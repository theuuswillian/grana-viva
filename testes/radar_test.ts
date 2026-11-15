// v10.163: regra do Grátis no radar-precos (só o alerta ativo mais antigo dispara). deno test testes/radar_test.ts
import "../supabase/functions/_shared/planos.js";
import { radarDe, permitidos, chaveAl } from "../supabase/functions/radar-precos/logica.ts";
const GVP = (globalThis as any).GVP;
const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(JSON.stringify(a) + " != " + JSON.stringify(b)); };
const cfg = { cfg: { radar: [
  { t: "PETR4", k: "acao", al: [{ id: "a1", tp: "acima", v: 40, g: 1, c: 3000 }, { id: "a2", tp: "abaixo", v: 30, g: 1, c: 1000 }] },
  { t: "BTC", k: "cripto", cg: "bitcoin", al: [{ id: "b1", tp: "queda", v: 5, g: 1, c: 2000 }] },
] } };
const chaves = (L: any[]) => L.flatMap((it) => it.al.map((a: any) => chaveAl(it, a)));
Deno.test("c é lido", () => { eq(radarDe(cfg)[0].al[1].c, 1000); });
Deno.test("Grátis: só o mais antigo", () => { eq(chaves(permitidos(radarDe(cfg), 1, () => true, GVP)), ["r|b|PETR4|a2|1"]); });
Deno.test("Grátis: o mais antigo já disparou, vale o próximo ativo", () => {
  eq(chaves(permitidos(radarDe(cfg), 1, (_it, a) => a.id !== "a2", GVP)), ["r|c|BTC|b1|1"]);
});
Deno.test("sem c conta como mais antigo", () => {
  const c2 = { cfg: { radar: [{ t: "VALE3", k: "acao", al: [{ id: "x1", tp: "acima", v: 9, g: 1, c: 500 }, { id: "x2", tp: "abaixo", v: 5, g: 1 }] }] } };
  eq(chaves(permitidos(radarDe(c2), 1, () => true, GVP)), ["r|b|VALE3|x2|1"]);
});
Deno.test("Pro: todos os ativos", () => { eq(chaves(permitidos(radarDe(cfg), -1, (_it, a) => a.id !== "a1", GVP)).length, 2); });
