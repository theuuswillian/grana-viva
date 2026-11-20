import { TABELAS, OCULTAR } from "../supabase/functions/minha-conta/tabelas.ts";

Deno.test("minha-conta: lista de exclusão inclui tabelas pessoais auxiliares", () => {
  const obrigatorias = ["tx", "settings", "assinaturas", "pagamento_eventos", "wa_pendente", "wa_codigo", "wa_vinculo", "radar_disparos"];
  for (const t of obrigatorias) if (!TABELAS.includes(t)) throw new Error("tabela ausente na exclusão: " + t);
  if (TABELAS.at(-1) !== "rl_uso") throw new Error("rl_uso deve ser apagada por último");
  if (new Set(TABELAS).size !== TABELAS.length) throw new Error("lista de tabelas contém duplicatas");
  if (TABELAS.some(t => /pluggy/i.test(t))) throw new Error("tabela Pluggy não deve integrar o fluxo atual");
});

Deno.test("minha-conta: exportação oculta segredos de push", () => {
  if (!OCULTAR.push_subs?.includes("p256dh") || !OCULTAR.push_subs?.includes("auth")) {
    throw new Error("segredos de push precisam ser excluídos do arquivo exportado");
  }
});
