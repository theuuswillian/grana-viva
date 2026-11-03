// testes locais (não vão no deploy): ~/.deno/bin/deno test supabase/functions/minha-conta/pluggy_test.ts
import { apagaItensPluggy } from "./pluggy.ts";

const eq = (a: unknown, b: unknown, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };
const SECRET = "segredo-super-secreto-123", APIKEY = "apikey-xyz-999";
const resp = (s: number, b: unknown = {}) => new Response(JSON.stringify(b), { status: s });

function mock(porItem: Record<string, number | "rede" | "trava">, auth = 200) {
  const chamadas: string[] = [];
  const f = (async (url: string, init: RequestInit = {}) => {
    const u = String(url), sig = init.signal;
    chamadas.push((init.method || "GET") + " " + u.replace("https://api.pluggy.ai", ""));
    if (u.endsWith("/auth")) { const b = JSON.parse(String(init.body)); if (b.clientSecret !== SECRET) return resp(401); return auth === 200 ? resp(200, { apiKey: APIKEY }) : resp(auth); }
    const id = u.split("/items/")[1], r = porItem[id];
    if ((init.headers as any)["X-API-KEY"] !== APIKEY) return resp(403);
    if (r === "rede") throw new TypeError("network");
    if (r === "trava") return await new Promise<Response>((_, rej) => sig?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
    return resp(r as number, r === 200 ? { count: 1 } : {});
  }) as unknown as typeof fetch;
  return { f, chamadas };
}
function registrador() { const log: any[] = []; return { log, reg: async (etapa: string, e: unknown, c?: unknown) => { log.push({ etapa, msg: String((e as any)?.message ?? e), c }); } }; }
const cfg = (ids: string[], extra: any = {}) => ({ client_id: "cid", client_secret: SECRET, api_key: null, api_key_exp: null, item_ids: ids, ...extra });
const semSegredo = (log: any[]) => { const s = JSON.stringify(log); if (s.includes(SECRET) || s.includes(APIKEY)) throw new Error("segredo no log: " + s); };

Deno.test("sucesso em todos", async () => {
  const { f, chamadas } = mock({ a: 200, b: 200 }); const { log, reg } = registrador();
  eq(await apagaItensPluggy(cfg(["a", "b"]), { fetch: f, registra: reg }), { apagados: 2, falhas: 0 });
  eq(chamadas, ["POST /auth", "DELETE /items/a", "DELETE /items/b"]); eq(log, []);
});
Deno.test("404 conta como sucesso", async () => {
  const { f } = mock({ a: 404, b: 200 }); const { log, reg } = registrador();
  eq(await apagaItensPluggy(cfg(["a", "b"]), { fetch: f, registra: reg }), { apagados: 2, falhas: 0 }); eq(log, []);
});
Deno.test("500 é falha registrada e não lança", async () => {
  const { f } = mock({ a: 500, b: 200 }); const { log, reg } = registrador();
  eq(await apagaItensPluggy(cfg(["a", "b"]), { fetch: f, registra: reg }), { apagados: 1, falhas: 1 });
  eq(log.length, 1); eq(log[0].c, 500); semSegredo(log);
});
Deno.test("erro de rede", async () => {
  const { f } = mock({ a: "rede" }); const { log, reg } = registrador();
  eq(await apagaItensPluggy(cfg(["a"]), { fetch: f, registra: reg }), { apagados: 0, falhas: 1 }); semSegredo(log);
});
Deno.test("timeout total", async () => {
  const { f } = mock({ a: "trava", b: 200 }); const { log, reg } = registrador();
  const t0 = Date.now();
  eq(await apagaItensPluggy(cfg(["a", "b"]), { fetch: f, registra: reg, prazoMs: 300 }), { apagados: 1, falhas: 1 });
  if (Date.now() - t0 > 2000) throw new Error("não respeitou o prazo");
  eq(log[0].etapa, "excluir-pluggy-timeout"); semSegredo(log);
});
Deno.test("sem itens e sem cfg: nada a fazer, nenhuma chamada", async () => {
  const { f, chamadas } = mock({});
  eq(await apagaItensPluggy(cfg([]), { fetch: f }), { apagados: 0, falhas: 0 });
  eq(await apagaItensPluggy(null, { fetch: f }), { apagados: 0, falhas: 0 });
  eq(chamadas, []);
});
Deno.test("credencial inválida: falha em todos, sem segredo no log", async () => {
  const { f } = mock({ a: 200, b: 200 }); const { log, reg } = registrador();
  eq(await apagaItensPluggy(cfg(["a", "b"], { client_secret: "errado" }), { fetch: f, registra: reg }), { apagados: 0, falhas: 2 });
  eq(log[0].etapa, "excluir-pluggy-auth"); eq(log[0].c, 401); semSegredo(log);
});
Deno.test("segredo cifrado (enc1) e api_key guardada vencida renova uma vez", async () => {
  const raw = crypto.getRandomValues(new Uint8Array(32)), chave = btoa(String.fromCharCode(...raw));
  const k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const enc = async (s: string) => { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(s))); const o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12); return "enc1:" + btoa(String.fromCharCode(...o)); };
  const { f, chamadas } = mock({ a: 200 }); const { log, reg } = registrador();
  const c = cfg(["a"], { client_secret: await enc(SECRET), api_key: await enc("chave-velha"), api_key_exp: new Date(Date.now() + 3600e3).toISOString() });
  eq(await apagaItensPluggy(c, { fetch: f, registra: reg, chave }), { apagados: 1, falhas: 0 });
  eq(chamadas, ["DELETE /items/a", "POST /auth", "DELETE /items/a"]); eq(log, []);
});
Deno.test("chave de criptografia ausente: falha registrada, não lança", async () => {
  const { f } = mock({ a: 200 }); const { log, reg } = registrador();
  eq(await apagaItensPluggy(cfg(["a"], { client_secret: "enc1:AAAA" }), { fetch: f, registra: reg, chave: "" }), { apagados: 0, falhas: 1 });
  eq(log[0].etapa, "excluir-pluggy-auth");
});
