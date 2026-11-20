import { cancelaConfirmando, hmacHex, refExterna } from "../supabase/functions/_shared/mercadopago.ts";
import { processaWebhook } from "../supabase/functions/_shared/webhook-nucleo.ts";

Deno.test("cancelaConfirmando aceita PUT bem-sucedido sem GET", async () => {
  const methods: string[] = [];
  const fake = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    methods.push(init?.method || "GET");
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  const result = await cancelaConfirmando("preapproval-1", "token", fake);
  if (result !== "cancelada") throw new Error("esperava cancelada");
  if (methods.join(",") !== "PUT") throw new Error("não deveria consultar GET após PUT bem-sucedido");
});

Deno.test("cancelaConfirmando aceita assinatura já cancelada no MP", async () => {
  let calls = 0;
  const fake = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    if (init?.method === "PUT") return new Response("{}", { status: 400 });
    return new Response(JSON.stringify({ status: "cancelled" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const result = await cancelaConfirmando("preapproval-2", "token", fake);
  if (result !== "ja_cancelada" || calls !== 2) throw new Error("estado cancelado não reconhecido");
});

Deno.test("cancelaConfirmando aceita 404 como recurso já encerrado", async () => {
  const fake = (async () => new Response("{}", { status: 404 })) as typeof fetch;
  const result = await cancelaConfirmando("preapproval-3", "token", fake);
  if (result !== "ja_cancelada") throw new Error("404 deveria permitir exclusão");
});

Deno.test("cancelaConfirmando bloqueia exclusão se o recurso continua ativo", async () => {
  const fake = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "PUT") return new Response("{}", { status: 400 });
    return new Response(JSON.stringify({ status: "authorized" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  let falhou = false;
  try { await cancelaConfirmando("preapproval-4", "token", fake); } catch { falhou = true; }
  if (!falhou) throw new Error("não pode permitir exclusão com assinatura ativa");
});


const MP_PLANOS_TESTE = {
  pro: { id: "pro", preco: 24.9, periodo: "mes", legado: [] },
  pro_anual: { id: "pro_anual", preco: 179, periodo: "ano", legado: [] },
};
const MP_UID_TESTE = "00000000-0000-4000-8000-000000000321";

function dbWebhookTeste(overrides: Record<string, unknown> = {}) {
  let reservas = 0, aplicacoes = 0;
  const db = {
    async reservaEvento() { reservas++; return { status: "novo" as const, token: "lease-test" }; },
    async concluiEvento() { return true; },
    async leAssinatura() { return null; },
    async aplicaAssinaturaEvento(_id: string, _token: string, _uid: string, _campos: Record<string, unknown>) {
      aplicacoes++; return "aplicado" as const;
    },
    ...overrides,
  };
  return { db, get reservas() { return reservas; }, get aplicacoes() { return aplicacoes; } };
}

Deno.test("webhook de assinatura falha fechado quando MP_WEBHOOK_SECRET não está configurado", async () => {
  const mock = dbWebhookTeste();
  const req = new Request("https://example.test/webhook?data.id=sub-1&type=subscription_preapproval", { method: "POST", body: "{}" });
  const res = await processaWebhook(req, {
    db: mock.db as any, env: { MP_ACCESS_TOKEN: "token-teste" }, PLANOS: MP_PLANOS_TESTE,
    efetivo: () => ({}), fetch: fetch,
  });
  if (res.status !== 503 || mock.reservas !== 0) throw new Error("sem segredo deve responder 503 antes de reservar evento");
});

Deno.test("webhook suportado rejeita assinatura ausente mesmo com o segredo configurado", async () => {
  const mock = dbWebhookTeste();
  const req = new Request("https://example.test/webhook?data.id=sub-2&type=subscription_preapproval", { method: "POST", body: "{}" });
  const res = await processaWebhook(req, {
    db: mock.db as any, env: { MP_ACCESS_TOKEN: "token-teste", MP_WEBHOOK_SECRET: "segredo-teste" },
    PLANOS: MP_PLANOS_TESTE, efetivo: () => ({}), fetch: fetch,
  });
  if (res.status !== 401 || mock.reservas !== 0) throw new Error("sem x-signature deve responder 401 sem reservar evento");
});

Deno.test("webhook Mercado Pago valida HMAC e só aplica estado retornado pela API", async () => {
  const mock = dbWebhookTeste();
  const segredo = "segredo-sandbox-de-teste";
  const dataId = "sub-sandbox-123";
  const requestId = "req-sandbox-123";
  const ts = String(Math.floor(Date.now() / 1000));
  const assinatura = await hmacHex(segredo, `id:${dataId};request-id:${requestId};ts:${ts};`);
  const preapproval = {
    id: dataId, version: 7, status: "authorized", payer_id: 987654,
    external_reference: refExterna(MP_UID_TESTE, "pro"),
    auto_recurring: { currency_id: "BRL", transaction_amount: 24.9, frequency: 1, frequency_type: "months" },
    next_payment_date: "2026-12-01T00:00:00.000Z",
  };
  const chamadas: string[] = [];
  const fakeFetch = (async (input: RequestInfo | URL) => {
    chamadas.push(String(input));
    return new Response(JSON.stringify(preapproval), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const req = new Request(`https://example.test/webhook?data.id=${dataId}&type=subscription_preapproval`, {
    method: "POST", headers: { "x-signature": `ts=${ts},v1=${assinatura}`, "x-request-id": requestId }, body: "{}",
  });
  const res = await processaWebhook(req, {
    db: mock.db as any,
    env: { MP_ACCESS_TOKEN: "token-sandbox-falso", MP_WEBHOOK_SECRET: segredo },
    PLANOS: MP_PLANOS_TESTE, efetivo: () => ({}), fetch: fakeFetch,
  });
  const body = await res.json();
  if (res.status !== 200 || body.resultado !== "aplicado") throw new Error("webhook válido não concluiu a homologação simulada");
  if (mock.reservas !== 1 || mock.aplicacoes !== 1) throw new Error("evento válido não reservou/aplicou exatamente uma vez");
  if (chamadas.length !== 1 || !chamadas[0].endsWith("/preapproval/" + dataId)) throw new Error("o estado não foi consultado diretamente na API do provedor");
});

Deno.test("webhook ignora tópico de plano não utilizado sem reservar evento", async () => {
  const mock = dbWebhookTeste();
  const req = new Request("https://example.test/webhook?data.id=plan-1&type=subscription_preapproval_plan", { method: "POST", body: "{}" });
  const res = await processaWebhook(req, {
    db: mock.db as any, env: { MP_ACCESS_TOKEN: "token-teste" }, PLANOS: MP_PLANOS_TESTE,
    efetivo: () => ({}), fetch: fetch,
  });
  const body = await res.json();
  if (res.status !== 200 || body.resultado !== "topico_ignorado" || mock.reservas !== 0) {
    throw new Error("tópico de plano deve ser confirmado como ignorado sem reservar evento");
  }
});
