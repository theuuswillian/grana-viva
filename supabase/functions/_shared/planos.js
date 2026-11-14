/* CÓPIA GERADA por deploy-fn.py a partir de /planos.js (raiz). Não edite aqui: edite /planos.js. */
/* GranaViva · planos e direitos (v10.82; v10.161: dois planos, Grátis e Pro, com cotas mensais). FONTE ÚNICA.
   Este arquivo é usado igual por:
   - o app (index.html carrega planos.js?v=versão) para mostrar telas e abrir o aviso de upgrade nos limites;
   - as páginas públicas (gerador site.py lê os preços, os limites e os diferenciais daqui);
   - as funções do Supabase (alertas-push, assistente, ler-comprovante, assinatura, pagamento-webhook, whatsapp-*), que importam
     supabase/functions/_shared/planos.js: UMA cópia gerada deste arquivo por deploy-fn.py (v10.93). deploy-fn.py recusa
     publicar se ela estiver diferente, e o teste testes/planos.test.cjs confere.
   Quem decide o plano de verdade é o servidor (tabela assinaturas, escrita só pelo webhook de pagamento).
   As cotas de IA e WhatsApp são contadas no servidor (tabela ia_uso); cartões, carteira e radar são conferidos no app
   (e o radar também no servidor, em alertas-push).
   v10.161: o Plus deixou de ser vendido. Quem já tem linha "plus" vale como Pro (mantido). "free" é sinônimo de "gratis". */
