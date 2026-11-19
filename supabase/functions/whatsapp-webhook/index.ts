// whatsapp-webhook (v10.136): recebe as mensagens do WhatsApp do GranaViva (Cloud API da Meta).
// Fluxo: a pessoa gera um código de 6 dígitos no app (função whatsapp-vincular) e manda pelo WhatsApp -> número ligado à conta.
// Depois, cada mensagem de texto ("gastei 32 no almoço") é lida pela IA e volta com os botões Salvar / Cancelar.
// "Salvar" grava o lançamento na tabela tx da pessoa (o app recebe na próxima sincronização).
// Secrets: WA_VERIFY_TOKEN (verificação do webhook), WA_APP_SECRET (assinatura X-Hub-Signature-256),
//          WA_TOKEN e WA_PHONE_ID (envio). Sem WA_TOKEN, o que seria enviado vai para a tabela wa_saida_teste.
// v10.153: modo sandbox da 360dialog (teste sem conta na Meta): WA_SB_TOKEN (vai na URL do webhook, ?sb=...) e
//          WA_D360_KEY (chave do sandbox, enviada no cabeçalho D360-API-KEY). O sandbox não assina as mensagens.
//          Limite do sandbox: 25 envios no total; quem fala com ele é só o número dono da chave.
// v10.165: idempotência por id da mensagem (wa_msg, chave primária, gravado ANTES de processar: reenvio da Meta = ignorado)
//          e resumo semanal pelo WhatsApp: pg_cron toda segunda às 11:00 UTC (8h em America/Sao_Paulo) chama
//          POST ?acao=resumo-semanal com x-cron-secret (= CRON_SECRET, o mesmo do alertas-push). Só para quem ligou o
//          "Resumo semanal" e no máximo um por semana (wa_vinculo.resumo_enviado, reservado antes de enviar).
//          Fase 1: a preferência fica em settings.whatsapp_resumo_semanal (padrão ligado; sem linha em settings = ligado).
//          Recuo: sem essa coluna ainda, vale wa_vinculo.resumo_semanal como na v10.165.
//          Fora da janela de 24h da Meta só template aprovado chega: WA_TPL_RESUMO (nome do template, 1 parâmetro no corpo) e
//          WA_TPL_LANG (padrão pt_BR). Sem template configurado, vai como texto (chega só para quem falou com o bot nas últimas 24h).
// Fase 2: o resumo traz o gasto dos últimos 7 dias, o saldo livre do mês com quanto dá por dia e a fatura atual; os envios
//          saem com 1,5 s de intervalo e no máximo ~100 s por chamada (o que sobrar vai na chamada seguinte do cron, mesma
//          segunda; a semana reservada impede repetir). Consultas pelo WhatsApp respondem saldo livre do mês e fatura atual e
//          não gastam cota. Foto/PDF/áudio acima de 5 MB ou de tipo fora da lista são recusados antes da IA.
import { createClient } from "npm:@supabase/supabase-js@2";
import "../_shared/planos.js";
import { registraErro } from "../_shared/erros.ts";
import { iguais } from "../_shared/seguro.ts";
import { reservaMensagem, finalizaMensagem, erroEnvioRecuperavel, contaLeituraMensagem } from "../_shared/wa-idem.ts";
import { semanaPassada, textoResumo, quemRecebeResumo, livreMes, faturaAtual, janelaResumo, enviaEmLote } from "../_shared/resumo-semanal.ts";
import { leMensagem, gastaCota, CATS_PADRAO, type Item, type Pergunta, type Midia } from "../_shared/ia-whatsapp.ts";
// Fase 2: mídia conferida (até 5 MB, tipo pelos bytes mágicos) antes de ir para a IA
import { confereBytes, ARQ_MAX, MSG_GRANDE, MSG_TIPO } from "../_shared/arquivo.ts";
import { confereCota, hojeSP } from "../_shared/cota.ts";
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
      if (!r.ok) {
        const detalhe = (await r.text()).slice(0, 200);
        if (erroEnvioRecuperavel(r.status)) throw new Error(`Falha transitória no envio sandbox (HTTP ${r.status}): ${detalhe}`);
        await registraErro(sb, FN, "enviar-sandbox", detalhe, r.status);
      }
    } catch (e) {
      await registraErro(sb, FN, "enviar-sandbox", e);
      throw e;
    }
    return;
  }
  const tok = Deno.env.get("WA_TOKEN"), pid = Deno.env.get("WA_PHONE_ID");
  if (!tok || !pid) {
    const { error } = await sb.from("wa_saida_teste").insert({ telefone: tel, corpo: msg });
    if (error) throw error;
    return;
  }
  try {
    const r = await fetch(`${GRAPH}/${pid}/messages`, { method: "POST", signal: AbortSignal.timeout(15000), headers: { authorization: "Bearer " + tok, "content-type": "application/json" }, body: JSON.stringify(msg) });
    if (!r.ok) {
      const detalhe = (await r.text()).slice(0, 200);
      if (r.status === 429 || r.status >= 500) throw new Error(`Falha transitória no envio WhatsApp (HTTP ${r.status}): ${detalhe}`);
      await registraErro(sb, FN, "enviar", detalhe, r.status);
    }
  } catch (e) {
    await registraErro(sb, FN, "enviar", e);
    throw e;
  }
}
const texto = (tel: string, t: string) => envia(tel, { type: "text", text: { body: t, preview_url: false } });

