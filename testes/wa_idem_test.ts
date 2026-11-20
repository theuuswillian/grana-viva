import { contaLeituraMensagem, erroEnvioRecuperavel, finalizaMensagem, reservaMensagem } from "../supabase/functions/_shared/wa-idem.ts";

Deno.test("WhatsApp fila: reserva nova mensagem", async () => {
  const seen: Record<string, unknown>[] = [];
  const sb = { rpc: async (name: string, input: Record<string, unknown>) => {
    if (name !== "wa_reserva_mensagem") throw new Error("RPC incorreta");
    seen.push(input);
    return { data: "nova", error: null };
  } };
  const r = await reservaMensagem(sb, "wamid.1");
  if (r.status !== "nova" || seen[0]?.p_id !== "wamid.1" || seen[0]?.p_lease_seconds !== 180 || seen[0]?.p_token !== r.token) {
    throw new Error("reserva nova ou lease padrão incorretos");
  }
});


Deno.test("WhatsApp fila: cada tentativa recebe um token de posse diferente", async () => {
  const tokens: string[] = [];
  const sb = { rpc: async (_name: string, args: Record<string, unknown>) => {
    tokens.push(String(args.p_token || ""));
    return { data: tokens.length === 1 ? "nova" : "retomada", error: null };
  } };
  const a = await reservaMensagem(sb, "wamid.fence");
  const b = await reservaMensagem(sb, "wamid.fence");
  if (!a.token || !b.token || a.token === b.token || tokens[0] === tokens[1]) {
    throw new Error("cada worker precisa de token de posse exclusivo");
  }
});

Deno.test("WhatsApp fila: reconhece retomada, duplicidade e lease ocupado", async () => {
  for (const status of ["retomada", "repetida", "ocupada"] as const) {
    const sb = { rpc: async () => ({ data: status, error: null }) };
    const r = await reservaMensagem(sb, "wamid.2");
    if (r.status !== status || !r.token) throw new Error(`status ${status} ou token não foi preservado`);
  }
});

Deno.test("WhatsApp fila: erro de RPC não vira duplicidade", async () => {
  const sb = { rpc: async () => ({ data: null, error: { code: "08006" } }) };
  const r = await reservaMensagem(sb, "wamid.3");
  if (r.status !== "erro" || !r.token) throw new Error("erro transitório deve solicitar retry mantendo o token local");
});

Deno.test("WhatsApp fila: finalização envia estado e detalhe", async () => {
  const seen: Record<string, unknown>[] = [];
  const sb = { rpc: async (name: string, args: Record<string, unknown>) => {
    if (name !== "wa_finaliza_mensagem") throw new Error("RPC incorreta");
    seen.push(args);
    return { data: true, error: null };
  } };
  const ok = await finalizaMensagem(sb, "wamid.4", "00000000-0000-4000-8000-000000000004", false, new Error("temporário"));
  if (!ok || seen[0]?.p_token !== "00000000-0000-4000-8000-000000000004" || seen[0]?.p_sucesso !== false || seen[0]?.p_erro !== "temporário") {
    throw new Error("finalização não enviou estado/erro corretamente");
  }
});

Deno.test("WhatsApp fila: falha ao finalizar é detectada", async () => {
  const sb = { rpc: async () => ({ data: null, error: { code: "08006" } }) };
  if (await finalizaMensagem(sb, "wamid.5", "00000000-0000-4000-8000-000000000005", true)) throw new Error("falha de finalização não pode ser sucesso");
});

Deno.test("WhatsApp envio: somente 429 e 5xx são recuperáveis", () => {
  for (const status of [429, 500, 502, 503]) {
    if (!erroEnvioRecuperavel(status)) throw new Error(`HTTP ${status} deveria permitir retry`);
  }
  for (const status of [200, 400, 401, 403, 404]) {
    if (erroEnvioRecuperavel(status)) throw new Error(`HTTP ${status} não deve entrar em retry automático`);
  }
});

Deno.test("WhatsApp IA: cota é contabilizada por ID original da mensagem", async () => {
  const calls: Record<string, unknown>[] = [];
  const sb = { rpc: async (name: string, args: Record<string, unknown>) => {
    if (name !== "wa_conta_leitura_ia") throw new Error("RPC incorreta");
    calls.push(args);
    return { data: true, error: null };
  } };
  const primeira = await contaLeituraMensagem(sb, "user-1", "wamid.ia.1", "2026-11-19", 10);
  const repetida = await contaLeituraMensagem(sb, "user-1", "wamid.ia.1", "2026-11-19", 10);
  if (!primeira || !repetida || calls.length !== 2) throw new Error("retry deve reutilizar a autorização original");
  if (calls.some((x) => x.p_msg_id !== "wamid.ia.1" || x.p_dia !== "2026-11-19")) {
    throw new Error("ID e data devem permanecer estáveis nos retries");
  }
});

Deno.test("WhatsApp IA: falha ao contabilizar cota propaga para fila", async () => {
  const sb = { rpc: async () => ({ data: null, error: { code: "08006" } }) };
  let falhou = false;
  try { await contaLeituraMensagem(sb, "user-1", "wamid.ia.2", "2026-11-19", 10); }
  catch { falhou = true; }
  if (!falhou) throw new Error("erro da RPC não pode ser tratado como resposta concluída");
});
