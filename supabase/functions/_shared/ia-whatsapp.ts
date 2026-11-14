// v10.154: cérebro do bot do WhatsApp. Uma chamada ao Gemini entende texto, foto de comprovante ou áudio e devolve:
// - intencao "lancamento": um ou mais lançamentos (vários gastos numa mensagem só), com forma, cartão/banco citado e se é conta fixa;
// - intencao "pergunta": uma consulta sobre os próprios gastos ("quanto gastei com mercado esse mês?");
// - intencao "outro": cumprimento ou algo sem valor.
import { CATS_RECEITA, CATS_PADRAO } from "./ia-lancamento.ts";
export { CATS_RECEITA, CATS_PADRAO };

export type Item = { valor: number; data: string; tipo: "despesa" | "receita"; descricao: string; categoria: string; forma: string; parcelas: number; recorrente: boolean; pagoCom: string };
export type Pergunta = { tipo: "despesa" | "receita" | "saldo"; categoria: string; busca: string; de: string; ate: string; rotulo: string };
export type Leitura = { intencao: "lancamento" | "pergunta" | "outro"; itens: Item[]; pergunta: Pergunta | null; confianca: number };
export type Midia = { mime: string; b64: string };

const ISO = /^\d{4}-\d\d-\d\d$/;
const limpa = (s: unknown, n: number) => String(s || "").replace(/[<>"'`*_~]/g, "").trim().slice(0, n);

export async function leMensagem(texto: string, midia: Midia | null, cats: string[], nomesPag: string[], hoje: string): Promise<{ ok: true; r: Leitura } | { ok: false; erro: string }> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return { ok: false, erro: "IA não configurada" };
  const cd = (cats.length ? cats : CATS_PADRAO).slice(0, 80);
  const dsem = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][new Date(hoje + "T12:00:00").getDay()];
  const fonte = midia ? (midia.mime.startsWith("audio") ? "um áudio do WhatsApp (transcreva mentalmente e interprete)" : "uma foto (comprovante, nota fiscal, recibo ou tela de app de banco)") + (texto ? ` com a legenda """${texto.replace(/"""/g, "").slice(0, 300)}"""` : "")
    : `a mensagem de WhatsApp """${texto.replace(/"""/g, "").slice(0, 800)}"""`;
  const prompt = `Você é o assistente financeiro do app GranaViva. O usuário mandou ${fonte}. Pode ter erros de digitação ou de ditado.
Hoje é ${hoje} (${dsem}). Interprete datas relativas ("ontem", "sexta", "dia 5") a partir de hoje. Valores como "45", "45 conto", "R$ 45,90", "mil e duzentos" são em reais.
Decida a intencao:
- "lancamento": registrar um ou mais gastos/receitas. Se houver vários ("almoço 30 e uber 15"), devolva um item para cada (no máximo 10). Num comprovante, um item com o total pago.
- "pergunta": a pessoa quer saber algo dos próprios lançamentos ou do mês ("quanto gastei com mercado esse mês?", "quanto recebi em outubro?", "qual meu saldo do mês?", "quanto ainda posso gastar?", "quanto está minha fatura?", "como está meu orçamento?"). Perguntas NUNCA são lançamento, mesmo citando valores. Saldo e "quanto posso gastar" = tipo "saldo"; fatura e orçamento = tipo "despesa".
- "outro": cumprimento, agradecimento ou algo sem valor.
Para cada item:
- valor: total em reais (se parcelado, o total da compra). data: AAAA-MM-DD (se não citada, ${hoje}).
- tipo: "despesa" (gasto, pagamento, compra) ou "receita" (dinheiro recebido).
- descricao: curta, minúsculas, sem o valor ("almoço", "uber pro trabalho"). Num comprovante, o nome do estabelecimento.
- categoria: despesa, exatamente uma de: ${cd.join(", ")}. Receita, uma de: ${CATS_RECEITA.join(", ")}.
- forma: "pix", "cartao", "dinheiro" ou "boleto" (crédito/débito = "cartao"). Se não der para saber, "".
- pagoCom: o nome do cartão ou banco citado ("nubank", "inter", "caixa", "itaú"). ${nomesPag.length ? "Se bater com um destes (mesmo abreviado ou com erro), use o nome exato: " + nomesPag.join(", ") + ". " : ""}Se não citou, "".
- parcelas: número de parcelas (1 se à vista).
- recorrente: true só se disser que se repete todo mês ("conta fixa", "todo mês", "mensal", "mensalidade", "assinatura"); senão false.
Para pergunta: tipo ("despesa", "receita" ou "saldo"), categoria (uma das listas acima, ou "" se for geral), busca (palavra a procurar na descrição, ex.: "ifood", ou ""), de e ate (AAAA-MM-DD; "esse mês" = do dia 1 até hoje; sem período = mês atual), rotulo (o período por extenso, ex.: "em novembro").
confianca: 0 a 1, o quanto você tem certeza.`;
  const parts: any[] = [{ text: prompt }];
  if (midia) parts.push({ inline_data: { mime_type: midia.mime, data: midia.b64 } });
  const S = { type: "STRING" }, N = { type: "NUMBER" };
  let r: Response;
  try {
    r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + (Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest") + ":generateContent", {
      method: "POST", signal: AbortSignal.timeout(midia ? 40000 : 20000),
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0, responseMimeType: "application/json",
          responseSchema: { type: "OBJECT", properties: {
            intencao: { type: "STRING", enum: ["lancamento", "pergunta", "outro"] },
            itens: { type: "ARRAY", items: { type: "OBJECT", properties: {
              valor: N, data: S, tipo: { type: "STRING", enum: ["despesa", "receita"] }, descricao: S, categoria: S,
              forma: { type: "STRING", enum: ["pix", "cartao", "dinheiro", "boleto", ""] }, pagoCom: S, parcelas: { type: "INTEGER" }, recorrente: { type: "BOOLEAN" } },
              required: ["valor", "data", "tipo", "descricao", "categoria", "forma", "pagoCom", "parcelas", "recorrente"] } },
            pergunta: { type: "OBJECT", properties: { tipo: { type: "STRING", enum: ["despesa", "receita", "saldo"] }, categoria: S, busca: S, de: S, ate: S, rotulo: S } },
            confianca: N },
            required: ["intencao", "itens", "confianca"] },
        },
      }),
    });
  } catch { return { ok: false, erro: "a IA demorou demais" }; }
  if (!r.ok) { console.log("gemini", r.status, (await r.text()).slice(0, 300)); return { ok: false, erro: r.status === 429 ? "a IA está ocupada" : "a IA não respondeu" }; }
  let o: any;
  try { const g = await r.json(); o = JSON.parse(g?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "{}"); } catch { return { ok: false, erro: "não consegui ler" }; }
  const itens: Item[] = [];
  for (const x of (Array.isArray(o.itens) ? o.itens : []).slice(0, 10)) {
    const valor = Math.round(Number(x?.valor) * 100) / 100;
    if (!(isFinite(valor) && valor > 0 && valor < 1e7)) continue;
    const tipo = x.tipo === "receita" ? "receita" : "despesa";
    const lista = tipo === "receita" ? CATS_RECEITA : cd;
    const pc = limpa(x.pagoCom, 40);
    itens.push({
      valor, tipo, data: ISO.test(x.data) ? x.data : hoje,
      descricao: limpa(x.descricao, 80), categoria: lista.includes(x.categoria) ? x.categoria : "Outros",
      forma: ["pix", "cartao", "dinheiro", "boleto"].includes(x.forma) ? x.forma : "",
      pagoCom: pc, parcelas: Math.max(1, Math.min(24, parseInt(x.parcelas, 10) || 1)), recorrente: x.recorrente === true,
    });
  }
  let pergunta: Pergunta | null = null;
  if (o.intencao === "pergunta" && o.pergunta) {
    const p = o.pergunta, ini = hoje.slice(0, 8) + "01";
    const de = ISO.test(p.de) ? p.de : ini, ate = ISO.test(p.ate) ? p.ate : hoje;
    const tp = ["despesa", "receita", "saldo"].includes(p.tipo) ? p.tipo : "despesa";
    const cat = [...cd, ...CATS_RECEITA].includes(p.categoria) ? p.categoria : "";
    pergunta = { tipo: tp, categoria: cat, busca: limpa(p.busca, 40).toLowerCase(), de: de <= ate ? de : ate, ate: de <= ate ? ate : de, rotulo: limpa(p.rotulo, 40) };
  }
  const intencao = o.intencao === "pergunta" && pergunta ? "pergunta" : itens.length ? "lancamento" : "outro";
  return { ok: true, r: { intencao, itens, pergunta, confianca: Math.max(0, Math.min(1, Number(o.confianca) || 0)) } };
}