const brl = (v: number) => "R$ " + v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const dataBR = (d: string, hoje: string) => d === hoje ? "hoje" : d.slice(8, 10) + "/" + d.slice(5, 7) + (d.slice(0, 4) !== hoje.slice(0, 4) ? "/" + d.slice(0, 4) : "");
const hojeBR = () => hojeSP(); // v10.165: America/Sao_Paulo pelo Intl (mesma função das cotas)
function diaMensagemSP(timestamp: unknown): string {
  const segundos = Number(timestamp);
  if (!Number.isFinite(segundos) || segundos <= 0) return hojeBR();
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(segundos * 1000));
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value || "";
  return parte("year") + "-" + parte("month") + "-" + parte("day");
}
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
// v10.161: plano Grátis = 5 lançamentos pelo WhatsApp por mês (contados ao salvar); consultas são sempre liberadas.
const APP = (Deno.env.get("APP_URL") || "https://theuuswillian.github.io/grana-viva/").replace(/\/?$/, "/");
export const LINK_PRO = APP + "?planos=pro";
export function msgCotaWhatsApp(limite: number) {
  return `Seus ${limite} lançamentos grátis pelo WhatsApp deste mês acabaram. 🙂\n\nConsultas continuam liberadas: saldo, quanto posso gastar, fatura e orçamento.\n\nNo Pro, lançar pelo WhatsApp (e com IA no app) é ilimitado:\n${LINK_PRO}\n\nOu lance pelo app: o lançamento manual é sempre grátis.`;
}
async function cotaBloqueia(tel: string, uid: string, nivel: number): Promise<boolean> {
  const lim = await confereCota(sb, uid, nivel, "whatsapp");
  if (!lim) return false;
  await texto(tel, msgCotaWhatsApp(Number(lim.limite) || 5));
  return true;
}
async function nivelDe(uid: string): Promise<number> {
  const { data, error } = await sb.from("assinaturas").select("plano,status,periodo_fim").eq("user_id", uid).maybeSingle();
  if (error) throw error;
  return GVP.efetivo(data).nivel;
}
const AJUDA = "Mande o gasto do jeito que você falaria, por exemplo:\n• gastei 32 no almoço\n• uber 18,50 ontem\n• recebi 2500 de salário";

async function vincula(tel: string, codigo: string) {
  const { data: c, error: ce } = await sb.from("wa_codigo").select("user_id,expira").eq("codigo", codigo).maybeSingle();
  if (ce) throw ce;
  if (!c || new Date(c.expira).getTime() < Date.now()) { await texto(tel, "Esse código não vale mais. Gere um novo no app: Ajustes > WhatsApp."); return; }
  const { error: de } = await sb.from("wa_vinculo").delete().or(`telefone.eq.${tel},user_id.eq.${c.user_id}`);
  if (de) throw de;
  const { error: ie } = await sb.from("wa_vinculo").insert({ user_id: c.user_id, telefone: tel });
  if (ie) throw ie;
  const { error: ce2 } = await sb.from("wa_codigo").delete().eq("user_id", c.user_id);
  if (ce2) throw ce2;
  await texto(tel, "Pronto! Seu WhatsApp está ligado ao GranaViva. ✅\n\n" + AJUDA);
}

