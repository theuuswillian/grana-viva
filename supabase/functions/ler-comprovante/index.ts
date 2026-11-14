// ler-comprovante: recebe a foto de um comprovante/nota (base64) e devolve os campos do lançamento.
// Chamada pelo app com o login do usuário. A chave do Gemini fica só aqui (secret GEMINI_API_KEY).
import { createClient } from "npm:@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ORIGENS = ["https://theuuswillian.github.io"];
const origemOk = (o: string) => ORIGENS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
let ORIG = ORIGENS[0];
const CORS = { get "Access-Control-Allow-Origin"() { return ORIG; }, "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });
// v10.161: cotas do plano (por mês, contadas em ia_uso por tipo): frase = GVP "ia_frase_mes" (Grátis 15), foto/PDF = "ia_comprovante_mes" (Grátis 3);
//          Pro ilimitado. O freio técnico diário (GVP.limite(nivel, "leitura_ia_dia"), igual para todos) continua.
import { confereCota, registraUso, type TipoUso } from "../_shared/cota.ts";
// v10.82: plano da pessoa (tabela assinaturas, só o servidor escreve). planos.js é cópia gerada do /planos.js da raiz.
import "../_shared/planos.js";
const GVP = (globalThis as any).GVP;
async function planoDe(uid: string) {
  const { data, error } = await sb.from("assinaturas").select("plano,status,periodo_fim").eq("user_id", uid).maybeSingle();
  if (error) throw error;
  return GVP.efetivo(data);
}

const MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

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
  const img = String(body?.imagem || ""), mime = String(body?.mime || "image/jpeg");
  const texto = String(body?.texto || "").trim().slice(0, 600);
  if (!texto && (!img || img.length > 7_000_000 || !MIMES.includes(mime))) return json({ erro: "arquivo inválido ou grande demais" }, 400);
  const cartoes: string[] = (Array.isArray(body?.cartoes) ? body.cartoes : []).map(String).slice(0, 20).map((c: string) => c.slice(0, 40));
  const cats: string[] = (Array.isArray(body?.categorias) ? body.categorias : []).map(String).slice(0, 80).map((c: string) => c.slice(0, 40));
  const hoje = String(body?.hoje || "").match(/^\d{4}-\d\d-\d\d$/) ? body.hoje : new Date().toISOString().slice(0, 10);

  // limite diário por usuário
  const dia = new Date().toISOString().slice(0, 10);
  // v10.54: conta e confere numa só operação no banco (duas leituras ao mesmo tempo não passam do limite)
  let ef: any;
  try { ef = await planoDe(uid); } catch { return json({ erro: "não foi possível conferir seu plano agora" }, 503); }
  // v10.161: cota mensal do plano, conferida antes de chamar a IA. Extrato (PDF/foto) conta como leitura de comprovante.
  const tipoUso: TipoUso = body?.extrato || !texto ? "comprovante" : "frase";
  try { const lim = await confereCota(sb, uid, ef.nivel, tipoUso); if (lim) return json(lim, 402); }
  catch { return json({ erro: "não foi possível conferir o limite agora" }, 503); }
  const LIMITE_DIA = GVP.limite(ef.nivel, "leitura_ia_dia");
  const { data: ok, error: ue } = await sb.rpc("ia_conta_k", { p_uid: uid, p_dia: dia, p_k: "leitura", p_lim: LIMITE_DIA });
  if (ue) return json({ erro: "não foi possível conferir o limite agora" }, 503);
  if (!ok) return json({ erro: "Você chegou ao limite de " + LIMITE_DIA + " leituras por dia. Amanhã libera de novo." }, 429);

  // v10.145: extrato ou fatura em PDF/foto vira lista de lançamentos para a tela de importar
  if (body?.extrato) {
    if (!img) return json({ erro: "envie o PDF ou a foto do extrato" }, 400);
    const pe = `Você lê extratos bancários e faturas de cartão brasileiros (PDF ou foto). Hoje é ${hoje}.
Liste TODOS os lançamentos (compras, pix, transferências, tarifas, pagamentos, estornos, créditos), um por linha, na ordem do documento.
- data: AAAA-MM-DD. Se o documento só tem dia/mês, deduza o ano pelo período do extrato/fatura (nunca depois de ${hoje}).
- desc: a descrição como está no documento, sem o valor (inclua "PARC 03/10" ou "Parcela 3/10" quando houver).
- valor: em reais, NEGATIVO para saída/compra/débito/tarifa e POSITIVO para entrada/crédito/estorno/pagamento recebido na fatura.
Não inclua saldos, totais, limites, resumos, juros futuros nem parcelas futuras que ainda não foram cobradas.
cartao: true se for fatura de cartão de crédito; false se for extrato de conta.`;
    let re: Response;
    try { re = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + (Deno.env.get("GEMINI_MODEL_EXTRATO") || "gemini-flash-latest") + ":generateContent", {
      method: "POST", signal: AbortSignal.timeout(110000),
      headers: { "content-type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY") || "" },
      body: JSON.stringify({ contents: [{ parts: [{ text: pe }, { inline_data: { mime_type: mime, data: img } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 30000, responseMimeType: "application/json",
          responseSchema: { type: "OBJECT", properties: { cartao: { type: "BOOLEAN" }, linhas: { type: "ARRAY", items: { type: "OBJECT", properties: {
            data: { type: "STRING" }, desc: { type: "STRING" }, valor: { type: "NUMBER" } }, required: ["data", "desc", "valor"] } } }, required: ["cartao", "linhas"] } } }),
    }); } catch { return json({ erro: "a IA demorou demais, tente um arquivo menor" }, 504); }
    if (!re.ok) { const t = (await re.text()).slice(0, 300); console.log("gemini-extrato", re.status, t); return json({ erro: re.status === 429 ? "a IA está ocupada, tente em 1 minuto" : "a IA não respondeu, tente de novo" }, 502); }
    const ge = await re.json();
    let oe: any;
    try { oe = JSON.parse(ge?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "{}"); } catch { return json({ erro: "não consegui ler esse extrato" }, 422); }
    const linhas = (Array.isArray(oe.linhas) ? oe.linhas : []).slice(0, 1500).map((l: any) => ({
      data: /^\d{4}-\d\d-\d\d$/.test(l?.data) && l.data <= hoje ? l.data : "",
      desc: String(l?.desc || "").replace(/\s+/g, " ").trim().slice(0, 120),
      valor: Math.round(Number(l?.valor) * 100) / 100,
    })).filter((l: any) => l.data && isFinite(l.valor) && l.valor !== 0 && Math.abs(l.valor) < 1e7);
    if (linhas.length) await registraUso(sb, uid, tipoUso);
    return json({ cartao: !!oe.cartao, linhas });
  }

  const dsem = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"][new Date(hoje + "T12:00:00").getDay()];
  const prompt = (texto ? `O usuário descreveu um lançamento financeiro com as próprias palavras (pode ter erros de ditado): """${texto.replace(/"""/g, "")}"""
Interprete datas relativas ("ontem", "sexta", "dia 5") a partir de hoje, ${hoje} (${dsem}). Valores como "45", "45 conto", "R$ 45,90", "mil e duzentos" são em reais.
Cartões do usuário: ${cartoes.join(", ") || "nenhum"}. Se ele citar um, devolva o nome exato em cartao; senão "".` : `Você lê comprovantes, notas fiscais, cupons e prints de pagamento brasileiros.`) + `
Extraia o lançamento financeiro principal. Hoje é ${hoje}.
- valor: o total pago em reais (número, ponto decimal). Se houver parcelas, o valor TOTAL da compra.
- data: AAAA-MM-DD da compra/pagamento; se não aparecer, use ${hoje}.
- tipo: "despesa" para pagamento/compra; "receita" se for dinheiro recebido (ex: Pix recebido).
- descricao: curta, em minúsculas, o nome do estabelecimento ou de quem recebeu/enviou (ex: "padaria pão dourado").
- categoria: escolha exatamente uma destas: ${cats.join(", ") || "Alimentação, Transporte, Moradia, Lazer, Saúde, Educação, Outros"}.
- forma: "pix", "cartao", "dinheiro" ou "boleto" (cartão de crédito/débito = "cartao").
- parcelas: número de parcelas se houver (1 se à vista).
- confianca: 0 a 1, o quanto você tem certeza do valor.
Se não houver um lançamento (imagem que não é comprovante ou frase sem valor), devolva valor 0 e confianca 0.`;

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ erro: "IA não configurada" }, 503);
  let r: Response;
  try { r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + (Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest") + ":generateContent", {
    method: "POST", signal: AbortSignal.timeout(45000),
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: texto ? [{ text: prompt }] : [{ text: prompt }, { inline_data: { mime_type: mime, data: img } }] }],
      generationConfig: {
        temperature: 0, responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: {
          valor: { type: "NUMBER" }, data: { type: "STRING" }, tipo: { type: "STRING", enum: ["despesa", "receita"] },
          descricao: { type: "STRING" }, categoria: { type: "STRING" }, forma: { type: "STRING", enum: ["pix", "cartao", "dinheiro", "boleto"] },
          parcelas: { type: "INTEGER" }, confianca: { type: "NUMBER" }, cartao: { type: "STRING" } },
          required: ["valor", "data", "tipo", "descricao", "categoria", "forma", "parcelas", "confianca"] },
      },
    }),
  }); } catch { return json({ erro: "a IA demorou demais, tente de novo" }, 504); }
  if (!r.ok) { const t = (await r.text()).slice(0, 400); console.log("gemini", r.status, t); let msg = ""; try { msg = JSON.parse(t)?.error?.status || ""; } catch {} return json({ erro: r.status === 429 ? "a IA está ocupada, tente em 1 minuto" : "a IA não respondeu, tente de novo", detalhe: r.status + " " + msg }, 502); }
  const g = await r.json();
  let o: any;
  try { o = JSON.parse(g?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "{}"); } catch { return json({ erro: "não consegui ler" }, 422); }
  const valor = Math.round(Number(o.valor) * 100) / 100;
  const out = {
    valor: isFinite(valor) && valor > 0 && valor < 1e7 ? valor : 0,
    data: /^\d{4}-\d\d-\d\d$/.test(o.data) ? o.data : hoje,
    tipo: o.tipo === "receita" ? "receita" : "despesa",
    descricao: String(o.descricao || "").slice(0, 80),
    categoria: cats.includes(o.categoria) ? o.categoria : (cats.includes("Outros") ? "Outros" : ""),
    forma: ["pix", "cartao", "dinheiro", "boleto"].includes(o.forma) ? o.forma : "pix",
    parcelas: Math.max(1, Math.min(24, parseInt(o.parcelas, 10) || 1)),
    confianca: Math.max(0, Math.min(1, Number(o.confianca) || 0)),
    cartao: cartoes.includes(o.cartao) ? o.cartao : "",
  };
  if (out.valor > 0) await registraUso(sb, uid, tipoUso); // só conta quando a IA achou um lançamento
  return json(out);
});
