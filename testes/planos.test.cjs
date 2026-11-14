// v10.161: node testes/planos.test.cjs  (sem dependências)
// Confere a matriz Grátis/Pro de planos.js, os apelidos de plano (free -> gratis, plus -> Pro), o corpo do erro LIMITE_PLANO,
// a cópia gerada supabase/functions/_shared/planos.js (o que os antigos t82/t93 conferiam) e o site gerado.
"use strict";
const fs = require("fs"), path = require("path"), assert = require("assert/strict");
const RAIZ = path.join(__dirname, "..");
const G = require(path.join(RAIZ, "planos.js"));
let n = 0; const t = (nome, f) => { f(); n++; console.log("ok", nome); };

t("preços", () => {
  assert.equal(G.PLANOS.gratis.preco, 0);
  assert.equal(G.PLANOS.pro.preco, 24.90); assert.equal(G.PLANOS.pro.periodo, "mes");
  assert.equal(G.PLANOS.pro_anual.preco, 179.00); assert.equal(G.PLANOS.pro_anual.periodo, "ano"); assert.equal(G.PLANOS.pro_anual.mensal, 14.90);
  assert.ok(Math.abs(1 - 179 / (24.90 * 12) - 0.40) < 0.01, "anual ~40% mais barato");
  assert.deepEqual(G.PAGOS, ["pro", "pro_anual"]);
  assert.ok(!G.vendavel("plus") && G.LEGADOS.includes("plus"));
  assert.ok(G.PLANOS.pro.legado.includes(29.90) && G.PLANOS.pro_anual.legado.includes(299));
});
t("limites", () => {
  assert.deepEqual(G.LIMITES.gratis, { lancamento_manual: -1, ia_frase_mes: 15, ia_comprovante_mes: 3, whatsapp_lancamento_mes: 5, max_cartoes: 2, max_ativos_carteira: 5, max_alertas_radar: 1, orcamento_ritmo: true });
  for (const [k, v] of Object.entries(G.LIMITES.pro)) assert.ok(v === -1 || (k === "orcamento_ritmo" && v === true), k);
  assert.equal(G.limite(0, "ia_frase_mes"), 15); assert.equal(G.limite(2, "ia_frase_mes"), -1);
  assert.equal(G.limite(0, "leitura_ia_dia"), G.ANTIABUSO.leitura_ia_dia); assert.equal(G.limite(2, "assistente_hora"), 15);
  assert.equal(G.cabe(0, "max_cartoes", 1), true); assert.equal(G.cabe(0, "max_cartoes", 2), false);
  assert.equal(G.cabe(0, "max_ativos_carteira", 4), true); assert.equal(G.cabe(0, "max_ativos_carteira", 5), false);
  assert.equal(G.cabe(0, "max_alertas_radar", 0), true); assert.equal(G.cabe(0, "max_alertas_radar", 1), false);
  assert.equal(G.cabe(2, "max_cartoes", 9999), true);
  for (const r of Object.keys(G.RECURSOS)) assert.ok(G.pode(0, r), "recurso liberado no Grátis: " + r);
});
t("erro LIMITE_PLANO", () => {
  assert.deepEqual(G.erroLimite("ia_frase", 0), { erro: "LIMITE_PLANO", recurso: "ia_frase", limite: 15, mensagem: "Você atingiu o limite de 15 lançamentos com IA deste mês no plano Grátis." });
  const c = G.erroLimite("ia_comprovante", 0); assert.equal(c.limite, 3); assert.equal(c.recurso, "ia_comprovante");
  assert.equal(G.erroLimite("whatsapp", 0).limite, 5);
  assert.equal(G.COTAS.cartoes.beneficio, "Cartões ilimitados"); assert.equal(G.COTAS.radar.beneficio, "Radar de Preços ilimitado");
  assert.equal(G.COTAS.ia_frase.beneficio, "IA ilimitada no App e no WhatsApp"); assert.equal(G.COTAS.carteira.beneficio, "Carteira ilimitada");
});
t("apelidos e efetivo()", () => {
  const AG = Date.parse("2026-11-13T12:00:00Z"), fut = "2026-12-31T00:00:00Z", pas = "2026-11-01T00:00:00Z";
  assert.equal(G.normaliza("free"), "gratis");
  let e = G.efetivo({ plano: "free", status: "ativo", periodo_fim: null }, AG); assert.equal(e.plano, "gratis"); assert.equal(e.nivel, 0); assert.equal(e.contratado, "gratis");
  e = G.efetivo({ plano: "plus", status: "ativo", periodo_fim: fut }, AG); assert.equal(e.plano, "pro"); assert.equal(e.nivel, 2);
  assert.equal(G.limite(e.nivel, "ia_frase_mes"), -1, "plus antigo = Pro ilimitado");
  e = G.efetivo({ plano: "pro_anual", status: "ativo", periodo_fim: fut }, AG); assert.equal(e.plano, "pro"); assert.equal(e.nivel, 2);
  e = G.efetivo({ plano: "pro", status: "fundador", periodo_fim: null }, AG); assert.ok(e.fundador && e.nivel === 2);
  e = G.efetivo({ plano: "pro", status: "teste", periodo_fim: fut }, AG); assert.ok(e.emTeste && e.nivel === 2);
  e = G.efetivo({ plano: "pro", status: "teste", periodo_fim: pas }, AG); assert.equal(e.nivel, 0);
  e = G.efetivo({ plano: "pro", status: "cancelado", periodo_fim: fut }, AG); assert.equal(e.nivel, 2);
  e = G.efetivo({ plano: "pro", status: "cancelado", periodo_fim: pas }, AG); assert.equal(e.nivel, 0);
  e = G.efetivo({ plano: "pro", status: "inadimplente", periodo_fim: fut }, AG); assert.equal(e.nivel, 0);
  e = G.efetivo(null, AG); assert.equal(e.plano, "gratis");
  e = G.efetivo({ plano: "xyz", status: "ativo" }, AG); assert.equal(e.nivel, 0);
  assert.equal(G.idBase("plus"), "pro"); assert.equal(G.idBase("free"), "gratis"); assert.equal(G.nivelDoPlano("plus"), 2);
});
t("cópia _shared/planos.js igual (deploy-fn.py)", () => {
  const CAB = "/* CÓPIA GERADA por deploy-fn.py a partir de /planos.js (raiz). Não edite aqui: edite /planos.js. */\n";
  const a = fs.readFileSync(path.join(RAIZ, "planos.js"), "utf8"), b = fs.readFileSync(path.join(RAIZ, "supabase/functions/_shared/planos.js"), "utf8");
  assert.equal(b, CAB + a);
});
t("site e app sem preços antigos", () => {
  const pr = fs.readFileSync(path.join(RAIZ, "site/precos.html"), "utf8");
  for (const x of ["R$ 14,90", "R$ 24,90", "R$ 179", "Mais escolhido", ...G.PRO_DIFERENCIAIS]) assert.ok(pr.includes(x), "precos.html sem: " + x);
  for (const f of ["site/precos.html", "site/index.html", "site/funcionalidades.html", "site/faq.html", "app.js"]) {
    const s = fs.readFileSync(path.join(RAIZ, f), "utf8");
    assert.ok(!/R\$ ?29,90|R\$ ?299\b|planos Plus|No Plus|Plus por/.test(s), f + " ainda cita Plus/preço antigo");
  }
  assert.ok(!/Open Finance|Pluggy|Imposto de Renda/i.test(pr), "precos.html cita Open Finance/IR");
});
console.log(n + " testes ok");