type Entrada = { texto: string; midia: Midia | null; msgId: string; diaCota: string };
async function leMsg(tel: string, uid: string, e: Entrada) {
  const { data: assinatura, error: erroAssinatura } = await sb.from("assinaturas")
    .select("plano,status,periodo_fim").eq("user_id", uid).maybeSingle();
  if (erroAssinatura) throw erroAssinatura;
  const ef = GVP.efetivo(assinatura);
  // v10.161: WhatsApp liberado em todos os planos. Freio técnico diário igual para todos (GVP.ANTIABUSO.leitura_ia_dia);
  // a cota do plano (lançamentos por mês) é conferida só quando a mensagem é um lançamento, nunca numa consulta.
  const lim = GVP.limite(ef.nivel, "leitura_ia_dia");
  const hoje = hojeBR();
  const diaCota = e.diaCota || hoje;
  const ok = await contaLeituraMensagem(sb, uid, e.msgId, diaCota, lim);
  if (!ok) { await texto(tel, "Você mandou muitas mensagens hoje (" + lim + "). Amanhã libera de novo, ou lance pelo app."); return; }
  const [{ data: st, error: es }, { data: kc, error: ek }, { data: bc, error: eb }] = await Promise.all([
    sb.from("settings").select("data").eq("user_id", uid).maybeSingle(),
    sb.from("cartoes").select("data").eq("user_id", uid), sb.from("bancos").select("data").eq("user_id", uid)]);
  if (es || ek || eb) throw es || ek || eb;
  const cats: string[] = Array.isArray(st?.data?.cats) && st.data.cats.length ? st.data.cats.map(String) : CATS_PADRAO;
  const nomes = [...(kc || []), ...(bc || [])].filter((x: any) => x?.data?.nome && !x.data.arq).map((x: any) => String(x.data.nome).slice(0, 40)).slice(0, 30);
  const r = await leMensagem(e.texto, e.midia, cats, nomes, hoje);
  if (!r.ok) {
    await registraErro(sb, FN, "ia", r.erro);
    if (r.recuperavel) throw new Error("Falha transitória na leitura IA: " + r.erro);
    await texto(tel, "Não consegui ler agora (" + r.erro + "). Tente de novo em 1 minuto.");
    return;
  }
  const L = r.r;
  if (L.intencao === "pergunta" && L.pergunta) { await responde(tel, uid, L.pergunta); return; }
  // Fase 2: só lançamento gasta cota (gastaCota); consulta e conversa nunca chegam aqui
  if (gastaCota(L) && await cotaBloqueia(tel, uid, ef.nivel)) return;
  if (L.intencao !== "lancamento" || !L.itens.length || L.confianca < 0.3) { await texto(tel, (e.midia ? "Não consegui achar um valor nisso. 🤔\n\n" : "Não entendi. 🤔\n\n") + AJUDA + "\n\nOu pergunte: quanto gastei com mercado esse mês?"); return; }
  // A mesma mensagem de origem sempre reutiliza o mesmo pendente.
  const { data: existente, error: ee } = await sb.from("wa_pendente")
    .select("id,lanc,status").eq("origem_msg_id", e.msgId).eq("user_id", uid).maybeSingle();
  if (ee) throw ee;
  let pid: string;
  let itensLanc: Item[];
  if (existente) {
    if (existente.status !== "pendente") {
      await texto(tel, "Essa mensagem já foi processada. Confira seus lançamentos no app.");
      return;
    }
    pid = existente.id;
    itensLanc = Array.isArray(existente.lanc?.itens) ? existente.lanc.itens : [existente.lanc];
  } else {
    // Pendentes legados sem wamid ainda podem ser limpos após 24h. Os novos ficam
    // como tombstones por 30 dias para bloquear retries da Meta.
    await sb.from("wa_pendente").delete().eq("user_id", uid).is("origem_msg_id", null)
      .lt("criado_em", new Date(Date.now() - 24 * 3600e3).toISOString());
    pid = novoId();
    itensLanc = L.itens;
    const { error: pe } = await sb.from("wa_pendente").insert({
      id: pid, user_id: uid, telefone: tel, lanc: { itens: itensLanc }, origem_msg_id: e.msgId,
    });
    if (pe) {
      if (pe.code !== "23505") throw pe;
      const { data: corrida, error: ce } = await sb.from("wa_pendente")
        .select("id,lanc,status").eq("origem_msg_id", e.msgId).eq("user_id", uid).maybeSingle();
      if (ce) throw ce;
      if (!corrida) throw pe;
      if (corrida.status !== "pendente") {
        await texto(tel, "Essa mensagem já foi processada. Confira seus lançamentos no app.");
        return;
      }
      pid = corrida.id;
      itensLanc = Array.isArray(corrida.lanc?.itens) ? corrida.lanc.itens : [corrida.lanc];
    }
  }
  const FM: Record<string, string> = { pix: "Pix", cartao: "cartão", dinheiro: "dinheiro", boleto: "boleto" };
  const linha = (l: Item) => {
    const pag = [l.forma ? FM[l.forma] : (l.pagoCom ? "" : "Pix"), l.pagoCom].filter(Boolean).join(" ");
    return `${l.tipo === "receita" ? "➕" : "➖"} *${brl(l.valor)}* · ${l.categoria}${l.descricao ? " · " + l.descricao : ""}\n   ${dataBR(l.data, hoje)}${pag ? " · " + pag : ""}${l.parcelas > 1 ? " · " + l.parcelas + "x (salvo como o total)" : ""}${l.recorrente && !(l.parcelas > 1) ? "\n   🔁 conta fixa, todo dia " + parseInt(l.data.slice(8, 10), 10) : ""}`;
  };
  const n = itensLanc.length, tot = itensLanc.reduce((a, l) => a + (l.tipo === "receita" ? 0 : l.valor), 0);
  const corpo = (n > 1 ? `${n} lançamentos${tot > 0 ? " · gastos somam " + brl(tot) : ""}\n\n` : "") + itensLanc.map(linha).join("\n\n");
  await envia(tel, { type: "interactive", interactive: { type: "button", body: { text: corpo.slice(0, 1000) }, action: { buttons: [
    { type: "reply", reply: { id: "ok:" + pid, title: n > 1 ? "Salvar todos" : "Salvar" } },
    { type: "reply", reply: { id: "no:" + pid, title: "Cancelar" } }] } } });
}

