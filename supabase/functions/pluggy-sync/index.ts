// GranaViva · pluggy-sync
// Lê as SUAS contas pelo Meu Pluggy (uso pessoal, grátis). O Client Secret fica só aqui no servidor,
// na tabela pluggy_cfg (RLS ligada, sem políticas: só a service role lê). O app nunca vê o segredo.
// Chamada pelo app com o login do usuário: {acao:'status'|'salvar'|'sincronizar'|'remover'|'webhook'|'backfill', ...}
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Max-Age": "86400" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const API = "https://api.pluggy.ai";

async function apiKey(clientId: string, clientSecret: string): Promise<string> {
  const r = await fetch(API + "/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId, clientSecret }) });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Client ID ou Client Secret inválidos." : "Pluggy respondeu " + r.status);
  const j = await r.json();
  return j.apiKey;
}
// v10.54: chave da API guardada por ~2h (antes: um login no Pluggy a cada busca); renova sozinha em 401/403 e espera em 429
async function keyFor(cfg: any, force = false): Promise<string> {
  if (!force && cfg.api_key && cfg.api_key_exp && Date.parse(cfg.api_key_exp) - Date.now() > 5 * 60e3) return cfg.api_key;
  const key = await apiKey(cfg.client_id, cfg.client_secret);
  cfg.api_key = key;
  const p = sb.from("pluggy_cfg").update({ api_key: key, api_key_exp: new Date(Date.now() + 110 * 60e3).toISOString() }).eq("user_id", cfg.user_id).then(() => {}, () => {});
  try { (globalThis as any).EdgeRuntime?.waitUntil(p); } catch (_) { /* */ }
  return key;
}
async function getC(cfg: any, path: string, tries = 2): Promise<any> {
  const r = await fetch(API + path, { headers: { "X-API-KEY": cfg.api_key } });
  if ((r.status === 401 || r.status === 403) && tries > 1) { await keyFor(cfg, true); return getC(cfg, path, tries - 1); }
  if (r.status === 429 && tries > 1) { const w = Math.min(8, +(r.headers.get("RateLimit-Reset") || r.headers.get("Retry-After") || 2)); await new Promise(res => setTimeout(res, w * 1000)); return getC(cfg, path, tries - 1); }
  if (!r.ok) throw new Error((r.status === 404 ? "Item não encontrado. Confira o itemId. " : "") + "Pluggy " + r.status + " em " + path.split("?")[0]);
  return r.json();
}
async function get(key: string, path: string) {
  const r = await fetch(API + path, { headers: { "X-API-KEY": key } });
  if (!r.ok) throw new Error((r.status === 404 ? "Item não encontrado. Confira o itemId. " : "") + "Pluggy " + r.status + " em " + path.split("?")[0]);
  return r.json();
}

