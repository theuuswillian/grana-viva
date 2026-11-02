// assinatura (v10.82): o app pergunta o plano, abre o pagamento e cancela. NÃO ativa plano: quem ativa é só o pagamento-webhook,
// depois de confirmar na API do Mercado Pago. Sem MP_ACCESS_TOKEN configurado, checkout responde "Pagamento em breve".
// Secrets: MP_ACCESS_TOKEN; APP_URL (opcional, padrão https://theuuswillian.github.io/grana-viva/).
import { createClient } from "npm:@supabase/supabase-js@2";
import "../_shared/planos.js";
import * as MP from "../_shared/mercadopago.ts";
import { registraErro } from "../_shared/erros.ts";
const GVP = (globalThis as any).GVP;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ORIGENS = ["https://theuuswillian.github.io"];
const origemOk = (o: string) => ORIGENS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
let ORIG = ORIGENS[0];
const CORS = { get "Access-Control-Allow-Origin"() { return ORIG; }, "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  const og = req.headers.get("origin") || "";
  ORIG = origemOk(og) ? og : ORIGENS[0];
  if (og && !origemOk(og)) return new Response("origem não permitida", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...CORS } });
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await sb.auth.getUser(tok);
  const user = u?.user;
  if (!user?.id) return json({ erro: "faça login" }, 401);
  let body: any;
  try { body = await req.json(); } catch { return json({ erro: "corpo inválido" }, 400); }
  const token = Deno.env.get("MP_ACCESS_TOKEN") || "";
  const { data: row, error: le } = await sb.from("assinaturas").select("plano,status,periodo_fim,provedor,provedor_assinatura_id").eq("user_id", user.id).maybeSingle();
  if (le) return json({ erro: "não foi possível ler seu plano agora" }, 503);
  const ef = GVP.efetivo(row);
  const acao = String(body?.acao || "");

  if (acao === "status") {
    return json({ plano: ef, assinatura: row ? { plano: row.plano, status: row.status, periodo_fim: row.periodo_fim } : null, pagamento: !!token });
  }
  if (acao === "checkout") {
    const plano = String(body?.plano || "");
    if (!GVP.PAGOS.includes(plano)) return json({ erro: "plano inválido" }, 400);
    if (!token) return json({ erro: "Pagamento em breve", emBreve: true }, 503);
    if (ef.fundador) return json({ erro: "Sua conta fundadora já tem acesso completo." }, 409);
    if (row?.status === "ativo" && ef.nivel > 0 && GVP.idBase(row.plano) === GVP.idBase(plano) && row.plano === plano) return json({ erro: "Você já assina este plano." }, 409);
    if (!user.email) return json({ erro: "sua conta precisa de um e-mail" }, 400);
    const { data: okH } = await sb.rpc("rl_conta", { p_uid: user.id, p_k: "checkout", p_lim: 6, p_seg: 3600 });
    if (!okH) return json({ erro: "Muitas tentativas. Espere alguns minutos." }, 429);
    const app = (Deno.env.get("APP_URL") || "https://theuuswillian.github.io/grana-viva/").replace(/\/?$/, "/");
    try {
      const c = await MP.criaCheckout({
        uid: user.id, email: user.email, plano, token, PLANOS: GVP.PLANOS,
        notificationUrl: Deno.env.get("SUPABASE_URL") + "/functions/v1/pagamento-webhook?provedor=mercadopago",
        backUrl: app + "?assinatura=retorno",
      });
      return json({ url: c.url });
    } catch (e) { console.log("checkout", String(e)); await registraErro(sb, "assinatura", "checkout", e); return json({ erro: "não consegui abrir o pagamento agora" }, 502); }
  }
  if (acao === "cancelar") {
    if (!token) return json({ erro: "Pagamento em breve", emBreve: true }, 503);
    if (row?.provedor !== "mercadopago" || !row?.provedor_assinatura_id) return json({ erro: "não há assinatura para cancelar" }, 404);
    try { await MP.cancela(row.provedor_assinatura_id, token); } catch (e) { console.log("cancela", String(e)); await registraErro(sb, "assinatura", "cancelar", e); return json({ erro: "não consegui cancelar agora" }, 502); }
    return json({ ok: true, aviso: "Cancelamento enviado. Seu acesso continua até o fim do período pago." });
  }
  return json({ erro: "ação desconhecida" }, 400);
});
