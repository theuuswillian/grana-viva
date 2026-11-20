import { cancelaConfirmando } from "../supabase/functions/_shared/mercadopago.ts";

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
