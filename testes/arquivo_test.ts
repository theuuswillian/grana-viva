import { confereArquivo, confereBytes, tipoPorBytes, audioPorBytes } from "../supabase/functions/_shared/arquivo.ts";

const b64 = (s: string) => btoa(s);
const bytes = (...xs: number[]) => new Uint8Array(xs);

Deno.test("aceita PNG pelo cabeçalho real", () => {
  const png = bytes(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a);
  const encoded = btoa(String.fromCharCode(...png));
  const r = confereArquivo(encoded, "image/png");
  if (!r.ok || r.mime !== "image/png") throw new Error("PNG válido recusado");
});

Deno.test("aceita PDF e rejeita MIME falsificado", () => {
  const pdf = b64("%PDF-1.7");
  const ok = confereArquivo(pdf, "application/pdf");
  if (!ok.ok || ok.mime !== "application/pdf") throw new Error("PDF válido recusado");
  const spoof = confereArquivo(pdf, "image/jpeg");
  if (spoof.ok || spoof.status !== 415) throw new Error("MIME falsificado foi aceito");
});

Deno.test("aceita CSV textual somente quando declarado como CSV", () => {
  const csv = b64("data,descricao,valor\n2026-01-01,Cafe,10.50");
  const ok = confereArquivo(csv, "text/csv");
  if (!ok.ok || ok.mime !== "text/csv") throw new Error("CSV válido recusado");
});

Deno.test("rejeita base64 inválido e arquivos acima do limite", () => {
  const invalid = confereArquivo("abcde", "image/png");
  if (invalid.ok || invalid.status !== 400) throw new Error("base64 inválido foi aceito");
  const large = confereArquivo(b64("12345"), "text/csv", 4);
  if (large.ok || large.status !== 413) throw new Error("arquivo acima do limite foi aceito");
});

Deno.test("reconhece áudio OGG e rejeita bytes desconhecidos", () => {
  if (audioPorBytes(bytes(0x4f,0x67,0x67,0x53)) !== "audio/ogg") throw new Error("OGG não reconhecido");
  if (audioPorBytes(bytes(0x00,0x01,0x02)) !== "") throw new Error("áudio inválido aceito");
  if (tipoPorBytes(bytes(0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a)) !== "image/png") throw new Error("PNG não identificado");
});