async function responde(tel: string, uid: string, p: Pergunta) {
  const h0 = hojeBR();
  // Fase 2: "qual meu saldo / quanto posso gastar" no mês atual = saldo livre do mês (igual ao termômetro do app) e
  //         "quanto está minha fatura" = fatura atual de cada cartão. Nenhuma das duas gasta cota.
  if (p.tipo === "fatura" || (p.tipo === "saldo" && p.de === h0.slice(0, 8) + "01" && p.ate === h0 && !p.categoria && !p.busca)) {
    const j = janelaResumo(h0, h0.slice(0, 8) + "01");
    const [{ data: rs, error: er }, { data: st }, { data: kc }] = await Promise.all([
      sb.from("tx").select("data").eq("user_id", uid).gte("data->>data", j.de).lte("data->>data", j.ate).limit(10000),
      sb.from("settings").select("data").eq("user_id", uid).maybeSingle(),
      p.tipo === "fatura" ? sb.from("cartoes").select("data").eq("user_id", uid) : Promise.resolve({ data: [] as any[] })]);
    if (er) throw er;
    const txs = (rs || []).map((x: any) => x.data || {});
    if (p.tipo === "fatura") {
      let cs = (kc || []).map((x: any) => x.data || {});
      if (p.busca) { const f = cs.filter((c: any) => String(c.nome || "").toLowerCase().includes(p.busca)); if (f.length) cs = f; }
      const F = faturaAtual(cs, txs, h0);
      await texto(tel, !F.cartoes.length ? "Você ainda não tem cartão com dia de fechamento e vencimento no app. Cadastre em Gastos & Cartões."
        : F.cartoes.map((c) => `💳 ${c.nome}: fatura atual *${brl(c.valor)}* · fecha ${dataBR(c.fecha, h0)} · vence ${dataBR(c.vence, h0)}`).join("\n") + (F.cartoes.length > 1 ? `\n\nTotal: *${brl(F.total)}*` : ""));
      return;
    }
    const L = livreMes(txs, h0, st?.data || {});
    const msg = L.base === "saldo"
      ? `Saldo livre no mês (entrou menos saiu): ${L.livre < 0 ? "−" : ""}*${brl(Math.abs(L.livre))}*${L.livre > 0 ? ` · dá ${brl(L.porDia)}/dia até o fim do mês` : ""}.\n\nDefina uma meta de gastos no app para eu acompanhar o ritmo do mês.`
      : L.livre >= 0 ? `Saldo livre no mês: *${brl(L.livre)}* · dá para gastar ${brl(L.porDia)}/dia até o fim do mês.\n(${L.base === "meta" ? "meta" : "orçamentos"} ${brl(L.lim)}, já gasto ${brl(L.gasto)})`
      : `Você está *${brl(-L.livre)}* acima da ${L.base === "meta" ? "meta" : "soma dos orçamentos"} do mês (${brl(L.lim)}; já gasto ${brl(L.gasto)}).`;
    await texto(tel, msg);
    return;
  }
  const { data: rows, error } = await sb.from("tx").select("data").eq("user_id", uid).gte("data->>data", p.de).lte("data->>data", p.ate).limit(5000);
  if (error) throw error;
  const txs = (rows || []).map((x: any) => x.data || {}).filter((t: any) => t.status !== "previsto" && !t.faturaKey && (t.tipo === "despesa" || t.tipo === "receita"));
  const casa = (t: any) => (!p.categoria || t.categoria === p.categoria) && (!p.busca || String(t.descricao || "").toLowerCase().includes(p.busca));
  const soma = (tp: string) => txs.filter((t: any) => t.tipo === tp && casa(t)).reduce((a: number, t: any) => a + (Number(t.valor) || 0), 0);
  const h = hojeBR();
  const per = p.rotulo || (p.de === p.ate ? "em " + dataBR(p.de, h) : `de ${dataBR(p.de, h)} a ${dataBR(p.ate, h)}`);
  const filtro = [p.categoria, p.busca ? `"${p.busca}"` : ""].filter(Boolean).join(" · ");
  let msg: string;
  if (p.tipo === "saldo") {
    const r = soma("receita"), d = soma("despesa");
    msg = `${per[0].toUpperCase() + per.slice(1)}: entrou ${brl(r)} e saiu ${brl(d)}. Saldo ${r - d < 0 ? "−" : ""}*${brl(Math.abs(r - d))}*.`;
  } else {
    const v = soma(p.tipo), qt = txs.filter((t: any) => t.tipo === p.tipo && casa(t)).length;
    msg = `${p.tipo === "receita" ? "Você recebeu" : "Você gastou"} *${brl(v)}*${filtro ? " com " + filtro : ""} ${per} (${qt} lançamento${qt === 1 ? "" : "s"}).`;
    if (!filtro && p.tipo === "despesa" && v > 0) {
      const pc: Record<string, number> = {};
      for (const t of txs) if (t.tipo === "despesa") pc[t.categoria || "Outros"] = (pc[t.categoria || "Outros"] || 0) + (Number(t.valor) || 0);
      msg += "\n\nOnde mais foi:\n" + Object.entries(pc).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, x]) => `• ${c}: ${brl(x)}`).join("\n");
    }
  }
  await texto(tel, msg);
}

