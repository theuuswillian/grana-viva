// radar-precos · regras puras (sem rede): lidas do S.cfg.radar de cada pessoa, testadas em gv-tools/radar_test.ts.
// Mesmas regras do app (app.js: radarSaneia / radarChave / radarBateu).

export type Alerta = { id: string; tp: "acima" | "abaixo" | "queda"; v: number; g: number; leg?: string; c?: number };
export type Item = { t: string; k: string; cg?: string; n?: string; al: Alerta[] };
export type Cot = { p: number; varPct: number | null; dia?: string | null; ant?: number | null };

export const B3_RE = /^[A-Z0-9]{4,7}$/;
export const CRIPTO_RE = /^[A-Z0-9]{2,10}$/;
export const CG_RE = /^[a-z0-9-]{2,60}$/;
export const TIPOS_B3 = ["acao", "fii", "etf", "bdr"];
export const MAX_ATIVOS = 30, MAX_ALERTAS = 3;

/* confere tudo de novo no servidor: a configuração vem do aparelho da pessoa */
export function radarDe(cfg: any): Item[] {
  const r = cfg?.cfg?.radar;
  if (!Array.isArray(r)) return [];
  const out: Item[] = [], vistos = new Set<string>();
  for (const x of r.slice(0, MAX_ATIVOS)) {
    if (!x || typeof x !== "object") continue;
    const k = String(x.k || ""), t = String(x.t || "").toUpperCase();
    const cri = k === "cripto";
    if (cri ? !CRIPTO_RE.test(t) || !CG_RE.test(String(x.cg || "")) : !TIPOS_B3.includes(k) || !B3_RE.test(t)) continue;
    const kk = (cri ? "c|" : "b|") + t;
    if (vistos.has(kk)) continue; vistos.add(kk);
    const al: Alerta[] = [];
    for (const a of (Array.isArray(x.al) ? x.al : []).slice(0, MAX_ALERTAS)) {
      const tp = a?.tp, v = Number(a?.v), g = Number(a?.g), id = String(a?.id || "");
      if (!["acima", "abaixo", "queda"].includes(tp) || !(v > 0) || !isFinite(v) || !/^[a-z0-9]{1,12}$/.test(id) || !(g >= 0) || !isFinite(g)) continue;
      if (tp === "queda" && v >= 100) continue;
      const o: Alerta = { id, tp, v, g: Math.floor(g) };
      const c = Number(a?.c); if (c > 0 && isFinite(c)) o.c = Math.floor(c); // v10.163: criação do alerta (o Grátis confere só o mais antigo)
      if (typeof a.leg === "string" && /^alvo\|[\w-]{1,40}\|(acima|abaixo)\|[\d.]{1,16}$/.test(a.leg)) o.leg = a.leg;
      al.push(o);
    }
    if (!al.length) continue;
    out.push({ t, k, cg: cri ? String(x.cg) : undefined, n: typeof x.n === "string" ? x.n.slice(0, 60) : "", al });
  }
  return out;
}
export const ehCripto = (it: Item) => it.k === "cripto";
export const chaveCot = (it: Item) => ehCripto(it) ? "c:" + it.cg : it.t;
/* v10.163: no Grátis só o alerta ATIVO (ainda não disparado) mais antigo é conferido; lim -1 = todos.
   ativos(it,a) diz se o alerta ainda está ativo. Os outros continuam guardados, só não disparam. */
export function permitidos(itens: Item[], lim: number, ativo: (it: Item, a: Alerta) => boolean, GVP: any): Item[] {
  if (lim === -1 || lim == null) return itens.map((it) => ({ ...it, al: it.al.filter((a) => ativo(it, a)) })).filter((it) => it.al.length);
  const L: { it: Item; a: Alerta }[] = [];
  for (const it of itens) for (const a of it.al) if (ativo(it, a)) L.push({ it, a });
  const ok = new Set(GVP.alertasPermitidos(L, lim, (x: { a: Alerta }) => x.a.c));
  return itens.map((it) => ({ ...it, al: it.al.filter((a) => L.some((x) => ok.has(x) && x.it === it && x.a === a)) })).filter((it) => it.al.length);
}
/* chave do disparo. a geração (g) muda quando a pessoa edita ou reativa o alerta */
export const chaveAl = (it: Item, a: Alerta) => "r|" + (ehCripto(it) ? "c" : "b") + "|" + it.t + "|" + a.id + "|" + a.g;
/* queda no dia: só com cotação de hoje (feriado na B3 repetiria a variação do último pregão) */
export function bateu(a: Alerta, q: Cot | undefined, hoje?: string): boolean {
  if (!q || !(q.p > 0)) return false;
  if (a.tp === "acima") return q.p >= a.v;
  if (a.tp === "abaixo") return q.p <= a.v;
  if (q.varPct == null || !isFinite(q.varPct)) return false;
  if (hoje && q.dia && q.dia !== hoje) return false;
  return q.varPct <= -a.v;
}
const FMT = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fp = (v: number) => (Math.abs(v) >= 1 || v === 0 ? FMT.format(v) : "R$ " + v.toLocaleString("pt-BR", { maximumSignificantDigits: 4 }));
const pc = (v: number) => (Math.abs(v) < 1 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10).toLocaleString("pt-BR") + "%";
export function texto(it: Item, a: Alerta, q: Cot): string {
  if (a.tp === "queda") return `${it.t} caiu ${pc(Math.abs(q.varPct || 0))} ${ehCripto(it) ? "em 24 h" : "hoje"}, para ${fp(q.p)} (alerta: queda de ${pc(a.v)})`;
  return `${it.t} ${a.tp === "acima" ? "subiu" : "caiu"} para ${fp(q.p)} (alerta: ${a.tp} de ${fp(a.v)})`;
}
/* uma notificação por pessoa e execução; discreto (padrão) não mostra ticker nem valores na tela bloqueada */
export function payload(lista: { it: Item; a: Alerta; q: Cot }[], discreto: boolean, tagBase: string) {
  const n = lista.length;
  const title = n === 1 ? "GranaViva · Radar" : `GranaViva · Radar: ${n} alertas`;
  const body = discreto
    ? (n === 1 ? "Um ativo que você acompanha chegou no seu alerta." : `${n} ativos que você acompanha chegaram nos seus alertas.`)
    : lista.slice(0, 4).map((x) => texto(x.it, x.a, x.q)).join("\n") + (n > 4 ? `\n+${n - 4} alerta${n - 4 > 1 ? "s" : ""}` : "");
  return { title, body, url: "./?radar=1", tag: "gv-radar-" + tagBase };
}
export const discretoOn = (cfg: any) => (cfg?.cfg?.pushDiscreto ?? cfg?.pushDiscreto) !== false;
export const notifOn = (cfg: any, k: string) => !(cfg?.cfg?.notif && cfg.cfg.notif[k] === false);
export const hojeBR = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
export const diaBR = (unix: number) => hojeBR(new Date(unix * 1000));
