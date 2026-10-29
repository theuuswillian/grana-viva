// GranaViva · alertas-push
// - chamada diária pelo pg_cron (cabeçalho x-cron-secret): confere faturas e contas fixas de
//   quem ativou notificações e manda um push por aparelho.
// - chamada pelo app com o login do usuário e {teste:true}: manda uma notificação de teste.
// verify_jwt desligado: a função confere o segredo do cron ou o token do usuário por conta própria.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:contato@granaviva.app", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } });

// ---------- datas (fuso de Brasília)
const hojeBR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const D = (iso: string) => new Date(iso + "T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const diaMes = (y: number, m: number, d: number) => { const x = new Date(Date.UTC(y, m, 1)); const ult = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), Math.min(d, ult))); };
const dias = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 864e5);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmt = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);
function fechamentoDe(c: any, dt: string) {
  const fe = Math.max(1, Math.min(31, c.fechamento || 1)), ve = Math.max(1, Math.min(31, c.vencimento || 1));
  const y = +dt.slice(0, 4), m = +dt.slice(5, 7) - 1;
  let C = diaMes(y, m, fe); if (iso(C) < dt) C = diaMes(y, m + 1, fe);
  const V = diaMes(C.getUTCFullYear(), C.getUTCMonth() + (ve > fe ? 0 : 1), ve);
  return { fecha: iso(C), vence: iso(V) };
}

// status: sem status = pago; previsto/cancelado não contam em fatura nem orçamento (mesma regra do app)
const efetivo = (t: any) => !t.status || t.status === "pago";
// conta fixa acontece na data d? (mensal / semanal / anual, mesma regra do app)
function ocorreEm(f: any, d: string): boolean {
  const x = D(d), fr = f.freq || "mensal";
  if (f.criadoEm && d < String(f.criadoEm).slice(0, 10)) return false;
  if (fr === "semanal") return x.getUTCDay() === (+f.dow || 0);
  if (fr === "anual" && x.getUTCMonth() + 1 !== (+f.mes || 1)) return false;
  return iso(diaMes(x.getUTCFullYear(), x.getUTCMonth(), f.dia || 1)) === d;
}
function chaveFixa(f: any, d: string): string {
  const fr = f.freq || "mensal";
  return "fx|" + f.id + "|" + (fr === "semanal" ? d : fr === "anual" ? d.slice(0, 4) : d.slice(0, 7));
}

// ---------- alertas de um usuário
function alertas(tx: any[], cartoes: any[], cfg: any, hoje: string): string[] {
  const out: string[] = [], pagDesde = cfg?.cfg?.pagDesde, gerados = cfg?.gerados || {};
  // antecedência escolhida no app (Ajustes): 0, 1, 2, 3, 5 ou 7 dias; padrão 3. no dia e na véspera sempre avisa.
  const N = [0, 1, 2, 3, 5, 7].includes(+cfg?.cfg?.avisoDias) ? +cfg.cfg.avisoDias : 3;
  const emN = (d: number) => `vence em ${d} dias`;
  for (const c of cartoes) {
    const somas: Record<string, { c: number; fecha: string }> = {};
    for (const t of tx) {
      if (t.cartao !== c.id || !(t.tipo === "despesa" || t.tipo === "transf") || !t.data || !efetivo(t)) continue;
      const f = fechamentoDe(c, t.data);
      const k = "fat|" + c.id + "|" + f.fecha.slice(0, 7);
      (somas[k] = somas[k] || { c: 0, fecha: f.fecha }).c += Math.round((+t.valor || 0) * 100);
    }
    for (const k of Object.keys(somas)) {
      if (gerados[k] === "del") continue;
      const { vence } = fechamentoDe(c, somas[k].fecha);
      const fat = tx.find((t) => t.faturaKey === k);
      if (!fat?.pagaEm && pagDesde && vence < pagDesde) continue;
      const resto = (somas[k].c - Math.round((+fat?.pagoValor || 0) * 100)) / 100;
      if (resto <= 0.009) continue;
      const d = dias(hoje, vence), nome = c.nome || "cartão";
      if (N > 1 && d === N) out.push(`Fatura ${nome} ${emN(d)} (${fmt(vence)}) · ${brl(resto)}`);
      else if (d === 1) out.push(`Fatura ${nome} vence amanhã · ${brl(resto)}`);
      else if (d === 0) out.push(`Fatura ${nome} vence hoje · ${brl(resto)}`);
      else if (d === -1 || d === -3 || d === -7) out.push(`Fatura ${nome} está atrasada desde ${fmt(vence)} · ${brl(resto)}`);
    }
  }
  const h = D(hoje), amanha = iso(new Date(h.getTime() + 864e5)), diaN = iso(new Date(h.getTime() + N * 864e5));
  for (const f of cfg?.fixas || []) {
    if (f.tipo === "receita") continue;
    const pago = (d: string) => { const k = chaveFixa(f, d); const t = tx.find((x) => x.fixaKey === k); return !!t && t.status !== "previsto"; };
    if (ocorreEm(f, hoje) && !pago(hoje)) out.push(`Conta fixa ${f.nome} vence hoje · ${brl(+f.valor || 0)}`);
    else if (ocorreEm(f, amanha) && !pago(amanha)) out.push(`Conta fixa ${f.nome} vence amanhã · ${brl(+f.valor || 0)}`);
    else if (N > 1 && ocorreEm(f, diaN) && !pago(diaN)) out.push(`Conta fixa ${f.nome} ${emN(N)} (${fmt(diaN)}) · ${brl(+f.valor || 0)}`);
  }
  // lançamentos previstos (fora das fixas automáticas): hoje, amanhã e atrasados há 1, 3 ou 7 dias
  for (const t of tx) {
    if (t.status !== "previsto" || t.tipo !== "despesa" || t.cartao || t.fxAuto || typeof t.data !== "string") continue;
    if (t.fixaKey && (cfg?.fixas || []).some((f: any) => t.fixaKey === chaveFixa(f, t.data) && (t.data === hoje || t.data === amanha || (N > 1 && t.data === diaN)))) continue; // já avisado acima
    const d = dias(hoje, t.data), nome = t.descricao || t.categoria || "conta";
    if (d === 0) out.push(`${nome} vence hoje · ${brl(+t.valor || 0)}`);
    else if (d === 1) out.push(`${nome} vence amanhã · ${brl(+t.valor || 0)}`);
    else if (N > 1 && d === N) out.push(`${nome} ${emN(d)} (${fmt(t.data)}) · ${brl(+t.valor || 0)}`);
    else if (d === -1 || d === -3 || d === -7) out.push(`${nome} está atrasada desde ${fmt(t.data)} · ${brl(+t.valor || 0)}`);
  }
  return out;
}