// ---------- P1: webhook + tabelas pluggy_tx / pluggy_acc ----------
const HOOK_URL = Deno.env.get("SUPABASE_URL") + "/functions/v1/pluggy-webhook";
function mapTx(t: any, accType: string): any | null {
  if (t.status === "PENDING" && accType !== "CREDIT") return null;
  const v = Math.abs(+t.amount || 0);
  if (!v) return null;
  return { id: t.id, data: String(t.date).slice(0, 10), valor: t.type === "DEBIT" ? -v : v, desc: String(t.description || t.descriptionRaw || "").slice(0, 120), cat: t.category || "" };
}
function mapConta(a: any) {
  const cd = a.creditData || {};
  const credito = a.type === "CREDIT" ? { limite: cd.creditLimit ?? null, disponivel: cd.availableCreditLimit ?? null, fecha: cd.balanceCloseDate || null, vence: cd.balanceDueDate || null, minimo: cd.minimumPayment ?? null, bandeira: cd.brand || "", final: String(a.number || "").replace(/\D/g, "").slice(-4), banco: a.marketingName || "" } : null;
  return { id: a.id, nome: [a.name, a.number ? "··" + String(a.number).slice(-4) : ""].filter(Boolean).join(" "), tipo: a.type, saldo: a.balance, credito };
}
// cria/renova o webhook do Pluggy deste usuário (um por aplicação Meu Pluggy) apontando para pluggy-webhook?k=SEGREDO
async function registraWebhook(cfg: any) {
  await keyFor(cfg);
  let secret = cfg.webhook_secret as string | null;
  if (!secret) { const b = crypto.getRandomValues(new Uint8Array(32)); secret = Array.from(b, x => x.toString(16).padStart(2, "0")).join(""); }
  const url = HOOK_URL + "?k=" + secret;
  const del = (id: string) => fetch(API + "/webhooks/" + id, { method: "DELETE", headers: { "X-API-KEY": cfg.api_key } }).then(r => r.body?.cancel(), () => {});
  // apaga o anterior e qualquer outro apontando para pluggy-webhook (evita entregas em dobro)
  const lista = (await getC(cfg, "/webhooks").catch(() => ({ results: [] }))).results || [];
  const velhos = new Set<string>(lista.filter((h: any) => String(h.url || "").startsWith(HOOK_URL)).map((h: any) => h.id));
  if (cfg.webhook_id) velhos.add(cfg.webhook_id);
  await Promise.all([...velhos].map(del));
  const r = await fetch(API + "/webhooks", { method: "POST", headers: { "X-API-KEY": cfg.api_key, "content-type": "application/json" }, body: JSON.stringify({ url, event: "all" }) });
  if (!r.ok) throw new Error("Pluggy webhook " + r.status + ": " + (await r.text()).slice(0, 200));
  const h = await r.json();
  const { error } = await sb.from("pluggy_cfg").update({ webhook_id: h.id, webhook_secret: secret }).eq("user_id", cfg.user_id);
  if (error) throw error;
  cfg.webhook_id = h.id; cfg.webhook_secret = secret;
  return h.id as string;
}
// preenche pluggy_acc / pluggy_tx com os últimos N dias
async function backfill(cfg: any, dias: number) {
  await keyFor(cfg);
  const desde = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
  const agora = new Date().toISOString();
  let nTx = 0, nAcc = 0;
  for (const it of (cfg.item_ids || []) as string[]) {
    const accs: any[] = (await getC(cfg, "/accounts?itemId=" + it)).results || [];
    if (accs.length) { const { error } = await sb.from("pluggy_acc").upsert(accs.map(a => ({ user_id: cfg.user_id, id: a.id, item_id: it, data: mapConta(a), updated_at: agora })), { onConflict: "user_id,id" }); if (error) throw error; }
    nAcc += accs.length;
    const porConta = await Promise.all(accs.map(async (a: any) => {
      const rows: any[] = [];
      let q: string | null = `?accountId=${a.id}&dateFrom=${desde}`;
      for (let pg = 0; q && pg < 40; pg++) {
        const r = await getC(cfg, "/v2/transactions" + q);
        for (const t of r.results || []) { const m = mapTx(t, a.type); if (m) rows.push({ user_id: cfg.user_id, id: t.id, account_id: a.id, item_id: it, data: m, removed: false, updated_at: agora }); }
        q = r.next || null;
      }
      return rows;
    }));
    const rows = porConta.flat();
    for (let i = 0; i < rows.length; i += 500) { const { error } = await sb.from("pluggy_tx").upsert(rows.slice(i, i + 500), { onConflict: "user_id,id" }); if (error) throw error; }
    nTx += rows.length;
  }
  return { desde, contas: nAcc, tx: nTx };
}
const bg = (p: Promise<unknown>) => { const q = p.catch(e => console.error("pluggy-sync bg", String((e as Error)?.message || e))); try { (globalThis as any).EdgeRuntime.waitUntil(q); } catch (_) { /* */ } };
// -------------------------------------------------------------------
const limpaIds = (a: unknown) => (Array.isArray(a) ? a : String(a || "").split(/[\s,;]+/)).map(x => String(x).trim()).filter(x => /^[0-9a-f-]{20,40}$/i.test(x)).slice(0, 5);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  // v10.54: confere o login localmente (JWKS em cache) quando dá; senão pergunta ao Auth
  let uid = "";
  try { const { data: c } = await (sb.auth as any).getClaims(tok); uid = c?.claims?.sub || ""; } catch (_) { /* */ }
  if (!uid) { const { data: u } = await sb.auth.getUser(tok); uid = u?.user?.id || ""; }
  if (!uid) return json({ erro: "Entre na sua conta para conectar o banco." }, 401);
  let b: any = {};
  try { b = await req.json(); } catch { /* vazio */ }
  try {
    if (b.acao === "status") {
      const { data } = await sb.from("pluggy_cfg").select("item_ids,ultima_sync,client_id,webhook_id,item_status").eq("user_id", uid).maybeSingle();
      return json({ conectado: !!data, itens: data?.item_ids?.length || 0, ultima: data?.ultima_sync || null, clientFim: data ? String(data.client_id).slice(-4) : "", webhook: !!data?.webhook_id, itensStatus: data?.item_status || {} });
    }
    if (b.acao === "remover") {
      const { data: cfg } = await sb.from("pluggy_cfg").select("*").eq("user_id", uid).maybeSingle();
      if (cfg?.webhook_id) { try { await keyFor(cfg); await fetch(API + "/webhooks/" + cfg.webhook_id, { method: "DELETE", headers: { "X-API-KEY": cfg.api_key } }); } catch (_) { /* */ } }
      await Promise.all([sb.from("pluggy_tx").delete().eq("user_id", uid), sb.from("pluggy_acc").delete().eq("user_id", uid)]);
      await sb.from("pluggy_cfg").delete().eq("user_id", uid);
      return json({ ok: true });
    }
    if (b.acao === "salvar") {
      const clientId = String(b.clientId || "").trim(), clientSecret = String(b.clientSecret || "").trim(), itens = limpaIds(b.itemIds);
      if (!clientId || !clientSecret) return json({ erro: "Informe o Client ID e o Client Secret." }, 400);
      if (!itens.length) return json({ erro: "Informe pelo menos um itemId válido." }, 400);
      const key = await apiKey(clientId, clientSecret);
      let contas = 0;
      for (const it of itens) contas += ((await get(key, "/accounts?itemId=" + it)).results || []).length;
      const { error } = await sb.from("pluggy_cfg").upsert({ user_id: uid, client_id: clientId, client_secret: clientSecret, item_ids: itens, api_key: key, api_key_exp: new Date(Date.now() + 110 * 60e3).toISOString(), updated_at: new Date().toISOString() });
      if (error) throw error;
      // P1: registra o webhook e enche as tabelas em segundo plano (não atrasa a resposta)
      const { data: cfg } = await sb.from("pluggy_cfg").select("*").eq("user_id", uid).maybeSingle();
      if (cfg) bg(registraWebhook(cfg).then(() => backfill(cfg, 90)));
      return json({ ok: true, contas });
    }
    if (b.acao === "webhook") {
      const { data: cfg } = await sb.from("pluggy_cfg").select("*").eq("user_id", uid).maybeSingle();
      if (!cfg) return json({ erro: "Banco ainda não conectado." }, 400);
      const id = await registraWebhook(cfg);
      return json({ ok: true, webhook: id });
    }
    if (b.acao === "backfill") {
      const { data: cfg } = await sb.from("pluggy_cfg").select("*").eq("user_id", uid).maybeSingle();
      if (!cfg) return json({ erro: "Banco ainda não conectado." }, 400);
      const r = await backfill(cfg, Math.max(7, Math.min(365, +b.dias || 90)));
      return json({ ok: true, ...r });
    }
    if (b.acao === "sincronizar") {
      const { data: cfg } = await sb.from("pluggy_cfg").select("*").eq("user_id", uid).maybeSingle();
      if (!cfg) return json({ erro: "Banco ainda não conectado." }, 400);
      await keyFor(cfg);
      const dias = Math.max(7, Math.min(365, +b.dias || 60));
      const desde = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
      const itens: string[] = cfg.item_ids || [];
      // v10.54: contas de todos os itens, transações de cada conta e investimentos correm em paralelo (antes: tudo em fila)
      const txConta = async (a: any) => {
        const tx: any[] = [];
        let q: string | null = `?accountId=${a.id}&dateFrom=${desde}`; // v2: paginação por cursor
        for (let pg = 0; q && pg < 40; pg++) {
          const r = await getC(cfg, "/v2/transactions" + q);
          for (const t of r.results || []) {
            if (t.status === "PENDING" && a.type !== "CREDIT") continue; // no cartão, a fatura aberta vem como pendente
            const v = Math.abs(+t.amount || 0);
            if (!v) continue;
            tx.push({ id: t.id, data: String(t.date).slice(0, 10), valor: t.type === "DEBIT" ? -v : v, desc: String(t.description || t.descriptionRaw || "").slice(0, 120), cat: t.category || "" });
          }
          q = r.next || null;
        }
        return tx;
      };
      const conta = (a: any, tx: any[]) => {
        const cd = a.creditData || {};
        const credito = a.type === "CREDIT" ? { limite: cd.creditLimit ?? null, disponivel: cd.availableCreditLimit ?? null, fecha: cd.balanceCloseDate || null, vence: cd.balanceDueDate || null, minimo: cd.minimumPayment ?? null, bandeira: cd.brand || "", final: String(a.number || "").replace(/\D/g, "").slice(-4), banco: a.marketingName || "" } : null;
        return { id: a.id, nome: [a.name, a.number ? "··" + String(a.number).slice(-4) : ""].filter(Boolean).join(" "), tipo: a.type, saldo: a.balance, credito, tx };
      };
      const invItem = async (it: string) => {
        const out: any[] = [];
        try {
          let pg = 1, tot = 1;
          while (pg <= tot && pg <= 10) {
            const r = await getC(cfg, `/investments?itemId=${it}&pageSize=500&page=${pg}`);
            tot = r.totalPages || 1; pg++;
            for (const v of r.results || []) out.push({ id: v.id, nome: String(v.name || "").slice(0, 80), codigo: String(v.code || "").slice(0, 20), tipo: v.type || "", subtipo: v.subtype || "", qtd: v.quantity ?? null, preco: v.value ?? null, saldo: v.balance ?? null, original: v.amountOriginal ?? null, status: v.status || "", vencimento: v.dueDate ? String(v.dueDate).slice(0, 10) : "", instituicao: v.institution?.name || "" });
          }
        } catch (_) { /* item sem permissão de investimentos */ }
        return out;
      };
      const accs = (await Promise.all(itens.map(it => getC(cfg, "/accounts?itemId=" + it)))).flatMap((r: any) => r.results || []);
      const [contas, inv] = await Promise.all([
        Promise.all(accs.map(async (a: any) => conta(a, await txConta(a)))),
        Promise.all(itens.map(invItem)),
      ]);
      const investimentos = inv.flat();
      const up = sb.from("pluggy_cfg").update({ ultima_sync: new Date().toISOString() }).eq("user_id", uid).then(() => {}, () => {});
      try { (globalThis as any).EdgeRuntime?.waitUntil(up); } catch (_) { await up; }
      return json({ ok: true, desde, contas, investimentos });
    }
    return json({ erro: "ação desconhecida" }, 400);
  } catch (e) {
    return json({ erro: String((e as Error).message || e) }, 502);
  }
});
