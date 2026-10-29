// GranaViva · pluggy-webhook (P1)
// Recebe os eventos do Pluggy (registrados por pluggy-sync acao 'webhook') e guarda contas e transações
// em pluggy_acc / pluggy_tx. O app lê essas tabelas direto (RLS: só select do próprio usuário).
// Autenticação: ?k=<webhook_secret> na URL (comparação em tempo constante) + itemId tem que ser do usuário.
// Responde 2xx na hora e faz o trabalho em EdgeRuntime.waitUntil (o Pluggy exige resposta em até ~10 s).
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const API = "https://api.pluggy.ai";
const txt = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/plain" } });

// ---------- mesmas regras de pluggy-sync ----------
async function apiKey(clientId: string, clientSecret: string): Promise<string> {
  const r = await fetch(API + "/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId, clientSecret }) });
  if (!r.ok) throw new Error("Pluggy /auth " + r.status);
  return (await r.json()).apiKey;
}
async function keyFor(cfg: any, force = false): Promise<string> {
  if (!force && cfg.api_key && cfg.api_key_exp && Date.parse(cfg.api_key_exp) - Date.now() > 5 * 60e3) return cfg.api_key;
  const key = await apiKey(cfg.client_id, cfg.client_secret);
  cfg.api_key = key;
  await sb.from("pluggy_cfg").update({ api_key: key, api_key_exp: new Date(Date.now() + 110 * 60e3).toISOString() }).eq("user_id", cfg.user_id).then(() => {}, () => {});
  return key;
}
async function getC(cfg: any, path: string, tries = 2): Promise<any> {
  const r = await fetch(API + path, { headers: { "X-API-KEY": cfg.api_key } });
  if ((r.status === 401 || r.status === 403) && tries > 1) { await keyFor(cfg, true); return getC(cfg, path, tries - 1); }
  if (r.status === 429 && tries > 1) { const w = Math.min(8, +(r.headers.get("RateLimit-Reset") || r.headers.get("Retry-After") || 2)); await new Promise(res => setTimeout(res, w * 1000)); return getC(cfg, path, tries - 1); }
  if (!r.ok) throw new Error("Pluggy " + r.status + " em " + path.split("?")[0]);
  return r.json();
}
// tx no formato de 'sincronizar' ({id,data,valor,desc,cat}); null = fica de fora (mesmo filtro)
function mapTx(t: any, accType: string): any | null {
  if (t.status === "PENDING" && accType !== "CREDIT") return null; // no cartão, a fatura aberta vem como pendente
  const v = Math.abs(+t.amount || 0);
  if (!v) return null;
  return { id: t.id, data: String(t.date).slice(0, 10), valor: t.type === "DEBIT" ? -v : v, desc: String(t.description || t.descriptionRaw || "").slice(0, 120), cat: t.category || "" };
}
// conta no formato de 'sincronizar', sem tx
function mapConta(a: any) {
  const cd = a.creditData || {};
  const credito = a.type === "CREDIT" ? { limite: cd.creditLimit ?? null, disponivel: cd.availableCreditLimit ?? null, fecha: cd.balanceCloseDate || null, vence: cd.balanceDueDate || null, minimo: cd.minimumPayment ?? null, bandeira: cd.brand || "", final: String(a.number || "").replace(/\D/g, "").slice(-4), banco: a.marketingName || "" } : null;
  return { id: a.id, nome: [a.name, a.number ? "··" + String(a.number).slice(-4) : ""].filter(Boolean).join(" "), tipo: a.type, saldo: a.balance, credito };
}
// ---------------------------------------------------

function iguais(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let d = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length, 1); i++) d |= (ea[i % (ea.length || 1)] ?? 0) ^ (eb[i % (eb.length || 1)] ?? 0);
  return d === 0 && ea.length > 0;
}

async function contasDoItem(cfg: any, itemId: string) {
  const accs: any[] = (await getC(cfg, "/accounts?itemId=" + itemId)).results || [];
  const agora = new Date().toISOString();
  if (accs.length) {
    const { error } = await sb.from("pluggy_acc").upsert(accs.map(a => ({ user_id: cfg.user_id, id: a.id, item_id: itemId, data: mapConta(a), updated_at: agora })), { onConflict: "user_id,id" });
    if (error) throw error;
  }
  return accs;
}

async function gravaTx(cfg: any, itemId: string, accTipo: Map<string, string>, lista: any[]) {
  const agora = new Date().toISOString();
  const rows: any[] = [], fora: string[] = [];
  for (const t of lista) {
    const m = mapTx(t, accTipo.get(t.accountId) || "");
    if (m) rows.push({ user_id: cfg.user_id, id: t.id, account_id: t.accountId, item_id: itemId, data: m, removed: false, updated_at: agora });
    else fora.push(t.id);
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from("pluggy_tx").upsert(rows.slice(i, i + 500), { onConflict: "user_id,id" });
    if (error) throw error;
  }
  // uma tx que já estava guardada e passou a ser filtrada (ex.: zerada) sai da lista do app
  if (fora.length) await sb.from("pluggy_tx").update({ removed: true, updated_at: agora }).eq("user_id", cfg.user_id).in("id", fora).eq("removed", false);
  return rows.length;
}

