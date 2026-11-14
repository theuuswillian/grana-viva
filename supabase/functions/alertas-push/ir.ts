// v10.112: imposto das vendas (DARF 6015) e alerta de preço, para o push do servidor.
// Mesma conta do app (app.js, irVendas/irApura, v10.111). Regras de 2026: ações, ETFs e BDRs 15% (lucro de ações isento
// com vendas de ações até R$ 20 mil no mês); FIIs 20%; prejuízo compensa na mesma categoria; desconta o IRRF de 0,005%;
// imposto abaixo de R$ 10 vai para o mês seguinte; vence no último dia útil do mês seguinte. Day trade e cripto ficam fora.
const FER_BR = new Set<string>(['2025-01-01','2025-03-03','2025-03-04','2025-04-18','2025-04-21','2025-05-01','2025-06-19','2025-09-07','2025-10-12','2025-11-02','2025-11-15','2025-11-20','2025-12-25','2026-01-01','2026-02-16','2026-02-17','2026-04-03','2026-04-21','2026-05-01','2026-06-04','2026-09-07','2026-10-12','2026-11-02','2026-11-15','2026-11-20','2026-12-25','2027-01-01','2027-02-08','2027-02-09','2027-03-26','2027-04-21','2027-05-01','2027-05-27','2027-09-07','2027-10-12','2027-11-02','2027-11-15','2027-11-20','2027-12-25']);
const pad = (n: number) => String(n).padStart(2, "0");
const isoU = (d: Date) => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
const cents = (v: unknown) => Math.round((Number(v) || 0) * 100);
const Q8 = (x: number) => Math.round(x * 1e8) / 1e8;
const FMT = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (c: number) => FMT.format(c / 100);
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const mesNome = (k: string) => MESES[+k.slice(5, 7) - 1] + " de " + k.slice(0, 4);
const IR_TIPOS: Record<string, string> = { acao: "comum", etf: "comum", bdr: "comum", fii: "fii" };
const tipoOf = (f: any) => f?.tipo || "fii";
export const diaUtil = (iso: string) => { const d = new Date(iso + "T12:00:00Z").getUTCDay(); return d !== 0 && d !== 6 && !FER_BR.has(iso); };
export function ultimoDiaUtil(ano: number, mes0: number) { const d = new Date(Date.UTC(ano, mes0 + 1, 0)); while (!diaUtil(isoU(d))) d.setUTCDate(d.getUTCDate() - 1); return isoU(d); }

