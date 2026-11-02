// Registro mínimo de erros das funções (v10.93). Tabela public.erros_fn: só o servidor escreve e lê (RLS sem policies).
// Sem dados pessoais: guarda função, etapa, código e uma mensagem curta "limpa" (e-mails, ids, tokens e números longos trocados).
// Nunca lança: se o registro falhar, a função segue como antes. Ver os últimos: MONITORAMENTO.md.
type SB = { from(t: string): any };

export function limpa(m: unknown): string {
  let s = typeof m === "string" ? m : String((m as any)?.message ?? (m as any)?.code ?? m ?? "");
  s = s
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "<email>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>")
    .replace(/\b(bearer|apikey|api[_-]?key|token|secret|senha|password|authorization)\b(\s*[:=]\s*|\s+)\S+/gi, "$1=<oculto>")
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>")
    .replace(/[A-Za-z0-9_\-]{32,}/g, "<longo>")
    .replace(/\d{6,}/g, "<n>")
    .replace(/[\r\n\t]+/g, " ");
  return s.slice(0, 300);
}

export async function registraErro(sb: SB, funcao: string, etapa: string, e: unknown, codigo?: string | number | null): Promise<void> {
  try {
    const c = codigo ?? (e as any)?.code ?? (String((e as any)?.message ?? e).match(/\b([45]\d\d)\b/)?.[1]) ?? null;
    await sb.from("erros_fn").insert({ funcao: String(funcao).slice(0, 40), etapa: String(etapa).slice(0, 60), mensagem: limpa(e), codigo: c == null ? null : String(c).slice(0, 40) });
  } catch (_) { /* registro nunca derruba a função */ }
}
