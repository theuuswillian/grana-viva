// pagamento-webhook (v10.82): recebe os avisos do provedor de pagamento (Mercado Pago) e é a ÚNICA coisa que ativa,
// renova ou encerra um plano pago na tabela assinaturas. Nada que vem do navegador muda plano.
// verify_jwt desligado (o Mercado Pago não manda login); a segurança é: assinatura conferida quando vem + consulta à API do MP
// com o token do servidor + eventos já processados guardados em pagamento_eventos.
// Secrets: MP_ACCESS_TOKEN (obrigatório para funcionar), MP_WEBHOOK_SECRET (opcional; confere x-signature quando vier).
// mercadopago.ts, webhook-nucleo.ts e planos.js são cópias geradas por deploy-fn.py (fonte: ../_shared e /planos.js).
import { createClient } from "npm:@supabase/supabase-js@2";
import "./planos.js";
import { processaWebhook, type DB } from "./webhook-nucleo.ts";
const GVP = (globalThis as any).GVP;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const db: DB = {
  async reservaEvento(id, meta) {
    const { error } = await sb.from("pagamento_eventos").insert({ id, provedor: meta.provedor, topico: meta.topico, recurso_id: meta.recurso_id });
    if (!error) return "novo";
    if (error.code !== "23505") throw error;
    const { data } = await sb.from("pagamento_eventos").select("processado_em").eq("id", id).maybeSingle();
    return data?.processado_em ? "concluido" : "pendente";
  },
  async concluiEvento(id, resultado, uid) {
    const { error } = await sb.from("pagamento_eventos").update({ processado_em: new Date().toISOString(), resultado: resultado.slice(0, 200), user_id: uid ?? null }).eq("id", id);
    if (error) throw error;
  },
  async leAssinatura(uid) {
    const { data, error } = await sb.from("assinaturas").select("plano,status,periodo_fim,provedor,provedor_assinatura_id,provedor_cliente_id").eq("user_id", uid).maybeSingle();
    if (error) throw error;
    return data;
  },
  async gravaAssinatura(uid, campos) {
    const { error } = await sb.from("assinaturas").upsert({ user_id: uid, ...campos }, { onConflict: "user_id" });
    if (error) throw error;
  },
};

Deno.serve(async (req) => {
  try {
    return await processaWebhook(req, {
      db, PLANOS: GVP.PLANOS, efetivo: GVP.efetivo,
      env: { MP_ACCESS_TOKEN: Deno.env.get("MP_ACCESS_TOKEN") || undefined, MP_WEBHOOK_SECRET: Deno.env.get("MP_WEBHOOK_SECRET") || undefined },
      log: (...a) => console.log("pagamento-webhook", ...a),
    });
  } catch (e) {
    console.log("pagamento-webhook erro", String(e));
    return new Response(JSON.stringify({ erro: "erro interno" }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
