// GranaViva · alertas-push · regras puras (sem rede), usadas pelo index.ts e pelos testes locais.
// v10.79: mesmas contas do app (app.js): vencimentos (vencEntre), orçamento (aba Orçamentos), empréstimos (empTot)
// e o resumo da semana (resumoSemana). datas sempre no fuso de Brasília, como texto AAAA-MM-DD.

export const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
const isoU = (d: Date) => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export const addDias = (s: string, k: number) => isoU(new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + k)));
const addMeses = (s: string, k: number) => { const y = +s.slice(0, 4), m = +s.slice(5, 7) - 1 + k, d = +s.slice(8, 10), Y = y + Math.floor(m / 12), M = ((m % 12) + 12) % 12; return isoU(new Date(Date.UTC(Y, M, Math.min(d, ultimoDia(Y, M))))); };
const diaMes = (y: number, m: number, d: number) => { const x = new Date(Date.UTC(y, m, 1)); const Y = x.getUTCFullYear(), M = x.getUTCMonth(); return new Date(Date.UTC(Y, M, Math.min(d, ultimoDia(Y, M)))); };
export const diaSemana = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))).getUTCDay();
export const dias = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const FMT = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (v: number) => FMT.format(Number(v) || 0);
export const fmt = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);
const cents = (v: unknown) => Math.round((Number(v) || 0) * 100);
const norm = (x: unknown) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const nomeConta = (x: unknown) => String(x || "").replace(/\s*\(fixa\)\s*$/i, "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

// status: sem status = pago; previsto/cancelado não contam (mesma regra do app).
export const efetivo = (t: any) => !t.status || t.status === "pago";
// conta fixa automática prevista para hoje ou antes: o app marca como paga ao abrir (geraRecorrentes); aqui já conta como paga.
export const efetivoEm = (t: any, hoje: string) => efetivo(t) || (t.status === "previsto" && !!t.fxAuto && typeof t.data === "string" && t.data <= hoje);

export function fechamentoDe(c: any, dt: string) {
  const fe = Math.max(1, Math.min(31, c.fechamento || 1)), ve = Math.max(1, Math.min(31, c.vencimento || 1));
  const y = +dt.slice(0, 4), m = +dt.slice(5, 7) - 1;
  let C = diaMes(y, m, fe); if (isoU(C) < dt) C = diaMes(y, m + 1, fe);
  const V = diaMes(C.getUTCFullYear(), C.getUTCMonth() + (ve > fe ? 0 : 1), ve);
  return { fecha: isoU(C), vence: isoU(V) };
}

// ---------- contas fixas (cópia de ocorrenciasFixa do app)
function regraIntervalo(f: any): { n: number; un: string } | null {
  const fr = f.freq; if (fr === "diaria") return { n: 1, un: "dia" }; if (fr === "quinzenal") return { n: 2, un: "semana" };
  if (fr === "intervalo") return { n: Math.max(1, Math.min(365, parseInt(f.n, 10) || 1)), un: ["dia", "semana", "mes"].includes(f.un) ? f.un : "dia" };
  return null;
}
export function ocorrenciasFixa(f: any, ini: string, fim: string): { data: string; key: string }[] {
  if (f.fim && ISO_RE.test(f.fim) && f.fim < fim) fim = f.fim;
  if (fim < ini) return [];
  const out: { data: string; key: string }[] = [], fr = f.freq || "mensal", cr = String(f.criadoEm || "");
  const ri = regraIntervalo(f);
  if (ri) {
    const a0 = ISO_RE.test(f.inicio || "") ? f.inicio : (cr || ini).slice(0, 10);
    if (ri.un === "mes") {
      let k = 0; if (a0 < ini) { const meses = (+ini.slice(0, 4) - +a0.slice(0, 4)) * 12 + (+ini.slice(5, 7) - +a0.slice(5, 7)); k = Math.max(0, Math.floor(meses / ri.n) - 1) * ri.n; }
      for (let g = 0; g < 2000; g++, k += ri.n) { const s = addMeses(a0, k); if (s > fim) break; if (s < ini || (cr && s < cr.slice(0, 10))) continue; out.push({ data: s, key: "fx|" + f.id + "|" + s }); }
      return out;
    }
    const passo = ri.n * (ri.un === "semana" ? 7 : 1);
    const t0 = Date.UTC(+a0.slice(0, 4), +a0.slice(5, 7) - 1, +a0.slice(8, 10)), ti = Date.UTC(+ini.slice(0, 4), +ini.slice(5, 7) - 1, +ini.slice(8, 10));
    let k = a0 < ini ? Math.ceil((ti - t0) / 864e5 / passo) * passo : 0;
    for (let g = 0; g < 2000; g++, k += passo) { const s = addDias(a0, k); if (s > fim) break; if (s < ini || (cr && s < cr.slice(0, 10))) continue; out.push({ data: s, key: "fx|" + f.id + "|" + s }); }
    return out;
  }
  const y0 = +ini.slice(0, 4), m0 = +ini.slice(5, 7) - 1, y1 = +fim.slice(0, 4), m1 = +fim.slice(5, 7) - 1;
  if (fr === "semanal") {
    const dow = Math.max(0, Math.min(6, +f.dow || 0));
    let s = ini; while (diaSemana(s) !== dow) s = addDias(s, 1);
    for (; s <= fim; s = addDias(s, 7)) { if (cr && s < cr) continue; out.push({ data: s, key: "fx|" + f.id + "|" + s }); }
    return out;
  }
  if (fr === "anual") {
    const mes = Math.max(1, Math.min(12, +f.mes || 1)) - 1;
    for (let y = y0; y <= y1; y++) { const s = isoU(new Date(Date.UTC(y, mes, Math.min(Math.max(1, f.dia || 1), ultimoDia(y, mes))))); if (s < ini || s > fim || (cr && s < cr)) continue; out.push({ data: s, key: "fx|" + f.id + "|" + y }); }
    return out;
  }
  for (let k = 0; ; k++) {
    const D = new Date(Date.UTC(y0, m0 + k, 1)); if (D.getUTCFullYear() > y1 || (D.getUTCFullYear() === y1 && D.getUTCMonth() > m1)) break;
    const ym = isoU(D).slice(0, 7);
    const s = isoU(new Date(Date.UTC(D.getUTCFullYear(), D.getUTCMonth(), Math.min(Math.max(1, f.dia || 1), ultimoDia(D.getUTCFullYear(), D.getUTCMonth())))));
    if (s < ini || s > fim || (cr && s < cr.slice(0, 10))) continue; out.push({ data: s, key: "fx|" + f.id + "|" + ym });
  }
  return out;
}

// ---------- faturas
const pagsFatura = (t: any) => Array.isArray(t.pagamentos) ? t.pagamentos : [];
function venceFatura(t: any, cartoes: any[]) { const c = cartoes.find((x) => t.faturaKey && String(t.faturaKey).indexOf("fat|" + x.id + "|") === 0); return c ? fechamentoDe(c, t.data).vence : t.data; }
function restanteFatura(t: any, cartoes: any[], pagDesde: string) {
  if (!t.faturaKey) return 0;
  if (!pagsFatura(t).length && !t.pagaEm && pagDesde && venceFatura(t, cartoes) < pagDesde) return 0;
  return Math.max(0, (cents(t.valor) - cents(t.pagoValor)) / 100);
}

export type Dados = { tx: any[]; cartoes: any[]; cfg: any };
// o que vence de ini a ate (cópia de vencEntre do app com atrasados=false)
export function vencEntre(D: Dados, ini: string, ate: string, hoje: string) {
  const out: any[] = [], vistos = new Set<string>(), pagDesde = D.cfg?.cfg?.pagDesde || "";
  for (const t of D.tx) {
    if (t.status !== "previsto" || t.tipo !== "despesa" || t.cartao || !t.data || t.data > ate || t.data < ini) continue;
    if (t.fxAuto && t.data <= hoje) continue; // vira paga no app
    if (t.fixaKey) vistos.add(t.fixaKey);
    out.push({ data: t.data, nome: t.descricao || t.categoria || "conta", valor: +t.valor || 0, tipo: t.fixaKey ? "fixa" : "conta" });
  }
  for (const f of (Array.isArray(D.cfg?.fixas) ? D.cfg.fixas : [])) {
    if (f.tipo === "receita") continue;
    for (const o of ocorrenciasFixa(f, ini, ate)) { if (vistos.has(o.key) || D.tx.some((t) => t.fixaKey === o.key)) continue; out.push({ data: o.data, nome: f.nome, valor: +f.valor || 0, tipo: "fixa" }); }
  }
  for (const t of D.tx) { if (!t.faturaKey) continue; const r = restanteFatura(t, D.cartoes, pagDesde), v = venceFatura(t, D.cartoes); if (r > 0.009 && v <= ate && v >= ini) out.push({ data: v, nome: t.descricao || "fatura", valor: r, tipo: "fatura" }); }
  const un: Record<string, any> = {}; let n = 0;
  for (const x of out) { if (x.tipo !== "fatura") x.nome = String(x.nome).replace(/\s*\(fixa\)\s*$/i, ""); const k = x.tipo === "fatura" ? "f" + (n++) : nomeConta(x.nome) + "|" + x.data + "|" + Math.round(x.valor * 100); if (!un[k] || (un[k].tipo !== "fixa" && x.tipo === "fixa")) un[k] = x; }
  return Object.values(un).sort((a: any, b: any) => a.data < b.data ? -1 : a.data > b.data ? 1 : 0);
}

// ---------- empréstimos: o que falta = saiu − voltou − perdoado (só efetivos), por pessoa
export function empAberto(D: Dados, id: string) {
  let ab = 0; for (const t of D.tx) { if (t.emp !== id || !efetivo(t)) continue; const v = cents(t.valor); ab += t.empDir === "out" ? v : -v; }
  return Math.max(0, ab) / 100;
}
export function aReceber(D: Dados) {
  let tot = 0, n = 0; for (const e of (Array.isArray(D.cfg?.emprestimos) ? D.cfg.emprestimos : [])) { const a = empAberto(D, e.id); if (a > 0) { tot += cents(a); n++; } }
  return { total: tot / 100, pessoas: n };
}

// ---------- resumo da semana (domingo R): entrou/saiu de R-7 a R-1, vence de R a R+6, a receber hoje
export function resumoSemana(D: Dados, R: string, hoje: string) {
  const ini = addDias(R, -7), fim = addDias(R, -1), ate = addDias(R, 6);
  let ent = 0, sai = 0, nE = 0, nS = 0;
  const conta = (tipo: string, v: number, ehFatura: boolean) => { if (tipo === "receita") { ent += v; nE++; } else if (tipo === "despesa" && !ehFatura) { sai += v; nS++; } };
  for (const t of D.tx) { if (!t.data || t.data < ini || t.data > fim || !efetivoEm(t, hoje)) continue; conta(t.tipo, cents(t.valor), !!t.faturaKey); }
  // conta fixa automática da semana que o app ainda não gerou (aparelho fechado): o app gera paga ao abrir
  const ger = D.cfg?.gerados || {};
  for (const f of (Array.isArray(D.cfg?.fixas) ? D.cfg.fixas : [])) {
    if (f.auto === false) continue;
    for (const o of ocorrenciasFixa(f, ini, fim)) { if (ger[o.key] || D.tx.some((t) => t.fixaKey === o.key) || o.data > hoje) continue; conta(f.tipo === "receita" ? "receita" : "despesa", cents(f.valor), false); }
  }
  const venc = vencEntre(D, R, ate, hoje), rc = aReceber(D);
  return { R, ini, fim, ate, entrou: ent / 100, saiu: sai / 100, nE, nS, venc, vencTot: venc.reduce((a: number, x: any) => a + cents(x.valor), 0) / 100, receber: rc.total, pessoas: rc.pessoas };
}
export function textoSemana(r: ReturnType<typeof resumoSemana>, discreto: boolean) {
  const title = "GranaViva · resumo da semana";
  if (discreto) return { title, body: "Seu resumo da semana está pronto: o que entrou e saiu, o que vence nos próximos 7 dias e o que tem a receber. Toque para ver." };
  const L = [`Entrou ${brl(r.entrou)} e saiu ${brl(r.saiu)} de ${fmt(r.ini)} a ${fmt(r.fim)}.`,
    r.venc.length ? `Vence até ${fmt(r.ate)}: ${brl(r.vencTot)} em ${r.venc.length} ${r.venc.length === 1 ? "conta" : "contas"}.` : `Nada vence até ${fmt(r.ate)}.`];
  if (r.receber > 0) L.push(`A receber de empréstimos: ${brl(r.receber)}.`);
  return { title, body: L.join("\n") };
}

// ---------- orçamento do mês (mesma base da aba Orçamentos: despesas efetivas da categoria no mês, cartão pela data da compra,
// sem as faturas; limite = registro mensal mais recente até o mês, senão o padrão). um aviso ao passar de 80% e outro ao estourar.
export function orcamentos(D: Dados, hoje: string): { chave: string; txt: string; cat: string; nivel: number }[] {
  const cfg = D.cfg;
  if (cfg?.cfg?.notif && cfg.cfg.notif.orc === false) return [];
  const mes = hoje.slice(0, 7), out: { chave: string; txt: string; cat: string; nivel: number }[] = [];
  const om = cfg?.orcMes && typeof cfg.orcMes === "object" ? cfg.orcMes : {};
  const k = Object.keys(om).filter((x) => /^\d{4}-\d{2}$/.test(x) && x <= mes).sort().pop();
  const orc = (k ? om[k] : cfg?.orc) || {};
  const cats: string[] | null = Array.isArray(cfg?.cats) ? cfg.cats : null;
  for (const cat of Object.keys(orc)) {
    if (cats && !cats.includes(cat)) continue; // o app só mostra as categorias que existem
    const lim = +orc[cat] || 0; if (lim <= 0) continue;
    let g = 0;
    for (const t of D.tx) if (t.tipo === "despesa" && efetivoEm(t, hoje) && !t.faturaKey && t.categoria === cat && typeof t.data === "string" && t.data.startsWith(mes)) g += cents(t.valor);
    const p = g / 100 / lim * 100;
    if (p >= 100) out.push({ chave: `orc|${cat}|${mes}|100`, txt: `Orçamento de ${cat} estourou · ${brl(g / 100)} de ${brl(lim)}`, cat, nivel: 100 });
    else if (p >= 80) out.push({ chave: `orc|${cat}|${mes}|80`, txt: `Orçamento de ${cat} em ${Math.floor(p)}% · ${brl(g / 100)} de ${brl(lim)}`, cat, nivel: 80 });
  }
  return out;
}

// ---------- alertas do dia: faturas, contas fixas, previstos e empréstimos
export function alertas(D: Dados, hoje: string): string[] {
  const { tx, cartoes, cfg } = D;
  const out: string[] = [], pagDesde = cfg?.cfg?.pagDesde, gerados = cfg?.gerados || {};
  const on = (k: string) => !(cfg?.cfg?.notif && cfg.cfg.notif[k] === false);
  const N = [0, 1, 2, 3, 5, 7].includes(+cfg?.cfg?.avisoDias) ? +cfg.cfg.avisoDias : 3;
  const emN = (d: number) => `vence em ${d} dias`;
  // ocorrência da conta fixa no dia d (mesma regra e chave do app, inclusive diária, quinzenal e personalizada)
  const occ = (f: any, d: string) => ocorrenciasFixa(f, d, d)[0] || null;
  for (const c of cartoes) {
    const somas: Record<string, { c: number; fecha: string }> = {};
    for (const t of tx) {
      if (t.cartao !== c.id || !(t.tipo === "despesa" || t.tipo === "transf") || !t.data || !efetivo(t)) continue;
      const f = fechamentoDe(c, t.data);
      const k = "fat|" + c.id + "|" + f.fecha.slice(0, 7);
      (somas[k] = somas[k] || { c: 0, fecha: f.fecha }).c += cents(t.valor);
    }
    for (const k of Object.keys(somas)) {
      if (gerados[k] === "del") continue;
      const { vence } = fechamentoDe(c, somas[k].fecha);
      const fat = tx.find((t) => t.faturaKey === k);
      if (!fat?.pagaEm && pagDesde && vence < pagDesde) continue;
      const resto = (somas[k].c - cents(fat?.pagoValor)) / 100;
      if (resto <= 0.009) continue;
      const d = dias(hoje, vence), nome = c.nome || "cartão";
      if (N > 1 && d === N && on("fatVence")) out.push(`Fatura ${nome} ${emN(d)} (${fmt(vence)}) · ${brl(resto)}`);
      else if (d === 1 && on("fatVence")) out.push(`Fatura ${nome} vence amanhã · ${brl(resto)}`);
      else if (d === 0 && on("fatVence")) out.push(`Fatura ${nome} vence hoje · ${brl(resto)}`);
      else if ((d === -1 || d === -3 || d === -7) && on("fatAtras")) out.push(`Fatura ${nome} está atrasada desde ${fmt(vence)} · ${brl(resto)}`);
    }
  }
  const amanha = addDias(hoje, 1), diaN = addDias(hoje, N);
  for (const f of (on("fixas") ? cfg?.fixas || [] : [])) {
    if (f.tipo === "receita") continue;
    const pago = (o: any) => { const t = tx.find((x) => x.fixaKey === o.key); return !!t && t.status !== "previsto"; };
    const oH = occ(f, hoje), oA = occ(f, amanha), oN = N > 1 ? occ(f, diaN) : null;
    if (oH && !pago(oH)) out.push(`Conta fixa ${f.nome} vence hoje · ${brl(+f.valor || 0)}`);
    else if (oA && !pago(oA)) out.push(`Conta fixa ${f.nome} vence amanhã · ${brl(+f.valor || 0)}`);
    else if (oN && !pago(oN)) out.push(`Conta fixa ${f.nome} ${emN(N)} (${fmt(diaN)}) · ${brl(+f.valor || 0)}`);
  }
  for (const t of (on("previstos") ? tx : [])) {
    if (t.status !== "previsto" || t.tipo !== "despesa" || t.cartao || t.fxAuto || typeof t.data !== "string") continue;
    if (t.fixaKey && (cfg?.fixas || []).some((f: any) => (t.data === hoje || t.data === amanha || (N > 1 && t.data === diaN)) && occ(f, t.data)?.key === t.fixaKey)) continue; // já avisado acima
    const d = dias(hoje, t.data), nome = t.descricao || t.categoria || "conta";
    if (d === 0) out.push(`${nome} vence hoje · ${brl(+t.valor || 0)}`);
    else if (d === 1) out.push(`${nome} vence amanhã · ${brl(+t.valor || 0)}`);
    else if (N > 1 && d === N) out.push(`${nome} ${emN(d)} (${fmt(t.data)}) · ${brl(+t.valor || 0)}`);
    else if (d === -1 || d === -3 || d === -7) out.push(`${nome} está atrasada desde ${fmt(t.data)} · ${brl(+t.valor || 0)}`);
  }
  for (const e of (on("previstos") ? cfg?.emprestimos || [] : [])) {
    if (typeof e?.prev !== "string" || !e.prev) continue;
    const ab = empAberto(D, e.id); if (ab <= 0) continue;
    const d = dias(hoje, e.prev), nome = String(e.pessoa || "alguém").slice(0, 40);
    if (d === 0) out.push(`${nome} combinou de devolver hoje · falta ${brl(ab)}`);
    else if (d === 1) out.push(`${nome} combinou de devolver amanhã · falta ${brl(ab)}`);
    else if (N > 1 && d === N) out.push(`${nome} combinou de devolver em ${d} dias (${fmt(e.prev)}) · falta ${brl(ab)}`);
    else if (d === -1 || d === -3 || d === -7) out.push(`${nome} está atrasado desde ${fmt(e.prev)} · falta ${brl(ab)}`);
  }
  return out;
}

// notificações discretas (padrão): sem valores na tela bloqueada
export const discretoOn = (cfg: any) => (cfg?.cfg?.pushDiscreto ?? cfg?.pushDiscreto) !== false;
export const semValores = (t: string) => t.replace(/\s*·\s*(falta\s*)?R\$\s?-?\d[\d.,]*/g, "").replace(/\s*(de|em)?\s*R\$\s?-?\d[\d.,]*/g, "").replace(/\s·\s*$/, "").trim();
