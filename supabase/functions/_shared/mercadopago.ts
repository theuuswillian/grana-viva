// Adaptador Mercado Pago · Assinaturas (preapproval). v10.82.
// CONSTRUÍDO A PARTIR DA DOCUMENTAÇÃO OFICIAL (nov/2026) E AINDA NÃO EXERCITADO CONTRA UMA CONTA MERCADO PAGO REAL.
// Documentos usados:
//  - https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks
//  - https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
//  - https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post
//  - https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-preapproval/get
//  - https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-authorized-payment/get
//  - SDK oficial npm "mercadopago" 3.6.1, dist/utils/webhook/index.js (WebhookSignatureValidator), portado abaixo sem mudar a regra.
//
// Regra de confiança: a assinatura do webhook (x-signature) é conferida QUANDO vem (uma inválida é recusada), mas não é
// a fonte da verdade, porque a doc diz que a configuração por "Suas integrações" (de onde vem a chave secreta) não vale
// para Assinaturas. O plano só muda a partir do objeto buscado na API do Mercado Pago com o token do servidor.

const API = "https://api.mercadopago.com";
export const CARENCIA_DIAS = 3; // depois da data da próxima cobrança, mantém o acesso por 3 dias enquanto o MP tenta cobrar

export type Estado = {
  uid: string;
  plano: string;                       // pro | pro_anual (plus: legado, só assinaturas antigas)
  status: "ativo" | "cancelado" | "inadimplente" | null; // null = nada a mudar (ex.: assinatura ainda pendente de pagamento)
  periodo_fim: string | null;          // null = manter o que já está gravado
  provedor_assinatura_id: string;
  provedor_cliente_id: string | null;
  mp_status: string;
  provedor_versao: number;
};
export type Busca = { estado?: Estado; ignorar?: string; naoEncontrado?: boolean };
type Fetch = typeof fetch;

// ---------- assinatura do webhook: porta fiel de WebhookSignatureValidator.validate (SDK mercadopago 3.6.1) ----------
function normaliza(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const raw = Array.isArray(v) ? v[0] : v;
  if (raw === undefined || raw === null) return undefined;
  const t = String(raw).trim();
  return t.length > 0 ? t : undefined;
}
function lerCabecalho(h: string) {
  const hashes: Record<string, string> = {}; let ts: string | undefined;
  for (const part of h.split(",")) {
    const eq = part.indexOf("="); if (eq === -1) continue;
    const k = part.substring(0, eq).trim().toLowerCase(), v = part.substring(eq + 1).trim();
    if (!k || !v) continue;
    if (k === "ts") ts = v; else if (/^v\d+$/.test(k)) hashes[k] = v;
  }
  return { ts, hashes };
}
function manifesto(dataId?: string, requestId?: string, ts?: string) {
  const p: string[] = [];
  if (dataId) p.push(`id:${dataId}`);
  if (requestId) p.push(`request-id:${requestId}`);
  p.push(`ts:${ts}`);
  return p.join(";") + ";";
}
export async function hmacHex(secret: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
  return [...s].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function iguaisTempoConstante(a: string, b: string) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let d = 0; for (let i = 0; i < ea.length; i++) d |= ea[i] ^ eb[i];
  return d === 0;
}
export async function validaAssinatura(o: { xSignature: unknown; xRequestId: unknown; dataId: unknown; secret: string; toleranciaSeg?: number; agora?: number }): Promise<{ ok: boolean; motivo?: string }> {
  const xs = normaliza(o.xSignature), rid = normaliza(o.xRequestId), did = normaliza(o.dataId);
  if (!xs) return { ok: false, motivo: "MissingSignatureHeader" };
  const { ts, hashes } = lerCabecalho(xs);
  if (!ts && Object.keys(hashes).length === 0) return { ok: false, motivo: "MalformedSignatureHeader" };
  if (!ts) return { ok: false, motivo: "MissingTimestamp" };
  if (!/^\d+$/.test(ts)) return { ok: false, motivo: "MalformedSignatureHeader" };
  const recebido = hashes["v1"];
  if (!recebido) return { ok: false, motivo: "MissingHash" };
  const calc = await hmacHex(o.secret, manifesto(did, rid, ts));
  if (!iguaisTempoConstante(calc, recebido)) return { ok: false, motivo: "SignatureMismatch" };
  if (o.toleranciaSeg !== undefined) {
    const drift = Math.abs((o.agora ?? Date.now()) - Number(ts) * 1000) / 1000;
    if (drift > o.toleranciaSeg) return { ok: false, motivo: "TimestampOutOfTolerance" };
  }
  return { ok: true };
}

