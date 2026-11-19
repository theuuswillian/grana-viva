import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const sql = readFileSync('supabase/migrations/20261118_remocao_pluggy.sql', 'utf8');
const app = readFileSync('app.js', 'utf8');
const legacyBundle = readFileSync('app.min.js', 'utf8');
const html = readFileSync('index.html', 'utf8');
const sw = readFileSync('sw.js', 'utf8');
const accountFunction = readFileSync('supabase/functions/minha-conta/index.ts', 'utf8');
const privacy = readFileSync('site/privacidade.html', 'utf8');

assert.match(sql, /^begin;/m, 'migration must run in a transaction');
assert.match(sql, /^commit;/m, 'migration must close its transaction');
assert.ok(sql.includes("delete from public.tx\nwhere coalesce(data, '{}'::jsonb) ? 'pluggyId';"), 'only transactions explicitly tagged with the legacy Pluggy ID may be deleted');
assert.ok(!sql.includes("or data ->> 'origem' = 'banco'"), 'migration must not delete every generic bank-origin transaction');
for (const table of ['pluggy_tx', 'pluggy_acc', 'pluggy_cfg']) {
  assert.ok(sql.includes(`drop table if exists public.${table};`), 'migration must remove ' + table + ' without cascading unrelated dependencies');
  assert.ok(!sql.includes(`drop table if exists public.${table} cascade;`), 'migration must never cascade-drop unrelated dependencies');
}
for (const key of ['pluggyOn', 'pluggyMap', 'pluggyIgn', 'pluggyDesde', 'pluggyVisto', 'pluggyInvDia']) {
  assert.ok(sql.includes(key), 'migration must clean setting ' + key);
}
assert.ok(!app.includes('function PLUGGY_ON('), 'legacy Pluggy feature switch must be removed');
assert.ok(!app.includes("functions.invoke('pluggy-sync'") && !app.includes('functions.invoke("pluggy-sync"'), 'frontend must not invoke the legacy Pluggy Edge Function');
assert.ok(!app.includes(".from('pluggy_tx')") && !app.includes(".from('pluggy_acc')") && !app.includes(".from('pluggy_cfg')"), 'frontend must not query legacy Pluggy tables');
assert.ok(!app.includes('async function pluggy('), 'legacy Pluggy API wrapper must be removed');
assert.ok(!/pluggy/i.test(accountFunction), 'account deletion function must not call Pluggy or retain its secrets');
assert.ok(!/pluggy/i.test(privacy), 'privacy policy must not advertise the removed Pluggy integration');
for (const obsoleteFile of ['supabase/functions/pluggy-sync/index.ts', 'supabase/functions/pluggy-webhook/index.ts', 'supabase/functions/minha-conta/pluggy.ts', 'supabase/functions/minha-conta/pluggy_test.ts']) {
  assert.ok(!existsSync(obsoleteFile), 'removed Pluggy source file must stay deleted: ' + obsoleteFile);
}
assert.ok(!legacyBundle.includes('function PLUGGY_ON(') && !legacyBundle.includes('async function pluggy('), 'legacy app.min.js bundle must not retain the Pluggy integration');
assert.ok(!legacyBundle.includes("functions.invoke('pluggy-sync'") && !legacyBundle.includes(".from('pluggy_tx')") && !legacyBundle.includes(".from('pluggy_acc')") && !legacyBundle.includes(".from('pluggy_cfg')"), 'legacy app.min.js bundle must not call Pluggy endpoints or tables');
for (const obsolete of ['IMP.banco', 'IMP_FILA', 'proxImportBanco', 'fimFilaBanco', 'catDoBanco(']) {
  assert.ok(!app.includes(obsolete) && !legacyBundle.includes(obsolete), 'legacy bank-import path must be removed: ' + obsolete);
}
assert.ok(app.includes("async function prcFontes(){return {linhas:[],fontes:['histórico local'],ok:true};}"), 'installment recovery must use local history only');
assert.ok(!html.includes('app.min.js?v='), 'HTML must load the maintained app source during this removal');
assert.ok(html.includes("const GV_BUILD='10.167';"), 'HTML build version must be bumped');
assert.ok(html.includes('app.js?v=10.167') && html.includes('planos.js?v=10.167'), 'HTML must load the versioned app and plans sources');
assert.doesNotMatch(html, /maximum-scale\\s*=\\s*1|user-scalable\\s*=\\s*no/i, 'viewport must preserve browser zoom for low-vision users');
assert.ok(sw.includes("const V='gv-v10.167';") && sw.includes('app.js?v=10.167') && sw.includes('planos.js?v=10.167') && sw.includes('tour.min.js?v=10.167'), 'service worker cache and precache URLs must match the app version');
console.log('Pluggy removal static checks passed.');
