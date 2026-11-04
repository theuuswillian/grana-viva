// GranaViva · alertas-push
// - chamada diária pelo pg_cron às 12:00 UTC (9h de Brasília, cabeçalho x-cron-secret): confere faturas, contas fixas,
//   previstos, empréstimos e orçamentos de quem ativou notificações e manda um push por aparelho.
//   v10.79: aos domingos manda também o resumo da semana (entrou, saiu, o que vence em 7 dias, a receber de empréstimos).
//   v10.89: lembrete do "dia de guardar" das metas com o app fechado (Ajustes › Notificações › "Dia de guardar no aparelho",
//   padrão ligado; desligar "Dia de guardar" também para). só para quem tem Metas no plano (Plus ou Pro). um por meta por mês (push_log).
//   v10.112: DARF das vendas na bolsa (7 dias antes e no dia, chave "darf") entra no resumo das 9h.
//   {so:'precos'} (pg_cron das 18:30 de Brasília, depois do fechamento da B3, só em dia útil): confere os alertas de preço
//   dos ativos (chave "alvoPreco") com a cotação do Yahoo e manda um push por alerta (push_log "alvo|id|dir|preço").
// - {dry:true} com o segredo do cron: calcula tudo e devolve o que seria enviado, sem mandar push e sem gravar push_log.
//   {hoje:'AAAA-MM-DD'} junto com dry simula outro dia (para conferir o resumo de domingo).
// - chamada pelo app com o login do usuário e {teste:true}: manda uma notificação de teste.
// verify_jwt desligado: a função confere o segredo do cron ou o token do usuário por conta própria.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { alertasD, diarioPayload, orcamentos, resumoSemana, textoSemana, discretoOn, diaSemana, ISO_RE, guardar, textoGuardar } from "./calc.ts";
// v10.89: plano da pessoa (metas são do Plus). planos.js é cópia gerada do /planos.js da raiz por deploy-fn.py.
import "../_shared/planos.js";
import { darfAvisos, alvos, alvoBateu, chaveAlvo, textoAlvo, diaUtil } from "./ir.ts";
const GVP = (globalThis as any).GVP;

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:contato@granaviva.app", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
const ORIGENS = ["https://theuuswillian.github.io"];
const origemOk = (o: string) => ORIGENS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
let ORIG = ORIGENS[0];
const CORS = { get "Access-Control-Allow-Origin"() { return ORIG; }, "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const hojeBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/* cotação da B3 (Yahoo), uma busca por ticker em cada execução */
const COT = new Map<string, number>();
async function cotacao(tk: string): Promise<number> {
  if (COT.has(tk)) return COT.get(tk)!;
  let p = 0;
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tk)}.SA?range=1d&interval=1d`, { headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", accept: "application/json" }, signal: AbortSignal.timeout(7000) });
      if (!r.ok) continue;
      const j = await r.json(); p = Number(j?.chart?.result?.[0]?.meta?.regularMarketPrice) || 0; break;
    } catch (_) { /* tenta o outro host */ }
  }
  COT.set(tk, p); return p;
}
async function precos(dry: boolean, hoje: string, porUser: Record<string, any[]>) {
  if (!dry && !diaUtil(hoje)) return { hoje, so: "precos", pulado: "não é dia útil" };
  let enviados = 0, usuarios = 0; const simulado: any[] = [];
  for (const uid of Object.keys(porUser)) {
    const [f, s] = await Promise.all([sb.from("fiis").select("data").eq("user_id", uid), sb.from("settings").select("data").eq("user_id", uid).maybeSingle()]);
    const cfg = s.data?.data || {};
    if (cfg?.cfg?.notif && cfg.cfg.notif.alvoPreco === false) continue;
    const A = alvos((f.data || []).map((r: any) => r.data).filter((x: any) => x && typeof x === "object"));
    if (!A.length) continue;
    const { data: ja } = await sb.from("push_log").select("chave").eq("user_id", uid).in("chave", A.map(chaveAlvo));
    const feitos = new Set((ja || []).map((r: any) => r.chave));
    const bat: { chave: string; txt: string; ticker: string }[] = [];
    for (const a of A) { if (feitos.has(chaveAlvo(a))) continue; const p = await cotacao(a.ticker); if (alvoBateu(a, p)) bat.push({ chave: chaveAlvo(a), txt: textoAlvo(a, p), ticker: a.ticker }); }
    if (!bat.length) continue;
    usuarios++;
    const discreto = discretoOn(cfg);
    const payload = { title: bat.length === 1 ? "GranaViva · alerta de preço" : `GranaViva · ${bat.length} alertas de preço`, body: discreto ? (bat.length === 1 ? "Um ativo chegou no preço do seu alerta." : `${bat.length} ativos chegaram no preço do seu alerta.`) : bat.slice(0, 4).map((x) => x.txt).join("\n"), url: "./?alertas=1", tag: "gv-alvo-" + hoje };
    if (dry) { simulado.push({ usuario: uid.slice(0, 8), payload, chaves: bat.map((x) => x.chave) }); continue; }
    const n = await enviar(porUser[uid], payload); enviados += n;
    if (n) await sb.from("push_log").upsert(bat.map((x) => ({ user_id: uid, chave: x.chave })));
  }
  return dry ? { hoje, so: "precos", dry: true, usuarios, simulado } : { hoje, so: "precos", usuarios, enviados };
}

async function enviar(subs: any[], payload: object) {
  let ok = 0;
  for (const s of subs) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86400, urgency: "high" }); ok++; }
    catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint); else console.error("push", e?.statusCode, e?.body); }
  }
  return ok;
}

Deno.serve(async (req) => {
  const og = req.headers.get("origin") || "";
  ORIG = origemOk(og) ? og : ORIGENS[0];
  if (og && !origemOk(og)) return new Response("origem não permitida", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...CORS } });
  const body: any = await req.json().catch(() => ({}));
  // teste pedido pelo app
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const cron = req.headers.get("x-cron-secret");
  if (!cron) {
    const { data: u } = await sb.auth.getUser(tok);
    if (!u?.user) return json({ erro: "não autorizado" }, 401);
    { const { data: ok } = await sb.rpc("rl_conta", { p_uid: u.user.id, p_k: "push:teste", p_lim: 10, p_seg: 3600 });
      if (ok === false) return json({ erro: "Muitos testes seguidos. Tente de novo mais tarde." }, 429); }
    const { data: subs } = await sb.from("push_subs").select("*").eq("user_id", u.user.id);
    if (!subs?.length) return json({ erro: "nenhum aparelho inscrito" }, 404);
    const n = await enviar(subs, { title: "GranaViva", body: "Notificações ativadas. Vou te avisar de faturas e contas perto do vencimento.", url: "./", tag: "gv-teste" });
    return json({ enviados: n });
  }
  // sem CRON_SECRET configurado, nenhum cabeçalho é aceito
  const segredo = Deno.env.get("CRON_SECRET");
  if (!segredo || cron !== segredo) return json({ erro: "não autorizado" }, 401);
  const dry = body?.dry === true;
  // GV_HOJE_TESTE só existe no teste local (simula outro dia); em produção não está definido
  const hj = dry && typeof body?.hoje === "string" ? body.hoje : (Deno.env.get("GV_HOJE_TESTE") || "");
  const hoje = ISO_RE.test(hj) ? hj : hojeBR();
  const domingo = diaSemana(hoje) === 0;
  const { data: subs } = await sb.from("push_subs").select("*");
  const porUser: Record<string, any[]> = {};
  for (const s of subs || []) (porUser[s.user_id] = porUser[s.user_id] || []).push(s);
  if (body?.so === "precos") return json(await precos(dry, hoje, porUser));
  let enviados = 0, usuarios = 0;
  const simulado: any[] = [];
  for (const uid of Object.keys(porUser)) {
    const [t, c, s, mt, fi] = await Promise.all([
      sb.from("tx").select("data").eq("user_id", uid),
      sb.from("cartoes").select("data").eq("user_id", uid),
      sb.from("settings").select("data").eq("user_id", uid).maybeSingle(),
      sb.from("metas").select("data").eq("user_id", uid),
      sb.from("fiis").select("data").eq("user_id", uid),
    ]);
    const cfg = s.data?.data || {};
    const D = { tx: (t.data || []).map((r: any) => r.data).filter((x: any) => x && typeof x === "object"), cartoes: (c.data || []).map((r: any) => r.data).filter(Boolean), cfg };
    const on = (k: string) => !(cfg?.cfg?.notif && cfg.cfg.notif[k] === false);
    const discreto = discretoOn(cfg);
    const lista = alertasD(D, hoje);
    // orçamento: um aviso por limite, por categoria, por mês (chaves em push_log)
    const orcs = orcamentos(D, hoje);
    /* v10.112: DARF das vendas (mesma regra de chaves do orçamento: cada fase avisa uma vez) */
    if (on("darf")) { try { orcs.push(...(darfAvisos((fi.data || []).map((r: any) => r.data).filter((x: any) => x && typeof x === "object"), cfg?.cfg || {}, hoje) as any)); } catch (e) { console.error("darf", e); } }
    let novos: { chave: string; txt: string; disc: string }[] = [];
    if (orcs.length) {
      const { data: ja } = await sb.from("push_log").select("chave").eq("user_id", uid).in("chave", orcs.map((o) => o.chave));
      const feitos = new Set((ja || []).map((r: any) => r.chave));
      novos = orcs.filter((o) => !feitos.has(o.chave));
      lista.push(...novos.map((o) => ({ txt: o.txt, disc: o.disc })));
    }
    // resumo da semana: domingo, padrão ligado (Ajustes › notificações › Resumo da semana); um por domingo
    let sem: { chave: string; payload: any; r: any } | null = null;
    if (domingo && on("semanal")) {
      const chave = "sem|" + hoje;
      const { data: ja } = await sb.from("push_log").select("chave").eq("user_id", uid).eq("chave", chave);
      if (!ja?.length) { const r = resumoSemana(D, hoje, hoje); const tx = textoSemana(r, discreto); sem = { chave, r, payload: { title: tx.title, body: tx.body, url: "./?semana=" + hoje, tag: "gv-sem-" + hoje } }; }
    }
    // v10.89: dia de guardar. só com as duas chaves ligadas (padrão: ligadas) e com Metas no plano
    let gd: { chaves: string[]; payload: any } | null = null;
    if (on("guardar") && on("metas")) {
      const L0 = guardar((mt.data || []).map((r: any) => r.data).filter((x: any) => x && typeof x === "object"), hoje);
      if (L0.length) {
        const { data: a } = await sb.from("assinaturas").select("plano,status,periodo_fim").eq("user_id", uid).maybeSingle();
        if (GVP.pode(GVP.efetivo(a).nivel, "metas")) {
          const { data: ja } = await sb.from("push_log").select("chave").eq("user_id", uid).in("chave", L0.map((x) => x.chave));
          const feitos = new Set((ja || []).map((r: any) => r.chave));
          const L = L0.filter((x) => !feitos.has(x.chave));
          if (L.length) { const tx = textoGuardar(L, discreto); gd = { chaves: L.map((x) => x.chave), payload: { title: tx.title, body: tx.body, url: "./?alertas=1", tag: L.length === 1 ? "gv-meta-" + L[0].id : "gv-metas-" + hoje } }; }
        }
      }
    }
    /* resumo diário: toda manhã, mesmo sem alerta ("Nada vence hoje."). no domingo com resumo da semana, ele já cobre isso */
    const resumo = cfg?.cfg?.resumoDiario !== false && on("resumo");
    let diario: any = null;
    if (lista.length || (resumo && !sem)) diario = diarioPayload(lista, discreto, hoje);
    if (!diario && !sem && !gd) continue;
    usuarios++;
    if (dry) { simulado.push({ usuario: uid.slice(0, 8), aparelhos: porUser[uid].length, discreto, diario, semana: sem && { payload: sem.payload, numeros: { ...sem.r, venc: sem.r.venc.length } }, orcNovos: novos.map((o) => o.chave), guardar: gd }); continue; }
    if (diario) {
      const n = await enviar(porUser[uid], diario);
      enviados += n;
      if (n && novos.length) await sb.from("push_log").upsert(novos.map((o) => ({ user_id: uid, chave: o.chave })));
    }
    if (gd) {
      const n = await enviar(porUser[uid], gd.payload);
      enviados += n;
      if (n) await sb.from("push_log").upsert(gd.chaves.map((chave) => ({ user_id: uid, chave })));
    }
    if (sem) {
      const n = await enviar(porUser[uid], sem.payload);
      enviados += n;
      if (n) await sb.from("push_log").upsert([{ user_id: uid, chave: sem.chave }]);
    }
  }
  return json(dry ? { hoje, dry: true, usuarios, simulado } : { hoje, usuarios, enviados });
});
