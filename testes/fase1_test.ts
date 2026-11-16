// Fase 1: deno test -A testes/fase1_test.ts
// limpeza da conexão bancária automática e do imposto das vendas; resumo semanal do WhatsApp em settings.whatsapp_resumo_semanal.
import { quemRecebeResumo, resumoLigado } from "../supabase/functions/_shared/resumo-semanal.ts";
import { alvos, alvoBateu, chaveAlvo, textoAlvo, diaUtil, capAlertas, criadoAlvo } from "../supabase/functions/alertas-push/alvos.ts";
const eq = (a: unknown, b: unknown, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + " esperado " + JSON.stringify(b) + " veio " + JSON.stringify(a)); };
const RAIZ = new URL("..", import.meta.url).pathname;

Deno.test("resumo: padrão ligado, só quem desligou fica de fora", () => {
  const v = [{ user_id: "a", telefone: "1" }, { user_id: "b", telefone: "2" }, { user_id: "c", telefone: "3" }];
  const p = new Map<string, boolean | null>([["a", true], ["b", false], ["c", null]]);
  eq(quemRecebeResumo(v, p).map((x) => x.user_id), ["a", "c"]);
  eq(quemRecebeResumo([{ user_id: "d" }], new Map()).length, 1, "sem linha em settings = ligado");
  eq(resumoLigado(null), true); eq(resumoLigado({ whatsapp_resumo_semanal: false }), false); eq(resumoLigado({ whatsapp_resumo_semanal: true }), true);
});
Deno.test("alertas-push/alvos.ts: helpers do Radar continuam iguais", () => {
  eq(diaUtil("2026-11-20"), false, "feriado"); eq(diaUtil("2026-11-15"), false, "domingo"); eq(diaUtil("2026-11-16"), true);
  const A = alvos([{ id: "x", ticker: "PETR4", tipo: "acao", alvoP: 40, alvoDir: "abaixo", alvoEm: Date.UTC(2026, 0, 2) }, { id: "y", ticker: "BTC", tipo: "cripto", alvoP: 1 }]);
  eq(A.length, 1); eq(chaveAlvo(A[0]), "alvo|x|abaixo|40"); eq(alvoBateu(A[0], 39.5), true); eq(alvoBateu(A[0], 41), false);
  eq(textoAlvo(A[0], 39.5).startsWith("PETR4 caiu para"), true);
  eq(criadoAlvo({ alvoEm: Date.UTC(2026, 0, 2) }), Date.UTC(2026, 0, 2));
  eq(typeof capAlertas, "function");
});
Deno.test("migração da fase 1: só as tabelas auxiliares e a coluna nova", () => {
  const sql = Deno.readTextFileSync(RAIZ + "supabase/migrations/20261116_fase1_remove_pluggy.sql").toLowerCase();
  for (const t of ["public.pluggy_tx", "public.pluggy_acc", "public.pluggy_cfg"]) eq(sql.includes(t), true, t);
  eq(/drop table[^;]*\b(tx|bancos|cartoes|fiis|metas|settings|wa_vinculo)\b(?!_)/.test(sql.replace(/pluggy_(tx|acc|cfg)/g, "")), false, "não apaga tabelas de dados");
  eq(sql.includes("add column if not exists whatsapp_resumo_semanal boolean not null default true"), true);
  eq(sql.includes("cron.unschedule"), true);
});
/* guarda da fase 1: nenhum arquivo do repositório cita a conexão bancária automática nem o imposto das vendas, exceto
   as migrações já aplicadas no banco (histórico, não se editam), a migração que remove as tabelas e este próprio teste */
Deno.test("repositório sem a conexão bancária automática nem o imposto das vendas", () => {
  const re = /pluggy|open ?finance|openfinance|darf|imposto de renda/i;
  const EXCECOES = new Set(["supabase/migrations/20261028_pluggy_cfg.sql", "supabase/migrations/20261029_pluggy_tx.sql",
    "supabase/migrations/20261101_erros_fn.sql", "supabase/migrations/20261103_rls_snapshot.sql",
    "supabase/migrations/20261116_fase1_remove_pluggy.sql", "testes/fase1_test.ts", "testes/planos.test.cjs"]);
  const anda = (d: string): string[] => [...Deno.readDirSync(RAIZ + d)].flatMap((e) =>
    e.name === ".git" || e.name === "node_modules" ? [] : e.isDirectory ? anda(d + e.name + "/") : [d + e.name]);
  const texto = /\.(js|cjs|ts|html|css|md|py|sql|sh|json|webmanifest|txt)$/;
  const ruins = anda("").filter((f) => texto.test(f) && !EXCECOES.has(f) && re.test(Deno.readTextFileSync(RAIZ + f)));
  eq(ruins, []);
});
