// ler-comprovante: recebe a foto de um comprovante/nota (base64) e devolve os campos do lançamento.
// Chamada pelo app com o login do usuário. A chave do Gemini fica só aqui (secret GEMINI_API_KEY).
import { createClient } from "npm:@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ORIGENS = ["https://theuuswillian.github.io"];
const origemOk = (o: string) => ORIGENS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
let ORIG = ORIGENS[0];
const CORS = { get "Access-Control-Allow-Origin"() { return ORIG; }, "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });
// v10.161: cotas do plano (por mês, contadas em ia_uso por tipo): frase = GVP "ia_frase_mes" (Grátis 15), foto/PDF = "ia_comprovante_mes" (Grátis 3),
//          v10.162: extrato/fatura com IA = "ia_extrato_mes" (Grátis 1, k 'extrato');
//          Pro ilimitado. O freio técnico diário (GVP.limite(nivel, "leitura_ia_dia"), igual para todos) continua.
import { confereCota, registraUso, corpoLimite, type TipoUso } from "../_shared/cota.ts";
// v10.82: plano da pessoa (tabela assinaturas, só o servidor escreve). planos.js é cópia gerada do /planos.js da raiz.
import "../_shared/planos.js";
// v10.165: validação estrita do JSON da IA (contra prompt injection) e "hoje" de Brasília
import * as V from "../_shared/valida-ia.ts";
// Fase 2: arquivo conferido (tamanho real até 5 MB e tipo pelos bytes mágicos) antes de qualquer chamada à IA
import { confereArquivo, ARQ_MAX, MSG_GRANDE } from "../_shared/arquivo.ts";
const GVP = (globalThis as any).GVP;
async function planoDe(uid: string) {
  const { data, error } = await sb.from("assinaturas").select("plano,status,periodo_fim").eq("user_id", uid).maybeSingle();
  if (error) throw error;
  return GVP.efetivo(data);
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
  // Fase 2: corpo maior do que um arquivo de 5 MB em base64 (+ folga para os outros campos) nem é lido
  const cl = Number(req.headers.get("content-length") || 0);
  if (cl > Math.ceil(ARQ_MAX / 3) * 4 + 200_000) return json({ erro: MSG_GRANDE, codigo: "ARQUIVO_GRANDE" }, 413);
  let body: any;
  try { body = await req.json(); } catch { return json({ erro: "corpo inválido" }, 400); }
  const img = typeof body?.imagem === "string" ? body.imagem : "";
  const texto = V.entradaUsuario(body?.texto, V.ENTRADA_MAX);
  const ehExtrato = body?.modo === "extrato" || body?.extrato === true;
  // Fase 2: com arquivo (foto, PDF ou CSV; e sempre no extrato) o arquivo é conferido aqui: 413 grande demais, 415 tipo fora da lista.
  //         O MIME que vai para a IA é o detectado pelos bytes.
  let mime = "";
  if (img || ehExtrato || !texto) {
    const c = confereArquivo(img, body?.mime || "image/jpeg");
    if (!c.ok) return json({ erro: c.erro, codigo: c.codigo }, c.status);
    mime = c.mime;
  }
  const cartoes: string[] = (Array.isArray(body?.cartoes) ? body.cartoes : []).map(String).slice(0, 20).map((c: string) => c.slice(0, 40));
  const cats: string[] = (Array.isArray(body?.categorias) ? body.categorias : []).map(String).slice(0, 80).map((c: string) => c.slice(0, 40));
  // v10.165: o "hoje" do app só vale se estiver a 1 dia do hoje de Brasília (senão a IA receberia uma data inventada)
  const hoje = V.hojeCliente(body?.hoje);

  // limite diário por usuário (v10.165: dia de Brasília, igual às cotas mensais; antes era o dia em UTC)
  const dia = V.hojeSP();
  // v10.54: conta e confere numa só operação no banco (duas leituras ao mesmo tempo não passam do limite)
  let ef: any;
  try { ef = await planoDe(uid); } catch { return json({ erro: "não foi possível conferir seu plano agora" }, 503); }
  // v10.161: cota mensal do plano, conferida antes de chamar a IA.
  // v10.162: importar extrato/fatura tem cota própria ('extrato', GVP ia_extrato_mes, Grátis 1). O app manda modo:'extrato'
  //          (v10.162+) e extrato:true (todas as versões desde a v10.145); sem nenhum dos dois é foto de recibo ou frase.
  const tipoUso: TipoUso = ehExtrato ? "extrato" : texto ? "frase" : "comprovante";
  try { const lim = await confereCota(sb, uid, ef.nivel, tipoUso); if (lim) return json(corpoLimite(lim, body), 402); }
  catch { return json({ erro: "não foi possível conferir o limite agora" }, 503); }
  const LIMITE_DIA = GVP.limite(ef.nivel, "leitura_ia_dia");
  const { data: ok, error: ue } = await sb.rpc("ia_conta_k", { p_uid: uid, p_dia: dia, p_k: "leitura", p_lim: LIMITE_DIA });
  if (ue) return json({ erro: "não foi possível conferir o limite agora" }, 503);
  if (!ok) return json({ erro: "Você chegou ao limite de " + LIMITE_DIA + " leituras por dia. Amanhã libera de novo." }, 429);

  // v10.145: extrato ou fatura em PDF/foto vira lista de lançamentos para a tela de importar
  if (ehExtrato) {
    if (!img) return json({ erro: "envie o PDF ou a foto do extrato" }, 400);
    const pe = `Você lê extratos bancários e faturas de cartão brasileiros (PDF, foto ou CSV). Hoje é ${hoje}.
${V.AVISO_DADO}
Liste TODOS os lançamentos (compras, pix, transferências, tarifas, pagamentos, estornos, créditos), um por linha, na ordem do documento.
- data: AAAA-MM-DD. Se o documento só tem dia/mês, deduza o ano pelo período do extrato/fatura (nunca depois de ${hoje}).
- desc: a descrição como está no documento, sem o valor (inclua "PARC 03/10" ou "Parcela 3/10" quando houver).
- valor: em reais, NEGATIVO para saída/compra/débito/tarifa e POSITIVO para entrada/crédito/estorno/pagamento recebido na fatura.
Não inclua saldos, totais, limites, resumos, juros futuros nem parcelas futuras que ainda não foram cobradas.
- provavel_fixo: true quando a linha parece uma cobrança que se repete todo mês (assinatura, streaming, academia, plano de celular/internet, aluguel, condomínio, seguro, mensalidade); senão false.
- frequencia: "mensal" quando provavel_fixo for true; senão "".
cartao: true se for fatura de cartão de crédito; false se for extrato de conta.`;
    let re: Response;
    try { re = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + (Deno.env.get("GEMINI_MODEL_EXTRATO") || "gemini-flash-latest") + ":generateContent", {
      method: "POST", signal: AbortSignal.timeout(110000),
      headers: { "content-type": "application/json", "x-goog-api-key": Deno.env.get("GEMINI_API_KEY") || "" },
      body: JSON.stringify({ contents: [{ parts: [{ text: pe }, { inline_data: { mime_type: mime, data: img } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 30000, responseMimeType: "application/json",
          responseSchema: { type: "OBJECT", properties: { cartao: { type: "BOOLEAN" }, linhas: { type: "ARRAY", items: { type: "OBJECT", properties: {
            data: { type: "STRING" }, desc: { type: "STRING" }, valor: { type: "NUMBER" }, provavel_fixo: { type: "BOOLEAN" }, frequencia: { type: "STRING", enum: ["mensal", ""] } }, required: ["data", "desc", "valor", "provavel_fixo"] } } }, required: ["cartao", "linhas"] } } }),
    }); } catch { return json({ erro: "a IA demorou demais, tente um arquivo menor" }, 504); }
    if (!re.ok) { const t = (await re.text()).slice(0, 300); console.log("gemini-extrato", re.status, t); return json({ erro: re.status === 429 ? "a IA está ocupada, tente em 1 minuto" : "a IA não respondeu, tente de novo" }, 502); }
    const ge = await re.json();
    let oe: any;
    try { oe = JSON.parse(ge?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "{}"); } catch { return json({ erro: "não consegui ler esse extrato" }, 422); }
    // v10.165: cada linha validada (data real até hoje, descrição limpa, valor finito com teto) e marcação de provável conta fixa
    // Fase 2: resposta fora do formato (sem lista de linhas) é descartada; linha fora do formato também.
    //         Toda linha sai com provavel_fixo (boolean); as recorrentes saem também com frequencia: "mensal".
    if (!V.conformeSchema(oe, { linhas: "a" })) return json({ erro: "não consegui ler esse extrato" }, 422);
    const linhas = oe.linhas.slice(0, 1500).filter((l: any) => V.conformeSchema(l, { data: "s", desc: "s", valor: "n" })).map((l: any) => ({
      data: V.dataOuVazio(l?.data, hoje, { ateHoje: true }),
      desc: V.textoIA(l?.desc, 120),
      valor: V.valorSinalIA(l?.valor),
      provavel_fixo: l?.provavel_fixo === true,
    })).filter((l: any) => l.data && l.valor !== 0)
      .map((l: any) => l.valor < 0 && (l.provavel_fixo || V.provavelFixo(l.desc))
        ? { data: l.data, desc: l.desc, valor: l.valor, provavel_fixo: true, frequencia: "mensal" }
        : { data: l.data, desc: l.desc, valor: l.valor, provavel_fixo: false });
    if (linhas.length) {
      try {
        if (!(await registraUso(sb, uid, tipoUso, ef.nivel))) {
          const lim = await confereCota(sb, uid, ef.nivel, tipoUso);
          return json(corpoLimite(lim || GVP.erroLimite(tipoUso === "extrato" ? "ia_extrato" : "ia_comprovante", ef.nivel), body), 402);
        }
      } catch { return json({ erro: "não foi possível registrar o uso agora" }, 503); }
    }
    return json({ cartao: !!oe.cartao, linhas });
  }

  const dsem = ["domingo","segunda","terça","quarta","quinta","sexta","sábado"][new Date(hoje + "T12:00:00").getDay()];
  const prompt = (texto ? `O usuário descreveu um lançamento financeiro com as próprias palavras (pode ter erros de ditado): """${texto}"""
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
Se não houver um lançamento (imagem que não é comprovante ou frase sem valor), devolva valor 0 e confianca 0.
${V.AVISO_DADO}`;

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
  // v10.165: validação estrita (valor com teto, data real numa janela de 5 anos para trás e 1 ano para frente, enums,
  //          categoria só da lista do app, descrição sem marcação, parcelas 1..48)
  // Fase 2: fora do formato pedido (campos obrigatórios ausentes ou de outro tipo) = descartada
  if (!V.conformeSchema(o, { valor: "n", data: "s", tipo: "s", descricao: "s", categoria: "s" })) return json({ erro: "não consegui ler" }, 422);
  const out = {
    valor: V.valorIA(o.valor),
    data: V.dataIA(o.data, hoje),
    tipo: V.tipoIA(o.tipo),
    descricao: V.textoIA(o.descricao, V.DESC_MAX),
    categoria: V.categoriaIA(o.categoria, cats),
    forma: V.formaIA(o.forma, "pix"),
    parcelas: V.parcelasIA(o.parcelas),
    confianca: V.confiancaIA(o.confianca),
    cartao: typeof o.cartao === "string" && cartoes.includes(o.cartao) ? o.cartao : "",
  };
  if (out.valor > 0) {
    try {
      if (!(await registraUso(sb, uid, tipoUso, ef.nivel))) {
        const lim = await confereCota(sb, uid, ef.nivel, tipoUso);
        return json(corpoLimite(lim || GVP.erroLimite(tipoUso === "frase" ? "ia_frase" : "ia_comprovante", ef.nivel), body), 402);
      }
    } catch { return json({ erro: "não foi possível registrar o uso agora" }, 503); }
  } // só conta quando a IA achou um lançamento
  return json(out);
});
