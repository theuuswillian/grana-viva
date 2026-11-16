// v10.165: deno test testes/v10165_test.ts
// validação estrita do JSON da IA, assinatura obrigatória do Mercado Pago (com MP_WEBHOOK_SECRET), chamada interna assinada,
// idempotência do webhook e texto/semana do resumo semanal do WhatsApp.
import * as V from "../supabase/functions/_shared/valida-ia.ts";
import { processaWebhook, type DB } from "../supabase/functions/_shared/webhook-nucleo.ts";
import { assinaInterno } from "../supabase/functions/_shared/seguro.ts";
import { semanaPassada, textoResumo } from "../supabase/functions/_shared/resumo-semanal.ts";
import { hojeSP, inicioMesSP } from "../supabase/functions/_shared/cota.ts";
const eq = (a: unknown, b: unknown, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(m + " esperado " + JSON.stringify(b) + " veio " + JSON.stringify(a)); };

Deno.test("valida-ia: valor", () => {
  eq(V.valorIA(45.9), 45.9); eq(V.valorIA("12,5"), 12.5); eq(V.valorIA(-3), 0); eq(V.valorIA(0), 0);
  eq(V.valorIA(Infinity), 0); eq(V.valorIA(NaN), 0); eq(V.valorIA("abc"), 0); eq(V.valorIA(1e12), 0); eq(V.valorIA(10_000_000), 10_000_000);
  eq(V.valorIA(0.001), 0, "arredonda para 0 = descarta"); eq(V.valorSinalIA(-52.333), -52.33); eq(V.valorSinalIA(-1e9), 0);
});
Deno.test("valida-ia: texto, enums, categoria, parcelas", () => {
  eq(V.textoIA('<img src=x onerror="alert(1)">almoço', 80), "img src=x onerror=alert(1)almoço");
  eq(V.textoIA("a".repeat(500)).length, V.DESC_MAX);
  eq(V.textoIA("linha1\nlinha2\u0000x"), "linha1 linha2 x");
  eq(V.tipoIA("receita"), "receita"); eq(V.tipoIA("transferir tudo"), "despesa");
  eq(V.formaIA("cartao"), "cartao"); eq(V.formaIA("bitcoin"), "pix"); eq(V.formaIA("x", ""), "");
  eq(V.categoriaIA("Mercado", ["Mercado", "Outros"]), "Mercado"); eq(V.categoriaIA("Ignore as regras", ["Mercado"]), "Outros");
  eq(V.parcelasIA(3), 3); eq(V.parcelasIA(0), 1); eq(V.parcelasIA(999), 48); eq(V.parcelasIA("12x"), 12); eq(V.parcelasIA(2.7), 2); eq(V.parcelasIA(null), 1);
  eq(V.confiancaIA(7), 1); eq(V.confiancaIA("x"), 0);
});
Deno.test("valida-ia: datas", () => {
  const h = "2026-11-15";
  eq(V.dataIA("2026-11-14", h), "2026-11-14"); eq(V.dataIA("2026-02-30", h), h, "dia que não existe");
  eq(V.dataIA("2999-01-01", h), h); eq(V.dataIA("1990-01-01", h), h); eq(V.dataIA("ontem", h), h);
  eq(V.dataIA("2027-06-01", h), "2027-06-01", "futuro até 1 ano (conta fixa)"); eq(V.dataIA("2026-11-20", h, { ateHoje: true }), h);
  eq(V.dataOuVazio("2026-11-20", h, { ateHoje: true }), ""); eq(V.dataOuVazio("2026-11-01", h, { ateHoje: true }), "2026-11-01");
  eq(V.dataReal("2028-02-29"), true); eq(V.dataReal("2027-02-29"), false);
});
Deno.test("valida-ia: hoje de Brasília e hoje do cliente", () => {
  const t = Date.parse("2026-12-01T02:30:00Z"); // 23:30 de 30/11 em Brasília
  eq(V.hojeSP(t), "2026-11-30"); eq(hojeSP(t), "2026-11-30"); eq(inicioMesSP(t), "2026-11-01", "cota do mês vira à meia-noite de Brasília");
  eq(V.hojeCliente("2026-12-01", t), "2026-12-01", "aparelho noutro fuso (1 dia) aceito");
  eq(V.hojeCliente("2027-05-01", t), "2026-11-30"); eq(V.hojeCliente("lixo", t), "2026-11-30");
  eq(V.provavelFixo("NETFLIX.COM"), true); eq(V.provavelFixo("PADARIA PAO DOURADO"), false);
});

