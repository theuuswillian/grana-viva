// ler-comprovante: recebe a foto de um comprovante/nota (base64) e devolve os campos do lançamento.
// Chamada pelo app com o login do usuário. A chave do Gemini fica só aqui (secret GEMINI_API_KEY).
import { createClient } from "npm:@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });
const LIMITE_DIA = 40;
const MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
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
  const { data: ok, error: ue } = await sb.rpc("ia_conta", { p_uid: uid, p_dia: dia, p_lim: LIMITE_DIA });
  if (ue) return json({ erro: "não foi possível conferir o limite agora" }, 503);
  if (!ok) return json({ erro: "Você chegou ao limite de " + LIMITE_DIA + " leituras por dia. Amanhã libera de novo." }, 429);

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
  return json(out);
});
