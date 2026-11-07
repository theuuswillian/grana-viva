// whatsapp-webhook (v10.136): recebe as mensagens do WhatsApp do GranaViva (Cloud API da Meta).
// Fluxo: a pessoa gera um código de 6 dígitos no app (função whatsapp-vincular) e manda pelo WhatsApp -> número ligado à conta.
// Depois, cada mensagem de texto ("gastei 32 no almoço") é lida pela IA e volta com os botões Salvar / Cancelar.
// "Salvar" grava o lançamento na tabela tx da pessoa (o app recebe na próxima sincronização).
// Secrets: WA_VERIFY_TOKEN (verificação do webhook), WA_APP_SECRET (assinatura X-Hub-Signature-256),
//          WA_TOKEN e WA_PHONE_ID (envio). Sem WA_TOKEN, o que seria enviado vai para a tabela wa_saida_teste.
// v10.153: modo sandbox da 360dialog (teste sem conta na Meta): WA_SB_TOKEN (vai na URL do webhook, ?sb=...) e
//          WA_D360_KEY (chave do sandbox, enviada no cabeçalho D360-API-KEY). O sandbox não assina as mensagens.
//          Limite do sandbox: 25 envios no total; quem fala com ele é só o número dono da chave.
import { createClient } from "npm:@supabase/supabase-js@2";
import "../_shared/planos.js";
import { registraErro } from "../_shared/erros.ts";
import { leLancamento, CATS_PADRAO, type Lanc } from "../_shared/ia-lancamento.ts";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const GVP = (globalThis as any).GVP;
const GRAPH = "https://graph.facebook.com/v21.0";
const D360 = "https://waba-sandbox.360dialog.io/v1/messages";
let viaSandbox = false;
const FN = "whatsapp-webhook";

const enc = new TextEncoder();
async function assinaturaOk(raw: string, cab: string | null): Promise<boolean> {
  const seg = Deno.env.get("WA_APP_SECRET");
  if (!seg || !cab || !cab.startsWith("sha256=")) return false;
  const k = await crypto.subtle.importKey("raw", enc.encode(seg), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(raw)));
  const hex = [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
  const rec = cab.slice(7).toLowerCase();
  if (rec.length !== hex.length) return false;
  let d = 0; for (let i = 0; i < hex.length; i++) d |= hex.charCodeAt(i) ^ rec.charCodeAt(i);
  return d === 0;
}

async function envia(tel: string, corpo: Record<string, unknown>) {
  const dest = tel.startsWith("u:") ? { recipient: tel.slice(2) } : { to: tel };
  const msg = { messaging_product: "whatsapp", recipient_type: "individual", ...dest, ...corpo };
  const dk = Deno.env.get("WA_D360_KEY");
  if (viaSandbox && dk) {
    try {
      const r = await fetch(D360, { method: "POST", signal: AbortSignal.timeout(15000), headers: { "D360-API-KEY": dk, "content-type": "application/json" }, body: JSON.stringify(msg) });
      if (!r.ok) await registraErro(sb, FN, "enviar-sandbox", (await r.text()).slice(0, 200), r.status);
    } catch (e) { await registraErro(sb, FN, "enviar-sandbox", e); }
    return;
  }
  const tok = Deno.env.get("WA_TOKEN"), pid = Deno.env.get("WA_PHONE_ID");
  if (!tok || !pid) { await sb.from("wa_saida_teste").insert({ telefone: tel, corpo: msg }); return; }
  try {
    const r = await fetch(`${GRAPH}/${pid}/messages`, { method: "POST", signal: AbortSignal.timeout(15000), headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(msg) });
    if (!r.ok) await registraErro(sb, FN, "enviar", (await r.text()).slice(0, 200), r.status);
  } catch (e) { await registraErro(sb, FN, "enviar", e); }
}
const texto = (tel: string, t: string) => envia(tel, { type: "text", text: { body: t, preview_url: false } });

const brl = (v: number) => "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const dataBR = (d: string, hoje: string) => d === hoje ? "hoje" : d.slice(8, 10) + "/" + d.slice(5, 7) + (d.slice(0, 4) !== hoje.slice(0, 4) ? "/" + d.slice(0, 4) : "");
const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // America/Sao_Paulo (sem horário de verão)
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const AJUDA = "Mande o gasto do jeito que você falaria, por exemplo:\n• gastei 32 no almoço\n• uber 18,50 ontem\n• recebi 2500 de salário";

