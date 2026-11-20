// pagamento-webhook: única porta que ativa, renova ou encerra um plano pago.
// A reserva, aplicação da assinatura e conclusão usam RPCs transacionais com fencing token.
import { createClient } from "npm:@supabase/supabase-js@2";
import "../_shared/planos.js";
import { processaWebhook, type DB, type ResultadoAplicacao, type Reserva } from "../_shared/webhook-nucleo.ts";
import { registraErro } from "../_shared/erros.ts";
const GVP = (globalThis as any).GVP;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const db: DB = {
  async reservaEvento(id, meta): Promise<Reserva> {
    const token = crypto.randomUUID();
    const { data, error } = await sb.rpc("pagamento_evento_reserva", {
      p_id: id,
      p_token: token,
      p_provedor: meta.provedor,
      p_topico: meta.topico,
      p_recurso_id: meta.recurso_id,
      p_lease_seconds: 120,
    });
    if (error) throw error;
    if (data === "novo" || data === "retomado") return { status: data, token };
    if (data === "pendente" || data === "concluido") return { status: data, token };
    throw new Error("status inesperado ao reservar evento de pagamento");
  },
  async concluiEvento(id, token, resultado, uid) {
    const { data, error } = await sb.rpc("pagamento_evento_finaliza", {
      p_id: id, p_token: token, p_resultado: resultado.slice(0, 200), p_uid: uid ?? null,
    });
    if (error) throw error;
    return data === true;
  },
  async leAssinatura(uid) {
    const { data, error } = await sb.from("assinaturas")
      .select("plano,status,periodo_fim,provedor,provedor_assinatura_id,provedor_cliente_id")
      .eq("user_id", uid).maybeSingle();
    if (error) throw error;
    return data;
  },
  async aplicaAssinaturaEvento(id, token, uid, campos): Promise<ResultadoAplicacao> {
    const { data, error } = await sb.rpc("pagamento_evento_aplica_assinatura", {
      p_id: id,
      p_token: token,
      p_uid: uid,
      p_plano: String(campos.plano),
      p_status: String(campos.status),
      p_periodo_fim: campos.periodo_fim ?? null,
      p_provedor_assinatura_id: String(campos.provedor_assinatura_id),
      p_provedor_cliente_id: campos.provedor_cliente_id ?? null,
    });
    if (error) throw error;
    if (data === "aplicado" || data === "fundador_mantido" || data === "outra_assinatura_ativa" || data === "perdido") return data;
    throw new Error("resultado inesperado ao aplicar assinatura");
  },
};

Deno.serve(async (req) => {
  try {
    return await processaWebhook(req, {
      db, PLANOS: GVP.PLANOS, efetivo: GVP.efetivo,
      env: { MP_ACCESS_TOKEN: Deno.env.get("MP_ACCESS_TOKEN") || undefined, MP_WEBHOOK_SECRET: Deno.env.get("MP_WEBHOOK_SECRET") || undefined, INTERNO_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || undefined },
      log: (...a) => console.log("pagamento-webhook", ...a),
      erro: (etapa, e) => registraErro(sb, "pagamento-webhook", etapa, e),
    });
  } catch (e) {
    console.log("pagamento-webhook erro", String(e));
    await registraErro(sb, "pagamento-webhook", "interno", e);
    return new Response(JSON.stringify({ erro: "erro interno" }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
