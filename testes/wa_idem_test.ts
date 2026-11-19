import { erroEnvioRecuperavel, finalizaMensagem, reservaMensagem } from "../supabase/functions/_shared/wa-idem.ts";

Deno.test("WhatsApp fila: reserva nova mensagem", async () => {
  const seen: Record<string, unknown>[] = [];
  const sb = { rpc: async (name: string, input: Record<string, unknown>) => {
    if (name !== "wa_reserva_mensagem") throw new Error("RPC incorreta");
    seen.push(input);
    return { data: "nova", error: null };
  } };
  const r = await reservaMensagem(sb, "wamid.1");
  if (r !== "nova" || seen[0]?.p_id !== "wamid.1" || seen[0]?.p_lease_seconds !== 180) {
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
  const seen: Record<string, unknown>[] = [];
  const sb = { rpc: async (name: string, args: Record<string, unknown>) => {
    if (name !== "wa_finaliza_mensagem") throw new Error("RPC incorreta");
    seen.push(args);
    return { data: true, error: null };
  } };
  const ok = await finalizaMensagem(sb, "wamid.4", false, new Error("temporário"));
  if (!ok || seen[0]?.p_sucesso !== false || seen[0]?.p_erro !== "temporário") {
    throw new Error("finalização não enviou estado/erro corretamente");
  }
});

Deno.test("WhatsApp fila: falha ao finalizar é detectada", async () => {
  const sb = { rpc: async () => ({ data: null, error: { code: "08006" } }) };
  if (await finalizaMensagem(sb, "wamid.5", true)) throw new Error("falha de finalização não pode ser sucesso");
});

Deno.test("WhatsApp envio: somente 429 e 5xx são recuperáveis", () => {
  for (const status of [429, 500, 502, 503]) {
    if (!erroEnvioRecuperavel(status)) throw new Error(`HTTP ${status} deveria permitir retry`);
  }
  for (const status of [200, 400, 401, 403, 404]) {
    if (erroEnvioRecuperavel(status)) throw new Error(`HTTP ${status} não deve entrar em retry automático`);
  }
});
