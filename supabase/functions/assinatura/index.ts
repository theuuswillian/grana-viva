// assinatura (v10.82): o app pergunta o plano, abre o pagamento e cancela. NÃO ativa plano: quem ativa é só o pagamento-webhook,
// depois de confirmar na API do Mercado Pago. Sem MP_ACCESS_TOKEN configurado, checkout responde "Pagamento em breve".
// Secrets: MP_ACCESS_TOKEN; APP_URL (opcional, padrão https://theuuswillian.github.io/grana-viva/).
import { createClient } from "npm:@supabase/supabase-js@2";
import "../_shared/planos.js";
import * as MP from "../_shared/mercadopago.ts";
import { registraErro } from "../_shared/erros.ts";
import { assinaInterno } from "../_shared/seguro.ts"; // v10.165: chamada interna ao pagamento-webhook
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
    // v10.161: à venda só "pro" (R$ 24,90/mês) e "pro_anual" (R$ 179/ano). "plus" é legado e não se compra mais.
    if (!GVP.PAGOS.includes(plano)) return json({ erro: GVP.LEGADOS.includes(plano) ? "O plano Plus não é mais vendido. Escolha o Pro." : "plano inválido" }, 400);
    if (!token) return json({ erro: "Pagamento em breve", emBreve: true }, 503);
    if (ef.fundador) return json({ erro: "Sua conta fundadora já tem acesso completo." }, 409);
    if (MP.checkoutBloqueadoPorAssinaturaAtiva(row)) return json({ erro: "Você já tem uma assinatura ativa. Cancele a atual e aguarde a confirmação antes de contratar outro plano." }, 409);
    if (row?.status === "ativo" && ef.nivel > 0 && GVP.idBase(row.plano) === GVP.idBase(plano) && GVP.normaliza(row.plano) === plano) return json({ erro: "Você já assina este plano." }, 409);
    // v10.118: e-mail da conta do Mercado Pago de quem paga (o MP exige que seja o mesmo do login do pagador); padrão: e-mail da conta
    const emIn = String(body?.email || "").trim().toLowerCase();
    if (emIn && (emIn.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emIn))) return json({ erro: "confira o e-mail do Mercado Pago" }, 400);
    const emailPagador = emIn || user.email || "";
    if (!emailPagador) return json({ erro: "informe o e-mail da sua conta Mercado Pago" }, 400);
    const intentId = String(body?.intentId || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intentId)) {
      return json({ erro: "inicie novamente a tentativa de pagamento" }, 400);
    }
    const { data: okH } = await sb.rpc("rl_conta", { p_uid: user.id, p_k: "checkout", p_lim: 6, p_seg: 3600 });
    if (!okH) return json({ erro: "Muitas tentativas. Espere alguns minutos." }, 429);

    // Consulta primeiro a intenção: retries preservam o mesmo preapproval e não o cancelam.
    const { data: existente, error: ce } = await sb.from("pagamento_checkout_intencoes")
      .select("user_id,plano,email_pagador,status,init_point")
      .eq("id", intentId).maybeSingle();
    if (ce) return json({ erro: "não consegui recuperar sua tentativa de pagamento" }, 503);
    let intencao: any = existente;
    const validaIntencao = (data: any) => data && data.user_id === user.id && data.plano === plano && data.email_pagador === emailPagador;
    if (intencao && !validaIntencao(intencao)) {
      return json({ erro: "esta tentativa de pagamento não corresponde aos dados atuais. Inicie outra." }, 409);
    }
    if (intencao?.status === "criado" && intencao.init_point) return json({ url: intencao.init_point, reutilizado: true });

    if (!intencao) {
      // Nunca cancela via GET+PUT: o status pode mudar entre as chamadas.
      // Assinatura já autorizada bloqueia nova compra; um único checkout pendente do mesmo plano é reutilizado.
      try {
        const { data: emailsAnteriores, error: erroEmailsAnteriores } = await sb.from("pagamento_checkout_intencoes")
          .select("email_pagador").eq("user_id", user.id).order("criado_em", { ascending: false }).limit(100);
        if (erroEmailsAnteriores) throw new Error("emails_checkout_indisponiveis");
        const emailsConhecidos = [...new Set([emailPagador, ...(emailsAnteriores || []).map((x: any) => x.email_pagador || "")])]
          .map((x) => String(x).trim().toLowerCase()).filter(Boolean);
        const existentes = await MP.consultaCheckoutsDoUsuario(user.id, emailsConhecidos, [...GVP.PAGOS, ...GVP.LEGADOS], token, GVP.PLANOS);
        if (existentes.autorizadas.length) {
          return json({ erro: "Encontramos uma assinatura aprovada que ainda está sendo sincronizada. Aguarde alguns instantes antes de tentar novamente." }, 409);
        }
        if (existentes.pendentes.length > 1) {
          return json({ erro: "Há mais de uma tentativa de pagamento pendente. Para evitar cobranças duplicadas, não vamos abrir outra. Entre em contato com o suporte para regularizar." }, 409);
        }
        if (existentes.pendentes.length === 1) {
          const pendente = existentes.pendentes[0];
          if (pendente.plano !== plano) {
            return json({ erro: "Você já tem um pagamento pendente para outro plano. Conclua ou regularize essa tentativa antes de escolher outro plano." }, 409);
          }
          return json({ url: pendente.url, reutilizado: true, checkoutPendente: true });
        }
      } catch (e) {
        console.log("reconciliacao_checkout", String(e));
        await registraErro(sb, "assinatura", "reconciliacao_checkout", e);
        return json({ erro: "não consegui verificar pagamentos anteriores. Tente novamente em instantes." }, 503);
      }
      const { error: ie } = await sb.from("pagamento_checkout_intencoes").insert({
        id: intentId, user_id: user.id, plano, email_pagador: emailPagador, status: "pendente",
      });
      if (ie?.code === "23505") {
        const { data, error } = await sb.from("pagamento_checkout_intencoes")
          .select("user_id,plano,email_pagador,status,init_point")
          .eq("id", intentId).maybeSingle();
        if (error) return json({ erro: "não consegui recuperar sua tentativa de pagamento" }, 503);
        if (!validaIntencao(data)) return json({ erro: "esta tentativa de pagamento não corresponde aos dados atuais. Inicie outra." }, 409);
        intencao = data;
      } else if (ie) {
        console.log("checkout_intencao", String(ie.message || ie.code));
        return json({ erro: "não consegui preparar o pagamento agora" }, 503);
      }
    }
    const app = (Deno.env.get("APP_URL") || "https://theuuswillian.github.io/grana-viva/").replace(/\/?$/, "/");
    try {
      const c = await MP.criaCheckout({
        uid: user.id, email: emailPagador, plano, token, PLANOS: GVP.PLANOS, idempotencyKey: intentId,
        notificationUrl: Deno.env.get("SUPABASE_URL") + "/functions/v1/pagamento-webhook?provedor=mercadopago",
        backUrl: app + "?assinatura=retorno",
      });
      const { data: salvo, error: se } = await sb.from("pagamento_checkout_intencoes")
        .update({ status: "criado", provedor_preapproval_id: c.id, init_point: c.url, atualizado_em: new Date().toISOString() })
        .eq("id", intentId).eq("user_id", user.id).eq("status", "pendente").select("id").maybeSingle();
      if (se) throw se;
      if (!salvo) {
        const { data: atual, error: ae } = await sb.from("pagamento_checkout_intencoes")
          .select("status,init_point").eq("id", intentId).eq("user_id", user.id).maybeSingle();
        if (ae || atual?.status !== "criado" || !atual.init_point) throw ae || new Error("checkout_intencao_nao_finalizada");
        return json({ url: atual.init_point, reutilizado: true });
      }
      return json({ url: c.url });
    } catch (e) { console.log("checkout", String(e)); await registraErro(sb, "assinatura", "checkout", e); return json({ erro: "não consegui abrir o pagamento agora" }, 502); }
  }
  if (acao === "cancelar") {
    if (!token) return json({ erro: "Pagamento em breve", emBreve: true }, 503);
    if (row?.provedor !== "mercadopago" || !row?.provedor_assinatura_id) return json({ erro: "não há assinatura para cancelar" }, 404);
    try { await MP.cancela(row.provedor_assinatura_id, token); } catch (e) { console.log("cancela", String(e)); await registraErro(sb, "assinatura", "cancelar", e); return json({ erro: "não consegui cancelar agora" }, 502); }
    return json({ ok: true, aviso: "Cancelamento enviado. Seu acesso continua até o fim do período pago." });
  }
  // v10.109: rede de segurança para quando o aviso do Mercado Pago atrasa ou não vem (no modo de teste ele não vem).
  // Procura no MP as assinaturas desta pessoa (external_reference gv1:<uid>:<plano>) e repassa a mais recente ao
  // pagamento-webhook, que confere tudo de novo na API do MP e aplica as mesmas regras (fundador mantido, outra assinatura etc.).
  // Nada vindo do navegador muda plano: o navegador só pede "confira".
  if (acao === "sincronizar") {
    if (!token) return json({ ok: true, resultado: "sem_pagamento" });
    if (ef.fundador) return json({ ok: true, resultado: "fundador_mantido" });
    const { data: okS } = await sb.rpc("rl_conta", { p_uid: user.id, p_k: "sincronizar", p_lim: 20, p_seg: 3600 });
    if (!okS) return json({ erro: "Muitas tentativas. Espere alguns minutos." }, 429);
    try {
      // A busca do MP aceita payer_email, não external_reference. Inclui e-mail da conta
      // e os e-mails usados em checkouts anteriores para não perder assinaturas legadas.
      const { data: historicos, error: erroEmails } = await sb.from("pagamento_checkout_intencoes")
        .select("email_pagador").eq("user_id", user.id).order("criado_em", { ascending: false }).limit(100);
      if (erroEmails) throw new Error("emails_checkout_indisponiveis");
      const emails = [...new Set([user.email || "", ...(historicos || []).map((x: any) => x.email_pagador || "")])]
        .map((x) => String(x).trim().toLowerCase()).filter(Boolean);
      const id = await MP.ultimaAssinatura(user.id, emails, [...GVP.PAGOS, ...GVP.LEGADOS], token);
      if (!id) return json({ ok: true, resultado: "nenhuma" });
      const r = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/pagamento-webhook?provedor=mercadopago&type=subscription_preapproval&data.id=" + encodeURIComponent(id), {
        method: "POST", signal: AbortSignal.timeout(12000),
        // v10.165: assinatura interna (o webhook exige x-signature do MP quando MP_WEBHOOK_SECRET está configurado)
        headers: { "content-type": "application/json", "x-request-id": "sync-" + crypto.randomUUID(), "x-gv-interno": await assinaInterno(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, "mp-sync", id) },
        body: JSON.stringify({ type: "subscription_preapproval", action: "sincronizar", data: { id } }),
      });
      let j: any = null; try { j = await r.json(); } catch { /* */ }
      if (!r.ok) throw new Error("webhook " + r.status);
      return json({ ok: true, resultado: String(j?.resultado || "") });
    } catch (e) { console.log("sincronizar", String(e)); await registraErro(sb, "assinatura", "sincronizar", e); return json({ erro: "não consegui confirmar agora" }, 502); }
  }
  return json({ erro: "ação desconhecida" }, 400);
});