// ---------- notificação recebida ----------
const TOPICOS: Record<string, string> = {
  subscription_preapproval: "subscription_preapproval", preapproval: "subscription_preapproval",
  subscription_authorized_payment: "subscription_authorized_payment", authorized_payment: "subscription_authorized_payment",
  payment: "payment",
};
export function lerNotificacao(url: URL, body: any, headers: Headers) {
  const q = url.searchParams;
  const bruto = String(q.get("type") || q.get("topic") || body?.type || body?.topic || "");
  const topico = TOPICOS[bruto] || bruto || "";
  const dataIdQuery = q.get("data.id") || undefined;           // é o que entra no manifesto da assinatura (SDK)
  const dataId = String(dataIdQuery || body?.data?.id || q.get("id") || (body?.resource ? String(body.resource).split("/").pop() : "") || "");
  const notifId = body?.id != null ? String(body.id) : "";
  const reqId = headers.get("x-request-id") || "";
  return { topico, dataId, dataIdQuery, notifId, reqId, acao: String(body?.action || "") };
}

// ---------- referência externa: liga a assinatura do MP à pessoa e ao plano ----------
export function refExterna(uid: string, plano: string) { return `gv1:${uid}:${plano}`; }
export function lerRef(s: unknown): { uid: string; plano: string } | null {
  const m = /^gv1:([0-9a-f-]{36}):(plus|pro|pro_anual)$/.exec(String(s ?? ""));
  return m ? { uid: m[1], plano: m[2] } : null;
}

async function mpGet(caminho: string, token: string, f: Fetch): Promise<{ status: number; json: any }> {
  const r = await f(API + caminho, { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(6000) });
  let j: any = null; try { j = await r.json(); } catch { /* corpo vazio */ }
  return { status: r.status, json: j };
}
const somaDias = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86400000).toISOString();

// confere que a assinatura do MP é exatamente a que o checkout cria para aquele plano (moeda, valor e frequência)
export function confereValores(p: any, plano: string, PLANOS: any): boolean {
  const P = PLANOS[plano]; const ar = p?.auto_recurring || {};
  if (!P || !P.preco) return false;
  const freq = P.periodo === "ano" ? 12 : 1;
  // v10.161: preço atual (Pro R$ 24,90/mês, Pro anual R$ 179/ano) ou um preço antigo do mesmo plano (assinaturas já existentes)
  const precos = [P.preco, ...(Array.isArray(P.legado) ? P.legado : [])];
  const v = Number(ar.transaction_amount);
  return ar.currency_id === "BRL" && precos.some((x: number) => Math.abs(v - x) < 0.005) && Number(ar.frequency) === freq && ar.frequency_type === "months";
}

export function estadoDePreapproval(p: any, PLANOS: any, agora = Date.now()): Busca {
  const ref = lerRef(p?.external_reference);
  if (!ref) return { ignorar: "referencia_desconhecida" };
  if (!confereValores(p, ref.plano, PLANOS)) return { ignorar: "valor_nao_confere" };
  const versao = Number(p?.version);
  if (!Number.isSafeInteger(versao) || versao < 0) return { ignorar: "versao_ausente_ou_invalida" };
  const prox = p?.next_payment_date && !isNaN(Date.parse(p.next_payment_date)) ? new Date(p.next_payment_date).toISOString() : null;
  const base = { uid: ref.uid, plano: ref.plano, provedor_assinatura_id: String(p.id), provedor_versao: versao, provedor_cliente_id: p?.payer_id != null ? String(p.payer_id) : null, mp_status: String(p?.status || "") };
  switch (p?.status) {
    case "authorized": {
      const meses = PLANOS[ref.plano].periodo === "ano" ? 12 : 1;
      const fim = prox ? somaDias(prox, CARENCIA_DIAS) : somaDias(new Date(agora).toISOString(), meses * 31 + CARENCIA_DIAS);
      return { estado: { ...base, status: "ativo", periodo_fim: fim } };
    }
    case "paused":
    case "canceled":
    case "cancelled":
      // acesso continua até o fim do período já pago (próxima cobrança, que não vai acontecer)
      return { estado: { ...base, status: "cancelado", periodo_fim: prox } };
    case "pending":
      return { estado: { ...base, status: null, periodo_fim: null } };
    default:
      return { ignorar: "status_desconhecido:" + String(p?.status) };
  }
}

