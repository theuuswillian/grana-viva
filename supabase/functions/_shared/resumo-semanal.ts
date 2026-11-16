// v10.165: texto do resumo semanal do WhatsApp (segunda 8h de Brasília). Sem banco e sem rede, para os testes.
// A semana resumida é a anterior (segunda a domingo, datas de America/Sao_Paulo). Lançamentos de exemplo (demo) não entram.
const brl = (v: number) => "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const dataBR = (d: string, hoje: string) => d === hoje ? "hoje" : d.slice(8, 10) + "/" + d.slice(5, 7) + (d.slice(0, 4) !== hoje.slice(0, 4) ? "/" + d.slice(0, 4) : "");
const somaDiasISO = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
// segunda-feira da semana de "hoje" (Brasília); a semana resumida é a anterior, de segunda a domingo
export function semanaPassada(hoje: string) {
  const dow = new Date(hoje + "T12:00:00Z").getUTCDay(); // 0 domingo
  const seg = somaDiasISO(hoje, -((dow + 6) % 7));
  return { seg, de: somaDiasISO(seg, -7), ate: somaDiasISO(seg, -1) };
}
export function textoResumo(txs: any[], de: string, ate: string, hoje: string, meta: number) {
  const ok = (t: any) => t && t.status !== "previsto" && t.status !== "cancelado" && !t.faturaKey && !t.demo && (t.tipo === "despesa" || t.tipo === "receita");
  const sem = txs.filter((t) => ok(t) && t.data >= de && t.data <= ate);
  const v = (t: any) => Number(t.valor) > 0 && Number.isFinite(Number(t.valor)) ? Number(t.valor) : 0;
  const gasto = sem.filter((t) => t.tipo === "despesa").reduce((a, t) => a + v(t), 0);
  const entrou = sem.filter((t) => t.tipo === "receita").reduce((a, t) => a + v(t), 0);
  const pc: Record<string, number> = {};
  for (const t of sem) if (t.tipo === "despesa") pc[t.categoria || "Outros"] = (pc[t.categoria || "Outros"] || 0) + v(t);
  const top = Object.entries(pc).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const linhas = [`📊 Seu resumo da semana (${dataBR(de, hoje)} a ${dataBR(ate, hoje)})`, `➖ Gastos: *${brl(gasto)}*`, `➕ Entradas: *${brl(entrou)}*`];
  if (top.length) linhas.push("Onde mais foi: " + top.map(([c, x]) => `${c} ${brl(x)}`).join(" · "));
  if (meta > 0) {
    const mes = hoje.slice(0, 7), dMes = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate(), dia = +hoje.slice(8, 10);
    const gm = txs.filter((t) => ok(t) && t.tipo === "despesa" && String(t.data).slice(0, 7) === mes && t.data <= hoje).reduce((a, t) => a + v(t), 0);
    const resta = meta - gm, dRest = Math.max(1, dMes - dia + 1);
    linhas.push(`🌡️ Ritmo do mês: ${Math.round(gm / meta * 100)}% da meta gasto no dia ${dia} de ${dMes}` + (resta >= 0 ? ` · dá para gastar ${brl(resta / dRest)}/dia` : ` · ${brl(-resta)} acima da meta`));
  }
  if (!sem.length) linhas.push("Nenhum lançamento na semana passada. Mande seus gastos por aqui: \"almoço 32\".");
  return linhas;
}

/* Fase 1: quem recebe o resumo. A preferência fica em settings.whatsapp_resumo_semanal (padrão ligado); só recebe quem tem
   o WhatsApp ligado (linha em wa_vinculo). prefs: user_id -> valor da coluna (sem linha em settings = ligado). */
export function quemRecebeResumo<T extends { user_id: string }>(vinculos: T[], prefs: Map<string, boolean | null | undefined>): T[] {
  return (vinculos || []).filter((v) => v && v.user_id && prefs.get(v.user_id) !== false);
}
/* valor mostrado no app: sem linha em settings (ou coluna nula) = ligado, que é o padrão da coluna */
export const resumoLigado = (linha: { whatsapp_resumo_semanal?: boolean | null } | null | undefined) => linha?.whatsapp_resumo_semanal !== false;
