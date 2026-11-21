// Valida a coerência entre versão do HTML e caches do service worker.
// Evita que usuários PWA permaneçam presos a assets de uma versão anterior.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

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
  ['tour.min.js no precache', sw.includes(`tour.min.js?v=${version}`)],
  ['dashboard usa composição principal', app.includes('const TOPO=HV?homeTopo') && app.includes("${TOPO||''}")],
  ['dashboard sem fallback visual legado', !app.includes("${TOPO!==null?TOPO+'<!--':''}") && !app.includes("${TOPO!==null?'-->':''}")],
  ['aviso de atualização anexado ao body', app.includes('document.body.appendChild(d);') && !app.includes('document.documentElement.appendChild(d);')],
];
for (const [name, ok] of checks) {
  if (!ok) throw new Error(`Versão PWA divergente: ${name} não acompanha ${version}`);
  console.log('ok', name, version);
}
console.log(`PWA version consistency OK: ${version}`);
