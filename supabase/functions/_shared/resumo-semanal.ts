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
const efetivoTx = (t: any) => t && (!t.status || t.status === "pago") && !t.demo;
const valorOk = (t: any) => { const n = Number(t?.valor); return Number.isFinite(n) && n > 0 ? n : 0; };
const ultimoDiaMes = (ym: string) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();

/* Fase 2: saldo livre do mês, igual ao termômetro do app (limiteMesHTML): limite = meta de gastos do mês (cfg.metaMes) ou,
   sem meta, a soma dos orçamentos do mês (orcMes da chave mais recente <= mês, senão orc). livre = limite - despesas do mês
   (pagas, sem as linhas de fatura: compras no cartão entram pela data da compra); por dia = livre / dias que faltam (com hoje).
   Sem meta nem orçamento: entradas - saídas do mês (o "saldo do mês"). settings = o JSON de public.settings.data. */
export function livreMes(txs: any[], hoje: string, settings: any) {
  const mes = hoje.slice(0, 7), dMes = ultimoDiaMes(mes), dia = +hoje.slice(8, 10), dRest = Math.max(1, dMes - dia + 1);
  const doMes = (txs || []).filter((t) => efetivoTx(t) && !t.faturaKey && String(t.data || "").slice(0, 7) === mes);
  const soma = (tp: string) => Math.round(doMes.filter((t) => t.tipo === tp).reduce((a, t) => a + valorOk(t) * 100, 0)) / 100;
  const gasto = soma("despesa");
  const meta = Number(settings?.cfg?.metaMes);
  let lim = 0, base: "meta" | "orc" | "saldo" = "saldo";
  if (Number.isFinite(meta) && meta > 0) { lim = meta; base = "meta"; }
  else {
    const om = settings?.orcMes && typeof settings.orcMes === "object" ? settings.orcMes : {};
    let k = ""; for (const x of Object.keys(om)) if (x <= mes && x > k) k = x;
    const L = k ? om[k] : (settings?.orc && typeof settings.orc === "object" ? settings.orc : {});
    const s = Object.values(L || {}).reduce((a: number, v: any) => a + (Number(v) > 0 ? Math.round(Number(v) * 100) : 0), 0) / 100;
    if (s > 0) { lim = s; base = "orc"; }
  }
  const livre = base === "saldo" ? Math.round((soma("receita") - gasto) * 100) / 100 : Math.round((lim - gasto) * 100) / 100;
  return { livre, porDia: Math.round(livre / dRest * 100) / 100, dRest, base, gasto, lim };
}

/* Fase 2: fatura atual dos cartões, igual ao app (fechamentoDe / ccCiclos): para cada cartão ativo com fechamento e vencimento,
   a soma das compras pagas no cartão (despesa ou transferência, sem as linhas de fatura) cuja fatura fecha no mesmo dia que a
   fatura de hoje. cartoes = os JSON de public.cartoes.data. */
const pad2 = (n: number) => String(n).padStart(2, "0");
const isoU = (d: Date) => d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
const diaMesU = (y: number, m: number, d: number) => { const x = new Date(Date.UTC(y, m, 1)); const Y = x.getUTCFullYear(), M = x.getUTCMonth(); return new Date(Date.UTC(Y, M, Math.min(d, new Date(Date.UTC(Y, M + 1, 0)).getUTCDate()))); };
export function fechamentoDe(c: any, dt: string) {
  const fe = Math.max(1, Math.min(31, Number(c.fechamento) || 1)), ve = Math.max(1, Math.min(31, Number(c.vencimento) || 1));
  const y = +dt.slice(0, 4), m = +dt.slice(5, 7) - 1;
  let C = diaMesU(y, m, fe); if (isoU(C) < dt) C = diaMesU(y, m + 1, fe);
  const V = diaMesU(C.getUTCFullYear(), C.getUTCMonth() + (ve > fe ? 0 : 1), ve);
  return { fecha: isoU(C), vence: isoU(V) };
}
const datasOk = (c: any) => { const f = +c?.fechamento, v = +c?.vencimento; return f >= 1 && f <= 31 && v >= 1 && v <= 31; };
export function faturaAtual(cartoes: any[], txs: any[], hoje: string) {
  const out: { id: string; nome: string; valor: number; fecha: string; vence: string }[] = [];
  for (const c of cartoes || []) {
    if (!c || !c.id || c.arq || !datasOk(c)) continue;
    const F = fechamentoDe(c, hoje);
    const cent = (txs || []).filter((t) => efetivoTx(t) && t.cartao === c.id && !t.faturaKey && (t.tipo === "despesa" || t.tipo === "transf") && /^\d{4}-\d\d-\d\d/.test(String(t.data || "")) && fechamentoDe(c, String(t.data).slice(0, 10)).fecha === F.fecha)
      .reduce((a, t) => a + Math.round(valorOk(t) * 100), 0);
    out.push({ id: String(c.id), nome: String(c.nome || "cartão").slice(0, 40), valor: cent / 100, fecha: F.fecha, vence: F.vence });
  }
  return { cartoes: out, total: Math.round(out.reduce((a, x) => a + x.valor * 100, 0)) / 100 };
}
// janela de lançamentos que o resumo precisa ler: o ciclo do cartão mais longo (até ~62 dias antes) e compras com data futura
// até o fechamento (até 40 dias depois); cobre a semana passada e o mês inteiro
export function janelaResumo(hoje: string, de: string) {
  const ini = [somaDiasISO(hoje, -62), de, hoje.slice(0, 8) + "01"].sort()[0];
  return { de: ini, ate: somaDiasISO(hoje, 40) };
}