// busca o estado verdadeiro no MP a partir do tópico e do id da notificação. Lança erro em falha temporária (o webhook responde 500 e o MP tenta de novo).
export async function buscaEstado(topico: string, dataId: string, token: string, PLANOS: any, f: Fetch = fetch, agora = Date.now()): Promise<Busca> {
  const id = encodeURIComponent(dataId);
  const falha = (s: number) => { if (s === 404 || s === 400) return { naoEncontrado: true }; throw new Error("mp " + s); };
  if (topico === "subscription_preapproval") {
    const r = await mpGet("/preapproval/" + id, token, f);
    if (r.status !== 200) return falha(r.status);
    return estadoDePreapproval(r.json, PLANOS, agora);
  }
  if (topico === "subscription_authorized_payment") {
    const r = await mpGet("/authorized_payments/" + id, token, f);
    if (r.status !== 200) return falha(r.status);
    const pid = r.json?.preapproval_id; if (!pid) return { ignorar: "sem_preapproval" };
    const p = await mpGet("/preapproval/" + encodeURIComponent(String(pid)), token, f);
    if (p.status !== 200) return falha(p.status);
    const b = estadoDePreapproval(p.json, PLANOS, agora);
    // cobrança recorrente recusada e período (com carência) já vencido: inadimplente
    const pagRuim = r.json?.payment?.status === "rejected" || r.json?.status === "cancelled";
    if (b.estado && pagRuim && b.estado.status === "ativo" && b.estado.periodo_fim && Date.parse(b.estado.periodo_fim) <= agora) b.estado.status = "inadimplente";
    return b;
  }
  if (topico === "payment") {
    const r = await mpGet("/v1/payments/" + id, token, f);
    if (r.status !== 200) return falha(r.status);
    // pagamento de assinatura: segue para a assinatura (campo não confirmado na doc; se não vier, o evento é só registrado)
    const pid = r.json?.metadata?.preapproval_id || r.json?.point_of_interaction?.transaction_data?.subscription_id;
    if (!pid) return { ignorar: "pagamento_sem_assinatura" };
    const p = await mpGet("/preapproval/" + encodeURIComponent(String(pid)), token, f);
    if (p.status !== 200) return falha(p.status);
    return estadoDePreapproval(p.json, PLANOS, agora);
  }
  return { ignorar: "topico_ignorado:" + topico };
}


// Não abre uma segunda recorrência enquanto a assinatura atual ainda está autorizada.
// A troca de plano deve passar primeiro pelo cancelamento confirmado da assinatura anterior.
export function checkoutBloqueadoPorAssinaturaAtiva(row: any): boolean {
  return row?.status === "ativo" && Boolean(row?.provedor_assinatura_id);
}

// ---------- checkout: cria a assinatura pendente e devolve o link de pagamento (Pix ou cartão, escolhido no MP) ----------
export async function criaCheckout(o: { uid: string; email: string; plano: string; token: string; PLANOS: any; notificationUrl: string; backUrl: string; idempotencyKey: string }, f: Fetch = fetch) {
  const P = o.PLANOS[o.plano];
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(o.idempotencyKey)) throw new Error("checkout_intencao_invalida");
  // v10.161: só Pro mensal (R$ 24,90) e Pro anual (R$ 179,00) são vendidos; o Plus é legado
  if (!P || !P.preco || P.descontinuado) throw new Error("plano_nao_vendido " + o.plano);
  const body = {
    reason: "GranaViva " + P.nome,
    external_reference: refExterna(o.uid, o.plano),
    payer_email: o.email,
    auto_recurring: { frequency: P.periodo === "ano" ? 12 : 1, frequency_type: "months", transaction_amount: P.preco, currency_id: "BRL" },
    back_url: o.backUrl,
    notification_url: o.notificationUrl,
    status: "pending",
  };
  const r = await f(API + "/preapproval", {
    method: "POST", signal: AbortSignal.timeout(10000),
    headers: { Authorization: "Bearer " + o.token, "content-type": "application/json", "X-Idempotency-Key": o.idempotencyKey },
    body: JSON.stringify(body),
  });
  let j: any = null; try { j = await r.json(); } catch { /* */ }
  if (!r.ok || !j?.id || !j?.init_point) throw new Error("mp_checkout " + r.status + " " + String(j?.message || "").slice(0, 120));
  return { url: String(j.init_point), id: String(j.id || "") };
}

