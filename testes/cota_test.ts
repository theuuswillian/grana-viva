// v10.161: deno test testes/cota_test.ts  (cotas mensais, corte de alertas do radar e preços aceitos pelo webhook)
import { confereCota, usoMes, registraUso, inicioMesSP, hojeSP, corpoLimite, MSG_LIMITE_LEGADO, clienteLimiteV2 } from "../supabase/functions/_shared/cota.ts";
import { capAlertas, alvos, criadoAlvo } from "../supabase/functions/alertas-push/ir.ts";
import { confereValores } from "../supabase/functions/_shared/mercadopago.ts";
const GVP = (globalThis as any).GVP;
const eq = (a: unknown, b: unknown, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + " esperado " + JSON.stringify(b) + " veio " + JSON.stringify(a)); };

// banco falso: ia_uso em memória + rpc ia_conta_k
function falso(linhas: { user_id: string; dia: string; k: string; n: number }[]) {
  return {
    linhas,
    from(_t: string) {
      const f: any[] = [];
      const q: any = {
        select() { return q; }, eq(c: string, v: unknown) { f.push((r: any) => r[c] === v); return q; }, gte(c: string, v: string) { f.push((r: any) => r[c] >= v); return q; },
        then(ok: any) { ok({ data: linhas.filter((r) => f.every((x) => x(r))), error: null }); },
      };
      return q;
    },
    async rpc(_n: string, a: any) { const r = linhas.find((x) => x.user_id === a.p_uid && x.dia === a.p_dia && x.k === a.p_k); if (r) r.n++; else linhas.push({ user_id: a.p_uid, dia: a.p_dia, k: a.p_k, n: 1 }); return { data: true, error: null }; },
  };
}
const AG = Date.parse("2026-11-13T15:00:00Z");
Deno.test("mês de Brasília", () => { eq(hojeSP(Date.parse("2026-12-01T02:00:00Z")), "2026-11-30"); eq(inicioMesSP(AG), "2026-11-01"); });
Deno.test("frase: Grátis bloqueia no 15º, Pro nunca", async () => {
  const sb = falso([{ user_id: "u", dia: "2026-10-31", k: "frase", n: 50 }, { user_id: "u", dia: "2026-11-02", k: "frase", n: 10 }, { user_id: "u", dia: "2026-11-10", k: "frase", n: 4 }, { user_id: "u", dia: "2026-11-10", k: "comprovante", n: 9 }]);
  eq(await usoMes(sb, "u", "frase", AG), 14);
  eq(await confereCota(sb, "u", 0, "frase", AG), null, "14 usados ainda pode");
  await registraUso(sb, "u", "frase", AG);
  eq(await confereCota(sb, "u", 0, "frase", AG), { erro: "LIMITE_PLANO", recurso: "ia_frase", limite: 15, mensagem: "Você atingiu o limite de 15 lançamentos com IA deste mês no plano Grátis." });
  eq(await confereCota(sb, "u", 2, "frase", AG), null, "Pro ilimitado");
});
Deno.test("comprovante 3 e whatsapp 5", async () => {
  const sb = falso([{ user_id: "u", dia: "2026-11-05", k: "comprovante", n: 3 }, { user_id: "u", dia: "2026-11-05", k: "whatsapp", n: 4 }]);
  eq((await confereCota(sb, "u", 0, "comprovante", AG) as any)?.recurso, "ia_comprovante");
  eq(await confereCota(sb, "u", 0, "whatsapp", AG), null);
  await registraUso(sb, "u", "whatsapp", AG);
  eq((await confereCota(sb, "u", 0, "whatsapp", AG) as any)?.limite, 5);
});
Deno.test("radar: Grátis confere só 1 alerta ativo (sem data: na ordem gravada)", () => {
  const A = [{ id: "a" }, { id: "b" }, { id: "c" }];
  eq(capAlertas(A, (x) => x.id === "a", GVP.limite(0, "max_alertas_radar")), [{ id: "b" }]);
  eq(capAlertas(A, () => false, GVP.limite(2, "max_alertas_radar")).length, 3);
});
Deno.test("v10.162 radar: ex-Pro com vários alertas recebe só o MAIS ANTIGO ativo", () => {
  const t = (iso: string) => Date.parse(iso);
  const idDe = (ms: number, r = "abcdef") => ms.toString(36) + r;
  const fiis = [
    { id: idDe(t("2026-09-01T12:00:00-03:00")), ticker: "PETR4", tipo: "acao", alvoP: 40, alvoDir: "acima", alvoEm: t("2026-11-10T12:00:00-03:00") },
    { id: idDe(t("2026-08-01T12:00:00-03:00")), ticker: "VALE3", tipo: "acao", alvoP: 60, alvoDir: "abaixo" }, // sem alvoEm: tempo do id
    { id: idDe(t("2026-10-01T12:00:00-03:00")), ticker: "ITUB4", tipo: "acao", alvoP: 30, alvoDir: "acima", alvoEm: t("2026-10-05T12:00:00-03:00") },
  ];
  const A = alvos(fiis);
  eq(A.map((a) => a.ticker), ["PETR4", "VALE3", "ITUB4"], "alvos mantém a ordem");
  eq(capAlertas(A, () => false, 1).map((a) => a.ticker), ["VALE3"], "ORDER BY criado ASC LIMIT 1");
  eq(capAlertas(A, (a) => a.ticker === "VALE3", 1).map((a) => a.ticker), ["ITUB4"], "o mais antigo já avisou: vale o próximo mais antigo ativo");
  eq(capAlertas(A, () => false, -1).length, 3, "Pro: todos");
  eq(criadoAlvo({ id: "x1" }), NaN, "id sem tempo = NaN (mais antigo)");
  const B = alvos([{ id: "x1", ticker: "BBAS3", tipo: "acao", alvoP: 20 }, ...fiis]);
  eq(capAlertas(B, () => false, 1).map((a) => a.ticker), ["BBAS3"], "sem data conta como o mais antigo");
});
Deno.test("v10.162 extrato: Grátis 1 por mês, separado do comprovante", async () => {
  const sb = falso([{ user_id: "u", dia: "2026-11-02", k: "comprovante", n: 2 }]);
  eq(await confereCota(sb, "u", 0, "extrato", AG), null, "1ª importação pode");
  await registraUso(sb, "u", "extrato", AG);
  eq(sb.linhas.find((r) => r.k === "extrato")?.n, 1, "conta em k='extrato'");
  eq(await confereCota(sb, "u", 0, "extrato", AG), { erro: "LIMITE_PLANO", recurso: "ia_extrato", limite: 1, mensagem: "Você atingiu o limite de 1 importação de extrato com IA deste mês no plano Grátis." });
  eq(await confereCota(sb, "u", 0, "comprovante", AG), null, "extrato não gasta a cota de comprovante");
  eq(await usoMes(sb, "u", "comprovante", AG), 2);
  eq(await confereCota(sb, "u", 2, "extrato", AG), null, "Pro ilimitado");
});
Deno.test("v10.162 corpo do 402: novo para v10.162+, frase amigável no campo erro para v10.160/161", () => {
  const lim = GVP.erroLimite("ia_extrato", 0);
  eq(clienteLimiteV2({ limiteV: 2 }), true); eq(clienteLimiteV2({}), false); eq(clienteLimiteV2(null), false);
  eq(corpoLimite(lim, { limiteV: 2 }), { erro: "LIMITE_PLANO", recurso: "ia_extrato", limite: 1, mensagem: lim.mensagem });
  const leg = corpoLimite(lim, { extrato: true }) as any;
  eq(leg.erro, MSG_LIMITE_LEGADO); eq(leg.erro, "Limite mensal do plano Grátis atingido. Recarregue o app ou assine o Plano Pro em Conta > Planos para liberar uso ilimitado.");
  eq([leg.codigo, leg.upgrade, leg.recurso, leg.limite, leg.mensagem], ["LIMITE_PLANO", true, "ia_extrato", 1, lim.mensagem]);
});
Deno.test("webhook aceita preço novo e antigo do mesmo plano", () => {
  const ar = (v: number, f: number) => ({ auto_recurring: { currency_id: "BRL", transaction_amount: v, frequency: f, frequency_type: "months" } });
  eq(confereValores(ar(24.90, 1), "pro", GVP.PLANOS), true); eq(confereValores(ar(29.90, 1), "pro", GVP.PLANOS), true);
  eq(confereValores(ar(179, 12), "pro_anual", GVP.PLANOS), true); eq(confereValores(ar(299, 12), "pro_anual", GVP.PLANOS), true);
  eq(confereValores(ar(14.90, 1), "plus", GVP.PLANOS), true, "plus antigo continua");
  eq(confereValores(ar(10, 1), "pro", GVP.PLANOS), false); eq(confereValores(ar(179, 1), "pro_anual", GVP.PLANOS), false);
});