/* Fase 2: texto do resumo: total gasto nos últimos 7 dias (a semana passada, de segunda a domingo), saldo livre no mês com
   quanto dá por dia, e a fatura atual dos cartões. Compatível com a chamada antiga textoResumo(txs, de, ate, hoje, meta). */
export function textoResumo(txs: any[], de: string, ate: string, hoje: string, metaOuSettings: number | any = 0, cartoes: any[] = []) {
  const settings = typeof metaOuSettings === "number" ? { cfg: { metaMes: metaOuSettings } } : (metaOuSettings || {});
  const sem = (txs || []).filter((t) => efetivoTx(t) && !t.faturaKey && t.tipo === "despesa" && t.data >= de && t.data <= ate);
  const gasto = Math.round(sem.reduce((a, t) => a + valorOk(t) * 100, 0)) / 100;
  const linhas = [`📊 Seu resumo da semana (${dataBR(de, hoje)} a ${dataBR(ate, hoje)})`, `➖ Gasto nos últimos 7 dias: *${brl(gasto)}*`];
  const L = livreMes(txs, hoje, settings);
  if (L.base === "saldo") linhas.push(`💰 Saldo livre no mês: *${L.livre < 0 ? "−" : ""}${brl(Math.abs(L.livre))}*` + (L.livre > 0 ? ` · ${brl(L.porDia)}/dia até o fim do mês` : ""));
  else linhas.push(L.livre >= 0 ? `💰 Saldo livre no mês: *${brl(L.livre)}* · ${brl(L.porDia)}/dia até o fim do mês` : `💰 Saldo livre no mês: *${brl(-L.livre)} acima da ${L.base === "meta" ? "meta" : "soma dos orçamentos"}*`);
  const F = faturaAtual(cartoes, txs, hoje);
  if (F.cartoes.length === 1) linhas.push(`💳 Fatura atual (${F.cartoes[0].nome}): *${brl(F.total)}* · vence ${dataBR(F.cartoes[0].vence, hoje)}`);
  else if (F.cartoes.length > 1) linhas.push(`💳 Faturas atuais: *${brl(F.total)}* · ` + F.cartoes.map((c) => `${c.nome} ${brl(c.valor)}`).join(" · "));
  if (!sem.length) linhas.push("Nenhum gasto na semana passada. Mande seus gastos por aqui: \"almoço 32\".");
  return linhas;
}

/* Fase 2: envio em lote com intervalo entre um disparo e outro (anti-spam da Meta) e orçamento de tempo dentro do limite da
   função. Para cada pessoa: reserva a semana (se não conseguir, alguém já enviou: pula), monta o texto e envia; depois espera
   delayMs. Quando o tempo acaba, para e devolve "restantes": a próxima chamada do cron (mesma segunda) continua de onde parou,
   porque quem já recebeu está com a semana reservada. Sem rede nem banco aqui (tudo entra por deps), para os testes. */
export type DepsEnvio<T> = { reserva(v: T): Promise<boolean>; envia(v: T): Promise<void>; espera(ms: number): Promise<void>; agora(): number; erro?(v: T, e: unknown): Promise<void> | void };
export async function enviaEmLote<T>(lista: T[], d: DepsEnvio<T>, opt: { delayMs?: number; orcamentoMs?: number } = {}) {
  const delay = opt.delayMs ?? DELAY_RESUMO_MS, fim = d.agora() + (opt.orcamentoMs ?? ORCAMENTO_RESUMO_MS);
  let enviados = 0, pulados = 0, falhas = 0, i = 0;
  for (; i < lista.length; i++) {
    if (d.agora() + delay > fim) break; // sem tempo para mais um com folga: o resto fica para a próxima chamada
    const v = lista[i];
    let ok = false;
    try { ok = await d.reserva(v); } catch (e) { await d.erro?.(v, e); }
    if (!ok) { pulados++; continue; }
    try { await d.envia(v); enviados++; } catch (e) { falhas++; await d.erro?.(v, e); }
    if (i < lista.length - 1) await d.espera(delay);
  }
  return { enviados, pulados, falhas, restantes: lista.length - i };
}
export const DELAY_RESUMO_MS = 1500;       // 1,5 s entre um envio e outro
export const ORCAMENTO_RESUMO_MS = 100_000; // 100 s por chamada: cabe no limite da função (150 s) e no timeout do pg_cron (120 s)

/* Fase 1: quem recebe o resumo. A preferência fica em settings.whatsapp_resumo_semanal (padrão ligado); só recebe quem tem
   o WhatsApp ligado (linha em wa_vinculo). prefs: user_id -> valor da coluna (sem linha em settings = ligado). */
export function quemRecebeResumo<T extends { user_id: string }>(vinculos: T[], prefs: Map<string, boolean | null | undefined>): T[] {
  return (vinculos || []).filter((v) => v && v.user_id && prefs.get(v.user_id) !== false);
}
/* valor mostrado no app: sem linha em settings (ou coluna nula) = ligado, que é o padrão da coluna */
export const resumoLigado = (linha: { whatsapp_resumo_semanal?: boolean | null } | null | undefined) => linha?.whatsapp_resumo_semanal !== false;
