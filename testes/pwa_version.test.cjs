// Valida a coerência entre versão do HTML e caches do service worker.
// Evita que usuários PWA permaneçam presos a assets de uma versão anterior.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'design-system.css'), 'utf8');
const visualCss = fs.readFileSync(path.join(root, 'visual-reference.css'), 'utf8');

const build = html.match(/const GV_BUILD='([^']+)'/);
if (!build) throw new Error('GV_BUILD não encontrado em index.html');
const version = build[1];
const checks = [
  ['service worker cache', sw.includes(`const V='gv-v${version}'`)],
  ['app.js no HTML', html.includes(`app.js?v=${version}`)],
  ['planos.js no HTML', html.includes(`planos.js?v=${version}`)],
  ['app.js no precache', sw.includes(`app.js?v=${version}`)],
  ['planos.js no precache', sw.includes(`planos.js?v=${version}`)],
  ['design-system.css no HTML', html.includes(`design-system.css?v=${version}`)],
  ['design-system.css no precache', sw.includes(`design-system.css?v=${version}`)],
  ['visual-reference.css no HTML', html.includes(`visual-reference.css?v=${version}`)],
  ['visual-reference.css no precache', sw.includes(`visual-reference.css?v=${version}`)],
  ['seis telas da referência All Black', visualCss.includes('#20d879') && visualCss.includes('.hB-spark')],
  ['atalhos da tela inicial conforme referência', app.includes("['hm-add-despesa','minus-circle','Adicionar despesa'") && app.includes("['metas','target','Metas'") && app.includes("'hm-add-despesa':()=>novoTx(null,'despesa')") && app.includes("'hm-add-receita':()=>novoTx(null,'receita')")],
  ['tour.min.js no precache', sw.includes(`tour.min.js?v=${version}`)],
  ['dashboard usa composição principal', app.includes('const TOPO=HV?homeTopo') && app.includes("${TOPO||''}")],
  ['dashboard sem fallback visual legado', !app.includes("${TOPO!==null?TOPO+'<!--':''}") && !app.includes("${TOPO!==null?'-->':''}")],
  ['aviso de atualização anexado ao body', app.includes('document.body.appendChild(d);') && !app.includes('document.documentElement.appendChild(d);')],
  ['diagnóstico visível de toque no aviso', app.includes("status('toque detectado')") && app.includes("diagnostico('toque-detectado')")],
  ['toque inicia atualização sem click sintético', app.includes("e.preventDefault();atualizar();")],
  ['estados da atualização anunciados', app.includes("d.setAttribute('aria-live','polite')") && app.includes("status('baixando atualização')") && app.includes("status('recarregando')")],
  ['falha de atualização permite tentar novamente', app.includes("d.disabled=false") && app.includes("status('tentar novamente')")],

];
checks.push(['design system sem acentos roxos herdados', !/rgba\(139,92,246|#a855f7|#6366f1/i.test(css)],['acabamento All Black v10.189',css.includes('v10.189')&&css.includes('#101413')],
  ['Conta e Configurações com perfil e seções',app.includes('gvProfile')&&app.includes('Conexões')&&app.includes('Personalização')&&app.includes('Dados e privacidade')],
  ['perfil usa dados da sessão autenticada',app.includes('USER.user_metadata')&&app.includes('USER.email')],
  ['acabamento da Conta e Configurações v10.189',css.includes('v10.189')&&css.includes('.gvProfile')&&css.includes('.gvCfgSection')],['telas internas com refinamento All Black', ['data-v=\"gastos\"','data-v=\"plan\"','data-v=\"rel\"','data-v=\"metas\"','data-v=\"cartoes\"','data-v=\"fii\"','data-v=\"pat\"'].every(x=>css.includes(x))]);
checks.push(
  ['gastos com gráfico de categorias real', app.includes('function gastosReferenciaHTML()') && app.includes('despesasPorCat(per)')],
  ['patrimônio com distribuição por classe', app.includes('gvRefInvestGrid') && app.includes('conic-gradient(${donutStops.join(\',\')})')],
  ['metas com progresso e valor faltante', app.includes('gvRefGoalFoot') && app.includes('brl(faltante)')],
  ['relatórios com receitas, despesas e saldo', app.includes('gvRefReportKpis') && app.includes('brl(ra.rec)') && app.includes('brl(ra.des)') && app.includes('brl(ra.sal)')],
  ['tema claro preservado no CSS de referência', visualCss.includes('html:not(.claro)')],
  ['build 10.191 com assets sincronizados', html.includes("GV_BUILD='10.191'") && sw.includes("gv-v10.191")]
);
for (const [name, ok] of checks) {
  if (!ok) throw new Error(`Versão PWA divergente: ${name} não acompanha ${version}`);
  console.log('ok', name, version);
}
console.log(`PWA version consistency OK: ${version}`);
