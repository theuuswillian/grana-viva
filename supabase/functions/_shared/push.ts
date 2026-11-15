// v10.155: envio de Web Push compartilhado (VAPID, push_subs). Mesmo comportamento do enviar() do alertas-push
// (que ainda tem a própria cópia; trocar por este quando ele for publicado de novo).
import webpush from "npm:web-push@3.6.7";

let pronto = false;
function prepara() {
  if (pronto) return;
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:contato@granaviva.app", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
  pronto = true;
}
/* manda para cada aparelho inscrito; aparelho que saiu (404/410) é removido de push_subs. devolve quantos receberam */
export async function enviarPush(sb: any, subs: any[], payload: object): Promise<number> {
  prepara();
  let ok = 0;
  for (const s of subs) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86400, urgency: "high" }); ok++; }
    catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subs").delete().eq("endpoint", s.endpoint); else console.error("push", e?.statusCode, e?.body); }
  }
  return ok;
}