// v10.109: id da assinatura desta pessoa no MP (qualquer plano pago): a autorizada mais recente, senão a mais recente; "" se não houver
export async function ultimaAssinatura(uid: string, emails: string[], planos: string[], token: string, f: Fetch = fetch): Promise<string> {
  const permitidos = new Set(planos);
  let melhor: { id: string; t: number } | null = null;
  for (const email of [...new Set(emails.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean))]) {
    let offset = 0;
    let total = 0;
    do {
      const r = await mpGet("/preapproval/search?limit=50&offset=" + offset + "&payer_email=" + encodeURIComponent(email), token, f);
      if (r.status !== 200) throw new Error("mp_busca " + r.status);
      const resultados = Array.isArray(r.json?.results) ? r.json.results : [];
      total = Number(r.json?.paging?.total ?? resultados.length);
      for (const a of resultados) {
        const ref = lerRef(a?.external_reference);
        if (!ref || ref.uid !== uid || !permitidos.has(ref.plano) || !a?.id) continue;
        // Uma autorizada vale mais que uma pendente; entre estados iguais, prioriza a alteração mais recente.
        const t = (a.status === "authorized" ? 1e13 : 0) + (Date.parse(a.last_modified || a.date_created || "") || 0);
        if (!melhor || t > melhor.t) melhor = { id: String(a.id), t };
      }
      offset += resultados.length;
      if (resultados.length === 0) break;
      if (offset < total && offset >= 200) throw new Error("mp_busca_limite");
    } while (offset < total);
  }
  return melhor ? melhor.id : "";
}
/**
 * Confirma diretamente os preapprovals persistidos nas intenções do próprio usuário.
 * Esta consulta fecha a janela em que o checkout já foi criado no provedor, mas
 * ainda não aparece em /preapproval/search por payer_email.
 */
