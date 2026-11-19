// Fase 2: idempotência das mensagens do WhatsApp (separada do whatsapp-webhook para o teste).
// O id da mensagem (wamid) é gravado em public.wa_msg (chave primária) ANTES de processar: o insert é o "on conflict do nothing"
// atômico. 23505 = a Meta reenviou uma mensagem já processada -> "repetida" (o webhook responde 200 e não faz nada).
// Outro erro -> "erro" (registra e também não processa: melhor perder do que gravar duas vezes).
export async function reservaMensagem(sb: { from(t: string): any }, id: string): Promise<"nova" | "repetida" | "erro"> {
  const { error } = await sb.from("wa_msg").insert({ id: String(id).slice(0, 200) });
  if (!error) return "nova";
  return error.code === "23505" ? "repetida" : "erro";
}
