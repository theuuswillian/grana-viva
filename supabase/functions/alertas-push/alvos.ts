// Radar do alertas-push (alerta de preço dos ativos, "alvoPreco") e calendário de dias úteis da B3.
// Fase 1: helpers do Radar separados num arquivo próprio; comportamento igual ao da v10.162/v10.163.
import "../_shared/planos.js"; // v10.162: GVP.alertasPermitidos (regra do alerta mais antigo, igual no app)
const GVPi = (globalThis as any).GVP;
const FER_BR = new Set<string>(['2025-01-01','2025-03-03','2025-03-04','2025-04-18','2025-04-21','2025-05-01','2025-06-19','2025-09-07','2025-10-12','2025-11-02','2025-11-15','2025-11-20','2025-12-25','2026-01-01','2026-02-16','2026-02-17','2026-04-03','2026-04-21','2026-05-01','2026-06-04','2026-09-07','2026-10-12','2026-11-02','2026-11-15','2026-11-20','2026-12-25','2027-01-01','2027-02-08','2027-02-09','2027-03-26','2027-04-21','2027-05-01','2027-05-27','2027-09-07','2027-10-12','2027-11-02','2027-11-15','2027-11-20','2027-12-25']);
const FMT = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const tipoOf = (f: any) => f?.tipo || "fii";
export const diaUtil = (iso: string) => { const d = new Date(iso + "T12:00:00Z").getUTCDay(); return d !== 0 && d !== 6 && !FER_BR.has(iso); };
/* ativos com alerta de preço (ações, FIIs, ETFs, BDRs); cripto e renda fixa não têm cotação aqui */
export function alvos(fiis: any[]) {
  return (fiis || []).filter((f) => Number(f?.alvoP) > 0 && ["acao", "fii", "etf", "bdr"].includes(tipoOf(f)) && /^[A-Z0-9]{4,8}$/.test(String(f.ticker || "")))
    .map((f) => ({ id: String(f.id), ticker: String(f.ticker), alvo: Number(f.alvoP), dir: f.alvoDir === "abaixo" ? "abaixo" : "acima", criado: criadoAlvo(f) }));
}
/* v10.162: quando o alerta de preço foi criado. A linha fiis não tem created_at (só id, user_id, data), então vale, nesta ordem:
   1) f.alvoEm (ms, gravado pelo app quando cria/troca o alerta, v10.162);
   2) o tempo embutido no id do ativo (app: Date.now().toString(36) + 6 letras aleatórias), que é quando o ativo entrou;
   3) nada: NaN = conta como o mais antigo, na ordem gravada (a consulta lê por id). */
const T_MIN = Date.UTC(2020, 0, 1);
export function criadoAlvo(f: any, agora = Date.now()): number {
  const em = Number(f?.alvoEm);
  if (isFinite(em) && em > T_MIN && em <= agora + 864e5) return em;
  const id = String(f?.id || "");
  if (/^[0-9a-z]{9,}$/.test(id)) { const t = parseInt(id.slice(0, id.length - 6), 36); if (isFinite(t) && t > T_MIN && t <= agora + 864e5) return t; }
  return NaN;
}
// v10.161: plano Grátis = GVP "max_alertas_radar" (1) alerta de preço ATIVO. Ativo = ainda não avisou (chave fora do push_log).
// v10.162: no Grátis vale o alerta ativo MAIS ANTIGO (ORDER BY criado ASC LIMIT lim; sem data = mais antigo, na ordem gravada).
// Quem era Pro e voltou ao Grátis com vários alertas guardados recebe só o mais antigo; os outros ficam salvos. lim -1 = ilimitado (Pro).
export function capAlertas<T>(A: T[], jaAvisou: (a: T) => boolean, lim: number, criadoEm: (a: T) => number = (a: any) => Number(a?.criado)): T[] {
  const ativos = A.filter((a) => !jaAvisou(a));
  return GVPi.alertasPermitidos(ativos, lim, criadoEm);
}
export function alvoBateu(a: { alvo: number; dir: string }, preco: number) { return preco > 0 && (a.dir === "abaixo" ? preco <= a.alvo : preco >= a.alvo); }
export const chaveAlvo = (a: { id: string; dir: string; alvo: number }) => "alvo|" + a.id + "|" + a.dir + "|" + a.alvo;
export const textoAlvo = (a: { ticker: string; dir: string; alvo: number }, preco: number) =>
  `${a.ticker} ${a.dir === "abaixo" ? "caiu" : "subiu"} para ${FMT.format(preco)} (seu alerta: ${a.dir === "abaixo" ? "abaixo" : "acima"} de ${FMT.format(a.alvo)})`;
