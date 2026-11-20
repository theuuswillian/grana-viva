// Núcleo do webhook de pagamento (v10.82), independente do provedor e do banco.
// A única porta que ativa um plano pago é a consulta autenticada à API do Mercado Pago.
// Cada execução recebe fencing token; aplicar assinatura e concluir evento é uma única transação no banco.
import * as MP from "./mercadopago.ts";
import { confereInterno } from "./seguro.ts";

export type Linha = { plano: string; status: string; periodo_fim: string | null; provedor?: string | null; provedor_assinatura_id?: string | null; provedor_cliente_id?: string | null } | null;
export type StatusReserva = "novo" | "retomado" | "pendente" | "concluido";
export type Reserva = { status: StatusReserva; token: string };
export type ResultadoAplicacao = "aplicado" | "fundador_mantido" | "outra_assinatura_ativa" | "perdido";
export type DB = {
  reservaEvento(id: string, meta: { provedor: string; topico: string; recurso_id: string }): Promise<Reserva>;
  concluiEvento(id: string, token: string, resultado: string, uid?: string | null): Promise<boolean>;
  leAssinatura(uid: string): Promise<Linha>;
  aplicaAssinaturaEvento(id: string, token: string, uid: string, campos: Record<string, unknown>, protegerOutra: boolean): Promise<ResultadoAplicacao>;
};
export type Deps = { db: DB; env: { MP_ACCESS_TOKEN?: string; MP_WEBHOOK_SECRET?: string; INTERNO_KEY?: string }; PLANOS: any; efetivo: (a: any, agora?: number) => any; fetch?: typeof fetch; agora?: () => number; log?: (...a: unknown[]) => void; erro?: (etapa: string, e: unknown) => Promise<void> | void };

const resp = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/;
const ocupado = () => new Response(JSON.stringify({ erro: "evento em processamento ou lease perdido" }), { status: 503, headers: { "content-type": "application/json", "retry-after": "60" } });

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

  const xs = req.headers.get("x-signature");
  const interno = !xs && await confereInterno(req.headers.get("x-gv-interno"), d.env.INTERNO_KEY, "mp-sync", n.dataId, agora);
  if (d.env.MP_WEBHOOK_SECRET && !interno) {
    if (!xs) { log("x-signature ausente com MP_WEBHOOK_SECRET configurado: recusado"); await d.erro?.("assinatura", "x-signature ausente"); return resp({ erro: "assinatura ausente" }, 401); }
    const v = await MP.validaAssinatura({ xSignature: xs, xRequestId: n.reqId, dataId: n.dataIdQuery || n.dataId, secret: d.env.MP_WEBHOOK_SECRET });
    if (!v.ok) { log("assinatura inválida", v.motivo); await d.erro?.("assinatura", "assinatura inválida " + v.motivo); return resp({ erro: "assinatura inválida" }, 401); }
  } else log(xs ? "x-signature recebido sem MP_WEBHOOK_SECRET configurado: seguindo pela consulta à API" : "MP_WEBHOOK_SECRET não configurado: aviso sem assinatura conferida, seguindo pela consulta à API");

  const chave = ["mp", n.topico || "?", n.dataId, n.notifId || n.reqId || "sem-id", n.acao].join(":").slice(0, 200);
  const reserva = await d.db.reservaEvento(chave, { provedor, topico: n.topico, recurso_id: n.dataId });
  if (reserva.status === "concluido") return resp({ ok: true, repetido: true });
  if (reserva.status === "pendente") return ocupado();
  const lease = reserva.token;
  const finaliza = async (resultado: string, uid?: string | null) => {
    const ok = await d.db.concluiEvento(chave, lease, resultado, uid);
    return ok ? null : ocupado();
  };

  let b: MP.Busca;
  try { b = await MP.buscaEstado(n.topico, n.dataId, token, d.PLANOS, d.fetch || fetch, agora); }
  catch (e) { log("falha ao consultar o provedor", String(e)); await d.erro?.("consulta_provedor", e); return resp({ erro: "provedor indisponível, tente de novo" }, 500); }
  if (b.naoEncontrado) {
    const falha = await finaliza("nao_encontrado");
    return falha || resp({ ok: true, resultado: "nao_encontrado" });
  }
  if (b.ignorar || !b.estado) {
    const resultado = b.ignorar || "ignorado";
    const falha = await finaliza(resultado);
    return falha || resp({ ok: true, resultado });
  }

  const e = b.estado;
  const atual = await d.db.leAssinatura(e.uid);
  if (atual?.status === "fundador") {
    const falha = await finaliza("fundador_mantido", e.uid);
    return falha || resp({ ok: true, resultado: "fundador_mantido" });
  }
  if (e.status === null) {
    const resultado = "pendente:" + e.mp_status;
    const falha = await finaliza(resultado, e.uid);
    return falha || resp({ ok: true, resultado: "sem_mudanca" });
  }

  const protegerOutra = !!(atual && atual.provedor_assinatura_id
    && atual.provedor_assinatura_id !== e.provedor_assinatura_id
    && e.status !== "ativo"
    && atual.status === "ativo"
    && d.efetivo(atual, agora).nivel > 0);

  const campos: Record<string, unknown> = {
    plano: e.plano, status: e.status,
    periodo_fim: e.periodo_fim,
    provedor_assinatura_id: e.provedor_assinatura_id,
    provedor_cliente_id: e.provedor_cliente_id,
  };
  const aplicado = await d.db.aplicaAssinaturaEvento(chave, lease, e.uid, campos, protegerOutra);
  if (aplicado === "perdido") return ocupado();
  if (aplicado === "fundador_mantido" || aplicado === "outra_assinatura_ativa") {
    return resp({ ok: true, resultado: aplicado });
  }
  return resp({ ok: true, resultado: "aplicado", status: e.status, plano: e.plano });
}