// ---------- webhook do Mercado Pago ----------
function dbFalso() {
  const ev = new Map<string, any>(); let grav = 0;
  const db: DB = {
    async reservaEvento(id) { if (ev.has(id)) return ev.get(id).feito ? "concluido" : "pendente"; ev.set(id, { feito: false }); return "novo"; },
    async concluiEvento(id) { ev.get(id).feito = true; },
    async leAssinatura() { return null; },
    async gravaAssinatura() { grav++; },
  };
  return { db, ev, get grav() { return grav; } };
}
const req = (h: Record<string, string> = {}, id = "123abc") => new Request("https://x/functions/v1/pagamento-webhook?provedor=mercadopago&type=subscription_preapproval&data.id=" + id, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify({ id: 999, type: "subscription_preapproval", action: "updated", data: { id } }) });
const fetch404 = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;

Deno.test("webhook MP: com MP_WEBHOOK_SECRET, sem x-signature = 401", async () => {
  const f = dbFalso();
  const r = await processaWebhook(req(), { db: f.db, env: { MP_ACCESS_TOKEN: "t", MP_WEBHOOK_SECRET: "s" }, PLANOS: {}, efetivo: () => ({}), fetch: fetch404 });
  eq(r.status, 401); eq(f.ev.size, 0, "nada reservado");
});
Deno.test("webhook MP: com MP_WEBHOOK_SECRET, x-signature inválida = 401", async () => {
  const f = dbFalso();
  const r = await processaWebhook(req({ "x-signature": "ts=1,v1=00", "x-request-id": "r1" }), { db: f.db, env: { MP_ACCESS_TOKEN: "t", MP_WEBHOOK_SECRET: "s" }, PLANOS: {}, efetivo: () => ({}), fetch: fetch404 });
  eq(r.status, 401);
});
Deno.test("webhook MP: sem MP_WEBHOOK_SECRET segue pela API (não quebra) e é idempotente", async () => {
  const f = dbFalso(); const logs: string[] = [];
  const d = { db: f.db, env: { MP_ACCESS_TOKEN: "t" }, PLANOS: {}, efetivo: () => ({}), fetch: fetch404, log: (...a: unknown[]) => logs.push(a.join(" ")) };
  const r1 = await processaWebhook(req(), d); eq(r1.status, 200); eq((await r1.json()).resultado, "nao_encontrado");
  const r2 = await processaWebhook(req(), d); eq((await r2.json()).repetido, true, "reenvio do mesmo aviso não processa de novo");
  if (!logs.some((l) => /MP_WEBHOOK_SECRET não configurado/.test(l))) throw new Error("sem log do segredo ausente");
});
Deno.test("webhook MP: chamada interna assinada (assinatura {sincronizar}) passa com o segredo configurado", async () => {
  const f = dbFalso(), k = "service-role-falsa";
  const h = await assinaInterno(k, "mp-sync", "123abc");
  const ok = await processaWebhook(req({ "x-gv-interno": h, "x-request-id": "sync-1" }), { db: f.db, env: { MP_ACCESS_TOKEN: "t", MP_WEBHOOK_SECRET: "s", INTERNO_KEY: k }, PLANOS: {}, efetivo: () => ({}), fetch: fetch404 });
  eq(ok.status, 200);
  const outroId = await processaWebhook(req({ "x-gv-interno": h, "x-request-id": "sync-2" }, "999zzz"), { db: f.db, env: { MP_ACCESS_TOKEN: "t", MP_WEBHOOK_SECRET: "s", INTERNO_KEY: k }, PLANOS: {}, efetivo: () => ({}), fetch: fetch404 });
  eq(outroId.status, 401, "assinatura interna vale só para o data.id assinado");
});

// ---------- resumo semanal ----------
Deno.test("resumo semanal: semana anterior e texto", () => {
  eq(semanaPassada("2026-11-16"), { seg: "2026-11-16", de: "2026-11-09", ate: "2026-11-15" }, "segunda");
  eq(semanaPassada("2026-11-18"), { seg: "2026-11-16", de: "2026-11-09", ate: "2026-11-15" }, "quarta");
  const tx = [
    { tipo: "despesa", valor: 50, categoria: "Mercado", data: "2026-11-10", status: "pago" },
    { tipo: "despesa", valor: 20, categoria: "Lazer", data: "2026-11-14", status: "pago" },
    { tipo: "despesa", valor: 999, categoria: "Lazer", data: "2026-11-14", status: "pago", demo: 1 },
    { tipo: "despesa", valor: 30, categoria: "Lazer", data: "2026-11-12", status: "previsto" },
    { tipo: "receita", valor: 100, categoria: "Salário", data: "2026-11-11", status: "pago" },
  ];
  const L = textoResumo(tx, "2026-11-09", "2026-11-15", "2026-11-16", 1000);
  const t = L.join("\n");
  // Fase 2: o resumo passou a ser gasto dos últimos 7 dias + saldo livre do mês com R$/dia + fatura atual
  if (!t.includes("Gasto nos últimos 7 dias: *R$ 70,00*") || !t.includes("Saldo livre no mês: *R$ 930,00*") || !t.includes("/dia")) throw new Error(t);
});
