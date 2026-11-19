// minha-conta · Fase 2: tabelas com dados da pessoa, separadas do index.ts para o teste conferir a lista.
// Toda tabela com user_id entra aqui (exportar e excluir). Manter em dia ao criar tabela nova.
// As do WhatsApp (wa_vinculo, wa_codigo, wa_pendente) e radar_disparos também têm ON DELETE CASCADE em auth.users, mas são
// apagadas aqui de forma explícita (a exclusão não depende do cascade). wa_msg guarda só ids de mensagens da Meta (sem
// user_id nem telefone) e some sozinha em 30 dias. wa_saida_teste (envios simulados sem token da Meta) é apagada pelo telefone.
// rl_uso fica por último: o limitador acabou de gravar nela.
export const TABELAS = ["tx", "fiis", "metas", "cartoes", "bancos", "settings", "push_subs", "push_log", "ia_uso", "assinaturas", "pagamento_eventos",
  "wa_pendente", "wa_codigo", "wa_vinculo", "radar_disparos", "rl_uso"];
// colunas que nunca saem no arquivo de exportação (segredos de acesso)
export const OCULTAR: Record<string, string[]> = { push_subs: ["p256dh", "auth"] };
