import { finalizaSaida, reservaSaida } from "../supabase/functions/_shared/wa-outbox.ts";

Deno.test("WhatsApp outbox: reconhece estados da reserva", async () => {
  for (const estado of ["nova", "retomada", "enviada", "ocupada", "incerta", "falhou"] as const) {
    const sb = { rpc: async () => ({ data: estado, error: null }) };
    const r = await reservaSaida(sb, "in:wamid.1:reply", "5561999999999", { type: "text" });
    if (r !== estado) throw new Error("estado da outbox não foi preservado: " + estado);
  }
});

Deno.test("WhatsApp outbox: falha de reserva propaga erro", async () => {
  const sb = { rpc: async () => ({ data: null, error: { code: "08006" } }) };
  let falhou = false;
  try { await reservaSaida(sb, "key", "5561999999999", { type: "text" }); } catch { falhou = true; }
  if (!falhou) throw new Error("erro da outbox precisa interromper o envio");
});

Deno.test("WhatsApp outbox: finalização envia status e ID do provedor", async () => {
  const argsSeen: Record<string, unknown>[] = [];
  const sb = { rpc: async (_name: string, args: Record<string, unknown>) => {
    argsSeen.push(args);
    return { data: true, error: null };
  } };
  const ok = await finalizaSaida(sb, "key", "enviada", "wamid.provider.1");
  if (!ok || argsSeen[0]?.p_status !== "enviada" || argsSeen[0]?.p_provider_msg_id !== "wamid.provider.1") {
    throw new Error("finalização da outbox não persistiu resultado do provedor");
  }
});