export function irApura(fiis: any[]) {
  type V = { mes: string; cat: string; acao: boolean; venda: number; ganho: number };
  const vendas: V[] = [];
  for (const f of fiis || []) {
    const cat = IR_TIPOS[tipoOf(f)]; if (!cat) continue;
    const ord = (Array.isArray(f.ops) ? f.ops : []).slice().sort((a: any, b: any) => (a.tipo === "inicial" ? -1 : 0) - (b.tipo === "inicial" ? -1 : 0) || String(a.data).localeCompare(String(b.data)));
    let q = 0, custo = 0;
    for (const o of ord) {
      const qtd = Number(o.qtd) || 0, preco = Number(o.preco) || 0;
      if (o.tipo === "inicial") { q = Q8(q + qtd); custo += cents(o.custo); }
      else if (o.tipo === "compra") { q = Q8(q + qtd); custo += cents(qtd * preco) + cents(o.taxas); }
      else if (o.tipo === "venda" && o.data) {
        if (qtd > q + 1e-9 || !q) continue;
        const baixa = Math.round(custo * qtd / q), bruto = cents(qtd * preco);
        vendas.push({ mes: String(o.data).slice(0, 7), cat, acao: tipoOf(f) === "acao", venda: bruto, ganho: bruto - cents(o.taxas) - baixa });
        custo -= baixa; q = Q8(q - qtd); if (q <= 0) { q = 0; custo = 0; }
      }
    }
  }
  const M: Record<string, any> = {};
  for (const v of vendas) {
    const m = M[v.mes] || (M[v.mes] = { mes: v.mes, vAcoes: 0, vComum: 0, vFii: 0, gAcoes: 0, gOutros: 0, gFii: 0 });
    if (v.cat === "fii") { m.vFii += v.venda; m.gFii += v.ganho; } else { m.vComum += v.venda; if (v.acao) { m.vAcoes += v.venda; m.gAcoes += v.ganho; } else m.gOutros += v.ganho; }
  }
  let pC = 0, pF = 0, resto = 0;
  const out: { mes: string; darf: number; vence: string }[] = [];
  for (const k of Object.keys(M).sort()) {
    const m = M[k];
    const isento = m.vAcoes > 0 && m.vAcoes <= 2000000;
    let bC = (isento && m.gAcoes > 0 ? 0 : m.gAcoes) + m.gOutros, bF = m.gFii;
    if (bC > 0) { const u = Math.min(bC, pC); bC -= u; pC -= u; } else { pC += -bC; bC = 0; }
    if (bF > 0) { const u = Math.min(bF, pF); bF -= u; pF -= u; } else { pF += -bF; bF = 0; }
    const irrf = Math.round((bC > 0 ? m.vComum : 0) * 0.00005) + Math.round((bF > 0 ? m.vFii : 0) * 0.00005);
    const imposto = Math.max(0, Math.round(bC * 0.15) + Math.round(bF * 0.2) - irrf);
    const tot = imposto + resto;
    let darf = 0; if (tot >= 1000) { darf = tot; resto = 0; } else resto = tot;
    const a = +k.slice(0, 4), mm = +k.slice(5, 7) - 1;
    out.push({ mes: k, darf, vence: ultimoDiaUtil(mm === 11 ? a + 1 : a, (mm + 1) % 12) });
  }
  return out;
}
const dias = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
/* DARF a pagar: um aviso quando faltam 7 dias (ou menos, se o mês já entrou assim) e outro no dia. chaves no push_log */
export function darfAvisos(fiis: any[], cfg: any, hoje: string): { chave: string; txt: string; disc: string }[] {
  const pagos = (cfg && cfg.darfPago && typeof cfg.darfPago === "object") ? cfg.darfPago : {};
  const out: { chave: string; txt: string; disc: string }[] = [];
  for (const m of irApura(fiis)) {
    if (!(m.darf > 0) || pagos[m.mes] || m.mes >= hoje.slice(0, 7) || m.vence < hoje) continue;
    const d = dias(hoje, m.vence);
    if (d > 7) continue;
    const fase = d === 0 ? "d0" : "d7";
    out.push({ chave: "darf|" + m.mes + "|" + fase, txt: `DARF das vendas de ${mesNome(m.mes)}: ${brl(m.darf)}, ${d === 0 ? "vence hoje" : d === 1 ? "vence amanhã" : "vence em " + d + " dias"}`, disc: "darf|" + (d === 0 ? "vence hoje" : "vence em breve") });
  }
  return out;
}
/* ativos com alerta de preço (ações, FIIs, ETFs, BDRs); cripto e renda fixa não têm cotação aqui */
export function alvos(fiis: any[]) {
  return (fiis || []).filter((f) => Number(f?.alvoP) > 0 && ["acao", "fii", "etf", "bdr"].includes(tipoOf(f)) && /^[A-Z0-9]{4,8}$/.test(String(f.ticker || "")))
    .map((f) => ({ id: String(f.id), ticker: String(f.ticker), alvo: Number(f.alvoP), dir: f.alvoDir === "abaixo" ? "abaixo" : "acima" }));
}
// v10.161: plano Grátis = GVP "max_alertas_radar" (1) alerta de preço ATIVO. Ativo = ainda não avisou (chave fora do push_log).
// Mantém a ordem dos ativos e conferem só os primeiros lim; lim -1 = ilimitado (Pro).
export function capAlertas<T>(A: T[], jaAvisou: (a: T) => boolean, lim: number): T[] {
  const ativos = A.filter((a) => !jaAvisou(a));
  return lim === -1 || lim == null ? ativos : ativos.slice(0, Math.max(0, lim | 0));
}
export function alvoBateu(a: { alvo: number; dir: string }, preco: number) { return preco > 0 && (a.dir === "abaixo" ? preco <= a.alvo : preco >= a.alvo); }
export const chaveAlvo = (a: { id: string; dir: string; alvo: number }) => "alvo|" + a.id + "|" + a.dir + "|" + a.alvo;
export const textoAlvo = (a: { ticker: string; dir: string; alvo: number }, preco: number) =>
  `${a.ticker} ${a.dir === "abaixo" ? "caiu" : "subiu"} para ${FMT.format(preco)} (seu alerta: ${a.dir === "abaixo" ? "abaixo" : "acima"} de ${FMT.format(a.alvo)})`;
