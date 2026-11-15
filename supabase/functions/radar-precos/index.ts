// GranaViva · radar-precos (v10.155; v10.163: no Grátis só o alerta ativo mais antigo dispara, igual ao app e ao alertas-push)
// Radar de Investimentos: ativos que a pessoa acompanha sem ter (S.cfg.radar, na tabela settings), com até 3 alertas cada
// (acima de R$ X, abaixo de R$ X, queda de X% no dia). Cada alerta dispara UMA vez: o servidor grava em radar_disparos
// (chave 'r|b|PETR4|<id>|<geração>') e todos os aparelhos mostram "atingido em". "Reativar" no app troca a geração.
//
// Modos (verify_jwt desligado; a função confere sozinha):
// - pg_cron com x-cron-secret (mesmo segredo do alertas-push, Deno.env CRON_SECRET):
//     {so:'b3'}     ações/FIIs/ETFs/BDRs, cotação do Yahoo (.SA, ~15 min de atraso). Cron a cada 15 min no pregão.
//     {so:'cripto'} moedas pelo CoinGecko (mesma fonte do app; variação = últimas 24 h). Cron de hora em hora.
//     {dry:true}    junto com so: calcula e devolve o que dispararia, sem gravar e sem push.
//     {teste:{uid,radar}} só para a conta do dono (GV_ADMIN_UID): avalia um radar de teste passado no corpo (não lê settings).
//   Respeita: plano com Investimentos (Pro), Ajustes › Notificações › "Alerta de preço" (alvoPreco; desligado = grava o
//   disparo, sem push) e notificações discretas (padrão: sem ticker nem valores na tela bloqueada).
// - app com o login da pessoa: {cotar:[{t,k,cg}]} devolve preço, variação do dia e 30 dias de fechamento (sparkline).
//   v10.157: {cotar} só para quem tem Investimentos no plano (Pro, Pro anual, teste de 14 dias ou fundador; 402 com plano:'pro'
//   para os outros). {lista:true} exige login (qualquer plano: a busca não revela preço). Os dois mantêm o rate limit por conta.
//   O x-cron-secret é comparado em tempo constante.
//
// Alertas migrados do alerta antigo por ativo (fiis.alvoP, v10.111) trazem al.leg = chave antiga do push_log
// ('alvo|id|dir|preço'): se o job antigo (alertas-push {so:'precos'}) já mandou, o radar marca como atingido sem push;
// quando o radar manda, grava a chave antiga também, e o job antigo pula. Ver supabase/migrations/20261109_radar_cron.sql.
import { createClient } from "npm:@supabase/supabase-js@2";
import "../_shared/planos.js";
import { enviarPush } from "../_shared/push.ts";
import { registraErro } from "../_shared/erros.ts";
import { iguais } from "../_shared/seguro.ts";
import { radarDe, permitidos, chaveAl, chaveCot, bateu, payload, discretoOn, notifOn, hojeBR, diaBR, ehCripto, B3_RE, CRIPTO_RE, CG_RE, TIPOS_B3, type Item, type Cot } from "./logica.ts";
const GVP = (globalThis as any).GVP;

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ORIGENS = ["https://theuuswillian.github.io"];
const origemOk = (o: string) => ORIGENS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
let ORIG = ORIGENS[0];
const CORS = { get "Access-Control-Allow-Origin"() { return ORIG; }, "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const ADMIN = Deno.env.get("GV_ADMIN_UID") || "2d3e59d8-37fc-413f-b688-e7c1348d19b0";

/* ---------- cotações (cache por execução/instância) ---------- */
type CotS = Cot & { serie?: number[]; t?: string | null; nome?: string };
const CACHE = new Map<string, { em: number; v: CotS | null }>();
const TTL = 60_000;
async function yahoo(sym: string, range: string): Promise<CotS | null> {
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(7000) });
      if (!r.ok) continue;
      const j = await r.json();
      const res = j?.chart?.result?.[0], m = res?.meta;
      const p = Number(m?.regularMarketPrice);
      if (!(p > 0)) return null;
      const ts: number[] = res?.timestamp || [], cl: number[] = res?.indicators?.quote?.[0]?.close || [];
      const dia = m?.regularMarketTime ? diaBR(m.regularMarketTime) : null;
      // fechamento anterior = último fechamento de um dia antes do pregão da cotação
      let ant = NaN;
      for (let i = ts.length - 1; i >= 0; i--) if (cl[i] > 0 && diaBR(ts[i]) < (dia || "9")) { ant = Number(cl[i]); break; }
      if (!(ant > 0)) ant = Number(m?.chartPreviousClose ?? m?.previousClose);
      const serie = cl.map(Number).filter((x) => x > 0).slice(-30);
      return { p, ant: ant > 0 ? ant : null, varPct: ant > 0 ? +((p - ant) / ant * 100).toFixed(3) : null, dia, serie, t: m?.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null, nome: String(m?.longName || m?.shortName || "").slice(0, 80) };
    } catch (_) { /* outro host */ }
  }
  return null;
}
async function cotB3(tks: string[], range = "5d"): Promise<Record<string, CotS>> {
  const out: Record<string, CotS> = {};
  const fila = [...new Set(tks)];
  const um = async (t: string) => {
    const k = "b:" + t + ":" + range, c = CACHE.get(k);
    if (c && Date.now() - c.em < TTL) { if (c.v) out[t] = c.v; return; }
    const v = await yahoo(t + ".SA", range); CACHE.set(k, { em: Date.now(), v }); if (v) out[t] = v;
  };
  // 6 em paralelo: educado com o Yahoo e rápido o bastante para dezenas de tickers
  for (let i = 0; i < fila.length; i += 6) await Promise.all(fila.slice(i, i + 6).map(um));
  return out;
}
async function cotCripto(ids: string[]): Promise<Record<string, CotS>> {
  const out: Record<string, CotS> = {};
  const L = [...new Set(ids)].filter((x) => CG_RE.test(x));
  if (!L.length) return out;
  const k = "c:" + L.sort().join(","), c = CACHE.get(k);
  if (c && Date.now() - c.em < TTL && c.v) return (c.v as any).todos;
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=brl&price_change_percentage=24h&sparkline=false&ids=" + encodeURIComponent(L.join(",")), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error("coingecko " + r.status);
    for (const x of await r.json()) {
      const p = Number(x?.current_price);
      if (!(p > 0)) continue;
      const v = Number(x?.price_change_percentage_24h);
      out[x.id] = { p, varPct: isFinite(v) ? +v.toFixed(3) : null, dia: null, t: x?.last_updated || null, nome: String(x?.name || "").slice(0, 60) };
    }
    CACHE.set(k, { em: Date.now(), v: { todos: out } as any });
  } catch (e) { console.error("cripto", String(e)); }
  return out;
}
/* 30 dias de cripto (sparkline do app): CoinGecko market_chart; se falhar, Yahoo <TICKER>-BRL */
async function serieCripto(id: string, t: string): Promise<number[] | null> {
  const k = "cs:" + id, c = CACHE.get(k);
  if (c && Date.now() - c.em < 30 * 60_000 && c.v) return c.v.serie || null;
  let serie: number[] | null = null;
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=brl&days=30&interval=daily`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (r.ok) { const j = await r.json(); serie = (j?.prices || []).map((x: number[]) => Number(x[1])).filter((x: number) => x > 0).slice(-31); }
  } catch (_) { /* reserva */ }
  if (!serie || serie.length < 5) { const y = await yahoo(t + "-BRL", "1mo"); serie = y?.serie || null; }
  if (serie) CACHE.set(k, { em: Date.now(), v: { p: 0, varPct: null, serie } });
  return serie;
}

/* ---------- modo app: cotações para os cards ---------- */
async function cotarApp(lista: any[]) {
  const b3: string[] = [], cr: { id: string; t: string }[] = [];
  for (const x of (Array.isArray(lista) ? lista : []).slice(0, 40)) {
    const t = String(x?.t || "").toUpperCase(), k = String(x?.k || "");
    if (k === "cripto") { const cg = String(x?.cg || ""); if (CRIPTO_RE.test(t) && CG_RE.test(cg)) cr.push({ id: cg, t }); }
    else if (TIPOS_B3.includes(k) && B3_RE.test(t)) b3.push(t);
  }
  const [qb, qc] = await Promise.all([cotB3(b3, "1mo"), cotCripto(cr.map((x) => x.id))]);
  const q: Record<string, unknown> = {};
  for (const t of Object.keys(qb)) { const v = qb[t]; q[t] = { p: v.p, ant: v.ant, varPct: v.varPct, serie: v.serie, t: v.t, nome: v.nome }; }
  await Promise.all(cr.map(async ({ id, t }) => {
    const v = qc[id]; if (!v) return;
    const s = await serieCripto(id, t);
    q["c:" + id] = { p: v.p, varPct: v.varPct, serie: s ? [...s.slice(0, -1), v.p] : null, t: v.t, nome: v.nome };
  }));
  return { q, em: new Date().toISOString() };
}

/* ---------- modo cron: confere alertas e dispara ---------- */
async function confere(so: "b3" | "cripto", dry: boolean, teste?: { uid: string; radar: unknown }) {
  const hoje = hojeBR();
  // pessoas com Radar: só as linhas de settings que têm cfg.radar
  let pessoas: { uid: string; cfg: any }[] = [];
  if (teste) pessoas = [{ uid: teste.uid, cfg: { cfg: { radar: teste.radar, pushDiscreto: false } } }];
  else {
    const { data, error } = await sb.from("settings").select("user_id,data").not("data->cfg->radar", "is", null);
    if (error) throw error;
    pessoas = (data || []).map((r: any) => ({ uid: r.user_id, cfg: r.data || {} }));
  }
  const porUser: { uid: string; cfg: any; itens: Item[] }[] = [];
  for (const p of pessoas) {
    const itens = radarDe(p.cfg).filter((it) => so === "cripto" ? ehCripto(it) : !ehCripto(it));
    if (itens.length) porUser.push({ uid: p.uid, cfg: p.cfg, itens });
  }
  if (!porUser.length) return { so, hoje, pessoas: pessoas.length, usuarios: 0, disparos: 0 };
  // plano: Radar fica em Investimentos (Pro)
  const uids = porUser.map((u) => u.uid);
  const { data: assin } = await sb.from("assinaturas").select("user_id,plano,status,periodo_fim").in("user_id", uids);
  const plano = new Map((assin || []).map((a: any) => [a.user_id, a]));
  const ativos = porUser.filter((u) => GVP.pode(GVP.efetivo(plano.get(u.uid) || null).nivel, "investimentos"));
  // disparos já gravados (e chaves antigas do push_log para alertas migrados)
  const todas = ativos.flatMap((u) => radarDe(u.cfg).flatMap((it) => it.al.map((a) => chaveAl(it, a)))); // v10.163: B3 e cripto (a ordem do Grátis é global)
  const legs = ativos.flatMap((u) => u.itens.flatMap((it) => it.al.filter((a) => a.leg).map((a) => u.uid + "|" + a.leg)));
  const ja = new Set<string>();
  for (let i = 0; i < todas.length; i += 300) {
    const { data } = await sb.from("radar_disparos").select("user_id,chave").in("user_id", uids).in("chave", todas.slice(i, i + 300));
    for (const r of data || []) ja.add(r.user_id + "|" + r.chave);
  }
  const legFeito = new Set<string>();
  if (legs.length) {
    const { data } = await sb.from("push_log").select("user_id,chave").in("user_id", uids).in("chave", legs.map((x) => x.slice(37)));
    for (const r of data || []) legFeito.add(r.user_id + "|" + r.chave);
  }
  // cotações de tudo o que ainda pode disparar
  // v10.163: ativo = ainda não disparado; no Grátis (max_alertas_radar 1) só o mais antigo entre os ativos de TODOS os aparelhos
  // (criação no campo c; sem c conta como o mais antigo). Isso vale também para quem só tem cripto ou só B3: a ordem é global.
  const pend = ativos.map((u) => {
    const lim = GVP.limite(GVP.efetivo(plano.get(u.uid) || null).nivel, "max_alertas_radar");
    const ativo = (it: Item, a: any) => !ja.has(u.uid + "|" + chaveAl(it, a));
    const todos = radarDe(u.cfg).filter((it) => it.al.some((a) => ativo(it, a)));
    const ok = permitidos(todos, lim, ativo, GVP);
    const meus = new Set(ok.flatMap((it) => it.al.map((a) => chaveAl(it, a))));
    return { ...u, itens: u.itens.map((it) => ({ ...it, al: it.al.filter((a) => meus.has(chaveAl(it, a))) })).filter((it) => it.al.length) };
  }).filter((u) => u.itens.length);
  const cot: Record<string, CotS> = {};
  if (so === "b3") Object.assign(cot, await cotB3(pend.flatMap((u) => u.itens.map((it) => it.t))));
  else { const c = await cotCripto(pend.flatMap((u) => u.itens.map((it) => it.cg!))); for (const id of Object.keys(c)) cot["c:" + id] = c[id]; }
  let disparos = 0, enviados = 0, usuarios = 0;
  const simulado: any[] = [];
  for (const u of pend) {
    const bat: { it: Item; a: any; q: CotS; chave: string; leg?: string; silencioso: boolean }[] = [];
    for (const it of u.itens) {
      const q = cot[chaveCot(it)];
      for (const a of it.al) {
        if (!bateu(a, q, so === "b3" ? hoje : undefined)) continue;
        bat.push({ it, a, q: q!, chave: chaveAl(it, a), leg: a.leg, silencioso: !!a.leg && legFeito.has(u.uid + "|" + a.leg) });
      }
    }
    if (!bat.length) continue;
    usuarios++;
    const pushOn = notifOn(u.cfg, "alvoPreco");
    const discreto = discretoOn(u.cfg);
    const avisar = bat.filter((x) => !x.silencioso);
    const pl = avisar.length ? payload(avisar, discreto, so + "-" + hoje) : null;
    if (dry) { simulado.push({ usuario: u.uid.slice(0, 8), pushOn, discreto, chaves: bat.map((x) => x.chave), silenciosos: bat.filter((x) => x.silencioso).map((x) => x.chave), payload: pl }); continue; }
    // grava primeiro (a chave primária impede disparo duplo se duas execuções se cruzarem); só avisa o que esta execução gravou
    const { data: gravou, error } = await sb.from("radar_disparos").upsert(bat.map((x) => ({ user_id: u.uid, chave: x.chave, em: new Date().toISOString(), preco: x.q.p })), { onConflict: "user_id,chave", ignoreDuplicates: true }).select("chave");
    if (error) { await registraErro(sb, "radar-precos", "gravar", error); continue; }
    const novas = new Set((gravou || []).map((r: any) => r.chave));
    disparos += novas.size;
    const legsNovas = bat.filter((x) => novas.has(x.chave) && x.leg).map((x) => ({ user_id: u.uid, chave: x.leg! }));
    if (legsNovas.length) await sb.from("push_log").upsert(legsNovas, { onConflict: "user_id,chave", ignoreDuplicates: true });
    const lista = avisar.filter((x) => novas.has(x.chave));
    if (!lista.length || !pushOn) continue;
    const { data: subs } = await sb.from("push_subs").select("*").eq("user_id", u.uid);
    if (subs?.length) enviados += await enviarPush(sb, subs, payload(lista, discreto, so + "-" + hoje));
  }
  return dry ? { so, hoje, dry: true, usuarios, cotacoes: Object.keys(cot).length, simulado } : { so, hoje, usuarios, disparos, enviados, cotacoes: Object.keys(cot).length };
}

let LISTA: { ts: number; t: string[] } | null = null;
async function listaB3(): Promise<string[]> {
  if (LISTA && Date.now() - LISTA.ts < 12 * 3600e3) return LISTA.t;
  const r = await fetch("https://brapi.dev/api/available", { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("brapi available " + r.status);
  const d: any = await r.json();
  const t = [...new Set((Array.isArray(d?.stocks) ? d.stocks : []).map((x: any) => String(x).toUpperCase())
    .filter((x: string) => /^[A-Z0-9]{4}[0-9]{1,2}$/.test(x)))].sort() as string[];
  if (t.length < 100) throw new Error("lista curta " + t.length);
  LISTA = { ts: Date.now(), t };
  return t;
}

Deno.serve(async (req) => {
  const og = req.headers.get("origin") || "";
  ORIG = origemOk(og) ? og : ORIGENS[0];
  if (og && !origemOk(og)) return new Response("origem não permitida", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...CORS } });
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  const body: any = await req.json().catch(() => ({}));
  const cron = req.headers.get("x-cron-secret");
  if (!cron) {
    // app: só cotações, com login
    const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = await sb.auth.getUser(tok);
    const uid = u?.user?.id;
    if (!uid) return json({ erro: "faça login" }, 401);
    if (body?.lista === true) {
      // v10.156: lista completa de códigos da B3 para a busca (o catálogo do app só tem os mais comuns)
      const { data: okL } = await sb.rpc("rl_conta", { p_uid: uid, p_k: "radar-lst", p_lim: 30, p_seg: 3600 });
      if (okL === false) return json({ erro: "tente em alguns minutos" }, 429);
      try { return json({ t: await listaB3() }); }
      catch (e) { await registraErro(sb, "radar-precos", "lista", e); return json({ erro: "lista indisponível agora" }, 502); }
    }
    if (!Array.isArray(body?.cotar)) return json({ erro: "pedido inválido: mande {cotar:[...]} ou {lista:true}" }, 400);
    // v10.157: Radar é do Pro (recurso "investimentos"); quem decide é a tabela assinaturas, não o app
    const { data: a, error: ae } = await sb.from("assinaturas").select("plano,status,periodo_fim").eq("user_id", uid).maybeSingle();
    if (ae) { await registraErro(sb, "radar-precos", "plano", ae); return json({ erro: "não foi possível conferir seu plano agora, tente em instantes" }, 503); }
    const ef = GVP.efetivo(a || null);
    if (!GVP.pode(ef.nivel, "investimentos")) return json({ erro: "O Radar de preços faz parte do plano Pro.", plano: ef.plano, precisa: GVP.planoMinimo("investimentos") }, 402);
    const { data: ok } = await sb.rpc("rl_conta", { p_uid: uid, p_k: "radar-cot", p_lim: 240, p_seg: 3600 });
    if (ok === false) return json({ erro: "muitas atualizações seguidas, tente em alguns minutos" }, 429);
    try { return json(await cotarApp(body.cotar)); }
    catch (e) { await registraErro(sb, "radar-precos", "cotar", e); return json({ erro: "cotações indisponíveis agora" }, 502); }
  }
  // sem CRON_SECRET configurado, nenhum cabeçalho é aceito
  const segredo = Deno.env.get("CRON_SECRET");
  if (!segredo || !(await iguais(cron, segredo))) return json({ erro: "não autorizado" }, 401);
  const so = body?.so === "cripto" ? "cripto" : body?.so === "b3" ? "b3" : null;
  if (!so) return json({ erro: "informe so: 'b3' ou 'cripto'" }, 400);
  let teste: { uid: string; radar: unknown } | undefined;
  if (body?.teste) {
    if (body.teste.uid !== ADMIN || !Array.isArray(body.teste.radar)) return json({ erro: "teste só na conta do dono" }, 403);
    teste = { uid: ADMIN, radar: body.teste.radar };
  }
  try { return json(await confere(so, body?.dry === true, teste)); }
  catch (e) { await registraErro(sb, "radar-precos", "confere-" + so, e); return json({ erro: "falhou", detalhe: String((e as any)?.message || e).slice(0, 120) }, 500); }
});
