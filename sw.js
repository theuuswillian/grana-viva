/* GranaViva service worker: abre offline e busca a versão nova sempre que há internet.
   - página: rede primeiro (3 s), cópia salva se estiver sem conexão
   - fontes, ícones e bibliotecas (vendor/): cópia salva primeiro
   - Supabase, cotações e qualquer outro domínio: nunca passam pelo cache */
const V='gv-v8';
const BASE=new URL('./',self.location).pathname;
const PRE=['./','./index.html','./manifest.webmanifest','./fonts/inter-400.woff2','./fonts/inter-600.woff2','./fonts/inter-700.woff2','./icons/icon-192.png','./icons/apple-touch-icon.png','./vendor/chart.umd.min.js','./vendor/supabase.min.js'];
self.addEventListener('install',e=>{
  e.waitUntil((async()=>{const c=await caches.open(V);await c.addAll(PRE);
    await self.skipWaiting();})());
});
self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==V)await caches.delete(k);await self.clients.claim();})());
});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);
  if(r.mode==='navigate'&&u.origin===location.origin){
    e.respondWith((async()=>{const c=await caches.open(V);
      try{const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),3000);
        const res=await fetch(r,{signal:ctl.signal,cache:'no-store'});clearTimeout(t);
        if(res.ok)c.put(BASE+'index.html',res.clone());return res;}
      catch(err){return (await c.match(BASE+'index.html'))||(await c.match(BASE))||Response.error();}})());
    return;
  }
  const estatico=u.origin===location.origin&&/\/(fonts|icons|vendor)\//.test(u.pathname);
  if(estatico){
    e.respondWith((async()=>{const c=await caches.open(V);const hit=await c.match(r.url);if(hit)return hit;
      const res=await fetch(r);if(res.ok&&(res.type==='basic'||res.type==='cors'))c.put(r.url,res.clone());return res;})());
  }
});