async function paginas(cfg: any, q: string | null) {
  const out: any[] = [];
  for (let pg = 0; q && pg < 40; pg++) { const r = await getC(cfg, "/v2/transactions" + q); out.push(...(r.results || [])); q = r.next || null; }
  return out;
}

async function marcaItem(cfg: any, itemId: string, info: any) {
  const { data } = await sb.from("pluggy_cfg").select("item_status").eq("user_id", cfg.user_id).maybeSingle();
  const st = { ...(data?.item_status || {}), [itemId]: { ...info, em: new Date().toISOString() } };
  await sb.from("pluggy_cfg").update({ item_status: st }).eq("user_id", cfg.user_id);
}

async function processa(cfg: any, ev: any) {
  const itemId = String(ev.itemId);
  switch (ev.event) {
    case "item/updated": {
      await keyFor(cfg);
      const accs = await contasDoItem(cfg, itemId);
      const tipos = new Map(accs.map((a: any) => [a.id, a.type]));
      // rede de segurança: últimos 10 dias de cada conta (eventos de transação perdidos)
      const desde = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
      const listas = await Promise.all(accs.map((a: any) => paginas(cfg, `?accountId=${a.id}&dateFrom=${desde}`)));
      const n = await gravaTx(cfg, itemId, tipos, listas.flat());
      await marcaItem(cfg, itemId, { status: "UPDATED", erro: null, evento: ev.event, tx: n });
      break;
    }
    case "transactions/created":
    case "transactions/updated": {
      await keyFor(cfg);
      const accs = await contasDoItem(cfg, itemId);
      const tipos = new Map(accs.map((a: any) => [a.id, a.type]));
      let lista: any[] = [];
      const ids: string[] = Array.isArray(ev.transactionIds) ? ev.transactionIds.map(String) : [];
      if (ev.event === "transactions/updated" && ids.length) {
        // /v2/transactions exige accountId mesmo com ids
        const contas = ev.accountId && tipos.has(String(ev.accountId)) ? [String(ev.accountId)] : accs.map((a: any) => a.id);
        for (const acc of contas)
          for (let i = 0; i < ids.length; i += 200) lista.push(...await paginas(cfg, `?accountId=${acc}&ids=${ids.slice(i, i + 200).join(",")}`));
      } else {
        let accId = ev.accountId ? String(ev.accountId) : "", from = ev.transactionsCreatedAtFrom ? String(ev.transactionsCreatedAtFrom) : "";
        try { const u = new URL(ev.createdTransactionsLink); accId = u.searchParams.get("accountId") || accId; from = u.searchParams.get("createdAtFrom") || from; } catch (_) { /* sem link */ }
        const contas = accId && tipos.has(accId) ? [accId] : accs.map((a: any) => a.id);
        const desde = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
        const ls = await Promise.all(contas.map(id => paginas(cfg, from ? `?accountId=${id}&createdAtFrom=${encodeURIComponent(from)}` : `?accountId=${id}&dateFrom=${desde}`)));
        lista = ls.flat();
      }
      const n = await gravaTx(cfg, itemId, tipos, lista);
      await marcaItem(cfg, itemId, { status: "UPDATED", erro: null, evento: ev.event, tx: n });
      break;
    }
    case "transactions/deleted": {
      const ids: string[] = Array.isArray(ev.transactionIds) ? ev.transactionIds.map(String) : [];
      for (let i = 0; i < ids.length; i += 500)
        await sb.from("pluggy_tx").update({ removed: true, updated_at: new Date().toISOString() }).eq("user_id", cfg.user_id).in("id", ids.slice(i, i + 500));
      break;
    }
    case "item/error":
      await marcaItem(cfg, itemId, { status: "ERROR", erro: ev.error?.code || ev.error?.message || "erro", evento: ev.event });
      break;
    case "item/waiting_user_input":
    case "item/waiting_user_action":
    case "item/deleted":
      await marcaItem(cfg, itemId, { status: ev.event.split("/")[1].toUpperCase(), erro: null, evento: ev.event });
      break;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return txt("ok");
  const k = new URL(req.url).searchParams.get("k") || "";
  if (k.length < 24) return txt("no", 401);
  const ev = await req.json().catch(() => null);
  const { data: rows } = await sb.from("pluggy_cfg").select("*").not("webhook_secret", "is", null);
  let cfg: any = null;
  for (const r of rows || []) if (iguais(k, String(r.webhook_secret)) && !cfg) cfg = r; // percorre todas (tempo constante por linha)
  if (!cfg) return txt("no", 401); // 401 não é reenviado pelo Pluggy
  if (!ev?.event || !ev.itemId) return txt("ok"); // eventos sem item (connector/status_updated etc.) são ignorados
  if (!(cfg.item_ids || []).includes(String(ev.itemId))) return txt("ignored"); // item de outra pessoa / removido
  const p = processa(cfg, ev).catch(e => console.error("pluggy-webhook", ev.event, String((e as Error)?.message || e)));
  try { (globalThis as any).EdgeRuntime.waitUntil(p); } catch (_) { await p; }
  return txt("ok");
});