(function (g) {
  "use strict";
  // nível: 0 grátis, 2 pro (o 1 era o Plus; quem ainda tem "plus" gravado recebe o nível do Pro).
  // legado: preços antigos que o webhook de pagamento ainda aceita para assinaturas já existentes.
  var PLANOS = {
    gratis:    { id: "gratis",    nome: "Grátis",    nivel: 0, preco: 0,      periodo: null,  rotulo: "R$ 0" },
    pro:       { id: "pro",       nome: "Pro",       nivel: 2, preco: 24.90,  periodo: "mes", rotulo: "R$ 24,90/mês", legado: [29.90] },
    pro_anual: { id: "pro_anual", nome: "Pro anual", nivel: 2, preco: 179.00, periodo: "ano", rotulo: "R$ 179/ano", base: "pro", mensal: 14.90, economiaPct: 40, legado: [299.00] },
    plus:      { id: "plus",      nome: "Pro",       nivel: 2, preco: 14.90,  periodo: "mes", rotulo: "R$ 14,90/mês", base: "pro", descontinuado: true }
  };
  var ALIAS = { free: "gratis" };
  var PAGOS = ["pro", "pro_anual"];   // à venda
  var LEGADOS = ["plus"];             // não se vende mais; assinaturas antigas continuam valendo como Pro
  // recurso -> nível mínimo. v10.161: no modelo de dois planos tudo fica no Grátis; o que muda são as cotas (LIMITES).
  var RECURSOS = {
    lancamentos:      { nivel: 0, nome: "Lançamentos manuais" },
    contas:           { nivel: 0, nome: "Contas e bancos" },
    categorias:       { nivel: 0, nome: "Categorias" },
    dashboard:        { nivel: 0, nome: "Início (resumo do mês)" },
    alertas:          { nivel: 0, nome: "Alertas de vencimento" },
    exportar:         { nivel: 0, nome: "Exportar e excluir seus dados" },
    planejamento:     { nivel: 0, nome: "Planejamento e projeções" },
    orcamentos:       { nivel: 0, nome: "Orçamentos por categoria" },
    cartoes:          { nivel: 0, nome: "Cartões e faturas" },
    relatorios:       { nivel: 0, nome: "Relatórios completos" },
    importar_extrato: { nivel: 0, nome: "Importar extrato (OFX/CSV)" },
    comprovantes:     { nivel: 0, nome: "Comprovantes anexados" },
    leitura_ia:       { nivel: 0, nome: "Ler comprovante ou frase com IA" },
    investimentos:    { nivel: 0, nome: "Investimentos (FIIs, renda fixa, cotações)" },
    patrimonio:       { nivel: 0, nome: "Patrimônio" },
    metas:            { nivel: 0, nome: "Metas" },
    assistente:       { nivel: 0, nome: "Assistente com IA" }
  };
  // cotas por plano (-1 = ilimitado). *_mes: por mês do calendário (America/Sao_Paulo), contadas no servidor.
  var LIMITES = {
    gratis: { lancamento_manual: -1, ia_frase_mes: 15, ia_comprovante_mes: 3, whatsapp_lancamento_mes: 5, max_cartoes: 2, max_ativos_carteira: 5, max_alertas_radar: 1, orcamento_ritmo: true },
    pro:    { lancamento_manual: -1, ia_frase_mes: -1, ia_comprovante_mes: -1, whatsapp_lancamento_mes: -1, max_cartoes: -1, max_ativos_carteira: -1, max_alertas_radar: -1, orcamento_ritmo: true }
  };
  // freio técnico contra abuso, igual para todos os planos (não é cota de plano; o Pro "ilimitado" continua com ele)
  var ANTIABUSO = { leitura_ia_dia: 60, assistente_dia: 40, assistente_hora: 15 };
  // recurso do aviso de limite -> chave em LIMITES, benefício que o Pro libera e a frase do aviso
  var COTAS = {
    ia_frase:       { k: "ia_frase_mes",            beneficio: "IA ilimitada no App e no WhatsApp", msg: function (n) { return "Você atingiu o limite de " + n + " lançamentos com IA deste mês no plano Grátis."; } },
    ia_comprovante: { k: "ia_comprovante_mes",      beneficio: "IA ilimitada no App e no WhatsApp", msg: function (n) { return "Você atingiu o limite de " + n + " leituras de comprovante com IA deste mês no plano Grátis."; } },
    whatsapp:       { k: "whatsapp_lancamento_mes", beneficio: "IA ilimitada no App e no WhatsApp", msg: function (n) { return "Você atingiu o limite de " + n + " lançamentos pelo WhatsApp deste mês no plano Grátis."; } },
    cartoes:        { k: "max_cartoes",             beneficio: "Cartões ilimitados",               msg: function (n) { return "O plano Grátis permite até " + n + " cartões."; } },
    carteira:       { k: "max_ativos_carteira",     beneficio: "Carteira ilimitada",               msg: function (n) { return "O plano Grátis permite até " + n + " ativos na carteira."; } },
    radar:          { k: "max_alertas_radar",       beneficio: "Radar de Preços ilimitado",        msg: function (n) { return "O plano Grátis permite " + n + " alerta de preço ativo."; } }
  };
  // os diferenciais do Pro, nesta ordem, no app e no site
  var PRO_DIFERENCIAIS = ["IA ilimitada por frase e foto de recibo", "WhatsApp ilimitado para lançamentos e consultas", "Cartões ilimitados", "Carteira ilimitada", "Radar de Preços ilimitado"];
  var TESTE_DIAS = 14;      // conta nova: Pro grátis por 14 dias, depois Grátis
  var STATUS = ["ativo", "cancelado", "inadimplente", "teste", "fundador"];

  function normaliza(p) { p = p == null ? "" : String(p); return ALIAS[p] || p; }
  function nivelDoPlano(p) { var x = PLANOS[normaliza(p)]; return x ? x.nivel : 0; }
  function idBase(p) { var x = PLANOS[normaliza(p)]; return x ? (x.base || x.id) : "gratis"; }
  function ms(d) { if (d == null || d === "") return NaN; var t = typeof d === "number" ? d : Date.parse(d); return isNaN(t) ? NaN : t; }

  /* plano que vale agora, a partir da linha da tabela assinaturas (ou null = sem linha).
     fundador: o plano gravado, sem fim.  teste/ativo/cancelado: o plano até periodo_fim (sem data = sem acesso pago, exceto ativo).
     inadimplente: grátis.  Qualquer coisa desconhecida: grátis.  "plus" (legado) vale como Pro; "free" é o Grátis. */
  function efetivo(a, agora) {
    var now = agora == null ? Date.now() : ms(agora);
    var pl = a ? normaliza(a.plano) : null;
    var r = { plano: "gratis", nivel: 0, status: a && a.status || null, contratado: pl, ate: null, emTeste: false, diasRestantes: null, fundador: false };
    if (!a || !PLANOS[pl] || STATUS.indexOf(a.status) < 0) return r;
    var fim = ms(a.periodo_fim);
    var vale = false;
    if (a.status === "fundador") { vale = true; r.fundador = true; }
    else if (a.status === "ativo") vale = isNaN(fim) || now < fim;
    else if (a.status === "teste" || a.status === "cancelado") vale = !isNaN(fim) && now < fim;
    if (!vale || pl === "gratis") return r;
    r.plano = idBase(pl); r.nivel = nivelDoPlano(pl);
    if (!isNaN(fim) && a.status !== "fundador") { r.ate = new Date(fim).toISOString(); r.diasRestantes = Math.max(0, Math.ceil((fim - now) / 86400000)); }
    r.emTeste = a.status === "teste";
    return r;
  }
  function pode(nivel, recurso) { var x = RECURSOS[recurso]; if (!x) return false; return (nivel | 0) >= x.nivel; }
  // limite(nivel, chave): cota do plano (-1 = ilimitado); as chaves antigas *_dia devolvem o freio técnico (igual para todos)
  function limite(nivel, k) {
    if (Object.prototype.hasOwnProperty.call(ANTIABUSO, k)) return ANTIABUSO[k];
    var l = LIMITES[(nivel | 0) > 0 ? "pro" : "gratis"];
    return l && Object.prototype.hasOwnProperty.call(l, k) ? l[k] : 0;
  }
  function ilimitado(v) { return v === -1 || v === true; }
  // cabe(nivel, chave, usados): ainda dá para usar mais um?
  function cabe(nivel, k, usados) { var l = limite(nivel, k); if (ilimitado(l)) return true; if (typeof l !== "number") return false; return (usados | 0) < l; }
  // corpo do erro LIMITE_PLANO que as funções devolvem (HTTP 402) e o app entende
  function erroLimite(recurso, nivel) {
    var c = COTAS[recurso]; if (!c) return null;
    var n = limite(nivel == null ? 0 : nivel, c.k);
    return { erro: "LIMITE_PLANO", recurso: recurso, limite: n, mensagem: c.msg(n) };
  }
  // plano mais barato que libera o recurso (para o texto do aviso de upgrade)
  function planoMinimo(recurso) { var x = RECURSOS[recurso]; if (!x) return COTAS[recurso] ? "pro" : null; return x.nivel >= 1 ? "pro" : "gratis"; }
  function recursosDoNivel(n) { return Object.keys(RECURSOS).filter(function (k) { return RECURSOS[k].nivel === n; }); }
  function vendavel(p) { return PAGOS.indexOf(p) >= 0; }

  var GVP = { PLANOS: PLANOS, ALIAS: ALIAS, PAGOS: PAGOS, LEGADOS: LEGADOS, RECURSOS: RECURSOS, LIMITES: LIMITES, ANTIABUSO: ANTIABUSO, COTAS: COTAS,
    PRO_DIFERENCIAIS: PRO_DIFERENCIAIS, TESTE_DIAS: TESTE_DIAS, STATUS: STATUS,
    efetivo: efetivo, pode: pode, limite: limite, cabe: cabe, ilimitado: ilimitado, erroLimite: erroLimite, planoMinimo: planoMinimo,
    recursosDoNivel: recursosDoNivel, nivelDoPlano: nivelDoPlano, idBase: idBase, normaliza: normaliza, vendavel: vendavel };
  g.GVP = GVP;
  if (typeof module !== "undefined" && module.exports) module.exports = GVP;
})(typeof globalThis !== "undefined" ? globalThis : this);
