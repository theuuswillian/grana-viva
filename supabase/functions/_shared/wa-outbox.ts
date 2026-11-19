// Outbox de saída do WhatsApp: não repetir automaticamente envios cujo resultado seja ambíguo.
type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };

export type EstadoSaida = "nova" | "retomada" | "enviada" | "ocupada" | "incerta" | "falhou";

export async function reservaSaida(
  sb: RpcClient,
  chave: string,
  telefone: string,
  corpo: Record<string, unknown>,
  leaseSeconds = 90,
): Promise<EstadoSaida> {
  const { data, error } = await sb.rpc("wa_saida_reserva", {
    p_chave: chave.slice(0, 200),
    p_telefone: telefone,
    p_corpo: corpo,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw error;
  if (data === "nova" || data === "retomada" || data === "enviada" || data === "ocupada" || data === "incerta" || data === "falhou") return data;
  throw new Error("Estado desconhecido retornado pela outbox WhatsApp");
}

export async function finalizaSaida(
  sb: RpcClient,
  chave: string,
  status: "enviada" | "falhou_segura" | "falhou" | "incerta",
  providerMessageId?: string | null,
  erro?: unknown,
): Promise<boolean> {
  const detalhe = erro instanceof Error ? erro.message : erro == null ? null : String(erro);
  const { data, error } = await sb.rpc("wa_saida_finaliza", {
    p_chave: chave.slice(0, 200),
    p_status: status,
    p_provider_msg_id: providerMessageId || null,
    p_erro: detalhe,
  });
  if (error) throw error;
  return data === true;
}
