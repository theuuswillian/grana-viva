// minha-conta (v10.81, LGPD): exportar todos os dados da pessoa ou excluir a conta inteira.
// Chamada pelo app com o login do usuário. Usa a service role só aqui no servidor e sempre com o id
// tirado do token (nunca do corpo do pedido): ninguém consegue exportar ou apagar a conta de outra pessoa.
import { createClient } from "npm:@supabase/supabase-js@2";
import * as MP from "../_shared/mercadopago.ts";
import { registraErro } from "../_shared/erros.ts"; // v10.93: importado direto de ../_shared (deploy-fn.py envia a pasta junto)
import { apagaItensPluggy } from "./pluggy.ts";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ORIGENS = ["https://theuuswillian.github.io"];
const origemOk = (o: string) => ORIGENS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
let ORIG = ORIGENS[0];
const CORS = { get "Access-Control-Allow-Origin"() { return ORIG; }, "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

// todas as tabelas com dados da pessoa (todas têm user_id). manter em dia ao criar tabela nova.
const TABELAS = ["tx", "fiis", "metas", "cartoes", "bancos", "settings", "push_subs", "push_log", "ia_uso", "rl_uso", "pluggy_cfg", "pluggy_tx", "pluggy_acc", "assinaturas", "pagamento_eventos"]; // v10.82: + plano e avisos de pagamento
const BUCKET = "comprovantes";
// colunas que nunca saem no arquivo (segredos de acesso, já criptografados no banco)
const OCULTAR: Record<string, string[]> = { pluggy_cfg: ["client_secret", "api_key", "webhook_secret"], push_subs: ["p256dh", "auth"] };

async function todasLinhas(t: string, uid: string) {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from(t).select("*").eq("user_id", uid).range(de, de + 999);
    if (error) throw new Error(t + ": " + error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
// lista recursiva dos arquivos da pessoa no bucket (pastas: uid/<lançamento>/<arquivo>)
async function arquivos(pasta: string, prof = 0): Promise<{ path: string; size: number; created_at: string }[]> {
  if (prof > 4) return [];
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.storage.from(BUCKET).list(pasta, { limit: 1000, offset: de });
    if (error) throw new Error("storage: " + error.message);
    for (const o of data || []) {
      const p = pasta + "/" + o.name;
      if (o.id) out.push({ path: p, size: (o.metadata as any)?.size || 0, created_at: o.created_at });
      else out.push(...await arquivos(p, prof + 1));
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

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
  let body: any;
  try { body = await req.json(); } catch { return json({ erro: "corpo inválido" }, 400); }
  const acao = String(body?.acao || "");

  if (acao === "exportar") {
    const { data: ok } = await sb.rpc("rl_conta", { p_uid: uid, p_k: "conta:exportar", p_lim: 10, p_seg: 3600 });
    if (!ok) return json({ erro: "Muitas exportações seguidas. Tente de novo em uma hora." }, 429);
    try {
      const tabelas: Record<string, any[]> = {};
      for (const t of TABELAS) {
        const linhas = await todasLinhas(t, uid);
        const oc = OCULTAR[t] || [];
        tabelas[t] = linhas.map((r) => { const x = { ...r }; for (const c of oc) if (x[c] != null) x[c] = "[segredo guardado criptografado, não exportado]"; return x; });
      }
      const arqs = await arquivos(uid);
      const us = u!.user!;
      return json({
        app: "GranaViva", formato: "exportacao-lgpd-1", geradoEm: new Date().toISOString(),
        conta: { id: us.id, email: us.email, criadaEm: us.created_at, ultimoAcesso: us.last_sign_in_at, emailConfirmadoEm: us.email_confirmed_at,
          provedores: (us.app_metadata as any)?.providers || [], nome: (us.user_metadata as any)?.full_name || (us.user_metadata as any)?.name || "" },
        tabelas,
        comprovantes: { bucket: BUCKET, arquivos: arqs, nota: "Os arquivos podem ser abertos um a um no app, em cada lançamento (Comprovantes)." },
      });
    } catch (e) { console.log("exportar", String(e)); await registraErro(sb, "minha-conta", "exportar", e); return json({ erro: "não foi possível gerar a exportação agora" }, 500); }
  }

  if (acao === "excluir") {
    if (String(body?.confirmacao || "") !== "EXCLUIR") return json({ erro: "confirmação ausente" }, 400);
    const { data: ok } = await sb.rpc("rl_conta", { p_uid: uid, p_k: "conta:excluir", p_lim: 3, p_seg: 3600 });
    if (!ok) return json({ erro: "Muitas tentativas. Tente de novo em uma hora." }, 429);
    const rel: Record<string, number> = {};
    // v10.82: assinatura paga ativa no Mercado Pago é cancelada antes (senão o MP continuaria cobrando)
    try {
      const { data: a } = await sb.from("assinaturas").select("provedor,provedor_assinatura_id,status").eq("user_id", uid).maybeSingle();
      const tk = Deno.env.get("MP_ACCESS_TOKEN");
      if (a?.provedor === "mercadopago" && a.provedor_assinatura_id && a.status !== "cancelado") {
        if (!tk) return json({ erro: "Sua assinatura paga precisa ser cancelada antes. Fale com o suporte." }, 409);
        await MP.cancela(a.provedor_assinatura_id, tk);
        rel.assinatura_cancelada = 1;
      }
    } catch (e) { console.log("excluir: cancela assinatura", uid, String(e)); await registraErro(sb, "minha-conta", "excluir-cancela-assinatura", e); return json({ erro: "não consegui cancelar sua assinatura agora. Tente de novo em instantes." }, 502); }
    // v10.108: antes de apagar as tabelas, apaga na Pluggy as conexões de banco (items). Falha aqui não impede a exclusão:
    // fica em erros_fn (sem dados pessoais) e o resultado diz quantas não saíram. Prazo total ~8 s.
    let pluggy = { apagados: 0, falhas: 0 };
    try {
      const { data: pc, error: pe } = await sb.from("pluggy_cfg").select("client_id,client_secret,api_key,api_key_exp,item_ids").eq("user_id", uid).maybeSingle();
      if (pe) throw new Error("pluggy_cfg: " + pe.message);
      pluggy = await apagaItensPluggy(pc, { chave: Deno.env.get("PLUGGY_ENC_KEY") || "", prazoMs: 8000, registra: (etapa, e, cod) => registraErro(sb, "minha-conta", etapa, e, cod) });
    } catch (e) { await registraErro(sb, "minha-conta", "excluir-pluggy", e); }
    if (pluggy.falhas) console.log("excluir: pluggy", JSON.stringify(pluggy));
    try {
      // 1) comprovantes no Storage
      const arqs = await arquivos(uid);
      for (let i = 0; i < arqs.length; i += 100) {
        const { error } = await sb.storage.from(BUCKET).remove(arqs.slice(i, i + 100).map((a) => a.path));
        if (error) throw new Error("storage: " + error.message);
      }
      rel.comprovantes = arqs.length;
      // 2) linhas de todas as tabelas (rl_uso por último, o limitador acabou de gravar nela)
      for (const t of TABELAS) {
        const { error, count } = await sb.from(t).delete({ count: "exact" }).eq("user_id", uid);
        if (error) throw new Error(t + ": " + error.message);
        rel[t] = count || 0;
      }
      // 3) o usuário de login (as tabelas também têm ON DELETE CASCADE, como segunda garantia)
      const { error: de } = await sb.auth.admin.deleteUser(uid);
      if (de) throw new Error("auth: " + de.message);
    } catch (e) { console.log("excluir", uid, String(e)); await registraErro(sb, "minha-conta", "excluir", e); return json({ erro: "não foi possível concluir a exclusão agora. Tente de novo em instantes.", parcial: rel, pluggy }, 500); }
    console.log("conta excluída", uid, JSON.stringify(rel), JSON.stringify(pluggy));
    return json({ ok: true, apagado: rel, pluggy });
  }
  return json({ erro: "ação desconhecida" }, 400);
});
