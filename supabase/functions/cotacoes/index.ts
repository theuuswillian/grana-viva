// @ts-nocheck
// v10.93: fonte RECUPERADA do deploy ativo (cotacoes v2) em 01/11/2026, porque não estava no repositório.
// É o JS que o Supabase guardou (tipos removidos na publicação); o comportamento é o mesmo que está no ar.
// cotacoes: preços da B3 (ações, FIIs, ETFs, BDRs) sem token, via Yahoo Finance no servidor.
// O app chama com o login do usuário; o navegador não acessa o Yahoo direto (CORS), por isso passa aqui.
// Cotação da B3 em fontes gratuitas chega com ~15 min de atraso.
// Fase 2: fallback para o último preço conhecido. Cada preço bom fica guardado (memória da função e, se a tabela existir,
// public.cotacao_cache da migração 20261116_fase2_blindagem.sql). Se o Yahoo falhar (fora do ar, limite, fim de semana sem
// resposta), o ativo volta com o último preço guardado e cache:true + salvoEm (quando foi lido), em vez de sumir da resposta:
// a carteira e a barra de dividendos continuam com valor. Dias da B3 calculados em America/Sao_Paulo pelo Intl.
import { createClient } from "npm:@supabase/supabase-js@2";
import { diaSP, comFallback } from "./cache.ts"; // Fase 2
const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: {
    persistSession: false
  }
});
const ORIGENS = [
  "https://theuuswillian.github.io"
];
const origemOk = (o)=>ORIGENS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
let ORIG = ORIGENS[0];
const CORS = {
  get "Access-Control-Allow-Origin" () {
    return ORIG;
  },
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (b, s = 200)=>new Response(JSON.stringify(b), {
    status: s,
    headers: {
      ...CORS,
      "content-type": "application/json"
    }
  });
const CACHE = new Map();
const TTL = 30_000;
const ULT = new Map(); // último preço bom por ticker (sem prazo), para o fallback

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
async function um(tk) {
  const c = CACHE.get(tk);
  if (c && Date.now() - c.t < TTL) return c.v;
  let v = null;
  for (const host of [
    "query1",
    "query2"
  ]){
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tk)}.SA?range=3mo&interval=1d&events=div`, {
        headers: {
          "user-agent": UA,
          accept: "application/json"
        },
        signal: AbortSignal.timeout(7000)
      });
      if (!r.ok) continue;
      const j = await r.json();
      const res = j?.chart?.result?.[0], m = res?.meta;
      const p = Number(m?.regularMarketPrice);
      if (!(p > 0)) break;
      // fechamento do pregão anterior: penúltima barra diária (a última é o pregão de hoje/último)
      const ts = res?.timestamp || [], cl = res?.indicators?.quote?.[0]?.close || [];
      const dia = diaSP; // Fase 2: dia de Brasília pelo Intl (antes: UTC − 3 h fixo)
      const hojeB3 = m?.regularMarketTime ? dia(m.regularMarketTime) : "";
      let ant = NaN;
      for(let i = ts.length - 1; i >= 0; i--){
        if (cl[i] > 0 && dia(ts[i]) < hojeB3) {
          ant = Number(cl[i]);
          break;
        }
      }
      if (!(ant > 0)) ant = Number(m?.regularMarketPreviousClose ?? m?.previousClose);
      const divs = Object.values(res?.events?.dividends || {});
      const ult = divs.sort((a, b)=>b.date - a.date)[0];
      v = {
        p,
        ant: ant > 0 ? ant : null,
        var: ant > 0 ? +(p - ant).toFixed(4) : null,
        varPct: ant > 0 ? +((p - ant) / ant * 100).toFixed(3) : null,
        t: m?.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
        nome: String(m?.longName || m?.shortName || "").slice(0, 80),
        div: ult && ult.amount > 0 ? {
          v: +Number(ult.amount).toFixed(6),
          d: diaSP(ult.date)
        } : null
      };
      break;
    } catch  {}
  }
  if (v) {
    CACHE.set(tk, {
      t: Date.now(),
      v
    });
    ULT.set(tk, {
      v,
      em: new Date().toISOString()
    });
  }
  return v;
}
// Fase 2: últimos preços guardados no banco (tabela opcional: se ainda não existir, só a memória vale)
async function leGuardados(tks) {
  try {
    const { data, error } = await sb.from("cotacao_cache").select("ticker,v,salvo_em").in("ticker", tks);
    if (error) return {};
    const o = {};
    for (const r of data || [])if (r?.v && Number(r.v.p) > 0) o[r.ticker] = {
      v: r.v,
      em: r.salvo_em
    };
    return o;
  } catch  {
    return {};
  }
}
async function guarda(frescos) {
  const linhas = Object.entries(frescos).map(([ticker, v])=>({
      ticker,
      v,
      salvo_em: new Date().toISOString()
    }));
  if (!linhas.length) return;
  try {
    await sb.from("cotacao_cache").upsert(linhas, {
      onConflict: "ticker"
    });
  } catch  {}
}
Deno.serve(async (req)=>{
  const og = req.headers.get("origin") || "";
  ORIG = origemOk(og) ? og : ORIGENS[0];
  if (og && !origemOk(og)) return new Response("origem não permitida", {
    status: 403
  });
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: {
      ...CORS
    }
  });
  if (req.method !== "POST") return json({
    erro: "método"
  }, 405);
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await sb.auth.getUser(tok);
  const uid = u?.user?.id;
  if (!uid) return json({
    erro: "faça login"
  }, 401);
  let body;
  try {
    body = await req.json();
  } catch  {
    return json({
      erro: "corpo inválido"
    }, 400);
  }
  const tks = [
    ...new Set((Array.isArray(body?.tickers) ? body.tickers : []).map((x)=>String(x).toUpperCase().trim()).filter((x)=>/^[A-Z0-9]{4,7}$/.test(x)))
  ].slice(0, 40);
  if (!tks.length) return json({
    q: {}
  });
  // até 400 pedidos por hora por usuário (com o app aberto atualizando a cada minuto sobra folga)
  const { data: ok } = await sb.rpc("rl_conta", {
    p_uid: uid,
    p_k: "cotacoes",
    p_lim: 400,
    p_seg: 3600
  });
  if (ok === false) return json({
    erro: "muitas atualizações seguidas, tente em alguns minutos"
  }, 429);
  const frescos = {};
  await Promise.all(tks.map(async (t)=>{
    let v = null;
    try {
      v = await um(t);
    } catch  {}
    if (v) frescos[t] = v;
  }));
  const faltam = tks.filter((t)=>!frescos[t] && !ULT.has(t));
  const banco = faltam.length ? await leGuardados(faltam) : {};
  const out = comFallback(frescos, tks, ULT, banco);
  // sem esperar: guardar o último preço nunca atrasa nem derruba a resposta
  const g = guarda(frescos);
  try {
    globalThis.EdgeRuntime?.waitUntil?.(g);
  } catch  {}
  return json({
    q: out,
    em: new Date().toISOString()
  });
});