export async function consultaCheckoutsRegistrados(uid: string, registros: Array<{ id?: string; plano?: string; email_pagador?: string; provedor_preapproval_id?: string }>, token: string, PLANOS: any, f: Fetch = fetch) {
  if (!uid || !token) throw new Error("reconciliacao_registrados_parametros_invalidos");
  const pendentes: Array<{ id: string; url: string; plano: string; criado: number }> = [];
  const autorizadas: Array<{ id: string; plano: string; criado: number }> = [];
  const vistos = new Set<string>();
  for (const registro of registros || []) {
    const id = String(registro?.provedor_preapproval_id || "");
    const plano = String(registro?.plano || "");
    if (!id || vistos.has(id) || !PLANOS[plano] || !registro?.email_pagador) continue;
    vistos.add(id);
    const atual = await mpGet("/preapproval/" + encodeURIComponent(id), token, f);
    // Um ID já persistido não pode ser tratado como inexistente: o 404 pode ser transitório
    // durante a propagação do provedor. Falha fechada para impedir um checkout duplicado.
    if (atual.status === 404) throw new Error("mp_checkout_registrado_ainda_nao_localizado");
    if (atual.status !== 200) throw new Error("mp_confirma_checkout_registrado " + atual.status);
    const p = atual.json;
    const vinculo = lerRef(p?.external_reference);
    if (String(p?.id || "") !== id || vinculo?.uid !== uid || vinculo.plano !== plano || !confereValores(p, plano, PLANOS)) continue;
    const emailProvedor = String(p?.payer_email || "").trim().toLowerCase();
    const emailRegistrado = String(registro.email_pagador).trim().toLowerCase();
    if (emailProvedor && emailProvedor !== emailRegistrado) continue;
    const confirmado = estadoDePreapproval(p, PLANOS);
    if (confirmado.ignorar || confirmado.estado?.uid !== uid) continue;
    const criado = Date.parse(p?.last_modified || p?.date_created || "") || 0;
    if (p?.status === "authorized" && confirmado.estado?.status === "ativo") {
      autorizadas.push({ id, plano, criado });
    } else if (p?.status === "pending" && confirmado.estado?.mp_status === "pending") {
      const url = String(p?.init_point || "");
      if (!url || !/^https:\/\//i.test(url)) throw new Error("mp_checkout_pendente_sem_link");
      pendentes.push({ id, url, plano, criado });
    }
  }
  pendentes.sort((a, b) => b.criado - a.criado);
  autorizadas.sort((a, b) => b.criado - a.criado);
  return { pendentes, autorizadas };
}

/**
 * Reutiliza um checkout pendente do próprio usuário em vez de cancelá-lo.
 * O Mercado Pago não oferece compare-and-set documentado para status/version:
 * GET seguido de PUT pode cancelar uma assinatura que acabou de ser autorizada.
 * Portanto esta rotina é somente leitura e nunca envia PUT.
 */
export async function consultaCheckoutsDoUsuario(uid: string, emails: string[], planos: string[], token: string, PLANOS: any, preservarId?: string | null, f: Fetch = fetch) {
  if (!uid || !emails?.some((x) => String(x || "").trim()) || !token) throw new Error("reconciliacao_parametros_invalidos");
  const permitidos = new Set(planos);
  const candidatos = new Map<string, string>();
  for (const email of [...new Set(emails.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean))]) {
    let offset = 0;
    let total = 0;
    do {
      const r = await mpGet("/preapproval/search?limit=50&offset=" + offset + "&payer_email=" + encodeURIComponent(email), token, f);
      if (r.status !== 200) throw new Error("mp_busca_reconciliacao " + r.status);
      const resultados = Array.isArray(r.json?.results) ? r.json.results : [];
      total = Number(r.json?.paging?.total ?? resultados.length);
      for (const item of resultados) {
        const id = String(item?.id || "");
        const vinculo = lerRef(item?.external_reference);
        if (!id || id === preservarId || !["pending", "authorized"].includes(String(item?.status)) || vinculo?.uid !== uid || !permitidos.has(vinculo.plano)) continue;
        candidatos.set(id, vinculo.plano);
      }
      offset += resultados.length;
      if (resultados.length === 0) break;
      if (offset < total && offset >= 200) throw new Error("mp_busca_reconciliacao_limite");
    } while (offset < total);
  }

  const pendentes: Array<{ id: string; url: string; plano: string; criado: number }> = [];
  const autorizadas: Array<{ id: string; plano: string; criado: number }> = [];
  for (const [id, plano] of candidatos) {
    const atual = await mpGet("/preapproval/" + encodeURIComponent(id), token, f);
    if (atual.status !== 200) throw new Error("mp_confirma_reconciliacao " + atual.status);
    const p = atual.json;
    const vinculo = lerRef(p?.external_reference);
    if (String(p?.id || "") !== id || vinculo?.uid !== uid || vinculo.plano !== plano || !confereValores(p, plano, PLANOS)) continue;
    const confirmado = estadoDePreapproval(p, PLANOS);
    if (confirmado.ignorar || confirmado.estado?.uid !== uid) continue;
    const criado = Date.parse(p?.last_modified || p?.date_created || "") || 0;
    if (p?.status === "authorized" && confirmado.estado?.status === "ativo") {
      autorizadas.push({ id, plano, criado });
    } else if (p?.status === "pending" && confirmado.estado?.mp_status === "pending") {
      const url = String(p?.init_point || "");
      if (!url || !/^https:\/\//i.test(url)) throw new Error("mp_checkout_pendente_sem_link");
      pendentes.push({ id, url, plano, criado });
    }
  }
  pendentes.sort((a, b) => b.criado - a.criado);
  autorizadas.sort((a, b) => b.criado - a.criado);
  return { pendentes, autorizadas };
}

export async function cancela(id: string, token: string, f: Fetch = fetch) {
  const r = await f(API + "/preapproval/" + encodeURIComponent(id), {
    method: "PUT", signal: AbortSignal.timeout(10000),
    headers: { Authorization: "Bearer " + token, "content-type": "application/json" },
    body: JSON.stringify({ status: "canceled" }),
  });
  if (!r.ok) throw new Error("mp_cancela " + r.status);
  return true;
}
