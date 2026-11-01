// CÓPIA GERADA por deploy-fn.py a partir de supabase/functions/_shared. Não edite aqui.
// Núcleo do webhook de pagamento (v10.82), independente do provedor e do banco (as dependências entram por parâmetro,
// para os testes rodarem com banco e Mercado Pago falsos). ESTA é a única porta que ativa um plano pago.
//
// Para cada notificação:
//  1. provedor configurado? (sem token do servidor não dá para conferir nada: 503, o provedor tenta depois)
//  2. se veio x-signature e há chave secreta, confere; assinatura inválida = 401 (nada muda)
//  3. registra o evento (id estável); evento já concluído = 200 sem fazer nada (idempotente)
//  4. busca o objeto na API do provedor com o token do servidor; só o que a API disser muda o plano
//  5. grava em assinaturas e marca o evento como concluído. Falha temporária no provedor = 500 sem concluir (o provedor reenvia)
import * as MP from "./mercadopago.ts";

export type Linha = { plano: string; status: string; periodo_fim: string | null; provedor?: string | null; provedor_assinatura_id?: string | null; provedor_cliente_id?: string | null } | null;
export type DB = {
  reservaEvento(id: string, meta: { provedor: string; topico: string; recurso_id: string }): Promise<"novo" | "pendente" | "concluido">;
  concluiEvento(id: string, resultado: string, uid?: string | null): Promise<void>;
  leAssinatura(uid: string): Promise<Linha>;
  gravaAssinatura(uid: string, campos: Record<string, unknown>): Promise<void>;
};
export type Deps = { db: DB; env: { MP_ACCESS_TOKEN?: string; MP_WEBHOOK_SECRET?: string }; PLANOS: any; efetivo: (a: any, agora?: number) => any; fetch?: typeof fetch; agora?: () => number; log?: (...a: unknown[]) => void };

const resp = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;

export async function processaWebhook(req: Request, d: Deps): Promise<Response> {
  const log = d.log || (() => {});
  const agora = d.agora ? d.agora() : Date.now();
  if (req.method !== "POST") return resp({ erro: "método" }, 405);
  const url = new URL(req.url);
  const provedor = url.searchParams.get("provedor") || "mercadopago";
  if (provedor !== "mercadopago") return resp({ erro: "provedor desconhecido" }, 400);
  const token = d.env.MP_ACCESS_TOKEN;
  if (!token) return resp({ erro: "pagamento não configurado" }, 503);

  const txt = await req.text();
  if (txt.length > 20000) return resp({ erro: "grande demais" }, 413);
  let body: any = {};
  if (txt.trim()) { try { body = JSON.parse(txt); } catch { return resp({ erro: "corpo inválido" }, 400); } }
  const n = MP.lerNotificacao(url, body, req.headers);
  if (!n.dataId || !ID_OK.test(n.dataId)) return resp({ erro: "sem id" }, 400);

  // 2. assinatura: conferida quando vem; nunca é suficiente sozinha
  const xs = req.headers.get("x-signature");
  if (xs) {
    if (d.env.MP_WEBHOOK_SECRET) {
      const v = await MP.validaAssinatura({ xSignature: xs, xRequestId: n.reqId, dataId: n.dataIdQuery || n.dataId, secret: d.env.MP_WEBHOOK_SECRET });
      if (!v.ok) { log("assinatura inválida", v.motivo); return resp({ erro: "assinatura inválida" }, 401); }
    } else log("x-signature recebido sem MP_WEBHOOK_SECRET configurado: seguindo pela consulta à API");
  }

  // 3. idempotência: o mesmo aviso (mesmo id de notificação; sem ele, o mesmo x-request-id) só é processado uma vez
  const chave = ["mp", n.topico || "?", n.dataId, n.notifId || n.reqId || "sem-id", n.acao].join(":").slice(0, 200);
  const r = await d.db.reservaEvento(chave, { provedor, topico: n.topico, recurso_id: n.dataId });
  if (r === "concluido") return resp({ ok: true, repetido: true });

  // 4. a verdade vem da API do provedor
  let b: MP.Busca;
  try { b = await MP.buscaEstado(n.topico, n.dataId, token, d.PLANOS, d.fetch || fetch, agora); }
  catch (e) { log("falha ao consultar o provedor", String(e)); return resp({ erro: "provedor indisponível, tente de novo" }, 500); }
  if (b.naoEncontrado) { await d.db.concluiEvento(chave, "nao_encontrado"); return resp({ ok: true, resultado: "nao_encontrado" }); }
  if (b.ignorar || !b.estado) { await d.db.concluiEvento(chave, b.ignorar || "ignorado"); return resp({ ok: true, resultado: b.ignorar || "ignorado" }); }

  const e = b.estado;
  const atual = await d.db.leAssinatura(e.uid);
  if (atual?.status === "fundador") { await d.db.concluiEvento(chave, "fundador_mantido", e.uid); return resp({ ok: true, resultado: "fundador_mantido" }); }
  if (e.status === null) { await d.db.concluiEvento(chave, "pendente:" + e.mp_status, e.uid); return resp({ ok: true, resultado: "sem_mudanca" }); }
  // aviso de OUTRA assinatura (ex.: a antiga, já trocada) não derruba a assinatura ativa atual
  if (atual && atual.provedor_assinatura_id && atual.provedor_assinatura_id !== e.provedor_assinatura_id && e.status !== "ativo") {
    const ef = d.efetivo(atual, agora);
    if (ef.nivel > 0 && atual.status === "ativo") { await d.db.concluiEvento(chave, "outra_assinatura_ativa", e.uid); return resp({ ok: true, resultado: "outra_assinatura_ativa" }); }
  }
  const campos: Record<string, unknown> = {
    plano: e.plano, status: e.status, provedor: "mercadopago",
    provedor_assinatura_id: e.provedor_assinatura_id, provedor_cliente_id: e.provedor_cliente_id,
    periodo_fim: e.periodo_fim ?? (atual?.periodo_fim ?? null),
  };
  await d.db.gravaAssinatura(e.uid, campos);
  await d.db.concluiEvento(chave, "aplicado:" + e.status + ":" + e.plano, e.uid);
  return resp({ ok: true, resultado: "aplicado", status: e.status, plano: e.plano });
}
