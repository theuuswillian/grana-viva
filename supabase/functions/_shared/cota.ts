// v10.161: cotas mensais do plano Grátis (IA por frase, leitura de comprovante, lançamentos pelo WhatsApp).
// Usa a tabela ia_uso que já existe (20261029_ia_uso.sql + 20261101_ia_uso_tipo.sql): uma linha por (user_id, dia, k) com o contador n.
// Os tipos novos ficam na coluna k: 'frase', 'comprovante', 'whatsapp' e (v10.162) 'extrato' (k não tem CHECK, então não precisa de migração).
// O mês é o do calendário em America/Sao_Paulo (dia gravado em horário de Brasília, sem horário de verão desde 2019).
// Regra: confere ANTES de chamar a IA (Grátis e já no limite = 402 LIMITE_PLANO) e só registra o uso DEPOIS de dar certo.
// O freio técnico contra abuso (rl_conta / ia_conta_k 'leitura' e 'assistente' por dia) continua à parte, para todos os planos.
import "./planos.js";
const GVP = (globalThis as any).GVP;

export type TipoUso = "frase" | "comprovante" | "extrato" | "whatsapp";
export const RECURSO_DO_TIPO: Record<TipoUso, string> = { frase: "ia_frase", comprovante: "ia_comprovante", extrato: "ia_extrato", whatsapp: "whatsapp" };

export const hojeSP = (agora = Date.now()) => new Date(agora - 3 * 3600e3).toISOString().slice(0, 10);
export const inicioMesSP = (agora = Date.now()) => hojeSP(agora).slice(0, 8) + "01";

// soma do mês (todas as linhas do tipo k desde o dia 1 em Brasília)
export async function usoMes(sb: any, uid: string, k: TipoUso, agora = Date.now()): Promise<number> {
  const { data, error } = await sb.from("ia_uso").select("n").eq("user_id", uid).eq("k", k).gte("dia", inicioMesSP(agora));
  if (error) throw error;
  return (data || []).reduce((a: number, r: any) => a + (Number(r?.n) || 0), 0);
}

// registra 1 uso no dia de hoje (Brasília). ia_conta_k com um teto alto só incrementa (atômico no banco).
export async function registraUso(sb: any, uid: string, k: TipoUso, agora = Date.now()): Promise<void> {
  const { error } = await sb.rpc("ia_conta_k", { p_uid: uid, p_dia: hojeSP(agora), p_k: k, p_lim: 1000000 });
  if (error) console.log("registraUso", k, String(error?.message || error));
}

// null = pode seguir; senão o corpo do erro LIMITE_PLANO (o chamador responde 402 com ele)
export async function confereCota(sb: any, uid: string, nivel: number, k: TipoUso, agora = Date.now()): Promise<Record<string, unknown> | null> {
  const rec = RECURSO_DO_TIPO[k];
  const chave = GVP.COTAS[rec].k;
  const lim = GVP.limite(nivel, chave);
  if (GVP.ilimitado(lim)) return null;
  const n = await usoMes(sb, uid, k, agora);
  return GVP.cabe(nivel, chave, n) ? null : GVP.erroLimite(rec, nivel);
}

/* v10.162: resposta HTTP do bloqueio de cota para o app.
   Os pedidos do app v10.160 e v10.161 são iguais (o servidor não sabe qual dos dois chamou), e o v10.160 mostra o campo "erro"
   direto num toast. Por isso:
   - app v10.162+ manda limiteV: 2 no corpo  -> corpo novo, exato: {erro:"LIMITE_PLANO", recurso, limite, mensagem}
   - sem limiteV (v10.160, v10.161 em cache)  -> "erro" leva a frase amigável (é o que o v10.160 mostra) e upgrade:true faz o
     v10.161 abrir o aviso do Pro (trataLimitePlano: status 402 + upgrade). O código vai em "codigo" e os dados continuam lá.
   Status 402 nos dois casos (o app nunca repete 402). */
export const MSG_LIMITE_LEGADO = "Limite mensal do plano Grátis atingido. Recarregue o app ou assine o Plano Pro em Conta > Planos para liberar uso ilimitado.";
export const clienteLimiteV2 = (body: any) => Number(body?.limiteV) >= 2;
export function corpoLimite(lim: Record<string, unknown>, body: any): Record<string, unknown> {
  if (clienteLimiteV2(body)) return lim;
  return { ...lim, erro: MSG_LIMITE_LEGADO, codigo: "LIMITE_PLANO", upgrade: true };
}
