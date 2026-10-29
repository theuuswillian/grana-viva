// GranaViva · pluggy-sync
// Lê as SUAS contas pelo Meu Pluggy (uso pessoal, grátis). O Client Secret fica só aqui no servidor,
// na tabela pluggy_cfg (RLS ligada, sem políticas: só a service role lê). O app nunca vê o segredo.
// Chamada pelo app com o login do usuário: {acao:'status'|'salvar'|'sincronizar'|'remover', ...}
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const API = "https://api.pluggy.ai";

async function apiKey(clientId: string, clientSecret: string): Promise<string> {
  const r = await fetch(API + "/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId, clientSecret }) });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "Client ID ou Client Secret inválidos." : "Pluggy respondeu " + r.status);
  const j = await r.json();
  return j.apiKey;
}
async function get(key: string, path: string) {
  const r = await fetch(API + path, { headers: { "X-API-KEY": key } });
  if (!r.ok) throw new Error((r.status === 404 ? "Item não encontrado. Confira o itemId. " : "") + "Pluggy " + r.status + " em " + path.split("?")[0]);
  return r.json();
}
const limpaIds = (a: unknown) => (Array.isArray(a) ? a : String(a || "").split(/[\s,;]+/)).map(x => String(x).trim()).filter(x => /^[0-9a-f-]{20,40}$/i.test(x)).slice(0, 5);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await sb.auth.getUser(tok);
  if (!u?.user) return json({ erro: "Entre na sua conta para conectar o banco." }, 401);
  const uid = u.user.id;
  let b: any = {};
  try { b = await req.json(); } catch { /* vazio */ }
  try {
    if (b.acao === "status") {
      const { data } = await sb.from("pluggy_cfg").select("item_ids,ultima_sync,client_id").eq("user_id", uid).maybeSingle();
      return json({ conectado: !!data, itens: data?.item_ids?.length || 0, ultima: data?.ultima_sync || null, clientFim: data ? String(data.client_id).slice(-4) : "" });
    }
    if (b.acao === "remover") {
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
      const { error } = await sb.from("pluggy_cfg").upsert({ user_id: uid, client_id: clientId, client_secret: clientSecret, item_ids: itens, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true, contas });
    }
    if (b.acao === "sincronizar") {
      const { data: cfg } = await sb.from("pluggy_cfg").select("*").eq("user_id", uid).maybeSingle();
      if (!cfg) return json({ erro: "Banco ainda não conectado." }, 400);
      const key = await apiKey(cfg.client_id, cfg.client_secret);
      const dias = Math.max(7, Math.min(365, +b.dias || 60));
      const desde = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
      const contas: any[] = [];
      for (const it of cfg.item_ids || []) {
        const acc = (await get(key, "/accounts?itemId=" + it)).results || [];
        for (const a of acc) {
          const tx: any[] = [];
          // v2: paginação por cursor (o /transactions antigo responde 410 nas chaves novas)
          let q: string | null = `?accountId=${a.id}&dateFrom=${desde}`;
          for (let pg = 0; q && pg < 40; pg++) {
            const r = await get(key, "/v2/transactions" + q);
            for (const t of r.results || []) {
              if (t.status === "PENDING" && a.type !== "CREDIT") continue; // no cartão, a fatura aberta vem como pendente
              const v = Math.abs(+t.amount || 0);
              if (!v) continue;
              tx.push({ id: t.id, data: String(t.date).slice(0, 10), valor: t.type === "DEBIT" ? -v : v, desc: String(t.description || t.descriptionRaw || "").slice(0, 120), cat: t.category || "" });
            }
            q = r.next || null;
          }
          contas.push({ id: a.id, nome: [a.name, a.number ? "··" + String(a.number).slice(-4) : ""].filter(Boolean).join(" "), tipo: a.type, saldo: a.balance, tx });
        }
      }
      await sb.from("pluggy_cfg").update({ ultima_sync: new Date().toISOString() }).eq("user_id", uid);
      return json({ ok: true, desde, contas });
    }
    return json({ erro: "ação desconhecida" }, 400);
  } catch (e) {
    return json({ erro: String((e as Error).message || e) }, 502);
  }
});
