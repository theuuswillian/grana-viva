// Fase 2: conferência de arquivo enviado para a IA (foto, PDF ou CSV), ANTES de chamar o LLM.
// Usado por ler-comprovante (foto de recibo e extrato) e pelo caminho de mídia do whatsapp-webhook.
// Regras:
//  - tamanho real (bytes decodificados do base64, não o tamanho que o cliente diz) até ARQ_MAX (5 MB) -> senão 413;
//  - tipo só da lista (image/jpeg, image/png, image/webp, application/pdf, text/csv), conferido pelo MIME declarado E pelos
//    bytes mágicos do começo do arquivo (um .exe renomeado para .jpg é recusado) -> senão 415;
//  - o MIME que vai para o LLM é o detectado pelos bytes, nunca o declarado.
// O WhatsApp também aceita áudio (lançar falando): áudio fica fora desta lista e tem regra própria (confereAudio), com o
// mesmo teto de 5 MB e bytes mágicos de OGG/MP3/MP4/AMR.

export const ARQ_MAX = 5 * 1024 * 1024; // 5 MB

/** Lê um stream com limite real de bytes, cancelando antes de alocar além do teto. */
export async function leStreamLimitado(
  body: ReadableStream<Uint8Array> | null,
  max = ARQ_MAX,
): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0);
  if (!Number.isSafeInteger(max) || max < 0) throw new Error("Limite de stream inválido");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > max) {
        try { await reader.cancel("limite de bytes excedido"); } catch { /* stream já encerrado */ }
        return null;
      }
      chunks.push(value);
    }
  } catch (e) {
    try { await reader.cancel(e); } catch { /* preserva o erro original */ }
    throw e;
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
export const MIMES_OK = ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/csv"] as const;
export type MimeOk = typeof MIMES_OK[number];
export const MSG_GRANDE = "Arquivo grande demais. O limite é 5 MB: tire a foto de novo ou envie um PDF menor.";
export const MSG_TIPO = "Formato não aceito. Envie uma foto (JPG, PNG ou WEBP), um PDF ou um CSV.";

export type Conferencia = { ok: true; mime: MimeOk; bytes: number } | { ok: false; status: 413 | 415 | 400; codigo: string; erro: string };

// bytes que o base64 representa (sem decodificar o arquivo inteiro). -1 = base64 inválido
export function bytesDoBase64(b64: string): number {
  const s = String(b64 || "").replace(/\s+/g, "");
  if (!s || s.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return -1;
  const pad = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return Math.floor(s.length * 3 / 4) - pad;
}
// decodifica só o começo (até n bytes) para olhar os bytes mágicos
export function inicioDoBase64(b64: string, n = 64): Uint8Array {
  const s = String(b64 || "").replace(/\s+/g, "");
  const pedaco = s.slice(0, Math.ceil(n / 3) * 4);
  try { const bin = atob(pedaco); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
  catch { return new Uint8Array(0); }
}
const comeca = (b: Uint8Array, sig: number[], off = 0) => b.length >= off + sig.length && sig.every((x, i) => b[off + i] === x);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

// tipo pelos bytes mágicos; "" = desconhecido
export function tipoPorBytes(b: Uint8Array): MimeOk | "" {
  if (comeca(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (comeca(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (comeca(b, ascii("RIFF")) && comeca(b, ascii("WEBP"), 8)) return "image/webp";
  // %PDF- (alguns geradores põem BOM ou espaços antes: aceita até 8 bytes de folga)
  for (let i = 0; i <= 8; i++) if (comeca(b, ascii("%PDF-"), i)) return "application/pdf";
  if (pareceTexto(b)) return "text/csv";
  return "";
}
// CSV: texto (UTF-8 ou latin-1) sem bytes de controle binários (NUL etc.)
function pareceTexto(b: Uint8Array): boolean {
  if (!b.length) return false;
  for (const x of b) { if (x === 0) return false; if (x < 0x09 || (x > 0x0d && x < 0x20 && x !== 0x1b)) return false; }
  return true;
}

export function confereArquivo(b64: unknown, mimeDeclarado: unknown, max = ARQ_MAX): Conferencia {
  const s = typeof b64 === "string" ? b64 : "";
  const declarado = String(mimeDeclarado || "").split(";")[0].trim().toLowerCase();
  if (!s) return { ok: false, status: 400, codigo: "SEM_ARQUIVO", erro: "Envie a foto ou o PDF." };
  // antes de decodificar: base64 com mais caracteres do que 5 MB cabem já é grande demais (barato e sem ler o resto)
  if (s.length > Math.ceil(max / 3) * 4 + 8) return { ok: false, status: 413, codigo: "ARQUIVO_GRANDE", erro: MSG_GRANDE };
  const n = bytesDoBase64(s);
  if (n < 0) return { ok: false, status: 400, codigo: "ARQUIVO_INVALIDO", erro: "Arquivo corrompido. Tente enviar de novo." };
  if (n > max) return { ok: false, status: 413, codigo: "ARQUIVO_GRANDE", erro: MSG_GRANDE };
  if (!(MIMES_OK as readonly string[]).includes(declarado)) return { ok: false, status: 415, codigo: "TIPO_INVALIDO", erro: MSG_TIPO };
  const real = tipoPorBytes(inicioDoBase64(s, 64));
  if (!real) return { ok: false, status: 415, codigo: "TIPO_INVALIDO", erro: MSG_TIPO };
  // imagem declarada como outra imagem (ex.: PNG mandado como image/jpeg) vale pelo que os bytes dizem;
  // mas texto declarado como imagem/PDF, ou imagem declarada como CSV, é recusado
  const fam = (m: string) => m.startsWith("image/") ? "img" : m;
  if (fam(real) !== fam(declarado)) return { ok: false, status: 415, codigo: "TIPO_INVALIDO", erro: MSG_TIPO };
  return { ok: true, mime: real, bytes: n };
}

// áudio do WhatsApp (OGG/Opus, MP3, AAC/MP4, AMR): mesmo teto de 5 MB, conferido pelos bytes
export const AUDIO_OK = ["audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "audio/amr"] as const;
export function audioPorBytes(b: Uint8Array): string {
  if (comeca(b, ascii("OggS"))) return "audio/ogg";
  if (comeca(b, ascii("ID3")) || (b.length > 1 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (comeca(b, ascii("ftyp"), 4)) return "audio/mp4";
  if (comeca(b, ascii("#!AMR"))) return "audio/amr";
  return "";
}
export function confereBytes(buf: Uint8Array, mimeDeclarado: string, opt: { audio?: boolean; max?: number } = {}): Conferencia | { ok: true; mime: string; bytes: number } {
  const max = opt.max ?? ARQ_MAX;
  if (buf.length > max) return { ok: false, status: 413, codigo: "ARQUIVO_GRANDE", erro: MSG_GRANDE };
  const declarado = String(mimeDeclarado || "").split(";")[0].trim().toLowerCase();
  const ini = buf.subarray(0, 64);
  if (opt.audio && declarado.startsWith("audio/")) {
    const a = audioPorBytes(ini);
    return a ? { ok: true, mime: a, bytes: buf.length } : { ok: false, status: 415, codigo: "TIPO_INVALIDO", erro: MSG_TIPO };
  }
  if (!(MIMES_OK as readonly string[]).includes(declarado)) return { ok: false, status: 415, codigo: "TIPO_INVALIDO", erro: MSG_TIPO };
  const real = tipoPorBytes(ini);
  const fam = (m: string) => m.startsWith("image/") ? "img" : m;
  if (!real || fam(real) !== fam(declarado)) return { ok: false, status: 415, codigo: "TIPO_INVALIDO", erro: MSG_TIPO };
  return { ok: true, mime: real, bytes: buf.length };
}
