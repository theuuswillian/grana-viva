// minha-conta · apaga na Pluggy as conexões de banco (items) da pessoa antes de excluir a conta (v10.108).
// Mesmo esquema de pluggy-sync/pluggy-webhook: client_secret e api_key em pluggy_cfg, cifrados em AES-GCM ("enc1:" + iv|ct em base64),
// chave em PLUGGY_ENC_KEY; POST /auth {clientId, clientSecret} -> {apiKey}; DELETE /items/{id} com X-API-KEY (200 {count} ou 404).
// Nunca lança e nunca registra segredos: as mensagens só levam etapa e código HTTP. 404 conta como apagado (já não existia).
const API = "https://api.pluggy.ai";

export type Resultado = { apagados: number; falhas: number };
type Registra = (etapa: string, e: unknown, codigo?: string | number | null) => Promise<void>;
export type Opcoes = { fetch?: typeof fetch; chave?: string; registra?: Registra; prazoMs?: number; agora?: () => number };

const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function dec(s: string | null | undefined, chave: string): Promise<string> {
  if (!s || !String(s).startsWith("enc1:")) return s || "";
  if (!chave) throw new Error("chave de criptografia ausente");
  const k = await crypto.subtle.importKey("raw", unb64(chave), "AES-GCM", false, ["decrypt"]);
  const u = unb64(String(s).slice(5));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, k, u.slice(12)));
}

export async function apagaItensPluggy(cfg: any, o: Opcoes = {}): Promise<Resultado> {
  const f = o.fetch ?? fetch, reg: Registra = o.registra ?? (async () => {}), agora = o.agora ?? Date.now;
  const itens = [...new Set(((cfg?.item_ids || []) as unknown[]).map((x) => String(x || "").trim()).filter(Boolean))];
  const res: Resultado = { apagados: 0, falhas: 0 };
  if (!cfg || !itens.length) return res;
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), o.prazoMs ?? 8000); // prazo total para tudo (auth + deletes)
  const falhaTudo = async (etapa: string, e: unknown, cod?: string | number | null) => { res.falhas = itens.length - res.apagados; await reg(etapa, e, cod); };
  try {
    let key = "";
    try {
      const exp = Date.parse(cfg.api_key_exp || "");
      if (cfg.api_key && exp - agora() > 60e3) key = await dec(cfg.api_key, o.chave ?? "");
    } catch (_) { key = ""; }
    const novaChave = async () => {
      const secret = await dec(cfg.client_secret, o.chave ?? "");
      if (!cfg.client_id || !secret) throw Object.assign(new Error("credenciais da Pluggy ausentes"), { code: "sem-cred" });
      const r = await f(API + "/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId: cfg.client_id, clientSecret: secret }), signal: ac.signal });
      if (!r.ok) throw Object.assign(new Error("Pluggy auth " + r.status), { code: r.status });
      const k = (await r.json())?.apiKey;
      if (!k) throw Object.assign(new Error("Pluggy auth sem apiKey"), { code: "sem-apikey" });
      return String(k);
    };
    const apaga = (id: string, k: string) => f(API + "/items/" + encodeURIComponent(id), { method: "DELETE", headers: { "content-type": "application/json", "X-API-KEY": k }, signal: ac.signal });
    try { if (!key) key = await novaChave(); }
    catch (e) { await falhaTudo(ac.signal.aborted ? "excluir-pluggy-timeout" : "excluir-pluggy-auth", ac.signal.aborted ? "tempo esgotado" : e, ac.signal.aborted ? "timeout" : (e as any)?.code); return res; }
    const pendentes: string[] = [];
    const um = async (id: string) => {
      try {
        let r = await apaga(id, key);
        if (r.status === 401 || r.status === 403) { pendentes.push(id); return; } // chave guardada vencida: tenta de novo com chave nova
        if (r.ok || r.status === 404) { res.apagados++; return; }
        res.falhas++; await reg("excluir-pluggy-item", "Pluggy DELETE /items " + r.status, r.status);
      } catch (e) {
        res.falhas++; await reg(ac.signal.aborted ? "excluir-pluggy-timeout" : "excluir-pluggy-item", ac.signal.aborted ? "tempo esgotado" : "rede: " + String((e as any)?.name || "erro"), ac.signal.aborted ? "timeout" : null);
      }
    };
    await Promise.all(itens.map(um));
    if (pendentes.length) {
      try { key = await novaChave(); }
      catch (e) { res.falhas += pendentes.length; await reg(ac.signal.aborted ? "excluir-pluggy-timeout" : "excluir-pluggy-auth", ac.signal.aborted ? "tempo esgotado" : e, ac.signal.aborted ? "timeout" : (e as any)?.code); return res; }
      const ids = pendentes.splice(0);
      await Promise.all(ids.map(async (id) => {
        try {
          const r = await apaga(id, key);
          if (r.ok || r.status === 404) { res.apagados++; return; }
          res.falhas++; await reg("excluir-pluggy-item", "Pluggy DELETE /items " + r.status, r.status);
        } catch (e) { res.falhas++; await reg(ac.signal.aborted ? "excluir-pluggy-timeout" : "excluir-pluggy-item", ac.signal.aborted ? "tempo esgotado" : "rede: " + String((e as any)?.name || "erro"), ac.signal.aborted ? "timeout" : null); }
      }));
    }
    return res;
  } catch (e) {
    await falhaTudo("excluir-pluggy", "erro inesperado: " + String((e as any)?.name || "erro"));
    return res;
  } finally { clearTimeout(tm); }
}
