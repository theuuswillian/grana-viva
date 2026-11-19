// Fila recuperável do WhatsApp: reserva com lease e finalização explícita.
// A RPC serializa concorrência no Postgres; leases expirados e falhas podem ser retomados.
type SupabaseRpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };

export type ReservaMensagem = "nova" | "retomada" | "repetida" | "ocupada" | "erro";
export type ResultadoReservaMensagem = { status: ReservaMensagem; token: string };

export async function reservaMensagem(
  sb: SupabaseRpc,
  id: string,
  leaseSeconds = 180,
): Promise<ResultadoReservaMensagem> {
  const token = crypto.randomUUID();
  const { data, error } = await sb.rpc("wa_reserva_mensagem", {
    p_id: String(id).slice(0, 200),
    p_token: token,
    p_lease_seconds: leaseSeconds,
  });
  if (error) return { status: "erro", token };
  if (data === "nova" || data === "retomada" || data === "repetida" || data === "ocupada") return { status: data, token };
  return { status: "erro", token };
}

export async function finalizaMensagem(
  sb: SupabaseRpc,
  id: string,
  token: string,
  sucesso: boolean,
  erro?: unknown,
): Promise<boolean> {
  const detalhe = erro instanceof Error ? erro.message : erro == null ? null : String(erro);
  const { data, error } = await sb.rpc("wa_finaliza_mensagem", {
    p_id: String(id).slice(0, 200),
    p_token: token,
    p_sucesso: sucesso,
    p_erro: detalhe,
  });
  return !error && data === true;
}

/** HTTP 429 e 5xx são falhas transitórias; 4xx restantes exigem correção/configuração, não retry automático. */
export function erroEnvioRecuperavel(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Consome a cota de leitura apenas uma vez por wamid, mesmo após retries do webhook. */
export async function contaLeituraMensagem(
  sb: SupabaseRpc,
  userId: string,
  messageId: string,
  dia: string,
  limite: number,
): Promise<boolean> {
  const { data, error } = await sb.rpc("wa_conta_leitura_ia", {
    p_uid: userId,
    p_msg_id: String(messageId).slice(0, 200),
    p_dia: dia,
    p_lim: limite,
  });
  if (error) throw error;
  return data === true;
}
