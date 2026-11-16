// Lê um lançamento escrito em português ("gastei 32 no almoço") com o Gemini (v10.136, usado pelo whatsapp-webhook).
// Mesmo prompt e mesmas regras da ler-comprovante (modo texto). A chave fica no secret GEMINI_API_KEY.
// v10.165: validação estrita do JSON da IA (valida-ia.ts)
import * as V from "./valida-ia.ts";
export const CATS_RECEITA = ["Salário", "Horas extras", "Freelance", "Vendas", "Reembolso", "Aluguel recebido", "Presentes recebidos", "Aposentadoria", "Dividendos", "Bônus/Promoções", "Rendimentos", "Outros"];
export const CATS_PADRAO = ["Moradia", "Alimentação", "Transporte", "Lazer", "Saúde", "Educação", "Mercado", "Restaurantes", "Delivery", "Combustível", "Uber e táxi", "Transporte público", "Manutenção do carro", "Contas da casa", "Internet e celular", "Assinaturas", "Compras", "Roupas", "Beleza", "Farmácia", "Academia", "Pets", "Viagem", "Presentes", "Doações", "Impostos e taxas", "Tarifas e juros", "Filhos", "Casa e reformas", "Eletrônicos", "Outros"];

export type Lanc = { valor: number; data: string; tipo: "despesa" | "receita"; descricao: string; categoria: string; forma: string; parcelas: number; confianca: number; recorrente?: boolean };

export async function leLancamento(texto: string, catsDesp: string[], hoje: string): Promise<{ ok: true; l: Lanc } | { ok: false; erro: string }> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return { ok: false, erro: "IA não configurada" };
  const cats = (catsDesp.length ? catsDesp : CATS_PADRAO).slice(0, 80);
  const dsem = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][new Date(hoje + "T12:00:00").getDay()];
  const prompt = `O usuário descreveu um lançamento financeiro com as próprias palavras, numa mensagem de WhatsApp (pode ter erros de digitação ou de ditado): """${V.entradaUsuario(texto, V.ENTRADA_MAX)}"""
Interprete datas relativas ("ontem", "sexta", "dia 5") a partir de hoje, ${hoje} (${dsem}). Valores como "45", "45 conto", "R$ 45,90", "mil e duzentos" são em reais.
Extraia o lançamento financeiro principal.
- valor: o total em reais (número, ponto decimal). Se houver parcelas, o valor TOTAL da compra.
- data: AAAA-MM-DD; se não for citada, use ${hoje}.
- tipo: "despesa" para gasto/pagamento/compra; "receita" para dinheiro recebido (salário, venda, Pix recebido).
- descricao: curta, em minúsculas, sem o valor (ex: "almoço", "uber pro trabalho", "salário").
- categoria: para despesa, escolha exatamente uma destas: ${cats.join(", ")}. Para receita, uma destas: ${CATS_RECEITA.join(", ")}.
- forma: "pix", "cartao", "dinheiro" ou "boleto" (cartão de crédito/débito = "cartao"); se não citar, "pix".
- parcelas: número de parcelas se houver (1 se à vista).
- recorrente: true só se a pessoa disser que se repete todo mês ("conta fixa", "fixa", "todo mês", "mensal", "mensalidade", "assinatura", "salário fixo"); senão false.
- confianca: 0 a 1, o quanto você tem certeza do valor.
Se a mensagem não for um lançamento (cumprimento, pergunta, frase sem valor), devolva valor 0 e confianca 0.
${V.AVISO_DADO}`;
  let r: Response;
  try {
    r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + (Deno.env.get("GEMINI_MODEL") || "gemini-flash-lite-latest") + ":generateContent", {
      method: "POST", signal: AbortSignal.timeout(20000),
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0, responseMimeType: "application/json",
          responseSchema: { type: "OBJECT", properties: {
            valor: { type: "NUMBER" }, data: { type: "STRING" }, tipo: { type: "STRING", enum: ["despesa", "receita"] },
            descricao: { type: "STRING" }, categoria: { type: "STRING" }, forma: { type: "STRING", enum: ["pix", "cartao", "dinheiro", "boleto"] },
            parcelas: { type: "INTEGER" }, confianca: { type: "NUMBER" }, recorrente: { type: "BOOLEAN" } },
            required: ["valor", "data", "tipo", "descricao", "categoria", "forma", "parcelas", "confianca"] },
        },
      }),
    });
  } catch { return { ok: false, erro: "a IA demorou demais" }; }
  if (!r.ok) { console.log("gemini", r.status, (await r.text()).slice(0, 300)); return { ok: false, erro: r.status === 429 ? "a IA está ocupada" : "a IA não respondeu" }; }
  let o: any;
  try { const g = await r.json(); o = JSON.parse(g?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "{}"); } catch { return { ok: false, erro: "não consegui ler" }; }
  // v10.165: tudo o que a IA devolve passa pela validação estrita (valida-ia.ts) antes de virar lançamento
  // Fase 2: fora do formato pedido = descartada
  if (!V.conformeSchema(o, { valor: "n", data: "s", tipo: "s", descricao: "s", categoria: "s" })) return { ok: false, erro: "não consegui ler" };
  const tipo = V.tipoIA(o.tipo);
  const lista = tipo === "receita" ? CATS_RECEITA : cats;
  const l: Lanc = {
    valor: V.valorIA(o.valor),
    data: V.dataIA(o.data, hoje),
    tipo,
    descricao: V.textoIA(o.descricao, V.DESC_MAX),
    categoria: V.categoriaIA(o.categoria, lista),
    forma: V.formaIA(o.forma, "pix"),
    parcelas: V.parcelasIA(o.parcelas),
    confianca: V.confiancaIA(o.confianca),
    recorrente: o.recorrente === true,
  };
  return { ok: true, l };
}