// Fase 2: até 5 MB (pelo tamanho que a Meta informa ANTES de baixar e pelos bytes baixados) e tipo conferido pelos bytes
// mágicos: foto JPG/PNG/WEBP, PDF, CSV ou áudio (OGG/MP3/MP4/AMR). Recusado = mensagem clara, sem chamar a IA.
async function baixaMidia(id: string): Promise<Midia | { erro: string } | null> {
  const tok = Deno.env.get("WA_TOKEN");
  if (!tok || !/^[0-9]{5,30}$/.test(id)) return null;
  try {
    const m = await fetch(`${GRAPH}/${id}`, { headers: { authorization: "Bearer " + tok }, signal: AbortSignal.timeout(10000) }).then((r) => r.json());
    if (!m?.url) return null;
    if (Number(m.file_size) > ARQ_MAX) return { erro: MSG_GRANDE };
    const r = await fetch(m.url, { headers: { authorization: "Bearer " + tok }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    const cl = Number(r.headers.get("content-length") || 0);
    if (cl > ARQ_MAX) { try { await r.body?.cancel(); } catch { /* */ } return { erro: MSG_GRANDE }; }
    const buf = new Uint8Array(await r.arrayBuffer());
    const c = confereBytes(buf, String(m.mime_type || ""), { audio: true });
    if (!c.ok) return { erro: c.erro };
    let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { mime: c.mime, b64: btoa(bin) };
  } catch (e) { await registraErro(sb, FN, "midia", e); throw e; }
}

async function botao(tel: string, uid: string, bid: string) {
  const m = /^(ok|no):([a-z0-9]{6,20})$/.exec(bid);
  if (!m) return;
  // Primeiro lê sem consumir: falhas na consulta de plano/cota não podem apagar o lançamento pendente.
  const { data: previa, error: le } = await sb.from("wa_pendente").select("id,lanc,status").eq("id", m[2]).eq("user_id", uid).maybeSingle();
  if (le) throw le;
  if (!previa || previa.status !== "pendente") { await texto(tel, "Esse lançamento já foi salvo ou cancelado."); return; }
  if (m[1] === "no") {
    const { data: cancelado, error: ce } = await sb.from("wa_pendente")
      .update({ status: "cancelado", finalizado_em: new Date().toISOString() })
      .eq("id", m[2]).eq("user_id", uid).eq("status", "pendente").select("id");
    if (ce) throw ce;
    await texto(tel, cancelado?.length ? "Cancelado. Nada foi salvo." : "Esse lançamento já foi salvo ou cancelado.");
    return;
  }
  // Confere plano e cota antes de consumir o pendente. Se a validação falhar, o botão continua utilizável.
  let nv = 0;
  nv = await nivelDe(uid);
  if (await cotaBloqueia(tel, uid, nv)) return;
  // A RPC valida a cota, grava os lançamentos e remove o pendente na mesma transação.
  // Se a gravação falhar, o banco desfaz tudo e o usuário pode tentar novamente.
  const itens: any[] = Array.isArray(previa.lanc?.itens) ? previa.lanc.itens : [previa.lanc];
  const agora = new Date().toISOString(), base = novoId();
  const linhas = itens.map((l: any, k: number) => {
    const id = itens.length > 1 ? base + k : base;
    const data: any = { id, tipo: l.tipo, valor: l.valor, categoria: l.categoria, descricao: l.descricao, sub: "", tags: ["whatsapp"], obs: "", data: l.data, cartao: "", forma: l.forma || (l.pagoCom ? "" : "pix"), conta: "", pagoCom: "", status: "pago", multa: 0, juros: 0, desconto: 0 };
    if (l.pagoCom) data.waPago = l.pagoCom;
    if (l.recorrente && !(l.parcelas > 1)) data.waFixa = 1;
    return { id, data, updated_at: agora };
  });
  const limitePlano = GVP.limite(nv, "whatsapp_lancamento_mes");
  const limiteAtomico = GVP.ilimitado(limitePlano) ? 1000000 : limitePlano;
  const { data: resultado, error: se } = await sb.rpc("wa_salva_pendente_com_cota", {
    p_uid: uid, p_pendente_id: m[2], p_dia: hojeBR(), p_lim: limiteAtomico, p_linhas: linhas,
  });
  if (se) throw se;
  if (resultado === "limite") { await texto(tel, msgCotaWhatsApp(Number(limitePlano) || 5)); return; }
  if (resultado !== "salvo") { await texto(tel, "Esse lançamento já foi salvo ou cancelado."); return; }
  if (itens.length > 1) { await texto(tel, `Salvos! ✅ ${itens.length} lançamentos. Aparecem no app na próxima vez que você abrir.`); return; }
  const l = itens[0];
  await texto(tel, `Salvo! ✅ ${l.tipo === "receita" ? "Receita" : "Despesa"} de ${brl(l.valor)} em ${l.categoria}${l.recorrente && !(l.parcelas > 1) ? ", como conta fixa todo mês" : ""}. Aparece no app na próxima vez que você abrir.`);
}

async function trata(m: any) {
  const tel = m?.from ? String(m.from).replace(/\D/g, "") : (m?.from_user_id ? "u:" + String(m.from_user_id).slice(0, 80) : "");
  const mid = String(m?.id || "");
  if (!tel || !mid) throw new Error("Mensagem WhatsApp sem telefone ou id");
  const t = m.type === "text" ? String(m.text?.body || "").trim() : "";
  const cod = /^\s*(?:gv\s*)?(\d{6})\s*$/i.exec(t);
  if (cod) { await vincula(tel, cod[1]); return; }
  const { data: v } = await sb.from("wa_vinculo").select("user_id").eq("telefone", tel).maybeSingle();
  if (!v) { await texto(tel, "Olá! Para lançar seus gastos por aqui, abra o GranaViva, vá em Ajustes > WhatsApp e mande o código de 6 dígitos que aparece lá."); return; }
  if (m.type === "interactive" && m.interactive?.type === "button_reply") { await botao(tel, v.user_id, String(m.interactive.button_reply?.id || "")); return; }
  if (m.type === "button") { return; }
  if (m.type === "image" || m.type === "audio" || m.type === "document") {
    // Fase 2: documento só foto ou PDF; o resto recebe a mensagem de formato, sem baixar
    if (m.type === "document" && !/^(image\/(jpeg|png|webp)|application\/pdf|text\/csv)$/.test(String(m.document?.mime_type || "").split(";")[0])) { await texto(tel, MSG_TIPO); return; }
    const md = m.image || m.audio || m.document;
    if (viaSandbox) { await texto(tel, "Foto e áudio funcionam quando o número oficial do GranaViva estiver ligado. Por enquanto, mande por texto. 🙂"); return; }
    const midia = await baixaMidia(String(md?.id || ""));
    if (!midia) { await texto(tel, "Não consegui abrir esse arquivo. Tente de novo ou mande por texto.\n\n" + AJUDA); return; }
    if ("erro" in midia) { await texto(tel, midia.erro); return; }
    await leMsg(tel, v.user_id, { texto: String(md?.caption || "").slice(0, 300), midia, msgId: String(m.id), diaCota: diaMensagemSP(m.timestamp) }); return;
  }
  if (m.type !== "text") { await texto(tel, "Eu leio texto, foto de comprovante e áudio.\n\n" + AJUDA); return; }
  if (!t || /^(oi|ol[aá]|bom dia|boa tarde|boa noite|ajuda|menu|obrigad[oa]|valeu|\?)\W*$/i.test(t)) { await texto(tel, AJUDA + "\n\nVárias coisas de uma vez também: almoço 30 e uber 15\nE perguntas: quanto gastei com mercado esse mês?"); return; }
  await leMsg(tel, v.user_id, { texto: t, midia: null, msgId: String(m.id), diaCota: diaMensagemSP(m.timestamp) });
}

/* ---------- v10.165: resumo semanal (segunda 8h de Brasília) ---------- */
async function enviaResumo(tel: string, linhas: string[]) {
  const tpl = Deno.env.get("WA_TPL_RESUMO");
  // parâmetro de template não aceita quebra de linha: vai numa linha só, separado por " · "
  if (tpl) return envia(tel, { type: "template", template: { name: tpl, language: { code: Deno.env.get("WA_TPL_LANG") || "pt_BR" }, components: [{ type: "body", parameters: [{ type: "text", text: linhas.join(" · ").replace(/\s+/g, " ").slice(0, 1000) }] }] } });
  return texto(tel, linhas.join("\n") + "\n\nPara parar: GranaViva > WhatsApp & Conta > Resumo semanal.");
}
/* quem tem o WhatsApp ligado e não desligou o resumo (settings.whatsapp_resumo_semanal). null = falha ao ler */
async function listaResumo(): Promise<{ user_id: string; telefone: string; resumo_enviado: string | null }[] | null> {
  const { data: vs, error } = await sb.from("wa_vinculo").select("user_id,telefone,resumo_enviado").limit(5000);
  if (error) { await registraErro(sb, FN, "resumo-lista", error); return null; }
  const ids = (vs || []).map((v: any) => v.user_id), prefs = new Map<string, boolean | null>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: ps, error: pe } = await sb.from("settings").select("user_id,whatsapp_resumo_semanal").in("user_id", ids.slice(i, i + 200));
    if (pe) { // recuo: coluna nova ainda não existe (migração 20261116 não aplicada) -> regra da v10.165
      const { data: velhos, error: e2 } = await sb.from("wa_vinculo").select("user_id,telefone,resumo_enviado").eq("resumo_semanal", true).limit(5000);
      if (e2) { await registraErro(sb, FN, "resumo-lista", e2); return null; }
      return velhos || [];
    }
    for (const p of ps || []) prefs.set(p.user_id, p.whatsapp_resumo_semanal);
  }
  return quemRecebeResumo(vs || [], prefs);
}
async function resumoSemanal(): Promise<Record<string, unknown>> {
  const hoje = hojeBR(), { seg, de, ate } = semanaPassada(hoje);
  const vs = await listaResumo();
  if (!vs) return { erro: "lista" };
  const fila = vs.filter((v) => !(v.resumo_enviado && v.resumo_enviado >= seg)); // já recebeu esta semana: nem entra na fila
  const j = janelaResumo(hoje, de);
  const r = await enviaEmLote(fila, {
    // reserva a semana antes de enviar: o cron repetido (ou duas execuções juntas) não manda duas vezes
    async reserva(v) {
      const { data: rv, error: re } = await sb.from("wa_vinculo").update({ resumo_enviado: seg }).eq("user_id", v.user_id).or(`resumo_enviado.is.null,resumo_enviado.lt.${seg}`).select("user_id");
      if (re) throw re;
      return !!rv?.length;
    },
    async envia(v) {
      const [{ data: rows, error: e1 }, { data: st }, { data: kc }] = await Promise.all([
        sb.from("tx").select("data").eq("user_id", v.user_id).gte("data->>data", j.de).lte("data->>data", j.ate).limit(10000),
        sb.from("settings").select("data").eq("user_id", v.user_id).maybeSingle(),
        sb.from("cartoes").select("data").eq("user_id", v.user_id)]);
      if (e1) throw e1;
      await enviaResumo(v.telefone, textoResumo((rows || []).map((x: any) => x.data || {}), de, ate, hoje, st?.data || {}, (kc || []).map((x: any) => x.data || {})));
    },
    espera: (ms) => new Promise((ok) => setTimeout(ok, ms)),
    agora: () => Date.now(),
    erro: (_v, e) => registraErro(sb, FN, "resumo", e),
  });
  return { ok: true, semana: { de, ate }, ...r, pulados: r.pulados + (vs.length - fila.length) };
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  if (req.method === "GET") {
    const vt = Deno.env.get("WA_VERIFY_TOKEN");
    if (vt && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === vt) return new Response(u.searchParams.get("hub.challenge") || "", { status: 200 });
    return new Response("proibido", { status: 403 });
  }
  if (req.method !== "POST") return new Response("método", { status: 405 });
  // v10.165: chamada do pg_cron (segunda 11:00 UTC = 8h de Brasília) com o segredo do cron
  if (u.searchParams.get("acao") === "resumo-semanal") {
    if (!(await iguais(req.headers.get("x-cron-secret"), Deno.env.get("CRON_SECRET")))) return new Response("proibido", { status: 403 });
    viaSandbox = false;
    return new Response(JSON.stringify(await resumoSemanal()), { headers: { "content-type": "application/json" } });
  }
  const raw = await req.text();
  const sbt = Deno.env.get("WA_SB_TOKEN"), sbq = u.searchParams.get("sb") || "";
  let sbOk = false;
  if (sbt && sbq.length === sbt.length) { let d = 0; for (let i = 0; i < sbt.length; i++) d |= sbt.charCodeAt(i) ^ sbq.charCodeAt(i); sbOk = d === 0; }
  viaSandbox = sbOk;
  if (!sbOk && !(await assinaturaOk(raw, req.headers.get("x-hub-signature-256")))) return new Response("assinatura inválida", { status: 401 });
  let b: any; try { b = JSON.parse(raw); } catch { return new Response("ok"); }
  const msgs: any[] = [];
  for (const e of b?.entry || []) for (const c of e?.changes || []) for (const m of c?.value?.messages || []) msgs.push(m);
  // Não descarte mensagens acima de 20. A fila persiste tentativas e recupera leases expirados.
  let falhou = false;
  for (const m of msgs) {
    const id = String(m?.id || "");
    if (!id) { falhou = true; await registraErro(sb, FN, "mensagem-sem-id", "Mensagem recebida sem wamid"); continue; }
    const reserva = await reservaMensagem(sb, id);
    if (reserva === "repetida") continue;
    if (reserva === "ocupada" || reserva === "erro") {
      falhou = true;
      await registraErro(sb, FN, "reserva", `Reserva WhatsApp: ${reserva}`);
      continue;
    }
    try {
      await trata(m);
      const finalizada = await finalizaMensagem(sb, id, true);
      if (!finalizada) {
        falhou = true;
        await registraErro(sb, FN, "finalizar", "Não foi possível marcar a mensagem como concluída; será recuperada após expirar o lease");
      }
    } catch (e) {
      falhou = true;
      await registraErro(sb, FN, "tratar", e);
      const finalizada = await finalizaMensagem(sb, id, false, e);
      if (!finalizada) await registraErro(sb, FN, "finalizar-falha", "Não foi possível registrar a falha; o lease expirará e permitirá nova tentativa");
    }
  }
  return falhou
    ? new Response("falha temporária; tente novamente", { status: 503, headers: { "retry-after": "60" } })
    : new Response("ok");
});
