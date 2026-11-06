// Lê um lançamento escrito em português ("gastei 32 no almoço") com o Gemini (v10.136, usado pelo whatsapp-webhook).
// Mesmo prompt e mesmas regras da ler-comprovante (modo texto). A chave fica no secret GEMINI_API_KEY.
export const CATS_RECEITA = ["Salário", "Horas extras", "Freelance", "Vendas", "Reembolso", "Aluguel recebido", "Presentes recebidos", "Aposentadoria", "Dividendos", "Bônus/Promoções", "Rendimentos", "Outros"];
export const CATS_PADRAO = ["Moradia", "Alimentação", "Transporte", "Lazer", "Saúde", "Educação", "Mercado", "Restaurantes", "Delivery", "Combustível", "Uber e táxi", "Transporte público", "Manutenção do carro", "Contas da casa", "Internet e celular", "Assinaturas", "Compras", "Roupas", "Beleza", "Farmácia", "Academia", "Pets", "Viagem", "Presentes", "Doações", "Impostos e taxas", "Tarifas e juros", "Filhos", "Casa e reformas", "Eletrônicos", "Outros"];

export type Lanc = { valor: number; data: string; tipo: "despesa" | "receita"; descricao: string; categoria: string; forma: string; parcelas: number; confianca: number };

export async function leLancamento(texto: string, catsDesp: string[], hoje: string): Promise<{ ok: true; l: Lanc } | { ok: false; erro: string }> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return { ok: false, erro: "IA não configurada" };
  const cats = (catsDesp.length ? catsDesp : CATS_PADRAO).slice(0, 80);
  const todas = [...new Set([...cats, ...CATS_RECEITA])];
  const dsem = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][new Date(hoje + "T12:00:00").getDay()];
  const prompt = `O usuário descreveu um lançamento financeiro com as próprias palavras, numa mensagem de WhatsApp (pode ter erros de digitação ou de ditado): """${texto.replace(/"""/g, "").slice(0, 600)}"""
Interprete datas relativas ("ontem", "sexta", "dia 5") a partir de hoje, ${hoje} (${dsem}). Valores como "45", "45 conto", "R$ 45,90", "mil e duzentos" são em reais.
Extraia o lançamento financeiro principal.
- valor: o total em reais (número, ponto decimal). Se houver parcelas, o valor TOTAL da compra.
- data: AAAA-MM-DD; se não for citada, use ${hoje}.
- tipo: "despesa" para gasto/pagamento/compra; "receita" para dinheiro recebido (salário, venda, Pix recebido).
- descricao: curta, em minúsculas, sem o valor (ex: "almoço", "uber pro trabalho", "salário").
- categoria: para despesa, escolha exatamente uma destas: ${cats.join(", ")}. Para receita, uma destas: ${CATS_RECEITA.join(", ")}.
- forma: "pix", "cartao", "dinheiro" ou "boleto" (cartão de crédito/débito = "cartao"); se não citar, "pix".
- parcelas: número de parcelas se houver (1 se à vista).
- confianca: 0 a 1, o quanto você tem certeza do valor.
Se a mensagem não for um lançamento (cumprimento, pergunta, frase sem valor), devolva valor 0 e confianca 0.`;
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
            parcelas: { type: "INTEGER" }, confianca: { type: "NUMBER" } },
            required: ["valor", "data", "tipo", "descricao", "categoria", "forma", "parcelas", "confianca"] },
        },
      }),
    });
  } catch { return { ok: false, erro: "a IA demorou demais" }; }
  if (!r.ok) { console.log("gemini", r.status, (await r.text()).slice(0, 300)); return { ok: false, erro: r.status === 429 ? "a IA está ocupada" : "a IA não respondeu" }; }
  let o: any;
  try { const g = await r.json(); o = JSON.parse(g?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "{}"); } catch { return { ok: false, erro: "não consegui ler" }; }
  const valor = Math.round(Number(o.valor) * 100) / 100;
  const tipo = o.tipo === "receita" ? "receita" : "despesa";
  const lista = tipo === "receita" ? CATS_RECEITA : cats;
  const l: Lanc = {
    valor: isFinite(valor) && valor > 0 && valor < 1e7 ? valor : 0,
    data: /^\d{4}-\d\d-\d\d$/.test(o.data) ? o.data : hoje,
    tipo,
    descricao: String(o.descricao || "").replace(/[<>"'`]/g, "").slice(0, 80),
    categoria: lista.includes(o.categoria) ? o.categoria : (todas.includes(o.categoria) && tipo === "despesa" && cats.includes(o.categoria) ? o.categoria : "Outros"),
    forma: ["pix", "cartao", "dinheiro", "boleto"].includes(o.forma) ? o.forma : "pix",
    parcelas: Math.max(1, Math.min(24, parseInt(o.parcelas, 10) || 1)),
    confianca: Math.max(0, Math.min(1, Number(o.confianca) || 0)),
  };
  return { ok: true, l };
}