// orçamento do mês: um aviso ao passar de 80% e outro ao estourar (chaves guardadas em push_log)
function orcamentos(tx: any[], cfg: any, hoje: string): { chave: string; txt: string }[] {
  const mes = hoje.slice(0, 7), out: { chave: string; txt: string }[] = [];
  // limites com histórico: o registro mensal mais recente até este mês; sem registro, o limite padrão
  const om = cfg?.orcMes && typeof cfg.orcMes === "object" ? cfg.orcMes : {};
  const k = Object.keys(om).filter((x) => /^\d{4}-\d{2}$/.test(x) && x <= mes).sort().pop();
  const orc = (k ? om[k] : cfg?.orc) || {};
  for (const cat of Object.keys(orc)) {
    const lim = +orc[cat] || 0; if (lim <= 0) continue;
    let g = 0;
    for (const t of tx) if (t.tipo === "despesa" && efetivo(t) && !t.faturaKey && t.categoria === cat && typeof t.data === "string" && t.data.startsWith(mes)) g += Math.round((+t.valor || 0) * 100);
    const p = g / 100 / lim * 100;
    if (p >= 100) out.push({ chave: `orc|${cat}|${mes}|100`, txt: `Orçamento de ${cat} estourou · ${brl(g / 100)} de ${brl(lim)}` });
    else if (p >= 80) out.push({ chave: `orc|${cat}|${mes}|80`, txt: `Orçamento de ${cat} em ${Math.round(p)}% · ${brl(g / 100)} de ${brl(lim)}` });
  }
  return out;
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const hoje = hojeBR();
  // teste pedido pelo app
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const cron = req.headers.get("x-cron-secret");
  if (!cron) {
    const { data: u } = await sb.auth.getUser(tok);
    if (!u?.user) return json({ erro: "não autorizado" }, 401);
    const { data: subs } = await sb.from("push_subs").select("*").eq("user_id", u.user.id);
    if (!subs?.length) return json({ erro: "nenhum aparelho inscrito" }, 404);
    const n = await enviar(subs, { title: "GranaViva", body: "Notificações ativadas. Vou te avisar de faturas e contas perto do vencimento.", url: "./", tag: "gv-teste" });
    return json({ enviados: n });
  }
  // sem CRON_SECRET configurado, nenhum cabeçalho é aceito (antes, ausente vs. ausente podia passar)
  const segredo = Deno.env.get("CRON_SECRET");
  if (!segredo || cron !== segredo) return json({ erro: "não autorizado" }, 401);
  const { data: subs } = await sb.from("push_subs").select("*");
  const porUser: Record<string, any[]> = {};
  for (const s of subs || []) (porUser[s.user_id] = porUser[s.user_id] || []).push(s);
  let enviados = 0, usuarios = 0;
  for (const uid of Object.keys(porUser)) {
    const [t, c, s] = await Promise.all([
      sb.from("tx").select("data").eq("user_id", uid),
      sb.from("cartoes").select("data").eq("user_id", uid),
      sb.from("settings").select("data").eq("user_id", uid).maybeSingle(),
    ]);
    const txs = (t.data || []).map((r: any) => r.data), cfg = s.data?.data || {};
    const lista = alertas(txs, (c.data || []).map((r: any) => r.data), cfg, hoje);
    const orcs = orcamentos(txs, cfg, hoje);
    let novos: { chave: string; txt: string }[] = [];
    if (orcs.length) {
      const { data: ja } = await sb.from("push_log").select("chave").eq("user_id", uid).in("chave", orcs.map((o) => o.chave));
      const feitos = new Set((ja || []).map((r: any) => r.chave));
      novos = orcs.filter((o) => !feitos.has(o.chave));
      lista.push(...novos.map((o) => o.txt));
    }
    if (!lista.length) continue;
    usuarios++;
    const title = lista.length === 1 ? "GranaViva" : `GranaViva · ${lista.length} alertas`;
    const n = await enviar(porUser[uid], { title, body: lista.slice(0, 4).join("\n") + (lista.length > 4 ? `\n+${lista.length - 4} no app` : ""), url: "./?alertas=1", tag: "gv-" + hoje });
    enviados += n;
    if (n && novos.length) await sb.from("push_log").upsert(novos.map((o) => ({ user_id: uid, chave: o.chave })));
  }
  return json({ hoje, usuarios, enviados });
});
