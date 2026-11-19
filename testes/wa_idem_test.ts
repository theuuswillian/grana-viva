import { reservaMensagem } from "../supabase/functions/_shared/wa-idem.ts";

Deno.test("WhatsApp idempotência: primeira reserva é nova", async () => {
  let inserted = false;
  const sb = { from: (_table: string) => ({ insert: async (_row: unknown) => { inserted = true; return { error: null }; } }) };
  const r = await reservaMensagem(sb, "wamid.1");
  if (r !== "nova" || !inserted) throw new Error("primeira mensagem deveria ser reservada");
});

Deno.test("WhatsApp idempotência: chave duplicada é repetida", async () => {
  const sb = { from: (_table: string) => ({ insert: async (_row: unknown) => ({ error: { code: "23505" } }) }) };
  const r = await reservaMensagem(sb, "wamid.1");
  if (r !== "repetida") throw new Error("chave duplicada deve ser ignorada");
});

Deno.test("WhatsApp idempotência: erro de banco não é tratado como repetição", async () => {
  const sb = { from: (_table: string) => ({ insert: async (_row: unknown) => ({ error: { code: "08006" } }) }) };
  const r = await reservaMensagem(sb, "wamid.2");
  if (r !== "erro") throw new Error("erro transitório precisa propagar para retry");
});
