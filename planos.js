/* GranaViva · planos e direitos (v10.82). FONTE ÚNICA.
   Este arquivo é usado igual por:
   - o app (index.html carrega planos.js?v=versão) para mostrar e bloquear telas;
   - as páginas públicas (gerador site.py lê os preços e a tabela daqui);
   - as funções do Supabase (assistente, ler-comprovante, assinatura, pagamento-webhook), que recebem uma CÓPIA
     gerada por deploy-fn.py (supabase/functions/<nome>/planos.js). O teste t82 confere que as cópias são idênticas.
   Quem decide o plano de verdade é o servidor (tabela assinaturas, escrita só pelo webhook de pagamento).
   O app só lê o plano para esconder/mostrar telas; os limites de IA são conferidos de novo no servidor. */
(function (g) {
  "use strict";
  // nível: 0 grátis, 1 plus, 2 pro. pro_anual é o mesmo Pro cobrado por ano.
  var PLANOS = {
    gratis:    { id: "gratis",    nome: "Grátis",    nivel: 0, preco: 0,     periodo: null,  rotulo: "R$ 0" },
    plus:      { id: "plus",      nome: "Plus",      nivel: 1, preco: 14.90, periodo: "mes", rotulo: "R$ 14,90/mês" },
    pro:       { id: "pro",       nome: "Pro",       nivel: 2, preco: 29.90, periodo: "mes", rotulo: "R$ 29,90/mês" },
    pro_anual: { id: "pro_anual", nome: "Pro anual", nivel: 2, preco: 299.00, periodo: "ano", rotulo: "R$ 299/ano", base: "pro" }
  };
  var PAGOS = ["plus", "pro", "pro_anual"];
  // recurso -> nível mínimo. As telas do app apontam para estes nomes (TAB_RECURSO em app.js).
  var RECURSOS = {
    lancamentos:      { nivel: 0, nome: "Lançamentos manuais" },
    contas:           { nivel: 0, nome: "Contas e bancos" },
    categorias:       { nivel: 0, nome: "Categorias" },
    dashboard:        { nivel: 0, nome: "Início (resumo do mês)" },
    alertas:          { nivel: 0, nome: "Alertas de vencimento" },
    exportar:         { nivel: 0, nome: "Exportar e excluir seus dados" },
    planejamento:     { nivel: 1, nome: "Planejamento e projeções" },
    orcamentos:       { nivel: 1, nome: "Orçamentos por categoria" },
    cartoes:          { nivel: 1, nome: "Cartões e faturas" },
    relatorios:       { nivel: 1, nome: "Relatórios completos" },
    importar_extrato: { nivel: 1, nome: "Importar extrato (OFX/CSV)" },
    comprovantes:     { nivel: 1, nome: "Comprovantes anexados" },
    leitura_ia:       { nivel: 1, nome: "Ler comprovante ou frase com IA" },
    investimentos:    { nivel: 2, nome: "Investimentos (FIIs, renda fixa, cotações)" },
    patrimonio:       { nivel: 2, nome: "Patrimônio" },
    metas:            { nivel: 2, nome: "Metas" },
    assistente:       { nivel: 2, nome: "Assistente com IA" }
  };
  // limites diários por nível (conferidos no servidor; 0 = não incluso no plano)
  var LIMITES = [
    { leitura_ia_dia: 0,  assistente_dia: 0 },
    { leitura_ia_dia: 15, assistente_dia: 0 },
    { leitura_ia_dia: 40, assistente_dia: 30 }
  ];
  var TESTE_DIAS = 14;      // conta nova: Pro grátis por 14 dias, depois Grátis
  var STATUS = ["ativo", "cancelado", "inadimplente", "teste", "fundador"];

  function nivelDoPlano(p) { var x = PLANOS[p]; return x ? x.nivel : 0; }
  function idBase(p) { var x = PLANOS[p]; return x ? (x.base || x.id) : "gratis"; }
  function ms(d) { if (d == null || d === "") return NaN; var t = typeof d === "number" ? d : Date.parse(d); return isNaN(t) ? NaN : t; }

  /* plano que vale agora, a partir da linha da tabela assinaturas (ou null = sem linha).
     fundador: o plano gravado, sem fim.  teste/ativo/cancelado: o plano até periodo_fim (sem data = sem acesso pago, exceto ativo).
     inadimplente: grátis.  Qualquer coisa desconhecida: grátis. */
  function efetivo(a, agora) {
    var now = agora == null ? Date.now() : ms(agora);
    var r = { plano: "gratis", nivel: 0, status: a && a.status || null, contratado: a && a.plano || null, ate: null, emTeste: false, diasRestantes: null, fundador: false };
    if (!a || !PLANOS[a.plano] || STATUS.indexOf(a.status) < 0) return r;
    var fim = ms(a.periodo_fim);
    var vale = false;
    if (a.status === "fundador") { vale = true; r.fundador = true; }
    else if (a.status === "ativo") vale = isNaN(fim) || now < fim;
    else if (a.status === "teste" || a.status === "cancelado") vale = !isNaN(fim) && now < fim;
    if (!vale || a.plano === "gratis") return r;
    r.plano = idBase(a.plano); r.nivel = nivelDoPlano(a.plano);
    if (!isNaN(fim) && a.status !== "fundador") { r.ate = new Date(fim).toISOString(); r.diasRestantes = Math.max(0, Math.ceil((fim - now) / 86400000)); }
    r.emTeste = a.status === "teste";
    return r;
  }
  function pode(nivel, recurso) { var x = RECURSOS[recurso]; if (!x) return false; return (nivel | 0) >= x.nivel; }
  function limite(nivel, k) { var l = LIMITES[Math.max(0, Math.min(2, nivel | 0))]; return l && typeof l[k] === "number" ? l[k] : 0; }
  // plano mais barato que libera o recurso (para o texto do aviso de upgrade)
  function planoMinimo(recurso) { var x = RECURSOS[recurso]; if (!x) return null; return x.nivel >= 2 ? "pro" : x.nivel === 1 ? "plus" : "gratis"; }
  function recursosDoNivel(n) { return Object.keys(RECURSOS).filter(function (k) { return RECURSOS[k].nivel === n; }); }

  var GVP = { PLANOS: PLANOS, PAGOS: PAGOS, RECURSOS: RECURSOS, LIMITES: LIMITES, TESTE_DIAS: TESTE_DIAS, STATUS: STATUS,
    efetivo: efetivo, pode: pode, limite: limite, planoMinimo: planoMinimo, recursosDoNivel: recursosDoNivel, nivelDoPlano: nivelDoPlano, idBase: idBase };
  g.GVP = GVP;
  if (typeof module !== "undefined" && module.exports) module.exports = GVP;
})(typeof globalThis !== "undefined" ? globalThis : this);