async function vincula(tel: string, codigo: string) {
  const { data: c } = await sb.from("wa_codigo").select("user_id,expira").eq("codigo", codigo).maybeSingle();
  if (!c || new Date(c.expira).getTime() < Date.now()) { await texto(tel, "Esse código não vale mais. Gere um novo no app: Ajustes > WhatsApp."); return; }
  await sb.from("wa_codigo").delete().eq("user_id", c.user_id);
  await sb.from("wa_vinculo").delete().or(`telefone.eq.${tel},user_id.eq.${c.user_id}`);
  const { error } = await sb.from("wa_vinculo").insert({ user_id: c.user_id, telefone: tel });
  if (error) { await registraErro(sb, FN, "vincular", error); await texto(tel, "Não consegui ligar agora. Tente de novo em instantes."); return; }
  await texto(tel, "Pronto! Seu WhatsApp está ligado ao GranaViva. ✅\n\n" + AJUDA);
}

async function leTexto(tel: string, uid: string, msg: string) {
  let ef: any;
  try { const { data } = await sb.from("assinaturas").select("plano,status,periodo_fim").eq("user_id", uid).maybeSingle(); ef = GVP.efetivo(data); }
  catch (e) { await registraErro(sb, FN, "plano", e); await texto(tel, "Não consegui conferir seu plano agora. Tente de novo em instantes."); return; }
  const lim = GVP.limite(ef.nivel, "leitura_ia_dia");
  if (!GVP.pode(ef.nivel, "leitura_ia") || lim <= 0) { await texto(tel, "Lançar pelo WhatsApp faz parte dos planos Plus e Pro. Você pode assinar pelo app, em Planos."); return; }
  const hoje = hojeBR();
  const { data: ok, error: ue } = await sb.rpc("ia_conta_k", { p_uid: uid, p_dia: hoje, p_k: "leitura", p_lim: lim });
  if (ue) { await registraErro(sb, FN, "limite", ue); await texto(tel, "Não consegui conferir seu limite agora. Tente de novo em instantes."); return; }
  if (!ok) { await texto(tel, `Você chegou ao limite de ${lim} leituras por dia. Amanhã libera de novo, ou lance pelo app.`); return; }
  const { data: st } = await sb.from("settings").select("data").eq("user_id", uid).maybeSingle();
  const cats: string[] = Array.isArray(st?.data?.cats) && st.data.cats.length ? st.data.cats.map(String) : CATS_PADRAO;
  const r = await leLancamento(msg, cats, hoje);
  if (!r.ok) { await registraErro(sb, FN, "ia", r.erro); await texto(tel, "Não consegui ler agora (" + r.erro + "). Tente de novo em 1 minuto."); return; }
  const l = r.l;
  if (!(l.valor > 0) || l.confianca < 0.3) { await texto(tel, "Não entendi o valor. 🤔\n\n" + AJUDA); return; }
  const pid = novoId();
  await sb.from("wa_pendente").delete().eq("user_id", uid).lt("criado_em", new Date(Date.now() - 24 * 3600e3).toISOString());
  const { error: pe } = await sb.from("wa_pendente").insert({ id: pid, user_id: uid, telefone: tel, lanc: l });
  if (pe) { await registraErro(sb, FN, "pendente", pe); await texto(tel, "Não consegui guardar agora. Tente de novo em instantes."); return; }
  const forma = { pix: "Pix", cartao: "cartão", dinheiro: "dinheiro", boleto: "boleto" }[l.forma] || l.forma;
  const corpo = `${l.tipo === "receita" ? "Receita" : "Despesa"} de *${brl(l.valor)}*\n${l.categoria}${l.descricao ? " · " + l.descricao : ""}\n${dataBR(l.data, hoje)} · ${forma}${l.parcelas > 1 ? " · " + l.parcelas + "x (salvo como o total)" : ""}${l.recorrente && !(l.parcelas > 1) ? "\n🔁 Conta fixa: repete todo dia " + parseInt(l.data.slice(8, 10), 10) + " no app" : ""}`;
  await envia(tel, { type: "interactive", interactive: { type: "button", body: { text: corpo }, action: { buttons: [
    { type: "reply", reply: { id: "ok:" + pid, title: "Salvar" } },
    { type: "reply", reply: { id: "no:" + pid, title: "Cancelar" } }] } } });
}

