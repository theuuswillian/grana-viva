import { finalizaMensagem, reservaMensagem } from "../supabase/functions/_shared/wa-idem.ts";

Deno.test("WhatsApp fila: reserva nova mensagem", async () => {
  let args: Record<string, unknown> | null = null;
  const sb = { rpc: async (name: string, input: Record<string, unknown>) => {
    if (name !== "wa_reserva_mensagem") throw new Error("RPC incorreta");
    args = input;
    return { data: "nova", error: null };
  } };
  const r = await reservaMensagem(sb, "wamid.1");
  if (r !== "nova" || args?.p_id !== "wamid.1" || args?.p_lease_seconds !== 180) {
    throw new Error("reserva nova ou lease padrão incorretos");
  }
});

Deno.test("WhatsApp fila: reconhece retomada, duplicidade e lease ocupado", async () => {
  for (const status of ["retomada", "repetida", "ocupada"] as const) {
    const sb = { rpc: async () => ({ data: status, error: null }) };
    const r = await reservaMensagem(sb, "wamid.2");
    if (r !== status) throw new Error(`status ${status} não foi preservado`);
  }
});

Deno.test("WhatsApp fila: erro de RPC não vira duplicidade", async () => {
  const sb = { rpc: async () => ({ data: null, error: { code: "08006" } }) };
  const r = await reservaMensagem(sb, "wamid.3");
  if (r !== "erro") throw new Error("erro transitório deve solicitar retry");
});

Deno.test("WhatsApp fila: finalização envia estado e detalhe", async () => {
  let received: Record<string, unknown> | null = null;
  const sb = { rpc: async (name: string, args: Record<string, unknown>) => {
    if (name !== "wa_finaliza_mensagem") throw new Error("RPC incorreta");
    received = args;
    return { data: true, error: null };
  } };
  const ok = await finalizaMensagem(sb, "wamid.4", false, new Error("temporário"));
  if (!ok || received?.p_sucesso !== false || received?.p_erro !== "temporário") {
    throw new Error("finalização não enviou estado/erro corretamente");
  }
});

Deno.test("WhatsApp fila: falha ao finalizar é detectada", async () => {
  const sb = { rpc: async () => ({ data: null, error: { code: "08006" } }) };
  if (await finalizaMensagem(sb, "wamid.5", true)) throw new Error("falha de finalização não pode ser sucesso");
});
