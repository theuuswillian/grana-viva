import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const sql = readFileSync('supabase/migrations/20261118_remocao_pluggy.sql', 'utf8');
const app = readFileSync('app.js', 'utf8');
const html = readFileSync('index.html', 'utf8');
const sw = readFileSync('sw.js', 'utf8');

assert.match(sql, /^begin;/m, 'migration must run in a transaction');
assert.match(sql, /^commit;/m, 'migration must close its transaction');
for (const table of ['pluggy_tx', 'pluggy_acc', 'pluggy_cfg']) {
  assert.match(sql, new RegExp('drop table if exists public\\.' + table + '\\s+cascade', 'i'), 'migration must remove ' + table);
}
for (const key of ['pluggyOn', 'pluggyMap', 'pluggyIgn', 'pluggyDesde', 'pluggyVisto', 'pluggyInvDia']) {
  assert.ok(sql.includes(key), 'migration must clean setting ' + key);
}
assert.ok(!/function\\s+PLUGGY_ON\\s*\\(/.test(app), 'legacy Pluggy feature switch must be removed');
assert.ok(!/functions\\.invoke\\([\"']pluggy-sync/.test(app), 'frontend must not invoke the legacy Pluggy Edge Function');
assert.ok(!/\\.from\\([\"']pluggy_(tx|acc|cfg)[\"']\\)/.test(app), 'frontend must not query legacy Pluggy tables');
assert.ok(!/async function pluggy\\s*\\(/.test(app), 'legacy Pluggy API wrapper must be removed');
assert.ok(app.includes("async function prcFontes(){return {linhas:[],fontes:['histórico local'],ok:true};}"), 'installment recovery must use local history only');
assert.ok(!html.includes('app.min.js?v='), 'HTML must load the maintained app source during this removal');
assert.ok(html.includes('app.js?v=10.166'), 'HTML must load the versioned app source');
assert.ok(sw.includes('app.js?v=10.166'), 'service worker must precache the same app source');
console.log('Pluggy removal static checks passed.');