async function botao(tel: string, uid: string, bid: string) {
  const m = /^(ok|no):([a-z0-9]{6,20})$/.exec(bid);
  if (!m) return;
  // apaga e devolve numa operação só: dois toques seguidos em "Salvar" não gravam duas vezes
  const { data: pd } = await sb.from("wa_pendente").delete().eq("id", m[2]).eq("user_id", uid).select("id,lanc");
  const p = pd?.[0];
  if (!p) { await texto(tel, "Esse lançamento já foi salvo ou cancelado."); return; }
  if (m[1] === "no") { await texto(tel, "Cancelado. Nada foi salvo."); return; }
  const l = p.lanc as Lanc, id = novoId();
  const data = { id, tipo: l.tipo, valor: l.valor, categoria: l.categoria, descricao: l.descricao, sub: "", tags: ["whatsapp"], obs: "", data: l.data, cartao: "", forma: l.forma, conta: "", pagoCom: "", status: "pago", multa: 0, juros: 0, desconto: 0 };
  if (l.recorrente && !(l.parcelas > 1)) (data as any).waFixa = 1; // v10.153: o app transforma em conta fixa mensal na próxima sincronização
  const { error } = await sb.from("tx").insert({ user_id: uid, id, data, updated_at: new Date().toISOString() });
  if (error) { await registraErro(sb, FN, "salvar", error); await texto(tel, "Não consegui salvar agora. Mande de novo em instantes."); return; }
  await texto(tel, `Salvo! ✅ ${l.tipo === "receita" ? "Receita" : "Despesa"} de ${brl(l.valor)} em ${l.categoria}${l.recorrente && !(l.parcelas > 1) ? ", como conta fixa todo mês" : ""}. Aparece no app na próxima vez que você abrir.`);
}

async function trata(m: any) {
  const tel = m?.from ? String(m.from).replace(/\D/g, "") : (m?.from_user_id ? "u:" + String(m.from_user_id).slice(0, 80) : "");
  const mid = String(m?.id || "");
  if (!tel || !mid) return;
  const { error: de } = await sb.from("wa_msg").insert({ id: mid.slice(0, 200) });
  if (de) return; // já processada (a Meta reenvia quando demora a resposta)
  const t = m.type === "text" ? String(m.text?.body || "").trim() : "";
  const cod = /^\s*(?:gv\s*)?(\d{6})\s*$/i.exec(t);
  if (cod) { await vincula(tel, cod[1]); return; }
  const { data: v } = await sb.from("wa_vinculo").select("user_id").eq("telefone", tel).maybeSingle();
  if (!v) { await texto(tel, "Olá! Para lançar seus gastos por aqui, abra o GranaViva, vá em Ajustes > WhatsApp e mande o código de 6 dígitos que aparece lá."); return; }
  if (m.type === "interactive" && m.interactive?.type === "button_reply") { await botao(tel, v.user_id, String(m.interactive.button_reply?.id || "")); return; }
  if (m.type === "button") { return; }
  if (m.type !== "text") { await texto(tel, "Por enquanto eu só leio mensagens de texto. Foto de comprovante e áudio estão chegando.\n\n" + AJUDA); return; }
  if (!t || /^(oi|ol[aá]|bom dia|boa tarde|boa noite|ajuda|menu|\?)\W*$/i.test(t)) { await texto(tel, AJUDA); return; }
  await leTexto(tel, v.user_id, t);
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (req.method === "GET") {
    const vt = Deno.env.get("WA_VERIFY_TOKEN");
    if (vt && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === vt) return new Response(u.searchParams.get("hub.challenge") || "", { status: 200 });
    return new Response("proibido", { status: 403 });
  }
  if (req.method !== "POST") return new Response("método", { status: 405 });
  const raw = await req.text();
  const sbt = Deno.env.get("WA_SB_TOKEN"), sbq = u.searchParams.get("sb") || "";
  let sbOk = false;
  if (sbt && sbq.length === sbt.length) { let d = 0; for (let i = 0; i < sbt.length; i++) d |= sbt.charCodeAt(i) ^ sbq.charCodeAt(i); sbOk = d === 0; }
  viaSandbox = sbOk;
  if (!sbOk && !(await assinaturaOk(raw, req.headers.get("x-hub-signature-256")))) return new Response("assinatura inválida", { status: 401 });
  let b: any; try { b = JSON.parse(raw); } catch { return new Response("ok"); }
  const msgs: any[] = [];
  for (const e of b?.entry || []) for (const c of e?.changes || []) for (const m of c?.value?.messages || []) msgs.push(m);
  for (const m of msgs.slice(0, 20)) { try { await trata(m); } catch (e) { await registraErro(sb, FN, "tratar", e); } }
  return new Response("ok");
});
