// Valida a coerência entre versão do HTML e caches do service worker.
// Evita que usuários PWA permaneçam presos a assets de uma versão anterior.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

const build = html.match(/const GV_BUILD='([^']+)'/);
if (!build) throw new Error('GV_BUILD não encontrado em index.html');
const version = build[1];
const checks = [
  ['service worker cache', new RegExp(`const V='gv-v${version.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}'`).test(sw)],
  ['app.js no HTML', new RegExp(`app\\.js\\?v=${version.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`).test(html)],
  ['planos.js no HTML', new RegExp(`planos\\.js\\?v=${version.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`).test(html)],
  ['app.js no precache', sw.includes(`app.js?v=${version}`)],
  ['planos.js no precache', sw.includes(`planos.js?v=${version}`)],
];
for (const [name, ok] of checks) {
  if (!ok) throw new Error(`Versão PWA divergente: ${name} não acompanha ${version}`);
  console.log('ok', name, version);
}
const swVersion = sw.match(/const V='gv-v([^']+)'/);
if (!swVersion || swVersion[1] !== version) throw new Error('GV_BUILD e service worker divergem');
console.log(`PWA version consistency OK: ${version}`);
