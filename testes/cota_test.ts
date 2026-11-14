// v10.161: deno test testes/cota_test.ts  (cotas mensais, corte de alertas do radar e preços aceitos pelo webhook)
import { confereCota, usoMes, registraUso, inicioMesSP, hojeSP } from "../supabase/functions/_shared/cota.ts";
import { capAlertas } from "../supabase/functions/alertas-push/ir.ts";
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
Deno.test("radar: Grátis confere só o 1º alerta ativo", () => {
  const A = [{ id: "a" }, { id: "b" }, { id: "c" }];
  eq(capAlertas(A, (x) => x.id === "a", GVP.limite(0, "max_alertas_radar")), [{ id: "b" }]);
  eq(capAlertas(A, () => false, GVP.limite(2, "max_alertas_radar")).length, 3);
});
Deno.test("webhook aceita preço novo e antigo do mesmo plano", () => {
  const ar = (v: number, f: number) => ({ auto_recurring: { currency_id: "BRL", transaction_amount: v, frequency: f, frequency_type: "months" } });
  eq(confereValores(ar(24.90, 1), "pro", GVP.PLANOS), true); eq(confereValores(ar(29.90, 1), "pro", GVP.PLANOS), true);
  eq(confereValores(ar(179, 12), "pro_anual", GVP.PLANOS), true); eq(confereValores(ar(299, 12), "pro_anual", GVP.PLANOS), true);
  eq(confereValores(ar(14.90, 1), "plus", GVP.PLANOS), true, "plus antigo continua");
  eq(confereValores(ar(10, 1), "pro", GVP.PLANOS), false); eq(confereValores(ar(179, 1), "pro_anual", GVP.PLANOS), false);
});
