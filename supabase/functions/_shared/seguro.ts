// v10.157: comparações de segredo em tempo constante e assinatura interna entre funções.
// - iguais(a, b): compara os SHA-256 dos dois textos byte a byte (tempo não depende de onde difere nem do tamanho do segredo).
// - assinaInterno / confereInterno: HMAC-SHA256 com a service role (que só as funções têm) para uma função chamar outra
//   (ex.: assinatura {sincronizar} -> pagamento-webhook) sem passar pela assinatura do Mercado Pago. Vale 5 minutos.
const enc = new TextEncoder();

export async function iguais(a: string | null | undefined, b: string | null | undefined): Promise<boolean> {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

async function hmac(chave: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(chave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const manifesto = (escopo: string, id: string, ts: string) => `gv-interno|${escopo}|${id}|${ts}`;

export async function assinaInterno(chave: string, escopo: string, id: string, agora = Date.now()): Promise<string> {
  const ts = String(Math.floor(agora / 1000));
  return `ts=${ts},v1=${await hmac(chave, manifesto(escopo, id, ts))}`;
}
export async function confereInterno(cab: string | null | undefined, chave: string | null | undefined, escopo: string, id: string, agora = Date.now(), tolSeg = 300): Promise<boolean> {
  if (!cab || !chave) return false;
  const m = /^ts=(\d{9,12}),v1=([0-9a-f]{64})$/.exec(cab.trim());
  if (!m) return false;
  if (Math.abs(agora / 1000 - Number(m[1])) > tolSeg) return false;
  return iguais(await hmac(chave, manifesto(escopo, id, m[1])), m[2]);
}
