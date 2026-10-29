// GranaViva · pluggy-sync
// Lê as SUAS contas pelo Meu Pluggy (uso pessoal, grátis). O Client Secret fica só aqui no servidor,
// na tabela pluggy_cfg (RLS ligada, sem políticas: só a service role lê). O app nunca vê o segredo.
// Chamada pelo app com o login do usuário: {acao:'status'|'salvar'|'sincronizar'|'remover'|'webhook'|'backfill', ...}
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
// v10.55: só o próprio app (e testes locais) pode chamar pelo navegador
const ORIGENS = ["https://theuuswillian.github.io"];
const origemOk = (o: string) => ORIGENS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
let ORIG = ORIGENS[0];
const CORS = { get "Access-Control-Allow-Origin"() { return ORIG; }, "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Max-Age": "86400" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const API = "https://api.pluggy.ai";

// v10.55: Client Secret e chave da API guardados criptografados (AES-GCM, chave só no ambiente da função)
const EK = Deno.env.get("PLUGGY_ENC_KEY") || "";
let CK: CryptoKey | null = null;
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function ck() { if (!CK && EK) CK = await crypto.subtle.importKey("raw", unb64(EK), "AES-GCM", false, ["encrypt", "decrypt"]); return CK; }
async function enc(s: string): Promise<string> {
  const k = await ck(); if (!k || !s) return s;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(s)));
  const o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12); return "enc1:" + b64(o);
}
async function dec(s: string): Promise<string> {
  if (!s || !String(s).startsWith("enc1:")) return s;
  const k = await ck(); if (!k) throw new Error("chave de criptografia ausente");
  const u = unb64(String(s).slice(5));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, k, u.slice(12)));
}
// abre a configuração: decifra em memória e, se ainda estava em texto puro, já grava cifrado
async function abre(cfg: any) {
  if (!cfg) return cfg;
  const plano = cfg.client_secret && !String(cfg.client_secret).startsWith("enc1:");
  cfg.client_secret = await dec(cfg.client_secret);
  try { cfg.api_key = await dec(cfg.api_key); } catch (_) { cfg.api_key = null; }
  if (plano && EK) await sb.from("pluggy_cfg").update({ client_secret: await enc(cfg.client_secret), api_key: cfg.api_key ? await enc(cfg.api_key) : null }).eq("user_id", cfg.user_id).then(() => {}, () => {});
  return cfg;
}

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
  const p = sb.from("pluggy_cfg").update({ api_key: await enc(key), api_key_exp: new Date(Date.now() + 110 * 60e3).toISOString() }).eq("user_id", cfg.user_id).then(() => {}, () => {});
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
  const og = req.headers.get("origin") || "";
  ORIG = origemOk(og) ? og : ORIGENS[0];
  if (og && !origemOk(og)) return new Response("origem não permitida", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...CORS } });
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  // v10.54: confere o login localmente (JWKS em cache) quando dá; senão pergunta ao Auth
  let uid = "";
  try { const { data: c } = await (sb.auth as any).getClaims(tok); uid = c?.claims?.sub || ""; } catch (_) { /* */ }
  if (!uid) { const { data: u } = await sb.auth.getUser(tok); uid = u?.user?.id || ""; }
  if (!uid) return json({ erro: "Entre na sua conta para conectar o banco." }, 401);
  let b: any = {};
  try { b = await req.json(); } catch { /* vazio */ }
  // v10.55: limite por pessoa e por hora (protege a conta Pluggy e o Supabase grátis)
  const LIM: Record<string, number> = { status: 240, sincronizar: 40, backfill: 6, webhook: 10, salvar: 10, remover: 10 };
  const lim = LIM[String(b.acao)] || 20;
  { const { data: ok } = await sb.rpc("rl_conta", { p_uid: uid, p_k: "pluggy:" + String(b.acao).slice(0, 20), p_lim: lim, p_seg: 3600 });
    if (ok === false) return json({ erro: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo." }, 429); }
  try {
    if (b.acao === "status") {
      const { data } = await sb.from("pluggy_cfg").select("item_ids,ultima_sync,client_id,webhook_id,item_status").eq("user_id", uid).maybeSingle();
      return json({ conectado: !!data, itens: data?.item_ids?.length || 0, ultima: data?.ultima_sync || null, clientFim: data ? String(data.client_id).slice(-4) : "", webhook: !!data?.webhook_id, itensStatus: data?.item_status || {} });
    }
    if (b.acao === "remover") {
      const cfg = await abre((await sb.from("pluggy_cfg").select("*").eq("user_id", uid).maybeSingle()).data);
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
      const { error } = await sb.from("pluggy_cfg").upsert({ user_id: uid, client_id: clientId, client_secret: await enc(clientSecret), item_ids: itens, api_key: await enc(key), api_key_exp: new Date(Date.now() + 110 * 60e3).toISOString(), updated_at: new Date().toISOString() });
      if (error) throw error;
      // P1: registra o webhook e enche as tabelas em segundo plano (não atrasa a resposta)
      const cfg = await abre((await sb.from("pluggy_cfg").select("*").eq("user_id", uid).maybeSingle()).data);
      if (cfg) bg(registraWebhook(cfg).then(() => backfill(cfg, 90)));
      return json({ ok: true, contas });
    }
    if (b.acao === "webhook") {
      const cfg = await abre((await sb.from("pluggy_cfg").select("*").eq("user_id", uid).maybeSingle()).data);
      if (!cfg) return json({ erro: "Banco ainda não conectado." }, 400);
      const id = await registraWebhook(cfg);
      return json({ ok: true, webhook: id });
    }
    if (b.acao === "backfill") {
      const cfg = await abre((await sb.from("pluggy_cfg").select("*").eq("user_id", uid).maybeSingle()).data);
      if (!cfg) return json({ erro: "Banco ainda não conectado." }, 400);
      const r = await backfill(cfg, Math.max(7, Math.min(365, +b.dias || 90)));
      return json({ ok: true, ...r });
    }
    if (b.acao === "sincronizar") {
      const cfg = await abre((await sb.from("pluggy_cfg").select("*").eq("user_id", uid).maybeSingle()).data);
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
    // v10.55: detalhes técnicos ficam no log; o app recebe uma mensagem amigável
    const m = String((e as Error)?.message || e);
    console.error("pluggy-sync", b.acao, m.slice(0, 300));
    const amigavel = /\b401\b|\b403\b|auth/i.test(m) ? "O Pluggy recusou as credenciais. Confira o Client ID e o Client Secret." : /\b429\b/.test(m) ? "O Pluggy pediu uma pausa. Tente de novo em alguns minutos." : "Não consegui falar com o Pluggy agora. Tente de novo daqui a pouco.";
    return json({ erro: amigavel }, 502);
  }
});
