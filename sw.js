/* GranaViva service worker: abre offline e busca a versão nova sempre que há internet.
   - página: cópia salva primeiro (abre na hora), atualiza em segundo plano
   - fontes, ícones, logos de bancos e bibliotecas (vendor/): cópia salva primeiro
   - Supabase, cotações e qualquer outro domínio: nunca passam pelo cache */
const V='gv-v10.145'; // troque junto com GV_BUILD no index.html (./bump.sh)
const BASE=new URL('./',self.location).pathname;
/* v10.99: dois caches.
   - V (troca a cada versão): página, app.min.js, planos.js, partes sob demanda (tour.min.js) e manifesto.
   - FIXO (não troca): fontes, ícones, logos e bibliotecas. Esses arquivos mudam de nome quando o conteúdo muda
     (inter-400-lat.woff2, vendor/*.min.js com SRI), então a cópia salva vale entre versões e não é baixada de novo a cada publicação. */
const FIXO='gv-fixo';
const PRE=['./','./index.html','./manifest.webmanifest','./app.min.js?v=10.145','./planos.js?v=10.145','./tour.min.js?v=10.145']; // v10.107: app minificado + partes sob demanda (tour) também offline
const PRE_FIXO=['./fonts/inter-400-lat.woff2','./fonts/inter-600-lat.woff2','./fonts/inter-700-lat.woff2','./icons/icon-192.png','./icons/apple-touch-icon.png','./vendor/supabase.min.js'];
const abs=u=>new URL(u,self.location).href;
self.addEventListener('install',e=>{
  /* v10.93: cache:'reload' = baixa da rede ignorando o cache HTTP do navegador (o GitHub Pages manda max-age=600).
     Sem isso, nos 10 min depois de publicar, a versão nova podia guardar index.html ainda da versão anterior. */
  e.waitUntil((async()=>{
    const c=await caches.open(V);await c.addAll(PRE.map(u=>new Request(u,{cache:'reload'})));
    const f=await caches.open(FIXO);
    for(const u of PRE_FIXO){if(!(await f.match(abs(u))))await f.add(new Request(u,{cache:'reload'}));}
    await self.skipWaiting();})());
});
self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    for(const k of await caches.keys())if(k!==V&&k!==FIXO)await caches.delete(k);
    /* tira do cache fixo o que esta versão não usa mais (fontes e bibliotecas antigas); logos ficam */
    const f=await caches.open(FIXO),manter=new Set(PRE_FIXO.map(abs));
    for(const r of await f.keys()){const p=new URL(r.url).pathname;if(/\/(fonts|vendor|icons)\//.test(p)&&!manter.has(r.url))await f.delete(r);}
    await self.clients.claim();})());
});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET')return;
  const u=new URL(r.url);
  /* v10.82: só a página do app (start_url "./" e index.html) usa a cópia salva. As páginas públicas (site/) vão sempre à rede,
     senão quem tem o app instalado veria o app no lugar delas. */
  const ehApp=u.pathname===BASE||u.pathname===BASE+'index.html';
  if(r.mode==='navigate'&&u.origin===location.origin&&ehApp){
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
  const fixo=u.origin===location.origin&&/\/(fonts|icons|vendor|logos)\//.test(u.pathname);
  const estatico=fixo||(u.origin===location.origin&&/\/(app|app\.min|planos|tour\.min)\.js$/.test(u.pathname)&&u.search); // v10.75: app.min.js com ?v=versão nunca muda: cópia salva primeiro (v10.107: também as partes sob demanda)
  if(estatico){
    e.respondWith((async()=>{const c=await caches.open(fixo?FIXO:V);const hit=await c.match(r.url);
      /* ícones e logos mantêm o nome quando mudam: entrega a cópia salva e confere a versão da rede em segundo plano */
      if(hit&&/\/(icons|logos)\//.test(u.pathname))e.waitUntil(fetch(r,{cache:'no-cache'}).then(res=>{if(res.ok&&res.type==='basic')return c.put(r.url,res);}).catch(()=>{}));
      if(hit)return hit;
      const res=await fetch(r,{cache:'no-cache'});if(res.ok&&(res.type==='basic'||res.type==='cors'))c.put(r.url,res.clone());return res;})());
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
