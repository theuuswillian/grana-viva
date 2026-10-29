/* GranaViva service worker: abre offline e busca a versão nova sempre que há internet.
   - página: rede primeiro (3 s), cópia salva se estiver sem conexão
   - fontes, ícones e bibliotecas (vendor/): cópia salva primeiro
   - Supabase, cotações e qualquer outro domínio: nunca passam pelo cache */
const V='gv-2026-10-28-24';
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
    /* rede primeiro; se passar de 4 s mostra a cópia salva, mas a busca continua e grava a versão nova para a próxima abertura */
    const rede=fetch(r,{cache:'no-store'}).then(async res=>{if(res.ok){const c=await caches.open(V);await c.put(BASE+'index.html',res.clone());}return res;});
    e.waitUntil(rede.catch(()=>{}));
    e.respondWith((async()=>{
      const espera=new Promise(ok=>setTimeout(()=>ok(null),4000));
      const res=await Promise.race([rede.then(x=>x.clone()).catch(()=>null),espera]);
      if(res&&res.ok)return res;
      const c=await caches.open(V);const salva=(await c.match(BASE+'index.html'))||(await c.match(BASE));
      if(salva)return salva;
      try{return await rede;}catch(err){return Response.error();}
    })());
    return;
  }
  const estatico=u.origin===location.origin&&/\/(fonts|icons|vendor)\//.test(u.pathname);
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
