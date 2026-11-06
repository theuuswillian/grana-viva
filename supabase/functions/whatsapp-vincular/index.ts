// whatsapp-vincular (v10.136): chamada pelo app com o login da pessoa.
// acao "status": diz se há WhatsApp ligado (número mascarado). "codigo": gera um código de 6 dígitos (15 min).
// "desvincular": desliga o número. O número do GranaViva vem do secret WA_NUMERO (só dígitos).
import { createClient } from "npm:@supabase/supabase-js@2";
import "../_shared/planos.js";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const GVP = (globalThis as any).GVP;
const ORIGENS = ["https://theuuswillian.github.io"];
const origemOk = (o: string) => ORIGENS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
let ORIG = ORIGENS[0];
const CORS = { get "Access-Control-Allow-Origin"() { return ORIG; }, "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const mascara = (t: string) => t.length > 6 ? "+" + t.slice(0, 2) + " " + t.slice(2, 4) + " •••••-" + t.slice(-4) : "•••";

Deno.serve(async (req) => {
  const og = req.headers.get("origin") || "";
  ORIG = origemOk(og) ? og : ORIGENS[0];
  if (og && !origemOk(og)) return new Response("origem não permitida", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...CORS } });
  if (req.method !== "POST") return json({ erro: "método" }, 405);
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await sb.auth.getUser(tok);
  const uid = u?.user?.id;
  if (!uid) return json({ erro: "faça login" }, 401);
  let body: any; try { body = await req.json(); } catch { body = {}; }
  const acao = String(body?.acao || "status");
  const numero = (Deno.env.get("WA_NUMERO") || "").replace(/\D/g, "");
  const ativo = !!(numero && Deno.env.get("WA_TOKEN"));
  const { data: s } = await sb.from("assinaturas").select("plano,status,periodo_fim").eq("user_id", uid).maybeSingle();
  const pode = GVP.pode(GVP.efetivo(s).nivel, "leitura_ia");
  if (acao === "status") {
    const { data: v } = await sb.from("wa_vinculo").select("telefone,criado_em").eq("user_id", uid).maybeSingle();
    return json({ ativo, pode, numero: ativo ? numero : "", vinculado: !!v, telefone: v ? mascara(v.telefone) : "", desde: v?.criado_em || null });
  }
  if (acao === "desvincular") {
    await sb.from("wa_vinculo").delete().eq("user_id", uid);
    await sb.from("wa_pendente").delete().eq("user_id", uid);
    return json({ ok: true });
  }
  if (acao === "codigo") {
    if (!pode) return json({ erro: "Lançar pelo WhatsApp faz parte dos planos Plus e Pro.", upgrade: true, recurso: "leitura_ia" }, 402);
    if (!ativo) return json({ erro: "O WhatsApp do GranaViva ainda não está no ar." }, 503);
    await sb.from("wa_codigo").delete().or(`user_id.eq.${uid},expira.lt.${new Date().toISOString()}`);
    for (let i = 0; i < 5; i++) {
      const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000;
      const codigo = String(n);
      const { error } = await sb.from("wa_codigo").insert({ codigo, user_id: uid, expira: new Date(Date.now() + 15 * 60e3).toISOString() });
      if (!error) return json({ codigo, numero, expiraMin: 15 });
    }
    return json({ erro: "não consegui gerar o código, tente de novo" }, 503);
  }
  return json({ erro: "ação desconhecida" }, 400);
});
