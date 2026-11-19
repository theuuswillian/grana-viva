// Fila recuperável do WhatsApp: reserva com lease e finalização explícita.
// A RPC serializa concorrência no Postgres; leases expirados e falhas podem ser retomados.
type SupabaseRpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };

export type ReservaMensagem = "nova" | "retomada" | "repetida" | "ocupada" | "erro";

export async function reservaMensagem(
  sb: SupabaseRpc,
  id: string,
  leaseSeconds = 180,
): Promise<ReservaMensagem> {
  const { data, error } = await sb.rpc("wa_reserva_mensagem", {
    p_id: String(id).slice(0, 200),
    p_lease_seconds: leaseSeconds,
  });
  if (error) return "erro";
  if (data === "nova" || data === "retomada" || data === "repetida" || data === "ocupada") return data;
  return "erro";
}

export async function finalizaMensagem(
  sb: SupabaseRpc,
  id: string,
  sucesso: boolean,
  erro?: unknown,
): Promise<boolean> {
  const detalhe = erro instanceof Error ? erro.message : erro == null ? null : String(erro);
  const { data, error } = await sb.rpc("wa_finaliza_mensagem", {
    p_id: String(id).slice(0, 200),
    p_sucesso: sucesso,
    p_erro: detalhe,
  });
  return !error && data === true;
}
