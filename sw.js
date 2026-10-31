/* GranaViva service worker: abre offline e busca a versão nova sempre que há internet.
   - página: cópia salva primeiro (abre na hora), atualiza em segundo plano
   - fontes, ícones, logos de bancos e bibliotecas (vendor/): cópia salva primeiro
   - Supabase, cotações e qualquer outro domínio: nunca passam pelo cache */
const V='gv-v10.79'; // troque junto com GV_BUILD no index.html (./bump.sh)
const BASE=new URL('./',self.location).pathname;
const PRE=['./','./index.html','./manifest.webmanifest','./fonts/inter-400.woff2','./fonts/inter-600.woff2','./fonts/inter-700.woff2','./icons/icon-192.png','./icons/apple-touch-icon.png','./vendor/chart.umd.min.js','./vendor/supabase.min.js','./app.js?v=10.79'];
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
    /* v10.77: abre na hora com a cópia salva e busca a versão nova em segundo plano (antes esperava a rede até 4 s).
       Cada publicação troca o sw.js; o service worker novo baixa a página nova e o app avisa "nova versão pronta". */
    e.respondWith((async()=>{
      const c=await caches.open(V);const salva=(await c.match(BASE+'index.html'))||(await c.match(BASE));
      const rede=fetch(r,{cache:'no-store'}).then(async res=>{if(res.ok)await c.put(BASE+'index.html',res.clone());return res;});
      if(salva){e.waitUntil(rede.catch(()=>{}));return salva;}
      try{return await rede;}catch(err){return Response.error();}
    })());
    return;
  }
  const estatico=u.origin===location.origin&&(/\/(fonts|icons|vendor|logos)\//.test(u.pathname)||(/\/app\.js$/.test(u.pathname)&&u.search)); // v10.75: app.js?v=10.79versão nunca muda: cópia salva primeiro
  if(estatico){
    e.respondWith((async()=>{const c=await caches.open(V);const hit=await c.match(r.url);if(hit)return hit;
      const res=await fetch(r);if(res.ok&&(res.type==='basic'||res.type==='cors'))c.put(r.url,res.clone());return res;})());
  }
});

/* notificações enviadas pela função alertas-push */
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{};}catch(err){d={body:e.data&&e.data.text()};}
  e.waitUntil(self.registration.showNotification(d.title||'GranaViva',{body:d.body||'',icon:BASE+'icons/icon-192.png',badge:BASE+'icons/icon-192.png',tag:d.tag||'gv',data:{url:d.url||'./'}}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const alvo=new URL((e.notification.data&&e.notification.data.url)||'./',self.registration.scope).href;
  e.waitUntil((async()=>{const cs=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const c of cs){if(c.url.startsWith(self.registration.scope)){await c.focus();if('navigate' in c)return c.navigate(alvo);return;}}
    return self.clients.openWindow(alvo);})());
});
