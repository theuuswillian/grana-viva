// cotacoes · Fase 2: partes puras (sem rede), usadas pelo index.ts e pelos testes.
const FMT_SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
// dia (AAAA-MM-DD) de Brasília de um instante em segundos (timestamps do Yahoo)
export const diaSP = (seg: number) => FMT_SP.format(new Date(seg * 1000));
type Guardado = { v: any; em?: string | null };
/* junta os preços frescos com o último preço conhecido de quem falhou agora (memória da função primeiro, depois o banco).
   O que vem do guardado sai com cache:true e salvoEm (quando foi lido do Yahoo); o app mostra "último preço de dd/mm hh:mm". */
export function comFallback(frescos: Record<string, any>, tks: string[], mem: Map<string, Guardado>, banco: Record<string, Guardado>) {
  const out: Record<string, any> = { ...frescos };
  for (const t of tks) {
    if (out[t]) continue;
    const g = mem.get(t) || banco[t];
    if (g && Number(g.v?.p) > 0) out[t] = { ...g.v, cache: true, salvoEm: g.em || null };
  }
  return out;
}
