
(function(){
'use strict';
/* v10.160: MVP enxuto. true = 4 abas (Início, Gastos & Cartões, Patrimônio, WhatsApp & Conta), barra inteligente com recibo,
   alertas de preço na carteira, Pluggy (Open Finance) e imposto das vendas (IR/DARF) escondidos. false = app completo como na v10.159.
   Nada do servidor é apagado: só a interface e as chamadas automáticas ao pluggy-sync mudam. */
const MVP_MODE=true;
/* v10.106: erros recentes (Ajustes → Erros recentes). guarda só o essencial, sem dados pessoais: mensagem limpa
   (sem e-mail, números longos, valores, ids, links externos), arquivo:linha, versão e aba. até 50 itens, só neste aparelho. */
const ERR_KEY='gv-erros',ERR_MAX=50;
function errTexto(t){return String(t==null?'':t)
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g,'<email>').replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g,'<token>')
  .replace(/https?:\/\/[^\s)'"]+/g,u=>{try{const x=new URL(u);return x.origin===location.origin?(x.pathname.split('/').pop()||'/'):x.host;}catch(e){return '<link>';}})
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,'<id>')
  .replace(/\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{16,}\b/g,'<id>')
  .replace(/R\$\s?-?[\d.,]+/g,'R$ <valor>').replace(/\d[\d.,:\/-]{3,}/g,'<n>').replace(/"[^"]{25,}"/g,'"<texto>"').replace(/\s+/g,' ').trim().slice(0,240);}
function errOnde(st){const o=[];String(st||'').replace(/(?:at\s+([\w$.<>]+)\s+\()?[^\s(]*?([\w.-]+\.js)(?:\?v=[\d.]+)?:(\d+):(\d+)/g,(m,fn,f,l,c)=>{if(o.length<4)o.push((fn?fn+' ':'')+f+':'+l+':'+c);return m;});return o;}
function errLista(){try{const a=JSON.parse(localStorage.getItem(ERR_KEY)||'[]');return Array.isArray(a)?a.filter(x=>x&&typeof x==='object'&&typeof x.m==='string').slice(-ERR_MAX):[];}catch(e){return [];}}
function errRegistra(tipo,msg,stack,ondeExtra){
  try{
    const m=errTexto(msg);if(!m)return;
    if(/^(Script error\.?|ResizeObserver loop)/i.test(m))return; // de outro site/extensão ou aviso do navegador: sem informação útil
    const pilha=errOnde(stack);if(!pilha.length&&ondeExtra)pilha.push(ondeExtra);
    let aba='';try{aba=String(localStorage.getItem('gv-tab')||'').replace(/[^a-z]/g,'').slice(0,12);}catch(e){}
    const L=errLista(),ult=L[L.length-1],em=new Date().toISOString().slice(0,16)+'Z';
    let v='';try{v=typeof GV_BUILD==='string'?GV_BUILD:'';}catch(e){}
    if(ult&&ult.m===m&&ult.t===tipo&&String(ult.p)===String(pilha)){ult.n=(ult.n||1)+1;ult.em=em;}
    else L.push({em,t:tipo,m,p:pilha,v,aba,n:1});
    localStorage.setItem(ERR_KEY,JSON.stringify(L.slice(-ERR_MAX)));
  }catch(e){}
}
window.addEventListener('error',e=>{
  if(!e||!(e instanceof ErrorEvent))return; // erro de carregar imagem/script não é ErrorEvent
  const f=String(e.filename||'');if(f&&!f.startsWith(location.origin))return; // extensões e scripts de fora
  const onde=f?f.split('/').pop().replace(/\?.*$/,'')+':'+(e.lineno||0)+':'+(e.colno||0):'';
  errRegistra('erro',(e.error&&e.error.name&&e.error.name!=='Error'?e.error.name+': ':'')+(e.message||''),e.error&&e.error.stack,onde);
});
window.addEventListener('unhandledrejection',e=>{
  const r=e&&e.reason;let msg;
  try{msg=r&&typeof r==='object'?((r.name&&r.name!=='Error'?r.name+': ':'')+(r.message||r.error_description||r.msg||JSON.stringify(r).slice(0,120))):String(r);}catch(x){msg='falha sem descrição';}
  errRegistra('promessa',msg,r&&r.stack,'');
});

/* ---------- estado e persistência ---------- */
const KEY='grana-viva-v1';
const CATS_NOVAS=['Mercado','Restaurantes','Delivery','Combustível','Uber e táxi','Transporte público','Manutenção do carro','Contas da casa','Internet e celular','Assinaturas','Compras','Roupas','Beleza','Farmácia','Academia','Pets','Viagem','Presentes','Doações','Impostos e taxas','Tarifas e juros','Filhos','Casa e reformas','Eletrônicos'];
const CATS_PADRAO=['Moradia','Alimentação','Transporte','Lazer','Saúde','Educação'].concat(CATS_NOVAS,['Outros']);
const CATS_RECEITA=['Salário','Horas extras','Freelance','Vendas','Reembolso','Aluguel recebido','Presentes recebidos','Aposentadoria','Dividendos','Bônus/Promoções','Rendimentos','Outros'];
const ACCENTS={verde:['#22c55e','#8b5cf6'],violeta:['#a855f7','#6366f1'],azul:['#3b82f6','#06b6d4'],rosa:['#ec4899','#f97316']};
const PAL=['#22c55e','#f472b6','#8b5cf6','#f97316','#06b6d4','#facc15','#38bdf8','#ef4444','#14b8a6','#d946ef','#6366f1','#f59e0b'];
function hashCat(s){let h=0;for(const ch of String(s))h=(h*31+ch.charCodeAt(0))>>>0;return h;}
// cor estável por nome: hash -> paleta, com sondagem para não repetir cor entre categorias
function corCat(c){
  if(catCor(c))return catCor(c);
  const custom=new Set((S.cats||[]).map(n=>catCor(n)).filter(Boolean));
  const names=[...new Set([...CATS_PADRAO,...(S.cats||[]),...CATS_RECEITA])].filter(n=>!catCor(n)).sort();
  const used=new Set(custom),map={};
  names.forEach(n=>{let i=hashCat(n)%PAL.length,k=0;while(used.has(PAL[i])&&k<PAL.length){i=(i+1)%PAL.length;k++;}used.add(PAL[i]);map[n]=PAL[i];});
  return map[c]||PAL[hashCat(c)%PAL.length];
}
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_LONGO=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

const ICONS={check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',send:'<path d="M21 3 10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5L3 9.5z"/>',
  refresh:'<path d="M20 11a8 8 0 0 0-14.6-4.5L3 9M3 4v5h5M4 13a8 8 0 0 0 14.6 4.5L21 15M21 20v-5h-5"/>',
  link:'<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  swap:'<path d="M7 4 3.5 7.5 7 11M3.5 7.5h13M17 13l3.5 3.5L17 20M20.5 16.5h-13"/>',
  arrowUp:'<path d="M12 19V5M6 11l6-6 6 6"/>',
  arrowDown:'<path d="M12 5v14M6 13l6 6 6-6"/>',
  wallet:'<rect x="3.5" y="6" width="17" height="13" rx="3"/><path d="M3.5 10h17M15.5 14.5h2"/>',
  piggy:'<path d="M5 11a7 6 0 0 1 12.5-3.2L20 7v4l-1.2.6A7 6 0 0 1 16 16.5V19h-3v-1.6a8 8 0 0 1-3 0V19H7v-2.6A6 6 0 0 1 5 11z"/><path d="M10 7.5h3"/>',
  calendar:'<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chevD:'<path d="m6 9 6 6 6-6"/>',
bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  list:'<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
report:'<path d="M4 20.5h16"/><rect x="5.5" y="11" width="3" height="7.5" rx="1"/><rect x="10.5" y="7" width="3" height="11.5" rx="1"/><rect x="15.5" y="4" width="3" height="14.5" rx="1"/>',
chevL:'<path d="M14.5 6.5 9 12l5.5 5.5"/>',
chevR:'<path d="M9.5 6.5 15 12l-5.5 5.5"/>',chevU:'<path d="m18 15-6-6-6 6"/>',
home:'<path d="M3.5 10.2 12 3.5l8.5 6.7"/><path d="M5.5 9.2v10.3a1.5 1.5 0 0 0 1.5 1.5h3.5v-5.5h3v5.5H17a1.5 1.5 0 0 0 1.5-1.5V9.2"/>',
mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',sparkle:'<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',receipt:'<path d="M6 3.5h12v17l-2.25-1.5L13.5 20.5 12 19l-1.5 1.5-2.25-1.5L6 20.5z"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>',
scale:'<path d="M12 4v16.5M7 20.5h10M5 7.5h14"/><path d="m5 7.5-2.5 6a2.5 2.5 0 0 0 5 0zM19 7.5l-2.5 6a2.5 2.5 0 0 0 5 0z"/>',
clip:'<path d="M20 11.5 12.3 19.2a5 5 0 0 1-7.1-7.1l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3"/>',
copy:'<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
compass:'<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
gauge:'<path d="M4 16.5a8 8 0 1 1 16 0"/><path d="M12 16.5 16 11"/><circle cx="12" cy="16.5" r="1.2"/>',
chart:'<path d="M3.5 19.5h17"/><path d="M5.5 15.5l4-4.5 3.5 3 5.5-6.5"/><path d="M15.5 7.5h3.5V11"/>',
flag:'<path d="M5.5 21V3.5"/><path d="M5.5 4.5h10.5l-2 4 2 4H5.5"/>',
card:'<rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/><path d="M6 14.5h4"/>',
bank:'<path d="M3 9.5 12 4l9 5.5"/><path d="M4.5 10.5v7M9.5 10.5v7M14.5 10.5v7M19.5 10.5v7"/><path d="M3 19.5h18"/>',
sliders:'<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
up:'<path d="M12 19.5v-15"/><path d="m6 10.5 6-6 6 6"/>',
down:'<path d="M12 4.5v15"/><path d="m6 13.5 6 6 6-6"/>',
edit:'<path d="M4 20l4.2-1 10.3-10.3a1.8 1.8 0 0 0-2.5-2.5L5.7 16.5z"/><path d="M14 6.5l3.5 3.5"/>',
trash:'<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10.5 11v5M13.5 11v5"/>',
close:'<path d="M6 6l12 12M18 6 6 18"/>',
alert:'<path d="M12 3.8 2.6 20h18.8z"/><path d="M12 10v4.2"/><path d="M12 17.3v.2"/>',
menu:'<path d="M4 7h16M4 12h16M4 17h10"/>',
star:'<path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.5l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/>',
plus:'<path d="M12 5v14M5 12h14"/>',search:'<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
salario:'<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
horas:'<path d="M6.5 3.5h11M6.5 20.5h11"/><path d="M7.5 3.5c0 4.5 4.5 5 4.5 8.5s-4.5 4-4.5 8.5M16.5 3.5c0 4.5-4.5 5-4.5 8.5s4.5 4 4.5 8.5"/>',
aposentadoria:'<path d="M3 16.5h18"/><path d="M6.5 16.5a5.5 5.5 0 0 1 11 0"/><path d="M12 5v2.5M5.2 9.2l1.6 1.6M18.8 9.2l-1.6 1.6"/>',
dividendos:'<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z"/><path d="M14.5 3.7A8.5 8.5 0 0 1 20.3 9.5H14.5z"/>',
bonus:'<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v7h14v-7"/><path d="M12 8.5v11"/><path d="M12 8.5c-1.5-3.5-5-3.5-5-1.2 0 1.2 2.5 1.2 5 1.2zM12 8.5c1.5-3.5 5-3.5 5-1.2 0 1.2-2.5 1.2-5 1.2z"/>',
rendimentos:'<circle cx="7.5" cy="7.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/><path d="M18.5 5.5 5.5 18.5"/>',
moradia:'<path d="M3.5 10.2 12 3.5l8.5 6.7"/><path d="M5.5 9.2v10.3a1.5 1.5 0 0 0 1.5 1.5h3.5v-5.5h3v5.5H17a1.5 1.5 0 0 0 1.5-1.5V9.2"/>',
alimentacao:'<path d="M7 3.5v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2v-7M8 3.5v4.5M5 3.5v4.5M12.5 20.5V3.5c2.2 1 3 3.5 3 6.5h-3"/>',
transporte:'<path d="M4.5 13.5l1.6-5a2 2 0 0 1 1.9-1.4h8a2 2 0 0 1 1.9 1.4l1.6 5"/><rect x="3" y="13.5" width="18" height="5" rx="2"/><circle cx="7.5" cy="18.5" r="1.2"/><circle cx="16.5" cy="18.5" r="1.2"/>',
lazer:'<path d="M12 20.5s-7.5-4.4-7.5-10A4 4 0 0 1 12 8a4 4 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10z"/><path d="M4.5 3.5l2 2M19.5 3.5l-2 2"/>',
saude:'<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.8a4.3 4.3 0 0 1 7.5 2.5c0 5.6-7.5 10.2-7.5 10.2z"/><path d="M9.5 12.5h1.5l1-2 1.5 4 1-2h1.5"/>',
educacao:'<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11.2v4.3c0 1.2 2.5 2.5 5.5 2.5s5.5-1.3 5.5-2.5v-4.3"/><path d="M21.5 9v5"/>',
casa:'<path d="M3.5 10.2 12 3.5l8.5 6.7"/><path d="M5.5 9.2v10.3a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9.2"/><path d="M10 21v-5h4v5"/>',
carro:'<path d="M4.5 13.5l1.6-5a2 2 0 0 1 1.9-1.4h8a2 2 0 0 1 1.9 1.4l1.6 5"/><rect x="3" y="13.5" width="18" height="5" rx="2"/><circle cx="7.5" cy="18.5" r="1.2"/><circle cx="16.5" cy="18.5" r="1.2"/>',
coracao:'<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>',
mala:'<rect x="3.5" y="7.5" width="17" height="12.5" rx="2.5"/><path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2"/><path d="M3.5 12.5h17"/>',
laptop:'<rect x="4.5" y="5" width="15" height="10.5" rx="1.8"/><path d="M2.5 18.5h19"/>',
pet:'<circle cx="6.5" cy="10" r="1.8"/><circle cx="10.5" cy="6.5" r="1.8"/><circle cx="14.5" cy="6.5" r="1.8"/><circle cx="18.5" cy="10" r="1.8"/><path d="M8 17c0-2.6 1.8-4.5 4-4.5s4 1.9 4 4.5c0 1.6-1.6 2.5-4 2.5S8 18.6 8 17z"/>',
presente:'<rect x="3.5" y="8.5" width="17" height="12" rx="1.5"/><path d="M2.5 8.5h19v3h-19zM12 8.5v12"/><path d="M12 8.5c-1.5-3.5-5-3.5-5-1 0 1.2 2.5 1 5 1zM12 8.5c1.5-3.5 5-3.5 5-1 0 1.2-2.5 1-5 1z"/>',
variedade:'<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/><path d="M18.5 16.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
compras:'<path d="M5 7.5h14l-1.3 10.5a1.5 1.5 0 0 1-1.5 1.3H7.8a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 7.5V6a3 3 0 0 1 6 0v1.5"/>',
academia:'<path d="M6 7v10M18 7v10M3.5 9.5v5M20.5 9.5v5M6 12h12"/>',
musica:'<path d="M9 17.5V5.5l10-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
outros:'<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.7 6.7a1.4 1.4 0 0 1-2 0z"/><circle cx="8" cy="8" r="1.3"/>',
user:'<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5"/>',
logout:'<path d="M14.5 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
mail:'<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6 8.5-6"/>',
lock:'<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
cloud:'<path d="M7 18.5h10a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.5 1.5A3.8 3.8 0 0 0 7 18.5z"/>'
};
const ICONS_LU={"lu_wrench": "<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z\" />", "lu_wifi": "<path d=\"M12 20h.01\" /><path d=\"M2 8.82a15 15 0 0 1 20 0\" /><path d=\"M5 12.859a10 10 0 0 1 14 0\" /><path d=\"M8.5 16.429a5 5 0 0 1 7 0\" />", "lu_wallet": "<path d=\"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\" /><path d=\"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4\" />", "lu_volleyball": "<path d=\"M11.1 7.1a16.55 16.55 0 0 1 10.9 4\" /><path d=\"M12 12a12.6 12.6 0 0 1-8.7 5\" /><path d=\"M16.8 13.6a16.55 16.55 0 0 1-9 7.5\" /><path d=\"M20.7 17a12.8 12.8 0 0 0-8.7-5 13.3 13.3 0 0 1 0-10\" /><path d=\"M6.3 3.8a16.55 16.55 0 0 0 1.9 11.5\" /><circle cx=\"12\" cy=\"12\" r=\"10\" />", "lu_utensils_crossed": "<path d=\"m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8\" /><path d=\"M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7\" /><path d=\"m2.1 21.8 6.4-6.3\" /><path d=\"m19 5-7 7\" />", "lu_undo_2": "<path d=\"M9 14 4 9l5-5\" /><path d=\"M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11\" />", "lu_tv": "<rect width=\"20\" height=\"15\" x=\"2\" y=\"7\" rx=\"2\" ry=\"2\" /><polyline points=\"17 2 12 7 7 2\" />", "lu_trending_up": "<polyline points=\"22 7 13.5 15.5 8.5 10.5 2 17\" /><polyline points=\"16 7 22 7 22 13\" />", "lu_train_front": "<path d=\"M8 3.1V7a4 4 0 0 0 8 0V3.1\" /><path d=\"m9 15-1-1\" /><path d=\"m15 15 1-1\" /><path d=\"M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z\" /><path d=\"m8 19-2 3\" /><path d=\"m16 19 2 3\" />", "lu_tag": "<path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\" /><circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />", "lu_stethoscope": "<path d=\"M11 2v2\" /><path d=\"M5 2v2\" /><path d=\"M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1\" /><path d=\"M8 15a6 6 0 0 0 12 0v-3\" /><circle cx=\"20\" cy=\"10\" r=\"2\" />", "lu_square_parking": "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" /><path d=\"M9 17V7h4a3 3 0 0 1 0 6H9\" />", "lu_sparkles": "<path d=\"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z\" /><path d=\"M20 3v4\" /><path d=\"M22 5h-4\" /><path d=\"M4 17v2\" /><path d=\"M5 18H3\" />", "lu_sofa": "<path d=\"M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3\" /><path d=\"M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z\" /><path d=\"M4 18v2\" /><path d=\"M20 18v2\" /><path d=\"M12 4v9\" />", "lu_smile": "<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"M8 14s1.5 2 4 2 4-2 4-2\" /><line x1=\"9\" x2=\"9.01\" y1=\"9\" y2=\"9\" /><line x1=\"15\" x2=\"15.01\" y1=\"9\" y2=\"9\" />", "lu_smartphone": "<rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\" /><path d=\"M12 18h.01\" />", "lu_shopping_cart": "<circle cx=\"8\" cy=\"21\" r=\"1\" /><circle cx=\"19\" cy=\"21\" r=\"1\" /><path d=\"M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12\" />", "lu_shopping_bag": "<path d=\"M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z\" /><path d=\"M3 6h18\" /><path d=\"M16 10a4 4 0 0 1-8 0\" />", "lu_shirt": "<path d=\"M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z\" />", "lu_scissors": "<circle cx=\"6\" cy=\"6\" r=\"3\" /><path d=\"M8.12 8.12 12 12\" /><path d=\"M20 4 8.12 15.88\" /><circle cx=\"6\" cy=\"18\" r=\"3\" /><path d=\"M14.8 14.8 20 20\" />", "lu_sandwich": "<path d=\"m2.37 11.223 8.372-6.777a2 2 0 0 1 2.516 0l8.371 6.777\" /><path d=\"M21 15a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5.25\" /><path d=\"M3 15a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h9\" /><path d=\"m6.67 15 6.13 4.6a2 2 0 0 0 2.8-.4l3.15-4.2\" /><rect width=\"20\" height=\"4\" x=\"2\" y=\"11\" rx=\"1\" />", "lu_receipt_text": "<path d=\"M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z\" /><path d=\"M14 8H8\" /><path d=\"M16 12H8\" /><path d=\"M13 16H8\" />", "lu_plane": "<path d=\"M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z\" />", "lu_pill": "<path d=\"m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z\" /><path d=\"m8.5 8.5 7 7\" />", "lu_piggy_bank": "<path d=\"M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2V5z\" /><path d=\"M2 9v1c0 1.1.9 2 2 2h1\" /><path d=\"M16 11h.01\" />", "lu_paw_print": "<circle cx=\"11\" cy=\"4\" r=\"2\" /><circle cx=\"18\" cy=\"8\" r=\"2\" /><circle cx=\"20\" cy=\"16\" r=\"2\" /><path d=\"M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z\" />", "lu_party_popper": "<path d=\"M5.8 11.3 2 22l10.7-3.79\" /><path d=\"M4 3h.01\" /><path d=\"M22 8h.01\" /><path d=\"M15 2h.01\" /><path d=\"M22 20h.01\" /><path d=\"m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10\" /><path d=\"m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17\" /><path d=\"m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7\" /><path d=\"M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z\" />", "lu_package": "<path d=\"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z\" /><path d=\"M12 22V12\" /><path d=\"m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7\" /><path d=\"m7.5 4.27 9 5.15\" />", "lu_music": "<path d=\"M9 18V5l12-2v13\" /><circle cx=\"6\" cy=\"18\" r=\"3\" /><circle cx=\"18\" cy=\"16\" r=\"3\" />", "lu_lightbulb": "<path d=\"M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5\" /><path d=\"M9 18h6\" /><path d=\"M10 22h4\" />", "lu_laptop": "<path d=\"M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16\" />", "lu_landmark": "<line x1=\"3\" x2=\"21\" y1=\"22\" y2=\"22\" /><line x1=\"6\" x2=\"6\" y1=\"18\" y2=\"11\" /><line x1=\"10\" x2=\"10\" y1=\"18\" y2=\"11\" /><line x1=\"14\" x2=\"14\" y1=\"18\" y2=\"11\" /><line x1=\"18\" x2=\"18\" y1=\"18\" y2=\"11\" /><polygon points=\"12 2 20 7 4 7\" />", "lu_house": "<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\" /><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" />", "lu_hand_heart": "<path d=\"M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16\" /><path d=\"m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9\" /><path d=\"m2 15 6 6\" /><path d=\"M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12Z\" />", "lu_hammer": "<path d=\"m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9\" /><path d=\"m18 15 4-4\" /><path d=\"m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5\" />", "lu_graduation_cap": "<path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\" /><path d=\"M22 10v6\" /><path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\" />", "lu_gift": "<rect x=\"3\" y=\"8\" width=\"18\" height=\"4\" rx=\"1\" /><path d=\"M12 8v13\" /><path d=\"M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7\" /><path d=\"M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5\" />", "lu_gamepad_2": "<line x1=\"6\" x2=\"10\" y1=\"11\" y2=\"11\" /><line x1=\"8\" x2=\"8\" y1=\"9\" y2=\"13\" /><line x1=\"15\" x2=\"15.01\" y1=\"12\" y2=\"12\" /><line x1=\"18\" x2=\"18.01\" y1=\"10\" y2=\"10\" /><path d=\"M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z\" />", "lu_fuel": "<line x1=\"3\" x2=\"15\" y1=\"22\" y2=\"22\" /><line x1=\"4\" x2=\"14\" y1=\"9\" y2=\"9\" /><path d=\"M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18\" /><path d=\"M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5\" />", "lu_footprints": "<path d=\"M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z\" /><path d=\"M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z\" /><path d=\"M16 17h4\" /><path d=\"M4 13h4\" />", "lu_flame": "<path d=\"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z\" />", "lu_dumbbell": "<path d=\"M14.4 14.4 9.6 9.6\" /><path d=\"M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z\" /><path d=\"m21.5 21.5-1.4-1.4\" /><path d=\"M3.9 3.9 2.5 2.5\" /><path d=\"M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z\" />", "lu_droplets": "<path d=\"M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z\" /><path d=\"M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97\" />", "lu_croissant": "<path d=\"m4.6 13.11 5.79-3.21c1.89-1.05 4.79 1.78 3.71 3.71l-3.22 5.81C8.8 23.16.79 15.23 4.6 13.11Z\" /><path d=\"m10.5 9.5-1-2.29C9.2 6.48 8.8 6 8 6H4.5C2.79 6 2 6.5 2 8.5a7.71 7.71 0 0 0 2 4.83\" /><path d=\"M8 6c0-1.55.24-4-2-4-2 0-2.5 2.17-2.5 4\" /><path d=\"m14.5 13.5 2.29 1c.73.3 1.21.7 1.21 1.5v3.5c0 1.71-.5 2.5-2.5 2.5a7.71 7.71 0 0 1-4.83-2\" /><path d=\"M18 16c1.55 0 4-.24 4 2 0 2-2.17 2.5-4 2.5\" />", "lu_credit_card": "<rect width=\"20\" height=\"14\" x=\"2\" y=\"5\" rx=\"2\" /><line x1=\"2\" x2=\"22\" y1=\"10\" y2=\"10\" />", "lu_coffee": "<path d=\"M10 2v2\" /><path d=\"M14 2v2\" /><path d=\"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1\" /><path d=\"M6 2v2\" />", "lu_clock": "<circle cx=\"12\" cy=\"12\" r=\"10\" /><polyline points=\"12 6 12 12 16 14\" />", "lu_clapperboard": "<path d=\"M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z\" /><path d=\"m6.2 5.3 3.1 3.9\" /><path d=\"m12.4 3.4 3.1 4\" /><path d=\"M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z\" />", "lu_cigarette": "<path d=\"M17 12H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h14\" /><path d=\"M18 8c0-2.5-2-2.5-2-5\" /><path d=\"M21 16a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1\" /><path d=\"M22 8c0-2.5-2-2.5-2-5\" /><path d=\"M7 12v4\" />", "lu_church": "<path d=\"M10 9h4\" /><path d=\"M12 7v5\" /><path d=\"M14 22v-4a2 2 0 0 0-4 0v4\" /><path d=\"M18 22V5.618a1 1 0 0 0-.553-.894l-4.553-2.277a2 2 0 0 0-1.788 0L6.553 4.724A1 1 0 0 0 6 5.618V22\" /><path d=\"m18 7 3.447 1.724a1 1 0 0 1 .553.894V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.618a1 1 0 0 1 .553-.894L6 7\" />", "lu_car_taxi_front": "<path d=\"M10 2h4\" /><path d=\"m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8\" /><path d=\"M7 14h.01\" /><path d=\"M17 14h.01\" /><rect width=\"18\" height=\"8\" x=\"3\" y=\"10\" rx=\"2\" /><path d=\"M5 18v2\" /><path d=\"M19 18v2\" />", "lu_car": "<path d=\"M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2\" /><circle cx=\"7\" cy=\"17\" r=\"2\" /><path d=\"M9 17h6\" /><circle cx=\"17\" cy=\"17\" r=\"2\" />", "lu_bus": "<path d=\"M8 6v6\" /><path d=\"M15 6v6\" /><path d=\"M2 12h19.6\" /><path d=\"M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3\" /><circle cx=\"7\" cy=\"18\" r=\"2\" /><path d=\"M9 18h5\" /><circle cx=\"16\" cy=\"18\" r=\"2\" />", "lu_building_2": "<path d=\"M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z\" /><path d=\"M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2\" /><path d=\"M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2\" /><path d=\"M10 6h4\" /><path d=\"M10 10h4\" /><path d=\"M10 14h4\" /><path d=\"M10 18h4\" />", "lu_briefcase": "<path d=\"M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16\" /><rect width=\"20\" height=\"14\" x=\"2\" y=\"6\" rx=\"2\" />", "lu_book_open": "<path d=\"M12 7v14\" /><path d=\"M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z\" />", "lu_bike": "<circle cx=\"18.5\" cy=\"17.5\" r=\"3.5\" /><circle cx=\"5.5\" cy=\"17.5\" r=\"3.5\" /><circle cx=\"15\" cy=\"5\" r=\"1\" /><path d=\"M12 17.5V14l-3-3 4-3 2 3h2\" />", "lu_beer": "<path d=\"M17 11h1a3 3 0 0 1 0 6h-1\" /><path d=\"M9 12v6\" /><path d=\"M13 12v6\" /><path d=\"M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z\" /><path d=\"M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8\" />", "lu_bed_double": "<path d=\"M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8\" /><path d=\"M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4\" /><path d=\"M12 4v6\" /><path d=\"M2 18h20\" />", "lu_baby": "<path d=\"M9 12h.01\" /><path d=\"M15 12h.01\" /><path d=\"M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5\" /><path d=\"M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1\" />", "lu_arrow_left_right": "<path d=\"M8 3 4 7l4 4\" /><path d=\"M4 7h16\" /><path d=\"m16 21 4-4-4-4\" /><path d=\"M20 17H4\" />", "lu_armchair": "<path d=\"M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3\" /><path d=\"M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z\" /><path d=\"M5 18v2\" /><path d=\"M19 18v2\" />", "lu_apple": "<path d=\"M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z\" /><path d=\"M10 2c1 .5 2 2 2 5\" />"};
ICONS_LU.search='<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>';ICONS_LU.more='<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>';
ICONS_LU.lu_lock_keyhole="<circle cx=\"12\" cy=\"16\" r=\"1\" /><rect x=\"3\" y=\"10\" width=\"18\" height=\"12\" rx=\"2\" /><path d=\"M7 10V7a5 5 0 0 1 10 0v3\" />";ICONS_LU.lu_scan_face="<path d=\"M3 7V5a2 2 0 0 1 2-2h2\" /><path d=\"M17 3h2a2 2 0 0 1 2 2v2\" /><path d=\"M21 17v2a2 2 0 0 1-2 2h-2\" /><path d=\"M7 21H5a2 2 0 0 1-2-2v-2\" /><path d=\"M8 14s1.5 2 4 2 4-2 4-2\" /><path d=\"M9 9h.01\" /><path d=\"M15 9h.01\" />";ICONS_LU.lu_key_round="<path d=\"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z\" /><circle cx=\"16.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />";ICONS_LU.lu_timer="<line x1=\"10\" x2=\"14\" y1=\"2\" y2=\"2\" /><line x1=\"12\" x2=\"15\" y1=\"14\" y2=\"11\" /><circle cx=\"12\" cy=\"14\" r=\"8\" />";
ICONS_LU.lu_chart_candlestick="<path d=\"M9 5v4\" /><rect width=\"4\" height=\"6\" x=\"7\" y=\"9\" rx=\"1\" /><path d=\"M9 15v2\" /><path d=\"M17 3v2\" /><rect width=\"4\" height=\"8\" x=\"15\" y=\"5\" rx=\"1\" /><path d=\"M17 13v3\" /><path d=\"M3 3v16a2 2 0 0 0 2 2h16\" />";ICONS_LU.lu_download="<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" /><polyline points=\"7 10 12 15 17 10\" /><line x1=\"12\" x2=\"12\" y1=\"15\" y2=\"3\" />";ICONS_LU.lu_upload="<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\" /><polyline points=\"17 8 12 3 7 8\" /><line x1=\"12\" x2=\"12\" y1=\"3\" y2=\"15\" />";
Object.assign(ICONS,ICONS_LU);
/* v10.86: arquivar (caixa de arquivo) */
ICONS.arquivo='<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>';
/* v10.81: ícones da divisão, do assistente e da exclusão de conta */
Object.assign(ICONS,{split:'<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.17-2.83L3 3"/><path d="m15 9 6-6"/>',
 chat:'<path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-4.9A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
 userX:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="m17 8 5 5M22 8l-5 5"/>',
 shield:'<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="m9 12 2 2 4-4"/>'});
const EMO2LU={"🏠": "lu_house", "🏘️": "lu_building_2", "💡": "lu_lightbulb", "🚿": "lu_droplets", "🔥": "lu_flame", "📱": "lu_smartphone", "🌐": "lu_wifi", "📺": "lu_tv", "🛒": "lu_shopping_cart", "🍔": "lu_sandwich", "🍽️": "lu_utensils_crossed", "🛵": "lu_bike", "☕": "lu_coffee", "🍺": "lu_beer", "🥖": "lu_croissant", "🍎": "lu_apple", "🚗": "lu_car", "⛽": "lu_fuel", "🔧": "lu_wrench", "🅿️": "lu_square_parking", "🚕": "lu_car_taxi_front", "🚌": "lu_bus", "🚇": "lu_train_front", "🏍️": "lu_bike", "✈️": "lu_plane", "🏨": "lu_bed_double", "🎬": "lu_clapperboard", "🎮": "lu_gamepad_2", "🎵": "lu_music", "⚽": "lu_volleyball", "🏋️": "lu_dumbbell", "🩺": "lu_stethoscope", "💊": "lu_pill", "🦷": "lu_smile", "💇": "lu_scissors", "🧴": "lu_sparkles", "👕": "lu_shirt", "👟": "lu_footprints", "🛍️": "lu_shopping_bag", "💻": "lu_laptop", "🛠️": "lu_hammer", "🛋️": "lu_sofa", "🐶": "lu_paw_print", "🧸": "lu_baby", "📚": "lu_book_open", "🎓": "lu_graduation_cap", "🎁": "lu_gift", "🤝": "lu_hand_heart", "⛪": "lu_church", "🧾": "lu_receipt_text", "🏦": "lu_landmark", "💳": "lu_credit_card", "💰": "lu_wallet", "💼": "lu_briefcase", "📈": "lu_trending_up", "🪙": "lu_piggy_bank", "🏷️": "lu_tag", "↩️": "lu_undo_2", "🔁": "lu_arrow_left_right", "🎉": "lu_party_popper", "🚬": "lu_cigarette", "📦": "lu_package", "⏱️": "lu_clock", "👴": "lu_armchair"};
const CAT_ICON={'Salário':'💰','Horas extras':'⏱️','Freelance':'💼','Vendas':'🏷️','Reembolso':'↩️','Aluguel recebido':'🏘️','Presentes recebidos':'🎁','Aposentadoria':'👴','Dividendos':'📈','Bônus/Promoções':'🎉','Rendimentos':'🪙','Outros':'📦','Moradia':'🏠','Alimentação':'🍔','Transporte':'🚗','Lazer':'🎬','Saúde':'🩺','Educação':'📚','Cartão':'card',
  'Mercado':'🛒','Restaurantes':'🍽️','Delivery':'🛵','Combustível':'⛽','Uber e táxi':'🚕','Transporte público':'🚌','Manutenção do carro':'🔧','Contas da casa':'💡','Internet e celular':'📱','Assinaturas':'📺','Compras':'🛍️','Roupas':'👕','Beleza':'💇','Farmácia':'💊','Academia':'🏋️','Pets':'🐶','Viagem':'✈️','Presentes':'🎁','Doações':'🤝','Impostos e taxas':'🧾','Tarifas e juros':'🏦','Filhos':'🧸','Casa e reformas':'🛠️','Eletrônicos':'💻','Transferência':'🔁'};
const CAT_ICON_PICK=[['lu_house','lu_house','Casa'],['lu_building_2','lu_building_2','Imóvel'],['lu_lightbulb','lu_lightbulb','Luz'],['lu_droplets','lu_droplets','Água'],['lu_flame','lu_flame','Gás'],['lu_smartphone','lu_smartphone','Celular'],['lu_wifi','lu_wifi','Internet'],['lu_tv','lu_tv','TV e streaming'],['lu_shopping_cart','lu_shopping_cart','Mercado'],['lu_sandwich','lu_sandwich','Lanche'],['lu_utensils_crossed','lu_utensils_crossed','Restaurante'],['lu_bike','lu_bike','Delivery'],['lu_coffee','lu_coffee','Café'],['lu_beer','lu_beer','Bar'],['lu_croissant','lu_croissant','Padaria'],['lu_apple','lu_apple','Feira'],['lu_car','lu_car','Carro'],['lu_fuel','lu_fuel','Combustível'],['lu_wrench','lu_wrench','Oficina'],['lu_square_parking','lu_square_parking','Estacionamento'],['lu_car_taxi_front','lu_car_taxi_front','Táxi e app'],['lu_bus','lu_bus','Ônibus'],['lu_train_front','lu_train_front','Metrô'],['lu_bike','lu_bike','Moto'],['lu_plane','lu_plane','Viagem'],['lu_bed_double','lu_bed_double','Hotel'],['lu_clapperboard','lu_clapperboard','Cinema'],['lu_gamepad_2','lu_gamepad_2','Games'],['lu_music','lu_music','Música'],['lu_volleyball','lu_volleyball','Esporte'],['lu_dumbbell','lu_dumbbell','Academia'],['lu_stethoscope','lu_stethoscope','Médico'],['lu_pill','lu_pill','Farmácia'],['lu_smile','lu_smile','Dentista'],['lu_scissors','lu_scissors','Beleza'],['lu_sparkles','lu_sparkles','Cuidados'],['lu_shirt','lu_shirt','Roupas'],['lu_footprints','lu_footprints','Calçados'],['lu_shopping_bag','lu_shopping_bag','Compras'],['lu_laptop','lu_laptop','Eletrônicos'],['lu_hammer','lu_hammer','Reformas'],['lu_sofa','lu_sofa','Móveis'],['lu_paw_print','lu_paw_print','Pet'],['lu_baby','lu_baby','Filhos'],['lu_book_open','lu_book_open','Estudo'],['lu_graduation_cap','lu_graduation_cap','Faculdade'],['lu_gift','lu_gift','Presente'],['lu_hand_heart','lu_hand_heart','Doação'],['lu_church','lu_church','Igreja'],['lu_receipt_text','lu_receipt_text','Impostos'],['lu_landmark','lu_landmark','Banco e tarifas'],['lu_credit_card','lu_credit_card','Cartão'],['lu_wallet','lu_wallet','Salário'],['lu_briefcase','lu_briefcase','Trabalho'],['lu_trending_up','lu_trending_up','Investimento'],['lu_piggy_bank','lu_piggy_bank','Rendimento'],['lu_tag','lu_tag','Vendas'],['lu_undo_2','lu_undo_2','Reembolso'],['lu_arrow_left_right','lu_arrow_left_right','Transferência'],['lu_party_popper','lu_party_popper','Festa'],['lu_cigarette','lu_cigarette','Vícios'],['lu_package','lu_package','Outros']];
const CAT_COR_PICK=['#22c55e','#8b5cf6','#06b6d4','#f59e0b','#ec4899','#3b82f6','#84cc16','#f97316'];
const EMO_RE=/\p{Extended_Pictographic}|\u21A9/u;
function catIcon(c){return (S.catIcons&&S.catIcons[c])||CAT_ICON[c]||'outros';}
function catCor(c){return (S.catCores&&S.catCores[c])||null;}
function I(n,c){if(n&&EMO2LU[n])n=EMO2LU[n];if(n&&!ICONS[n]&&EMO_RE.test(n))return '<span class="i emo '+(c||'')+'" aria-hidden="true">'+n+'</span>';return '<svg class="i '+(c||'')+'" viewBox="0 0 24 24" aria-hidden="true">'+ICONS[n]+'</svg>';}
/* v10.84: cada logo com o próprio id do degradê (o mesmo id em 3 lugares é inválido e some quando o primeiro está escondido) */
let LOGO_N=0;
const logoSVG=()=>{const g='gLogo'+(++LOGO_N);return '<svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="'+g+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--a1)"/><stop offset="1" style="stop-color:var(--a2)"/></linearGradient></defs><rect x="4" y="10" width="30" height="22" rx="6.5" fill="url(#'+g+')" fill-opacity=".16" stroke="url(#'+g+')" stroke-width="2"/><path d="M8.5 10V8.6A3.6 3.6 0 0 1 12.1 5h14.4" fill="none" stroke="url(#'+g+')" stroke-width="2" stroke-linecap="round"/><rect x="23" y="17.5" width="11" height="9" rx="3.2" fill="url(#'+g+')"/><circle cx="27.2" cy="22" r="1.6" fill="#fff"/><path d="M10.5 19.5h6.5M10.5 24h4" stroke="url(#'+g+')" stroke-width="2" stroke-linecap="round" opacity=".85"/></svg>';};
const NAV_FULL=[{t:'inicio',l:'Início',i:'home'},{t:'lanc',l:'Despesas',i:'receipt'},{t:'orc',l:'Orçamentos',i:'gauge'},{t:'fii',l:'Investimentos',i:'chart'},{t:'metas',l:'Metas',i:'flag'},{t:'pat',l:'Patrimônio',i:'scale'},{t:'plan',l:'Planejamento',i:'compass'},{t:'cartoes',l:'Cartões',i:'card'},{t:'bancos',l:'Bancos',i:'bank'},{t:'rel',l:'Relatório',i:'report'},{t:'cfg',l:'Ajustes',i:'sliders'}];
/* v10.160: no MVP a navegação principal tem 4 abas; as telas de detalhe ficam em "mais" (barra lateral) e dentro de cada aba */
const NAV_MVP=[{t:'inicio',l:'Início',i:'home'},{t:'gastos',l:'Gastos & Cartões',i:'card'},{t:'fii',l:'Patrimônio',i:'scale'},{t:'cfg',l:'WhatsApp & Conta',i:'chat'}];
const NAV_MVP_MAIS=[{t:'lanc',l:'Extrato',i:'receipt'},{t:'orc',l:'Orçamentos',i:'gauge'},{t:'cartoes',l:'Cartões e faturas',i:'card'},{t:'plan',l:'Planejamento',i:'compass'},{t:'rel',l:'Relatório',i:'report'},{t:'pat',l:'Patrimônio líquido',i:'scale'},{t:'metas',l:'Metas',i:'flag'},{t:'bancos',l:'Contas e bancos',i:'bank'}];
const NAV=MVP_MODE?NAV_MVP:NAV_FULL;
/* ---------- v10.82: planos (v10.161: Grátis e Pro; o Plus antigo vale como Pro) ----------
   A regra vem de planos.js (window.GVP), o mesmo arquivo que as funções do servidor usam.
   O plano é lido UMA vez por login da tabela assinaturas (a pessoa só lê a própria linha; só o servidor escreve).
   Aqui o plano só decide o que aparece; os limites de IA são conferidos de novo no servidor.
   Sem conseguir ler o plano (sem rede, primeira vez): usa a última cópia; sem cópia, nada é bloqueado. */
const TAB_RECURSO={orc:'orcamentos',fii:'investimentos',metas:'metas',pat:'patrimonio',plan:'planejamento',cartoes:'cartoes',rel:'relatorios'};
const ACT_RECURSO={'rd-bell':'investimentos','fmodo':'investimentos','rd-busca':'investimentos','rd-alertas':'investimentos','rd-reativa':'investimentos','rd-comprei':'investimentos','rd-add-rapido':'investimentos','alvo-fii':'investimentos','ia-ler':'leitura_ia','ia-frase':'leitura_ia','ia-mic':'leitura_ia','assist':'assistente','importar':'importar_extrato','anexos':'comprovantes'};
let PLANO_ROW,PLANO_LIDO=false,PLANO_PAG=null,PLANO_FALHA=false;
function planoChave(){return 'gv-plano:'+(USER&&USER.id||'');}
function planoAgora(){if(!PLANO_LIDO||!window.GVP)return null;return GVP.efetivo(PLANO_ROW,Date.now());}
function pode(rec){const p=planoAgora();if(!p)return true;return GVP.pode(p.nivel,rec);}
function planoZera(){PLANO_ROW=undefined;PLANO_LIDO=false;PLANO_PAG=null;PLANO_FALHA=false;pintaNavPlano();}
function planoAplica(row){PLANO_ROW=row||null;PLANO_LIDO=true;pintaNavPlano();}
async function carregaPlano(){
  if(!USER||!window.GVP)return;
  const uid=USER.id;
  try{const c=JSON.parse(localStorage.getItem(planoChave())||'null');if(c&&c.uid===uid&&!PLANO_LIDO){planoAplica(c.row);render();}}catch(e){} // v10.129: a tela aberta antes de saber o plano precisa redesenhar já com a cópia
  try{
    const {data,error}=await sb.from('assinaturas').select('plano,status,periodo_fim,provedor').eq('user_id',uid).maybeSingle();
    if(error)throw error;
    if(!USER||USER.id!==uid)return;
    const antes=JSON.stringify(planoAgora());planoAplica(data||null);
    try{localStorage.setItem(planoChave(),JSON.stringify({uid,row:data||null,em:Date.now()}));}catch(e){}
    if(JSON.stringify(planoAgora())!==antes)render();
  }catch(e){/* mantém a cópia (ou tudo liberado) */if(USER&&USER.id===uid&&!PLANO_LIDO){PLANO_FALHA=true;render();}}
}
function pintaNavPlano(){
  document.querySelectorAll('.sb-item[data-tab]').forEach(b=>{
    const rec=TAB_RECURSO[b.dataset.tab];let tag=b.querySelector('.sbPlano');
    const bloq=rec&&!pode(rec);
    if(bloq&&!tag){tag=document.createElement('span');tag.className='sbPlano';b.appendChild(tag);}
    if(tag){if(bloq){const pm=GVP.planoMinimo(rec);tag.textContent=GVP.PLANOS[pm].nome;tag.dataset.p=pm;}else tag.remove();} // v10.126: data-p pinta a cor do plano
  });
}
const REC_TXT={
  planejamento:['Planejamento','Veja seu saldo nos próximos meses, simule cortes e rendas extras e acompanhe o saldo dia a dia.'],
  orcamentos:['Orçamentos','Defina limites por categoria, acompanhe o mês e receba aviso em 80% e 100%.'],
  cartoes:['Cartões e faturas','Faturas abertas e fechadas, parcelas a vencer, limite usado e custo de atraso.'],
  relatorios:['Relatório completo','Comparação com o mês anterior, ritmo de gastos, variação por categoria e resumo do mês.'],
  importar_extrato:['Importar extrato','Traga o extrato em PDF, OFX ou CSV do seu banco, com categorias sugeridas e sem duplicar.'],
  comprovantes:['Comprovantes','Guarde fotos e PDFs dos comprovantes junto de cada lançamento.'],
  leitura_ia:['Lançar com IA','Tire foto do comprovante ou diga o gasto em uma frase e o lançamento vem preenchido para você conferir.'],
  investimentos:['Investimentos','FIIs, renda fixa pelo CDI, cotações da B3, proventos e o Radar com alertas de preço.'],
  patrimonio:['Patrimônio','Seu patrimônio líquido: contas, investimentos e bens menos dívidas, mês a mês.'],
  metas:['Metas','Metas com ritmo mensal, previsão e rendimento pelo CDI.'],
  assistente:['Assistente','Pergunte sobre o seu dinheiro e receba respostas conferidas com os seus lançamentos.']
};
/* v10.129: tela de venda por recurso (antes: cadeado + uma frase). Prévia ilustrada com dados de exemplo, 3 ganhos, preço por dia e assinar direto. */
const REC_VENDA={
  planejamento:{h:'Saiba hoje se vai faltar dinheiro no fim do mês',b:['Saldo previsto dos próximos 6 meses','Simule cortes e rendas extras antes de decidir','Veja o dia exato em que o saldo aperta'],pv:{n:'Saldo previsto em março',v:'R$ 2.340',bar:[62,48,55,30,44,70],lb:['nov','dez','jan','fev','mar','abr']}},
  orcamentos:{h:'Pare de descobrir no fim do mês que gastou demais',b:['Limite por categoria, do seu jeito','Aviso quando chegar a 80% e a 100%','Quanto ainda dá pra gastar hoje'],pv:{n:'Restam neste mês',v:'R$ 640',rows:[['Mercado',82,'#f59e0b'],['Restaurantes',104,'#f87171'],['Transporte',45,'#4ade80']]}},
  cartoes:{h:'Nunca mais leve susto com a fatura',b:['Fatura aberta e fechada de cada cartão','Parcelas futuras somadas mês a mês','Limite usado e quanto custa atrasar'],pv:{n:'Fatura atual',v:'R$ 1.287,40',rows:[['Nubank · fecha dia 3',64,'#a855f7'],['Inter · fecha dia 10',38,'#f97316'],['Parcelas até jun',51,'#60a5fa']]}},
  relatorios:{h:'Entenda para onde o seu dinheiro foi',b:['Comparação com o mês passado','As categorias que mais cresceram','Resumo do mês em uma tela'],pv:{n:'Gastos vs. mês passado',v:'−12%',bar:[70,58,80,52,66,47],lb:['jun','jul','ago','set','out','nov']}},
  importar_extrato:{h:'Traga meses de lançamentos em segundos',b:['PDF da fatura ou do extrato, OFX ou CSV','Categorias sugeridas automaticamente','Nada duplicado, mesmo importando de novo'],pv:{n:'Extrato importado',v:'148 lançamentos',rows:[['Categorizados',92,'#4ade80'],['Duplicados ignorados',12,'#94a3b8'],['Para conferir',8,'#f59e0b']]}},
  comprovantes:{h:'Todo comprovante no lugar certo',b:['Foto ou PDF junto de cada lançamento','Ache qualquer recibo em segundos','Guardado com segurança na sua conta'],pv:{n:'Comprovantes guardados',v:'36 este ano',rows:[['Notas fiscais',70,'#60a5fa'],['Pix e transferências',48,'#4ade80'],['Boletos',30,'#f59e0b']]}},
  leitura_ia:{h:'Lance um gasto em 3 segundos',b:['Foto do comprovante vira lançamento','Ou diga: "gastei 32 no almoço"','Você só confere e salva'],pv:{n:'"Uber 23,90 ontem"',v:'Transporte · R$ 23,90',rows:[['Valor e data lidos',100,'#4ade80'],['Categoria sugerida',100,'#60a5fa'],['Pronto para salvar',100,'#a855f7']]}},
  investimentos:{h:'Seus investimentos e a sua conta numa tela só',b:['FIIs e ações com cotação da B3','Radar: alertas de preço no celular','Renda fixa calculada pelo CDI'],pv:{n:'Carteira',v:'R$ 18.420',bar:[40,46,44,55,61,68],lb:['jun','jul','ago','set','out','nov']}},
  patrimonio:{h:'Veja o seu patrimônio crescer mês a mês',b:['Contas, investimentos e bens somados','Dívidas descontadas automaticamente','Gráfico da sua evolução'],pv:{n:'Patrimônio líquido',v:'R$ 47.900',bar:[38,42,47,51,58,66],lb:['jun','jul','ago','set','out','nov']}},
  metas:{h:'Chegue lá mais rápido',b:['Quanto guardar por mês para cada meta','Previsão de quando você chega','Rendimento pelo CDI incluído'],pv:{n:'Viagem · faltam 5 meses',v:'68%',rows:[['Viagem',68,'#4ade80'],['Reserva de emergência',41,'#60a5fa'],['Carro',22,'#f59e0b']]}},
  assistente:{h:'Pergunte qualquer coisa sobre o seu dinheiro',b:['"Quanto gastei com delivery em outubro?"','Respostas conferidas com os seus lançamentos','Dicas para fechar o mês no azul'],pv:{n:'Você perguntou',v:'R$ 412 em delivery',rows:[['Outubro',100,'#f87171'],['Setembro',73,'#94a3b8'],['Média 6 meses',64,'#94a3b8']]}}
};
function precoDia(P){const d=P.preco/30;return d<0.95?'R$ '+d.toFixed(2).replace('.',',')+' por dia':'cerca de R$ '+Math.round(d)+' por dia';}
function bloqGancho(rec){try{const n=(S.tx||[]).length;
  if(rec==='patrimonio'||rec==='investimentos'){const nb=(S.bancos||[]).length;if(nb)return 'Você já tem '+nb+(nb>1?' contas cadastradas':' conta cadastrada')+'. Elas entram na conta na hora.';}
  if(n>=10&&/orcamentos|relatorios|planejamento|assistente/.test(rec))return 'Você já tem '+n+' lançamentos. Isso funciona com eles desde o primeiro minuto.';
  if(rec==='cartoes'&&(S.cartoes||[]).length)return 'Seus cartões já cadastrados aparecem aqui na hora.';
}catch(e){}return '';}
function bloqPrevia(pv){
  const corpo=pv.bar?`<div class="bvBars">${pv.bar.map((h,i)=>`<i style="height:${h}%"${i===pv.bar.length-1?' class="on"':''}></i>`).join('')}</div><div class="bvLb">${pv.lb.map(x=>`<span>${x}</span>`).join('')}</div>`
    :`<div class="bvRows">${pv.rows.map(r=>`<div class="bvRow"><span>${esc(r[0])}</span><b style="--w:${Math.min(r[1],100)}%;--c:${r[2]}"></b></div>`).join('')}</div>`;
  return `<div class="bvPrev" aria-hidden="true"><span class="bvEx">exemplo</span><small>${esc(pv.n)}</small><strong>${esc(pv.v)}</strong>${corpo}</div>`;
}
function viewBloqueio(rec){
  const pm=GVP.planoMinimo(rec),P=GVP.PLANOS[pm],t=REC_TXT[rec]||[GVP.RECURSOS[rec].nome,''],V=REC_VENDA[rec];
  const p=planoAgora(),pag=pagVisivel(),g=bloqGancho(rec);
  if(PLANO_PAG===null&&USER){const ant=pag;verificaPagamento().then(v=>{if(v!==ant&&TAB_RECURSO[TAB]===rec&&!pode(rec))render();});}
  const fim=p&&p.contratado&&p.status==='teste';
  const cta=pag===true?`<button class="btn bvCta" data-act="assinar" data-id="${pm}">Assinar ${esc(P.nome)} · ${esc(P.rotulo)}</button><button class="bvLink" data-act="planos" data-id="${esc(rec)}">Comparar planos</button>`
    :`<button class="btn bvCta" data-act="planos" data-id="${esc(rec)}">Ver o plano ${esc(P.nome)}</button>`;
  return `<div class="head"><h2>${esc(TAB_NOME[TAB]||t[0])}</h2></div>
  <div class="card plBloq bv" data-p="${pm}">
    ${V?bloqPrevia(V.pv):''}
    <span class="bvTag">${I('lock')}Plano ${esc(P.nome)}</span>
    <h3>${esc(V?V.h:t[0])}</h3>
    ${V?`<ul class="bvList">${V.b.map(x=>`<li>${I('check')}<span>${esc(x)}</span></li>`).join('')}</ul>`:`<p>${esc(t[1])}</p>`}
    ${g?`<p class="bvGancho">${esc(g)}</p>`:''}
    ${cta}
    <p class="plNota">${P.periodo?esc(precoDia(P))+' · cancele quando quiser. ':''}${fim?'Seu teste terminou, mas seus dados continuam guardados.':'Seus dados continuam guardados.'}</p>
  </div>`;
}
function planoStatusTxt(p){
  if(!p)return 'Carregando seu plano…';
  if(p.fundador)return 'Conta fundadora: acesso completo, sem data de fim.';
  if(p.emTeste)return 'Teste grátis do Pro: '+(p.diasRestantes<=1?'termina hoje.':'faltam '+p.diasRestantes+' dias.');
  if(p.status==='cancelado'&&p.nivel>0)return 'Assinatura cancelada. Acesso até '+fmtDate(new Date(p.ate))+'.';
  if(p.status==='ativo'&&p.nivel>0)return 'Assinatura ativa'+(p.ate?', renova até '+fmtDate(new Date(p.ate)):'')+'.';
  if(p.status==='inadimplente')return 'Pagamento não aprovado. Você está no Grátis até regularizar.';
  return 'Você está no plano Grátis.';
}
function cardPlanoCfg(){
  if(!USER||!window.GVP)return '';
  const p=planoAgora();const nome=p?GVP.PLANOS[p.plano].nome:'…';
  return `<div class="card plCard"><div class="plTop"><div><h4>Seu plano</h4><b class="plNome">${esc(nome)}${p&&p.fundador?' <span class="plTag">fundador</span>':p&&p.emTeste?' <span class="plTag">teste</span>':''}</b></div>
    <button class="btn2 sm" data-act="planos">Ver planos</button></div><p class="plSt">${esc(planoStatusTxt(p))}</p>
    ${PLANO_ROW&&PLANO_ROW.status==='ativo'&&PLANO_ROW.provedor==='mercadopago'?'<button class="btn2 sm danger plCanc" data-act="ass-cancelar">Cancelar assinatura</button>':''}</div>`;
}
/* v10.161: dois planos, Grátis e Pro (mensal ou anual; o Pro vem primeiro para o botão de assinar aparecer sem rolar). A mesma folha serve para "Ver planos" e para o aviso de limite:
   abrePlanos(rec,{mensagem,manual}) com rec = um recurso de GVP.COTAS (ia_frase, ia_comprovante, whatsapp, cartoes, carteira, radar)
   mostra primeiro o benefício que o Pro libera. Anual vem marcado ("Mais escolhido"). No limite da IA aparece também
   "Continuar lançando manualmente (Grátis)", que abre o lançamento manual (sempre ilimitado). */
let PL_PER='anual',PL_ARGS=[null,null];
function plGratisItens(){const L=GVP.LIMITES.gratis;
  return ['Lançamentos manuais ilimitados','Orçamentos com termômetro de ritmo','Planejamento, metas, patrimônio e relatórios','IA: '+L.ia_frase_mes+' lançamentos por frase e '+L.ia_comprovante_mes+' fotos de recibo por mês','WhatsApp: '+L.whatsapp_lancamento_mes+' lançamentos por mês (consultas liberadas)','Até '+L.max_cartoes+' cartões, '+L.max_ativos_carteira+' ativos na carteira e '+L.max_alertas_radar+' alerta de preço'];}
const brlPl=v=>'R$ '+Number(v).toFixed(2).replace('.',',');
function abrePlanos(rec,opts){
  if(!window.GVP)return;
  opts=opts||{};PL_ARGS=[rec||null,opts];
  const box=$('#modal');const p=planoAgora();const pag=pagVisivel();
  const C=rec&&GVP.COTAS[rec]?GVP.COTAS[rec]:null;
  const ehPro=!!(p&&p.nivel>0);
  const manual=opts.manual===true||(opts.manual!==false&&(rec==='ia_frase'||rec==='ia_comprovante'));
  const an=PL_PER!=='mensal',PA=GVP.PLANOS.pro_anual,PM=GVP.PLANOS.pro,id=an?'pro_anual':'pro';
  const msg=C?(opts.mensagem||GVP.erroLimite(rec,0).mensagem):'';
  let cta;
  if(p&&p.fundador)cta='<span class="plAtual">Pro incluso na sua conta fundadora</span>';
  else if(ehPro&&p.status==='ativo')cta='<span class="plAtual">Você já é Pro</span>';
  else if(pag===true)cta=`<button class="btn full pwCta" data-act="assinar" data-id="${id}">Assinar Pro ${an?'anual':'mensal'} · ${an?esc(brlPl(PA.preco))+'/ano':esc(brlPl(PM.preco))+'/mês'}</button>`;
  else cta=`<button class="btn full pwCta" disabled aria-disabled="true">${pag===null?'Verificando…':'Pagamento em breve'}</button>`;
  box.innerHTML=`<div class="sheet plSheet pwSheet" role="dialog" aria-modal="true" aria-label="${C?'Seja Pro':'Planos'}"><div class="sh-head"><h3>${C?'Seja Pro':'Planos'}</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    ${C?`<div class="pwBen" data-rec="${esc(rec)}">${I('sparkle')}<div><b>${esc(C.beneficio)}</b><small>${esc(msg)}</small></div></div>`:''}
    ${p&&!C?`<p class="plMot2">${esc(planoStatusTxt(p))}</p>`:''}
    <div class="pwPer" role="radiogroup" aria-label="período">
      <button type="button" role="radio" data-act="pl-per" data-id="anual" class="${an?'on':''}" aria-checked="${an}">Anual<span class="pwSelo">Mais escolhido</span></button>
      <button type="button" role="radio" data-act="pl-per" data-id="mensal" class="${an?'':'on'}" aria-checked="${!an}">Mensal</button>
    </div>
    <div class="plGrade">
      <div class="plOp on"><div class="plOpH"><b>Pro</b>${an?'<span class="pwSelo">Mais escolhido</span>':''}${ehPro?'<span class="plTag">atual</span>':''}</div>
        <div class="plPreco pwPreco" data-per="${an?'anual':'mensal'}">${esc(brlPl(an?PA.mensal:PM.preco))}<small>/mês</small></div>
        <p class="plAnual pwCob">${an?'cobrado '+esc(brlPl(PA.preco))+' por ano · economize '+PA.economiaPct+'%':'cobrado todo mês · cancele quando quiser'}</p>
        <ul><li>${I('check')}<span>Tudo do Grátis</span></li>${GVP.PRO_DIFERENCIAIS.map(x=>`<li>${I('check')}<span>${esc(x)}</span></li>`).join('')}</ul>
        ${cta}${manual?'<button type="button" class="pwManual" data-act="pw-manual">Continuar lançando manualmente (Grátis)</button>':''}</div>
      <div class="plOp"><div class="plOpH"><b>Grátis</b>${p&&!ehPro?'<span class="plTag">atual</span>':''}</div>
        <div class="plPreco">R$ 0<small>para sempre</small></div>
        <ul>${plGratisItens().map(x=>`<li>${I('check')}<span>${esc(x)}</span></li>`).join('')}</ul></div>
    </div>
    <p class="plRod">${pag===false?'Os pagamentos ainda não estão ativos. Quando estiverem, você assina por aqui pelo Mercado Pago. ':''}<a href="site/precos.html" target="_blank" rel="noopener">Comparar planos</a> · <a href="site/termos.html" target="_blank" rel="noopener">Termos</a></p>
  </div>`;
  box.classList.add('on');
  if(PLANO_PAG===null&&USER){const ant=pag;verificaPagamento().then(v=>{if(v!==ant&&$('#modal .pwSheet'))abrePlanos(PL_ARGS[0],PL_ARGS[1]);});}
}
function plPer(v){PL_PER=v==='mensal'?'mensal':'anual';if($('#modal .pwSheet'))abrePlanos(PL_ARGS[0],PL_ARGS[1]);}
/* aviso de limite: o mesmo para a resposta LIMITE_PLANO do servidor e para os limites conferidos aqui (cartões, carteira, radar) */
function abrePaywall(rec,opts){abrePlanos(rec,opts);}
/* resposta de uma função: LIMITE_PLANO (v10.161) ou o 402 "upgrade" das funções antigas -> abre o aviso e devolve true */
const REC_LEGADO={leitura_ia:'ia_frase',assistente:'ia_frase'};
function trataLimitePlano(o,status,recPadrao,opts){
  if(!o||typeof o!=='object')return false;
  if(o.erro==='LIMITE_PLANO'){const rec=GVP.COTAS[o.recurso]?o.recurso:recPadrao;abrePaywall(rec,Object.assign({mensagem:typeof o.mensagem==='string'?o.mensagem.slice(0,200):''},opts||{}));return true;}
  if(status===402&&o.upgrade){abrePaywall(recPadrao||REC_LEGADO[o.recurso]||'ia_frase',opts);return true;}
  return false;
}
function erroPaywall(){const e=new Error('');e.gvPaywall=true;return e;}
function toastErroIA(e,padrao){if(e&&e.gvPaywall)return;toast(String(e&&e.message||padrao),true);}
/* limites de quantidade do plano, conferidos no aparelho antes de criar (sem plano lido: não bloqueia, como o resto do app) */
function cabeNoPlano(rec,usados){
  const p=planoAgora();if(!p||!window.GVP||!GVP.COTAS[rec])return true;
  if(GVP.cabe(p.nivel,GVP.COTAS[rec].k,usados))return true;
  abrePaywall(rec);return false;
}
function rdAlertasAtivos(exceto){let n=0;for(const x of radarL()){if(x===exceto)continue;for(const a of (x.al||[]))if(!rdDisp(x,a))n++;}return n;}
/* ?planos=pro (link do WhatsApp quando acaba a cota): abre a folha do Pro assim que a conta estiver aberta */
(function(){try{const m=/[?&]planos=([a-z_]+)/.exec(location.search);if(!m)return;sessionStorage.setItem('gv-abre-planos',m[1]);
  const u=new URL(location.href);u.searchParams.delete('planos');history.replaceState(null,'',u.pathname+(u.search||'')+u.hash);}catch(e){}})();
function abrePlanosURL(){try{const v=sessionStorage.getItem('gv-abre-planos');if(!v||!USER)return;sessionStorage.removeItem('gv-abre-planos');
  if(v==='anual'||v==='mensal')PL_PER=v;abrePaywall(v==='pro'||v==='anual'||v==='mensal'?'whatsapp':null,{manual:false});}catch(e){}}
/* v10.135: a tela de venda não espera o servidor para mostrar "Assinar": usa o último valor conhecido
   (guardado no aparelho) e, sem nenhum, assume pagamento ativo; se não estiver, o checkout responde "em breve" */
function pagVisivel(){if(PLANO_PAG!==null)return PLANO_PAG;try{const c=localStorage.getItem('gv-pag');if(c==='0')return false;}catch(e){}return true;}
function pagGuarda(){try{if(PLANO_PAG!==null)localStorage.setItem('gv-pag',PLANO_PAG?'1':'0');}catch(e){}}
async function verificaPagamento(){
  try{const {data:o,error}=await sb.functions.invoke('assinatura',{body:{acao:'status'}});if(!error&&o){PLANO_PAG=o.pagamento===true;pagGuarda();}
    if(o&&o.assinatura!==undefined){planoAplica(o.assinatura);}
  }catch(e){}
  return pagVisivel(); /* falha de rede: não decide nada, tenta de novo na próxima vez */
}
/* v10.118: o Mercado Pago só aceita o pagamento se quem paga entrar com o mesmo e-mail enviado na assinatura.
   Perguntamos o e-mail da conta do Mercado Pago (começa com o da conta GranaViva ou o último usado) antes de abrir o pagamento. */
const MP_EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function assinar(plano){
  if(!USER){toast('Entre na sua conta primeiro.',true);return;}
  let ult='';try{ult=localStorage.getItem('gv_mp_email')||'';}catch(e){}
  form('Pagar com Mercado Pago',[
    {type:'html',html:'<p class="plMot2">Digite o e-mail com que você entra no Mercado Pago. Se for outro, o Mercado Pago recusa o pagamento.</p>'},
    {name:'e',label:'E-mail da sua conta Mercado Pago',type:'email',required:true,value:ult||USER.email||''}
  ],v=>{
    const e=String(v.e||'').trim().toLowerCase();
    if(!MP_EMAIL_RE.test(e)||e.length>200)return 'confira o e-mail';
    try{localStorage.setItem('gv_mp_email',e);}catch(x){}
    setTimeout(()=>abreCheckout(plano,e),30);return null;
  });
  const bt=$('#mf button[type="submit"]');if(bt)bt.textContent='Continuar para o pagamento';
  const inp=$('#mf input[name="e"]');if(inp){inp.setAttribute('autocomplete','email');inp.setAttribute('inputmode','email');inp.setAttribute('autocapitalize','off');}
}
async function abreCheckout(plano,email){
  const b=document.querySelector('[data-act="assinar"][data-id="'+plano+'"]');if(b){b.disabled=true;b.textContent='Abrindo o pagamento…';}
  toast('Abrindo o pagamento…');
  try{
    const {data:o,error}=await sb.functions.invoke('assinatura',{body:{acao:'checkout',plano,email}});
    let m=o&&o.erro,emBreve=o&&o.emBreve;try{if(error&&error.context){const j=await error.context.json();m=m||j.erro;emBreve=emBreve||j.emBreve;}}catch(e){}
    if(emBreve){PLANO_PAG=false;pagGuarda();abrePlanos();toast('Pagamento em breve');return;}
    if(error||!o||!o.url)throw new Error(m||'não consegui abrir o pagamento');
    const u=new URL(o.url);if(!/(^|\.)mercadopago\.com(\.br)?$/.test(u.hostname))throw new Error('endereço de pagamento inválido');
    location.href=u.href;
  }catch(e){toast(e.message||'não consegui abrir o pagamento',true);if(b){b.disabled=false;b.textContent='Tentar de novo';}}
}
/* volta do Mercado Pago (?assinatura=retorno): o plano só muda quando o servidor confirmar no MP; relemos a tabela por 1 minuto.
   v10.109: além de esperar o aviso do MP, pedimos ao servidor que confira no MP (na 1ª, 4ª e 8ª volta), porque o aviso pode atrasar ou não vir */
function retornoAssinatura(){
  if(!/[?&]assinatura=retorno\b/.test(location.search)||window.__assOk)return;window.__assOk=1;
  try{history.replaceState(null,'',location.pathname);}catch(e){}
  toast('Recebemos sua volta do pagamento. Confirmando…');
  const confere=()=>sb.functions.invoke('assinatura',{body:{acao:'sincronizar'}}).catch(()=>null);
  let n=0;const tic=async()=>{n++;const antes=JSON.stringify(PLANO_ROW);if(n===1||n===4||n===8)await confere();await carregaPlano();
    if(JSON.stringify(PLANO_ROW)!==antes&&PLANO_ROW&&PLANO_ROW.status==='ativo'){toast('Plano '+GVP.PLANOS[GVP.idBase(PLANO_ROW.plano)].nome+' ativado. Obrigado!');render();return;}
    if(n<12)setTimeout(tic,5000);else toast('O pagamento ainda está sendo confirmado. O plano muda sozinho quando o Mercado Pago aprovar.');};
  setTimeout(tic,1500);
}

const FREQS=['diaria','semanal','quinzenal','mensal','anual','intervalo'],ISO_RE=/^\d{4}-\d{2}-\d{2}$/;
function vazio(){return {tx:[],cats:CATS_PADRAO.slice(),catIcons:{},catCores:{},orc:{},orcMes:{},bens:[],passivos:[],patHist:{},fiis:[],metas:[],cartoes:[],bancos:[],fixas:[],emprestimos:[],gerados:{},cfg:{tema:'escuro',accent:'verde'}};}
/* saneamento: tudo que vem do aparelho, da nuvem ou de um backup passa por aqui.
   garante tipos (números, datas, ids seguros) e impede que um backup adulterado injete HTML pelos ids/cores. */
const ID_OK=/^[A-Za-z0-9_|:.\-]{1,80}$/;
const COR_OK=/^#[0-9a-fA-F]{3,8}$/;
const DATA_OK=/^\d{4}-\d{2}-\d{2}$/;
function n0(v){const x=Number(v);return isFinite(x)?x:0;}
function c2(v){return Math.round(n0(v)*100)/100;}
function enc(v){const x=c2(Math.abs(n0(v)));return x>0&&x<1e9?x:0;}
function pct(v,max){const x=Math.round(Math.abs(n0(v))*100)/100;return x>0?Math.min(max,x):0;}
function sid(v){const x=String(v==null?'':v);return ID_OK.test(x)?x:uidS();}
function uidS(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
function str(v,max){return String(v==null?'':v).slice(0,max||200);}
function dia31(v){const d=parseInt(v,10);return d>=1&&d<=31?d:0;}
/* v10.84: backup antigo/editado à mão: prazo da meta como número (202612) e criadoEm como número quebravam a tela (ym.slice / cr.slice) */
function ymOk(v){if(v==null||v==='')return '';const t=String(v).trim();let m=t.match(/^(\d{4})-(\d{1,2})/)||t.match(/^(\d{4})(\d{2})$/);if(!m)return '';const y=+m[1],mm=+m[2];return y>=1990&&y<=2200&&mm>=1&&mm<=12?y+'-'+String(mm).padStart(2,'0'):'';}
function isoTsOk(v){if(v==null||v==='')return undefined;if(typeof v==='number'&&isFinite(v)){const d=new Date(v<1e11?v*1000:v);return isNaN(d)?undefined:d.toISOString();}const t=String(v);return /^\d{4}-\d{2}-\d{2}/.test(t)?t.slice(0,40):undefined;}
function sanea(d){
  const o=Object.assign(vazio(),d&&typeof d==='object'?d:{});
  const arr=a=>Array.isArray(a)?a.filter(x=>x&&typeof x==='object'):[];
  o.tx=arr(o.tx).filter(t=>DATA_OK.test(String(t.data))&&!!dataOk(...String(t.data).slice(0,10).split('-'))&&(t.tipo==='receita'||t.tipo==='despesa'||t.tipo==='transf')).map(t=>Object.assign({},t,{id:sid(t.id),de:/^[bc]:/.test(String(t.de||''))?String(t.de).slice(0,2)+sid(String(t.de).slice(2)):'',para:/^b:/.test(String(t.para||''))?'b:'+sid(String(t.para).slice(2)):'',importado:!!t.importado,valor:c2(Math.abs(n0(t.valor))),pagoValor:c2(Math.abs(n0(t.pagoValor))),pagaEm:DATA_OK.test(String(t.pagaEm))?t.pagaEm:'',pagoConta:t.pagoConta?sid(t.pagoConta):'',invOp:t.invOp?String(t.invOp).replace(/[^A-Za-z0-9_|-]/g,'').slice(0,80):'',invRf:t.invRf?sid(t.invRf):'',parcela:parseInt(t.parcela,10)||0,parcelas:parseInt(t.parcelas,10)||0,grupo:t.grupo?sid(t.grupo):'',categoria:str(t.categoria,60)||'Outros',descricao:str(t.descricao,140),sub:str(t.sub,60).trim(),obs:str(t.obs,300),tags:limpaTags(t.tags),multa:enc(t.multa),juros:enc(t.juros),desconto:enc(t.desconto),anexos:limpaAnexos(t.anexos),cartao:t.cartao?sid(t.cartao):'',conta:t.conta?sid(t.conta):''}));
  o.fiis=arr(o.fiis).map(f=>Object.assign({},f,{id:sid(f.id),ticker:str(f.ticker,12).toUpperCase().replace(/[^A-Z0-9.]/g,''),nome:str(f.nome,80),cotas:Math.max(0,n0(f.cotas)),preco:Math.max(0,n0(f.preco)),dpc:Math.max(0,n0(f.dpc)),pago:Math.max(0,c2(f.pago)),diaPag:dia31(f.diaPag),realizado:c2(n0(f.realizado)),proventos:Math.max(0,c2(f.proventos)),ops:arr(f.ops).slice(0,2000).map(o=>Object.assign({id:sid(o.id),tipo:['inicial','compra','venda','provento'].includes(o.tipo)?o.tipo:'compra',data:DATA_OK.test(String(o.data))?o.data:'',qtd:Math.max(0,n0(o.qtd)),preco:Math.max(0,n0(o.preco)),taxas:Math.max(0,c2(o.taxas)),valor:Math.max(0,c2(o.valor)),custo:Math.max(0,c2(o.custo)),tx:o.tx?sid(o.tx):'',conta:o.conta?sid(o.conta):''},o.g?{g:sid(o.g)}:{}))},f.ap?{ap:arr(f.ap).slice(0,500).map(a=>({v:Math.max(0,c2(a&&a.v)),d:DATA_OK.test(String(a&&a.d))?a.d:'',p:Math.max(0,c2(a&&a.p!=null?a.p:a&&a.v)),ir:DATA_OK.test(String(a&&a.ir))?a.ir:(a&&a.d)||''})).filter(a=>a.d&&a.v>0)}:{},f.taxa!=null?{taxa:Math.max(-50,Math.min(300,n0(f.taxa)))}:{},f.prod!=null?{prod:str(f.prod,12)}:{}));
  if(o.cfg&&o.cfg.radar!==undefined)o.cfg.radar=radarSaneia(o.cfg.radar); // v10.155: Radar
  o.fiis.forEach(f=>{const a=n0(f.alvoP);if(a>0&&isFinite(a)){f.alvoP=Math.round(a*100)/100;f.alvoDir=f.alvoDir==='abaixo'?'abaixo':'acima';}else{delete f.alvoP;delete f.alvoDir;}}); // v10.111: alerta de preço
  o.metas=arr(o.metas).map(m=>Object.assign({},m,{id:sid(m.id),nome:str(m.nome,80),alvo:Math.max(0,c2(m.alvo)),atual:Math.max(0,c2(m.atual)),aporteMes:Math.max(0,c2(n0(m.aporteMes))),cdi:!!m.cdi,pctCdi:Math.min(300,Math.max(0,n0(m.pctCdi))),prazo:ymOk(m.prazo)}));
  /* v10.87: campos novos da meta validados um a um; alocação de um ativo entre metas nunca passa de 100% */
  o.metas=saneaAlocacoes(o.metas.map(m=>{const x=Object.assign({},m);['ativos','planos','aportes','diaAporte','cripMax','ipca','alvoBase','alvoEm','baseEm','baseN','apDest','apConta','apFonte','criadoEm','fipe'].forEach(k=>delete x[k]);return Object.assign(x,saneaMetaExtra(m));}));
  o.cartoes=arr(o.cartoes).map(c=>Object.assign({},c,{id:sid(c.id),nome:str(c.nome,60),banco:str(c.banco,60),final:str(c.final,4).replace(/\D/g,''),limite:Math.max(0,c2(c.limite)),fechamento:dia31(c.fechamento)||1,vencimento:dia31(c.vencimento)||1,cor:Math.max(0,parseInt(c.cor,10)||0),rotativo:pct(c.rotativo,30),multaPct:pct(c.multaPct,10),moraPct:pct(c.moraPct,10),arq:!!c.arq,arqEm:DATA_OK.test(String(c.arqEm))?c.arqEm:'',visual:/^(cor:\d{1,2}|[a-z][a-z0-9_]{1,24})$/.test(String(c.visual||''))?String(c.visual):'',bandeira:['mastercard','visa','elo','amex','hipercard'].includes(c.bandeira)?c.bandeira:''}));
  o.bancos=arr(o.bancos).map(b=>Object.assign({},b,{id:sid(b.id),nome:str(b.nome,80),codigo:str(b.codigo,5).replace(/\D/g,''),logo:/^https:\/\//.test(String(b.logo||''))?str(b.logo,300):'',tipo:str(b.tipo,40),saldo:c2(b.saldo),saldoData:DATA_OK.test(String(b.saldoData))?b.saldoData:'',saldoFecha:!!b.saldoFecha,principal:!!b.principal&&!b.arq,arq:!!b.arq,arqEm:DATA_OK.test(String(b.arqEm))?b.arqEm:''}));
  o.fixas=arr(o.fixas).map(f=>Object.assign({},f,{id:sid(f.id),nome:str(f.nome,80),valor:c2(Math.abs(n0(f.valor))),dia:dia31(f.dia)||1,categoria:str(f.categoria,60)||'Outros',tipo:f.tipo==='receita'?'receita':'despesa',freq:FREQS.includes(f.freq)?f.freq:'mensal',dow:Math.max(0,Math.min(6,parseInt(f.dow,10)||0)),mes:Math.max(1,Math.min(12,parseInt(f.mes,10)||1)),auto:f.auto!==false,n:Math.max(1,Math.min(365,parseInt(f.n,10)||1)),un:['dia','semana','mes'].includes(f.un)?f.un:'dia',inicio:ISO_RE.test(f.inicio||'')?f.inicio:'',fim:ISO_RE.test(f.fim||'')?f.fim:'',forma:['dinheiro','pix','boleto','cartao'].includes(f.forma)?f.forma:'',conta:f.conta?sid(f.conta):'',cartao:f.cartao?sid(f.cartao):'',pagoCom:['dinheiro','cartao','conta'].includes(f.pagoCom)?f.pagoCom:'',criadoEm:isoTsOk(f.criadoEm)}));
  // patrimônio: bens, dívidas e fotografia mensal
  const BEM_T=['imovel','veiculo','outro'],PAS_T=['emprestimo','financiamento','divida','outro'];
  o.bens=arr(o.bens).map(b=>({id:sid(b.id),nome:str(b.nome,80),tipo:BEM_T.includes(b.tipo)?b.tipo:'outro',valor:Math.max(0,c2(b.valor))})).filter(b=>b.nome);
  o.passivos=arr(o.passivos).map(p=>({id:sid(p.id),nome:str(p.nome,80),tipo:PAS_T.includes(p.tipo)?p.tipo:'outro',saldo:Math.max(0,c2(p.saldo)),parcela:Math.max(0,c2(p.parcela)),juros:Math.max(0,Math.min(100,n0(p.juros))),restantes:Math.max(0,Math.min(600,Math.round(n0(p.restantes))))})).filter(p=>p.nome);
  {const ph={};const src=o.patHist&&typeof o.patHist==='object'&&!Array.isArray(o.patHist)?o.patHist:{};Object.entries(src).forEach(([k,v])=>{if(/^\d{4}-\d{2}$/.test(k)&&v&&typeof v==='object')ph[k]={a:c2(v.a),p:Math.max(0,c2(v.p))};});o.patHist=ph;}
  /* v10.62: empréstimos a receber (uma ficha por pessoa; o dinheiro anda por lançamentos transf com t.emp) */
  o.emprestimos=arr(o.emprestimos).map(e=>({id:sid(e.id),pessoa:str(e.pessoa,60).trim(),tel:str(e.tel,15).replace(/\D/g,''),prev:ISO_RE.test(e.prev||'')?e.prev:'',obs:str(e.obs,140),modo:e.modo==='partes'?'partes':'avista',criadoEm:ISO_RE.test(String(e.criadoEm||'').slice(0,10))?String(e.criadoEm).slice(0,10):''})).filter(e=>e.pessoa);
  /* v10.78: empDir 'perdao' (dívida perdoada): transf (não conta como gasto) ou despesa (se a pessoa escolheu contar) */
  /* v10.79: empAnt = dinheiro que saiu (ou voltou) antes de usar o app: conta no empréstimo, mas não mexe em conta nenhuma.
     empAntDe guarda a conta de antes, para desfazer a correção. */
  o.tx.forEach(t=>{if(t.emp&&(t.tipo==='transf'||(t.tipo==='despesa'&&t.empDir==='perdao'))){t.emp=sid(t.emp);t.empDir=t.empDir==='in'?'in':t.empDir==='perdao'?'perdao':'out';if(t.empDir==='perdao'){t.de='';t.para='';t.cartao='';t.conta='';t.forma='';}
      if(t.empAnt&&t.empDir!=='perdao'){t.empAnt=1;t.de='';t.para='';t.empAntDe=/^b:/.test(String(t.empAntDe||''))?'b:'+sid(String(t.empAntDe).slice(2)):'';if(!t.empAntDe)delete t.empAntDe;}else{delete t.empAnt;delete t.empAntDe;}}
    else{delete t.emp;delete t.empDir;delete t.empAnt;delete t.empAntDe;}});
  // status do lançamento: só valores conhecidos (sem status = pago)
  o.tx.forEach(t=>{if(!['pago','previsto','cancelado'].includes(t.status))delete t.status;if(t.status!=='previsto')delete t.fxAuto;});
  /* v10.81: divisão entre categorias só em despesa comum (não em fatura, transferência ou empréstimo); inválida é descartada e o lançamento fica com a categoria única */
  o.tx.forEach(t=>{if(!('split' in t))return;const ok=t.tipo==='despesa'&&!t.faturaKey&&!t.emp&&Array.isArray(t.split)?confereSplit(t.split.slice(0,11),t.valor):null;if(Array.isArray(ok))t.split=ok;else delete t.split;});
  /* v10.80: dia trabalhado (competência), só em receita. data inválida ou em outro tipo é descartada; backup antigo não tem e segue igual */
  o.tx.forEach(t=>{const w=String(t.trab||'').slice(0,10);if(t.tipo==='receita'&&DATA_OK.test(w)&&dataOk(...w.split('-')))t.trab=w;else delete t.trab;});
  /* v10.45: pagamentos da fatura em lista (cada um com data e conta). formato antigo (pagoValor/pagaEm/pagoConta) vira 1 pagamento.
     pagoValor = soma; pagaEm/pagoConta espelham o último (compatibilidade com a função de alertas). */
  o.tx.forEach(t=>{
    if(!t.faturaKey){delete t.pagamentos;return;}
    let pg=arr(t.pagamentos).map(x=>({valor:enc(x.valor),data:DATA_OK.test(String(x.data))?x.data:'',conta:x.conta?sid(x.conta):''})).filter(x=>x.valor>0).slice(0,200);
    if(!pg.length&&t.pagoValor>0)pg=[{valor:t.pagoValor,data:t.pagaEm||'',conta:t.pagoConta||''}];
    t.pagamentos=pg;fechaPagamentos(t);
  });
  /* v10.45: venda de investimento lançada como receita (versões antigas) vira transferência para a conta: não é renda */
  {const vend=new Set();o.fiis.forEach(f=>f.ops.forEach(op=>{if(op.tipo==='venda'&&op.tx)vend.add(op.tx);}));
   o.tx.forEach(t=>{if(vend.has(t.id)&&t.tipo==='receita'&&t.invOp&&t.conta){t.tipo='transf';t.de='';t.para='b:'+t.conta;t.forma='';t.conta='';t.cartao='';}});}
  o.cats=(Array.isArray(o.cats)?o.cats:CATS_PADRAO).map(c=>str(c,60).trim()).filter(Boolean);
  if(!o.cats.length)o.cats=CATS_PADRAO.slice();
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
  o.orc={};Object.entries(obj(d&&d.orc)).forEach(([k,v])=>{if(n0(v)>0)o.orc[str(k,60)]=c2(v);});
  // limites por mês (histórico): {'AAAA-MM':{categoria:limite}}; vale para o mês e os seguintes até o próximo registro
  o.orcMes={};Object.entries(obj(d&&d.orcMes)).forEach(([mk,mp])=>{if(!/^\d{4}-\d{2}$/.test(mk))return;const l={};Object.entries(obj(mp)).forEach(([k,v])=>{if(n0(v)>0)l[str(k,60)]=c2(v);});o.orcMes[mk]=l;});
  o.catCores={};Object.entries(obj(d&&d.catCores)).forEach(([k,v])=>{if(COR_OK.test(String(v)))o.catCores[str(k,60)]=v;});
  o.catIcons={};Object.entries(obj(d&&d.catIcons)).forEach(([k,v])=>{if(ICONS[v]||(typeof v==='string'&&v.length<=8&&EMO_RE.test(v)))o.catIcons[str(k,60)]=v;});
  o.gerados=obj(o.gerados);
  o.cfgTs={};Object.entries(obj(d&&d.cfgTs)).forEach(([k,v])=>{if(n0(v)>0&&k.length<=60)o.cfgTs[k]=n0(v);});
  o.cfg=Object.assign({tema:'escuro',accent:'verde'},obj(o.cfg));
  if(!(o.cfg.catsV>=2)){const i=o.cats.indexOf('Outros');const novas=CATS_NOVAS.filter(c=>!o.cats.includes(c));if(i>=0)o.cats.splice(i,0,...novas);else o.cats.push(...novas);o.cfg.catsV=2;}
  /* v10.95: a "meta de cotas" saiu de Investimentos. o número antigo (metaFii, de backups e da nuvem antiga) não se perde:
     fica em cfg.metaCotas {n, fim:''|'criada'|'dispensada'} e a aba Metas oferece virar uma meta comum (só se for diferente de 100, o padrão) */
  {const mf=Math.round(n0(o.metaFii)*1e4)/1e4,mc=obj(o.cfg.metaCotas),n=Math.round(n0(mc.n)*1e4)/1e4;
   if(mf>0&&mf!==100&&mf!==n)o.cfg.metaCotas={n:mf,fim:''};
   else if(n>0)o.cfg.metaCotas={n,fim:['criada','dispensada'].includes(mc.fim)?mc.fim:'',...(mc.meta?{meta:sid(mc.meta)}:{})};
   else delete o.cfg.metaCotas;
   delete o.metaFii;}
  if(!ACCENTS[o.cfg.accent])o.cfg.accent='verde';
  if(o.cfg.pagDesde&&!DATA_OK.test(String(o.cfg.pagDesde)))o.cfg.pagDesde='';
  if(o.cfg.tema!=='claro'&&o.cfg.tema!=='preto')o.cfg.tema='escuro';
  o.cfg.assinIgnora=[...new Set((Array.isArray(o.cfg.assinIgnora)?o.cfg.assinIgnora:[]).filter(x=>typeof x==='string').map(x=>str(x,40).trim()).filter(Boolean))].slice(-300);
  {const av={};Object.entries(obj(o.cfg.assinVisto)).slice(-300).forEach(([k,v])=>{if(/^\d{4}-\d{2}$/.test(String(v)))av[str(k,40)]=v;});o.cfg.assinVisto=av;}
  {const ae={},lim=new Date(Date.now()-90*864e5).toISOString().slice(0,10);Object.entries(obj(o.cfg.alEst)).slice(-400).forEach(([k,v])=>{v=String(v);if(/^[lx]:\d{4}-\d{2}-\d{2}$/.test(v)&&v.slice(2)>=lim)ae[str(k,90)]=v;});if(Object.keys(ae).length)o.cfg.alEst=ae;else delete o.cfg.alEst;}
  {const rg={};Object.entries(obj(o.cfg.regras)).slice(0,500).forEach(([k,v])=>{const kk=str(k,80).trim();if(kk&&typeof v==='string')rg[kk]=str(v,60);});o.cfg.regras=rg;}
  return o;
}
/* o cache local pertence a uma conta específica (gv-owner). sem dono conhecido, não é exibido. */
const OWNER_KEY='gv-owner';
function sessaoGuardadaId(){try{const r=JSON.parse(localStorage.getItem('sb-hydvhpfpvhopetqqjido-auth-token')||'null');return r&&r.user&&r.user.id||null;}catch(e){return null;}}
/* ---------- v10.64: dados deste aparelho criptografados ----------
   AES-GCM 256. a chave é uma CryptoKey NÃO exportável guardada no IndexedDB: o app usa, mas ela não pode ser lida nem copiada.
   quem copiar o localStorage (backup, extensão, outro app) leva só texto embaralhado. sem WebCrypto/IndexedDB, grava como antes. */
const CR_PFX='gve1:';
let CR_RAW=null,CR_OK=true,CR_KEY=null,CR_FALHOU=false,CR_TELA=false;const CR_G={};
function crIdbOp(modo,fn){return new Promise((ok,er)=>{const r=indexedDB.open('gv-cripto',1);r.onupgradeneeded=()=>r.result.createObjectStore('k');r.onerror=()=>er(r.error);
  r.onsuccess=()=>{const db=r.result;let q;try{const tx=db.transaction('k',modo);q=fn(tx.objectStore('k'));tx.oncomplete=()=>{db.close();ok(q&&q.result);};tx.onerror=tx.onabort=()=>{db.close();er(tx.error);};}catch(e){db.close();er(e);}};});}
async function crChave(criar){
  if(CR_KEY)return CR_KEY;
  if(!(window.crypto&&crypto.subtle&&window.indexedDB))return null;
  let k=await crIdbOp('readonly',st=>st.get('main')).catch(()=>null);
  if(!k&&criar){k=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await crIdbOp('readwrite',st=>st.put(k,'main'));}
  return CR_KEY=k||null;
}
function crB64(u){let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);}
function crBin(s){const b=atob(s),n=b.length,u=new Uint8Array(n);for(let i=0;i<n;i++)u[i]=b.charCodeAt(i);return u;} // v10.73: ~10x mais rápido que Uint8Array.from com função
async function crCifra(txt){const k=await crChave(true);if(!k)return null;const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,new TextEncoder().encode(txt)));return CR_PFX+crB64(iv)+':'+crB64(ct);}
async function crDecifra(raw){const k=await crChave(false);if(!k)throw new Error('sem chave');const [iv,ct]=raw.slice(CR_PFX.length).split(':');
  return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:crBin(iv)},k,crBin(ct)));}
/* grava cifrado; gravações mais novas da mesma chave vencem as antigas que ainda estavam cifrando */
function gravaCifrado(chave,txt){const g=CR_G[chave]=(CR_G[chave]||0)+1;
  return crCifra(txt).then(c=>{if(CR_G[chave]!==g)return;localStorage.setItem(chave,c||txt);},()=>{if(CR_G[chave]!==g)return;try{localStorage.setItem(chave,txt);}catch(e){}});}
function crCancela(chave){CR_G[chave]=(CR_G[chave]||0)+1;if(chave===KEY){clearTimeout(GL_T);GL_T=null;GL_PEND=false;}}
async function leTalvezCifrado(chave){const raw=localStorage.getItem(chave);if(!raw)return null;return JSON.parse(raw.indexOf(CR_PFX)===0?await crDecifra(raw):raw);}
/* v10.99: gravação agrupada. Vários salvar() seguidos (importar extrato, gerar parcelas, sincronizar) viram uma só
   cifragem + escrita, 40 ms depois do último. Ao sair do app (aba escondida, fechar, trocar de app) grava na hora,
   então nenhum lançamento fica só na memória. gravaLocal(true) grava já. */
var GL_T=null,GL_PEND=false;
function gravaLocal(ja){
  if(!CR_OK)return; // ainda abrindo a cópia cifrada: não sobrescreve com dados vazios
  GL_PEND=true;
  if(ja){gravaLocalJa();return;}
  if(!GL_T)GL_T=setTimeout(gravaLocalJa,40);
}
function gravaLocalJa(){
  clearTimeout(GL_T);GL_T=null;
  if(!GL_PEND||!CR_OK||LOC_BLOQ)return;GL_PEND=false;
  try{const ac=ACCENTS[S.cfg.accent]||ACCENTS.verde,u=JSON.stringify({tema:S.cfg.tema,accent:S.cfg.accent,a1:ac[0],a2:ac[1]});if(localStorage.getItem('gv-ui')!==u)localStorage.setItem('gv-ui',u);}catch(e){}
  const g=CR_G[KEY]=(CR_G[KEY]||0)+1,txt=JSON.stringify(S);
  return crCifra(txt).catch(()=>null).then(c=>{if(CR_G[KEY]!==g)return;return guardaCopia(c||txt);}).then(()=>{LOC_AVISOU=false;},e=>avisoArmazenamento(e));
}
/* v10.106: a cópia local fica no localStorage (rápido). quando ele enche (QuotaExceededError; no Safari ~5 MB),
   a cópia passa para o IndexedDB (gv-dados), que tem bem mais espaço. ordem: grava no IndexedDB, marca gv-loc=idb,
   e só então tira a cópia antiga do localStorage. a leitura prefere o IndexedDB e cai no localStorage se ele falhar,
   então interromper no meio não perde a cópia. sem IndexedDB: aviso com "Exportar backup", nada é apagado. */
const LOC_KEY='gv-loc';let LOC_BLOQ=false,LOC_AVISOU=false;
function locIdb(){try{return localStorage.getItem(LOC_KEY)==='idb';}catch(e){return false;}}
function ehCota(e){return !!e&&(e.name==='QuotaExceededError'||e.name==='NS_ERROR_DOM_QUOTA_REACHED'||e.code===22||e.code===1014);}
function dadosIdb(modo,fn){return new Promise((ok,er)=>{if(!window.indexedDB)return er(new Error('sem IndexedDB'));let r;try{r=indexedDB.open('gv-dados',1);}catch(e){return er(e);}
  r.onupgradeneeded=()=>r.result.createObjectStore('d');r.onerror=()=>er(r.error||new Error('IndexedDB'));r.onblocked=()=>er(new Error('IndexedDB bloqueado'));
  r.onsuccess=()=>{const db=r.result;let q;try{const tx=db.transaction('d',modo);q=fn(tx.objectStore('d'));tx.oncomplete=()=>{db.close();ok(q&&q.result);};tx.onerror=tx.onabort=()=>{db.close();er(tx.error||new Error('IndexedDB abortado'));};}catch(e){db.close();er(e);}};});}
async function guardaCopia(v){
  if(locIdb()){
    try{await dadosIdb('readwrite',st=>st.put(v,KEY));return;}
    catch(e){localStorage.setItem(KEY,v);try{localStorage.removeItem(LOC_KEY);}catch(x){}return;} // IndexedDB falhou: volta para o localStorage (se também falhar, o erro sobe e a cópia anterior fica onde estava)
  }
  let cota;try{localStorage.setItem(KEY,v);return;}catch(e){if(!ehCota(e))throw e;cota=e;}
  try{await dadosIdb('readwrite',st=>st.put(v,KEY));}catch(e){throw cota;} // IndexedDB também falhou: o aviso de cota cheia sobe (a cópia anterior continua no localStorage)
  try{localStorage.setItem(LOC_KEY,'idb');}catch(e){try{localStorage.removeItem(KEY);localStorage.setItem(LOC_KEY,'idb');}catch(x){}}
  try{localStorage.removeItem(KEY);}catch(e){}
  try{errRegistra('aviso','cópia local passou para o IndexedDB (localStorage cheio)','','');}catch(e){}
  toast('A cópia deste aparelho passou para um espaço maior do navegador. Nada foi perdido.');
}
function avisoArmazenamento(e){
  try{errRegistra('armazenamento',(e&&e.name?e.name+': ':'')+(e&&e.message||'falha ao gravar a cópia local'),e&&e.stack,'');}catch(x){}
  GL_PEND=true; // a próxima gravação tenta de novo com tudo
  const cheio=ehCota(e)||/quota|cheio|full/i.test(String(e&&e.message||''));
  const curto=cheio?'Armazenamento cheio: a cópia deste aparelho não foi atualizada. Nada foi apagado.':'Não deu para salvar a cópia deste aparelho. Nada foi apagado.';
  if(LOC_AVISOU)return;LOC_AVISOU=true;
  if(document.querySelector('#modal.on')){ // formulário aberto: não fecha, avisa no rodapé com o botão
    const t=$('#toast');t.className='err';t.innerHTML='<span>'+esc(curto)+'</span><button type="button" class="tDesf">Exportar backup</button>';t.classList.add('on');
    t.querySelector('.tDesf').onclick=()=>{t.classList.remove('on');try{exportar();}catch(x){}};clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),9000);return;
  }
  confirma({titulo:cheio?'Armazenamento do aparelho cheio':'Não deu para salvar neste aparelho',
    texto:'A cópia deste aparelho (usada para abrir sem internet) não foi atualizada. Nada foi apagado: o que você fez continua aberto no app'+(USER?' e vai para a nuvem normalmente':'')+'. '+(USER?'':'Sem conta, essas alterações só existem nesta aba. ')+'Exporte um backup e, se puder, libere espaço no navegador.',
    ok:'Exportar backup'},()=>{try{exportar();}catch(x){}});
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')gravaLocalJa();});
window.addEventListener('pagehide',()=>gravaLocalJa());
function uiSalva(){try{const u=JSON.parse(localStorage.getItem('gv-ui')||'null');return u&&typeof u==='object'?{tema:u.tema==='claro'||u.tema==='preto'?u.tema:'escuro',accent:String(u.accent||'verde').slice(0,20)}:null;}catch(e){return null;}}
const CR_IDB='idb:'; // v10.106: marca "a cópia está no IndexedDB" (abreCripto lê de lá)
async function abreCripto(){
  try{
    let raw=CR_RAW;
    if(raw===CR_IDB){
      try{raw=await dadosIdb('readonly',st=>st.get(KEY));}catch(e){raw=undefined;LOC_BLOQ=!localStorage.getItem(KEY);} // não abriu: não grava por cima do que está lá
      if(raw==null)raw=localStorage.getItem(KEY);
    }
    if(raw==null)throw {semCopia:1};
    const d=JSON.parse(String(raw).indexOf(CR_PFX)===0?await crDecifra(raw):raw);
    const dono=localStorage.getItem(OWNER_KEY),sess=sessaoGuardadaId();
    COPIA_LIDA=!!(dono&&sess&&dono===sess&&d&&typeof d==='object');S=COPIA_LIDA?sanea(d):Object.assign(vazio(),{cfg:S.cfg});
  }catch(e){
    if(e&&e.semCopia){S=Object.assign(vazio(),{cfg:S.cfg});if(LOC_BLOQ)setTimeout(()=>toast('Não foi possível abrir a cópia deste aparelho; seus dados vêm da nuvem.',true),800);}
    /* chave perdida (o sistema limpou o IndexedDB) ou cópia corrompida: descarta o cache local e baixa tudo da nuvem de novo */
    else{CR_FALHOU=true;limpaCache();S=Object.assign(vazio(),{cfg:S.cfg});}
  }
  CR_RAW=null;CR_OK=true;zeraCfgH();document.documentElement.classList.remove('crAbrindo');
  try{if(!S.cfg.pagDesde)S.cfg.pagDesde=hojeISO();geraRecorrentes();applyCfg();restauraAba();render();CR_TELA=!CR_FALHOU;}catch(e){}
}
let LEGADO=null;
/* v10.117: só vira true quando a cópia deste aparelho, da conta da sessão, foi aberta de verdade */
var COPIA_LIDA=false;
function carregar(){
  try{
    const dono=localStorage.getItem(OWNER_KEY),sess=sessaoGuardadaId();
    const raw=localStorage.getItem(KEY)||'null';
    /* v10.106: cópia no IndexedDB (ou sem cópia no localStorage, mas com dono: pode ter migrado e parado no meio) */
    if(dono&&sess&&dono===sess&&window.indexedDB&&(locIdb()||raw==='null')){CR_RAW=CR_IDB;CR_OK=false;document.documentElement.classList.add('crAbrindo');const u=uiSalva();const v=vazio();if(u)Object.assign(v.cfg,u);return v;}
    if(raw.indexOf(CR_PFX)===0){if(!dono||!sess||dono!==sess)return vazio();CR_RAW=raw;CR_OK=false;document.documentElement.classList.add('crAbrindo');const u=uiSalva();const v=vazio();if(u)Object.assign(v.cfg,u);return v;}
    const d=JSON.parse(raw);
    if(!dono&&d&&typeof d==='object'&&Array.isArray(d.tx)){LEGADO=d;return vazio();}
    if(!dono||!sess||dono!==sess)return vazio();
    if(d&&typeof d==='object'){COPIA_LIDA=true;return sanea(d);}
  }catch(e){}
  return vazio();
}
let S=carregar();zeraCfgH();
const CR_PRONTO=CR_RAW?abreCripto():Promise.resolve();
/* cópia antiga em texto puro, da mesma conta: regrava cifrada */
try{const r0=localStorage.getItem(KEY),o0=localStorage.getItem(OWNER_KEY);if(!CR_RAW&&r0&&r0.indexOf(CR_PFX)!==0&&o0&&o0===sessaoGuardadaId())setTimeout(gravaLocal,0);}catch(e){}
const SB_URL='https://hydvhpfpvhopetqqjido.supabase.co';
const SB_KEY='sb_publishable_hq7L3RL6Y-BE49SlgjqcTw_Sh-N9hJj';
const sb=window.supabase.createClient(SB_URL,SB_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});
let USER=null,syncT=null,syncBusy=false,syncPend=false;
const TABELAS=['tx','fiis','metas','cartoes','bancos'];
/* v10.86: indicador de sincronização. nuvem dentro de um anel, com o estado escrito no aria-label/title;
   tocar mostra o detalhe (e a hora da última sincronização) */
let SYNC_EST={k:'',det:'',em:0};
const SYNC_SVG={
  synced:'<path class="sgN" d="M7.2 18.2a4.4 4.4 0 0 1-.6-8.76 5.6 5.6 0 0 1 10.9 1.06A3.9 3.9 0 0 1 17 18.2z"/><path class="sgM" d="M9.6 13.6l1.8 1.8 3.2-3.3"/>',
  syncing:'<path class="sgN" d="M7.2 18.2a4.4 4.4 0 0 1-.6-8.76 5.6 5.6 0 0 1 10.9 1.06A3.9 3.9 0 0 1 17 18.2z"/><path class="sgM" d="M12 16v-4.6M10 13.2l2-2 2 2"/>',
  pend:'<path class="sgN" d="M7.2 18.2a4.4 4.4 0 0 1-.6-8.76 5.6 5.6 0 0 1 10.9 1.06A3.9 3.9 0 0 1 17 18.2z"/><path class="sgM" d="M12 11.6v2.6l1.6 1"/>',
  offline:'<path class="sgN" d="M7.2 18.2a4.4 4.4 0 0 1-.6-8.76 5.6 5.6 0 0 1 2.7-3.7M12.4 4.9a5.6 5.6 0 0 1 5.1 5.6A3.9 3.9 0 0 1 19.7 17"/><path class="sgM" d="M4 4l16 16"/>'};
/* v10.131: sem piscar. 'sincronizando' só aparece se o envio passar de 1,2s (salvar rápido fica verde o tempo todo),
   e o ícone só é redesenhado quando o estado muda de fato */
let SYNC_ESP=null;
function setSync(t){
  const el=document.getElementById('syncTxt');if(!el)return;
  clearTimeout(SYNC_ESP);SYNC_ESP=null;
  if(t&&/sincronizando|carregando/.test(t)&&SYNC_EST.k&&SYNC_EST.k!=='syncing'&&SYNC_EST.k!=='offline'){SYNC_ESP=setTimeout(()=>{SYNC_ESP=null;setSyncJa(t);},1200);return;}
  setSyncJa(t);
}
function setSyncJa(t){
  const el=document.getElementById('syncTxt');if(!el)return;
  if(!t){el.className='syncPill';el.innerHTML='';el.hidden=true;SYNC_EST={k:'',det:'',em:SYNC_EST.em};return;}
  let k,lab;
  if(/offline/.test(t)){k='offline';lab='offline, as mudanças ficam salvas neste aparelho';}
  else if(/pendente/.test(t)){k='pend';lab='sincronização pendente, tenta de novo em instantes';}
  else if(/sincronizando|carregando/.test(t)){k='syncing';lab='sincronizando com a nuvem';}
  else {k='synced';lab='sincronizado com a nuvem';SYNC_EST.em=Date.now();}
  const igual=SYNC_EST.k===k&&!el.hidden&&el.firstChild;
  SYNC_EST.k=k;SYNC_EST.det=t;el.hidden=false;
  if(igual)return;
  el.className='syncPill '+k;el.dataset.st=k;
  el.innerHTML='<svg class="syncRing" viewBox="0 0 44 44" aria-hidden="true"><circle class="srT" cx="22" cy="22" r="19"/><circle class="srA" cx="22" cy="22" r="19" pathLength="100"/></svg><svg class="syncIc" viewBox="0 0 24 24" aria-hidden="true">'+SYNC_SVG[k]+'</svg><span class="sr">'+lab+'</span>';
  el.title=lab.charAt(0).toUpperCase()+lab.slice(1);el.setAttribute('aria-label','status da sincronização: '+lab);
}
function syncDetalhe(){
  const k=SYNC_EST.k;if(!k)return;
  const hm=d=>{const x=new Date(d);return pad(x.getHours())+':'+pad(x.getMinutes());};
  if(k==='synced')toast('Sincronizado'+(SYNC_EST.em?' às '+hm(SYNC_EST.em):''));
  else if(k==='syncing')toast('Sincronizando com a nuvem…');
  else if(k==='pend'){const m=/em (\d+)s/.exec(SYNC_EST.det);toast(m?'Pendente: tenta de novo em '+m[1]+'s':'Pendente: tenta ao voltar a conexão',true);}
  else toast('Offline: salvo neste aparelho',true);
}
window.addEventListener('offline',()=>setSync('offline, salvo no aparelho'));
window.addEventListener('online',()=>{if(USER)agendaSync();});
let MUDANCAS=0; // v10.45: conta salvamentos locais; download que atravessou uma edição é descartado
function salvar(){
  if(MEMO)MEMO={};
  try{PROJ_C=null;}catch(e){} // v10.80: mudar só a data de um previsto (mesmo número de lançamentos) também refaz o saldo dia a dia
  try{localStorage.setItem('gv-last-act',String(Date.now()));}catch(e){}
  MUDANCAS++;
  try{fotoPat();}catch(e){}
  marcaCfg();
  try{if(USER&&CR_OK)localStorage.setItem(OWNER_KEY,USER.id);}catch(e){}
  gravaLocal();
  if(USER)agendaSync();
  if(!ORC_V)setTimeout(()=>{try{orcVigia();}catch(e){}},0); // v10.79
}
function agendaSync(ms){clearTimeout(syncT);syncT=setTimeout(enviar,ms==null?700:ms);}
/* sincronização incremental.
   SNAP guarda, por tabela, o hash de cada registro que sabemos estar na nuvem (baixado ou enviado por nós).
   - envia só o que mudou (hash diferente ou novo);
   - apaga na nuvem só o que estava no SNAP e foi removido aqui.
   antes: cada salvamento apagava da nuvem tudo que não existisse neste aparelho, então um segundo aparelho
   com cópia antiga apagava registros criados no primeiro. */
const SNAP_KEY=()=>'gv-snap-'+(USER?USER.id:'');
let SNAP=null,syncFalhas=0;
/* v10.155 (C1): BASE_OK só fica true depois de um baixar() completo (ou quando a cópia deste aparelho abriu: COPIA_LIDA).
   sem isso, o snapshot antigo do localStorage NUNCA é usado para decidir exclusões na nuvem. */
let BASE_OK=false;
/* v10.155 (A1): ids que a trava de exclusão em massa segurou, por tabela. ficam fora de temPendencia (senão o aparelho
   ficava "pendente" para sempre e nunca mais baixava a nuvem) até a pessoa escolher restaurar ou confirmar a exclusão */
let SEGURA={},TRAVA_T=null;
function hashObj(o){const t=JSON.stringify(o);let h=5381;for(let i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;return t.length+':'+h;}
function lerSnap(){try{const x=JSON.parse(localStorage.getItem(SNAP_KEY())||'null');if(x&&typeof x==='object')return x;}catch(e){}return null;}
function gravaSnap(){try{localStorage.setItem(SNAP_KEY(),JSON.stringify(SNAP));}catch(e){}}
function cfgNuvem(){return {cats:S.cats,catIcons:S.catIcons||{},catCores:S.catCores||{},orc:S.orc,orcMes:S.orcMes||{},bens:S.bens||[],passivos:S.passivos||[],patHist:S.patHist||{},cfg:S.cfg,cfgTs:S.cfgTs||{},fixas:S.fixas||[],emprestimos:S.emprestimos||[],gerados:S.gerados||{}};}
/* hash por chave dos ajustes (cfg entra campo a campo) para saber o que este aparelho mudou */
const hashV=v=>v===undefined?'u':hashObj(v);
/* v10.54: cada ajuste guarda quando foi mudado neste aparelho (cfgTs); na junção com a nuvem vence o mais recente,
   então um aparelho com cópia velha não devolve a meta de cotas (ou outro ajuste) para o valor antigo */
var CFG_H; // var: usado em let S=carregar() antes desta linha
function cfgChaves(){const h=cfgHashes(cfgNuvem());delete h.cfgTs;delete h.gerados;return h;}
function marcaCfg(){try{const h=cfgChaves();if(CFG_H){const t=Date.now();if(!S.cfgTs)S.cfgTs={};Object.keys(h).forEach(k=>{if(h[k]!==CFG_H[k])S.cfgTs[k]=t;});}CFG_H=h;}catch(e){}}
function zeraCfgH(){try{CFG_H=cfgChaves();}catch(e){CFG_H=null;}}
function cfgHashes(c){const h={};Object.keys(c).forEach(k=>{if(k==='cfg')Object.keys(c.cfg||{}).forEach(j=>{h['cfg.'+j]=hashV(c.cfg[j]);});else h[k]=hashV(c[k]);});return h;}
async function juntaCfgRemoto(){
  const {data:r,error}=await sb.from('settings').select('data,updated_at').eq('user_id',USER.id).maybeSingle();
  if(error)throw error;
  if(!r||!r.data||!r.updated_at||r.updated_at===SNAP.__cfgAt)return false; // ninguém gravou desde a nossa leitura
  const base=SNAP.__cfgK||{};
  const rem=r.data,loc=cfgNuvem(),toma={},tomaCfg={};
  const tR=(rem.cfgTs&&typeof rem.cfgTs==='object')?rem.cfgTs:{},tL=S.cfgTs||{};
  /* fica com a versão da nuvem quando este aparelho não mexeu na chave desde a última leitura, ou quando a da nuvem é mais nova */
  const daNuvem=(k,vl)=>(base[k]&&hashV(vl)===base[k])||(+tR[k]||0)>(+tL[k]||0);
  Object.keys(rem).forEach(k=>{
    if(k==='cfgTs')return;
    if(k==='cfg'){Object.keys(rem.cfg||{}).forEach(j=>{if(daNuvem('cfg.'+j,loc.cfg[j]))tomaCfg[j]=rem.cfg[j];});return;}
    if(k==='gerados'){toma.gerados=Object.assign({},rem.gerados||{},loc.gerados||{});return;} // marcas: união
    if(k in loc&&hashV(loc[k])!==hashV(rem[k])&&daNuvem(k,loc[k]))toma[k]=rem[k];
  });
  /* v10.157: "controle de pagamentos desde" só volta no tempo. um aparelho novo que marcou hoje não pode empurrar a data
     para frente, senão faturas vencidas entre as duas datas passariam a contar como pagas sem sair de conta nenhuma */
  {const a=String((rem.cfg||{}).pagDesde||''),b=String(loc.cfg.pagDesde||'');if(DATA_OK.test(a)&&DATA_OK.test(b)&&a!==b){const mn=a<b?a:b;if(mn!==b)tomaCfg.pagDesde=mn;else delete tomaCfg.pagDesde;}}
  {const ts=Object.assign({},tL);Object.keys(tR).forEach(k=>{if((+tR[k]||0)>(+ts[k]||0))ts[k]=+tR[k];});if(hashV(ts)!==hashV(tL)){S.cfgTs=ts;toma.cfgTs=ts;}}
  if(!Object.keys(toma).length&&!Object.keys(tomaCfg).length)return false;
  const z=sanea(Object.assign({},loc,toma,{metaFii:rem.metaFii,cfg:Object.assign({},loc.cfg,tomaCfg)})); // v10.95: aparelho antigo ainda grava metaFii
  if(hashV(z.cfg.metaCotas)!==hashV(S.cfg.metaCotas)&&!('metaCotas' in tomaCfg))tomaCfg.metaCotas=1;
  Object.keys(toma).forEach(k=>{S[k]=z[k];});
  Object.keys(tomaCfg).forEach(j=>{S.cfg[j]=z.cfg[j];});
  zeraCfgH();
  gravaLocal();
  setTimeout(()=>{if(!document.querySelector('#modal.on')){try{applyCfg();render();}catch(e){}}},0);
  return true;
}
let APAGA_LIBERADO=false;
async function upTabela(tab,arr,uid,ok){
  uid=uid||USER.id;ok=ok||(()=>true);
  const snap=SNAP[tab]||(SNAP[tab]={});
  const agora=new Date().toISOString();
  const mudou=[],hashes={};
  (arr||[]).forEach(x=>{const id=String(x.id),h=hashObj(x);hashes[id]=h;if(snap[id]!==h)mudou.push({user_id:uid,id,data:x,updated_at:agora});});
  let sair=Object.keys(snap).filter(id=>!(id in hashes));
  /* v10.65: trava de segurança. sumir mais da metade de uma tabela de uma vez só acontece de propósito por "Apagar tudo"
     ou "Importar backup". fora disso, seria um defeito: a exclusão na nuvem fica segurada e os dados continuam lá. */
  const tot=Object.keys(snap).length;
  /* v10.116: tabelas pequenas (contas, cartões, investimentos, metas) também: 2 ou mais sumindo de uma vez, acima da metade, ficam seguradas */
  if(!APAGA_LIBERADO&&sair.length>tot*0.5&&(sair.length>=50||(tab!=='tx'&&sair.length>=2))){
    SEGURA[tab]=sair.slice();travaAgenda(); // v10.155 (A1): baixa a nuvem de volta e pergunta o que fazer
    sair=[];
  }
  for(let i=0;i<mudou.length;i+=500){
    if(!ok())throw CONTA_TROCOU;
    const lote=mudou.slice(i,i+500);
    const {error}=await sb.from(tab).upsert(lote);if(error)throw error;
    lote.forEach(r=>{snap[r.id]=hashes[r.id];});gravaSnap();
  }
  for(let i=0;i<sair.length;i+=200){
    if(!ok())throw CONTA_TROCOU;
    const lote=sair.slice(i,i+200);
    const {error}=await sb.from(tab).delete().eq('user_id',uid).in('id',lote);if(error)throw error;
    lote.forEach(id=>{delete snap[id];});gravaSnap();
  }
}
const CONTA_TROCOU=new Error('conta trocada durante o envio');
async function enviar(){
  if(!USER||!CR_OK)return;
  if(syncBusy){syncPend=true;return;}
  if(!navigator.onLine){setSync('offline, salvo no aparelho');return;}
  /* v10.155 (C1): o snapshot do localStorage só vale com a cópia deste aparelho aberta (COPIA_LIDA) ou depois de um
     download completo (BASE_OK). antes, um lançamento feito com a tela ainda vazia (cópia sumiu, rede lenta ou
     download falhou) enviava DELETE de tudo que estava no snapshot antigo. */
  if(!SNAP&&(COPIA_LIDA||BASE_OK))SNAP=lerSnap()||{};
  syncBusy=true;setSync('sincronizando…');
  try{
    /* sem base: baixa a nuvem e junta as edições deste aparelho (só upserts de ids novos/alterados, zero deletes) */
    if(!SNAP){await baixar({junta:true});if(!SNAP)throw new Error('sem base para sincronizar');}
  }catch(e){
    syncBusy=false;syncFalhas++;
    const espera=Math.min(300,15*Math.pow(2,syncFalhas-1));
    setSync('pendente, tenta de novo em '+espera+'s');agendaSync(espera*1000);
    if(syncPend){syncPend=false;}
    return;
  }
  /* v10.103: a conta é fixada no começo do envio; se sair ou trocar de conta no meio, o envio para sem gravar nada na outra */
  const uid=USER.id,S0=S,SN0=SNAP,ok=()=>!!USER&&USER.id===uid&&S===S0&&SNAP===SN0;
  try{
    for(const t of TABELAS){if(!ok())throw CONTA_TROCOU;await upTabela(t,S0[t],uid,ok);}
    APAGA_LIBERADO=false;
    let cfg=cfgNuvem(),hc=hashObj(cfg);
    if(SNAP.__cfg!==hc){
      /* v10.45: outro aparelho gravou os ajustes depois da nossa última leitura? junta antes de gravar:
         chaves que este aparelho não mexeu desde então ficam com a versão da nuvem (antes o último a gravar apagava o outro) */
      if(await juntaCfgRemoto()){cfg=cfgNuvem();hc=hashObj(cfg);}
      const at=new Date().toISOString();
      if(!ok())throw CONTA_TROCOU;
      const {error}=await sb.from('settings').upsert({user_id:uid,data:cfg,updated_at:at});
      if(error)throw error;
      SNAP.__cfg=hc;SNAP.__cfgAt=at;SNAP.__cfgK=cfgHashes(cfg);gravaSnap();
    }
    syncFalhas=0;setSync('sincronizado');
  }catch(e){
    if(e===CONTA_TROCOU){syncPend=false;return;}
    syncFalhas++;
    const espera=Math.min(300,15*Math.pow(2,syncFalhas-1));
    setSync('pendente, tenta de novo em '+espera+'s');
    agendaSync(espera*1000);
  }
  finally{syncBusy=false;if(syncPend){syncPend=false;agendaSync();}}
}
function temPendencia(){
  if(!USER||!SNAP)return false;
  for(const t of TABELAS){const snap=SNAP[t]||{},ids=new Set(),seg=new Set(SEGURA[t]||[]);for(const x of S[t]||[]){const id=String(x.id);ids.add(id);if(snap[id]!==hashObj(x))return true;}if(Object.keys(snap).some(id=>!ids.has(id)&&!seg.has(id)))return true;}
  return SNAP.__cfg!==hashObj(cfgNuvem());
}
async function baixar(o){
  /* v10.157: o PostgREST devolve no máximo 1000 linhas por pedido. sem .range(), quem tinha mais de 1000 lançamentos recebia
     só os 1000 primeiros (e o resto parecia apagado). agora lê em páginas de 1000, em ordem de id, até a última vir incompleta */
  const q=async t=>{const out=[];for(let de=0;de<500000;de+=1000){const r=await sb.from(t).select('id,data').eq('user_id',USER.id).order('id',{ascending:true}).range(de,de+999);if(r.error)return r;const d=r.data||[];out.push(...d);if(d.length<1000)break;}const vi=new Set();return {data:out.filter(r=>{const k=String(r.id);if(vi.has(k))return false;vi.add(k);return true;}),error:null};};
  const m0=MUDANCAS,uid0=USER.id;
  const [a,b,c,d,e,s]=await Promise.all([q('tx'),q('fiis'),q('metas'),q('cartoes'),q('bancos'),sb.from('settings').select('data,updated_at').eq('user_id',USER.id).maybeSingle()]);
  for(const r of [a,b,c,d,e,s])if(r.error)throw r.error;
  if(!USER||USER.id!==uid0)return; // trocou de conta no meio do download
  const res={tx:a,fiis:b,metas:c,cartoes:d,bancos:e};
  const nuvem={};TABELAS.forEach(t=>{nuvem[t]=res[t].data.map(r=>r.data).filter(Boolean);});
  /* v10.155 (C1): sem base (a cópia deste aparelho não abriu e nenhum download terminou), o que está na tela são só
     edições feitas desde a abertura. junta com a nuvem em vez de descartar: a nuvem é a base, as edições daqui entram
     como upserts (ids novos ou alterados) e nada é apagado. */
  const semBase=!SNAP&&!COPIA_LIDA&&!BASE_OK;
  if(semBase&&s.data&&(MUDANCAS!==m0||(o&&o.junta)||TABELAS.some(t=>(S[t]||[]).length))){juntaBase(res,s.data);return 'junta';}
  /* houve edição neste aparelho durante o download: a cópia baixada está velha. descarta e envia o que mudou aqui */
  if(MUDANCAS!==m0){agendaSync(0);return;}
  const vazioNuvem=!s.data&&TABELAS.every(t=>!nuvem[t].length);
  if(vazioNuvem){
    SNAP={};gravaSnap();BASE_OK=true;
    const temLocal=TABELAS.some(t=>(S[t]||[]).length);
    if(temLocal&&localStorage.getItem(OWNER_KEY)===USER.id){await enviar();return;}
    S=Object.assign(vazio(),{cfg:S.cfg});
    salvar();setSync('sincronizado');
    if(LEGADO&&TABELAS.some(t=>Array.isArray(LEGADO[t])&&LEGADO[t].length)){
      const leg=LEGADO;LEGADO=null;
      setTimeout(()=>confirma({titulo:'Importar dados deste aparelho?',texto:'Encontramos lançamentos salvos neste aparelho antes do login, sem conta vinculada. Importar para '+(USER.email||'esta conta')+'? Se não forem seus, toque em Cancelar e eles serão descartados.',ok:'Importar'},()=>{S=sanea(leg);salvar();render();toast('Dados importados');}),400);
    }
    return;
  }
  /* v10.73: a nuvem está igual ao que já está neste aparelho (mesmos registros, mesmos hashes e mesmas configurações):
     não reprocessa, não regrava o cache e não redesenha a tela. abrir o app fica bem mais leve com milhares de lançamentos. */
  if(SNAP&&s.data&&SNAP.__cfgAt&&SNAP.__cfgAt===(s.data.updated_at||'')&&localStorage.getItem(OWNER_KEY)===USER.id&&!temPendencia()&&TABELAS.every(t=>{
      const o=SNAP[t];if(!o)return false;const rows=res[t].data.filter(r=>r.data),n=Object.keys(o).length;
      if(rows.length!==n||(S[t]||[]).length!==n)return false;
      return rows.every(r=>o[String(r.id)]===hashObj(r.data));})){
    LEGADO=null;BASE_OK=true;setSync('sincronizado');
    try{if(rfRecalc())salvar();atualizaCDI();}catch(err){}
    return 'igual';
  }
  LEGADO=null;
  const cfgRem=(s.data&&s.data.data)||{};
  S=sanea(Object.assign({},nuvem,cfgRem,{cfg:Object.assign({tema:'escuro',accent:'verde'},cfgRem.cfg||{})}));zeraCfgH();
  SNAP={__cfg:s.data?hashObj(cfgNuvem()):''};
  if(s.data){SNAP.__cfgAt=s.data.updated_at||'';SNAP.__cfgK=cfgHashes(cfgNuvem());}
  TABELAS.forEach(t=>{SNAP[t]={};S[t].forEach(x=>{SNAP[t][String(x.id)]=hashObj(x);});});
  /* registros que o saneamento corrigiu ficam com hash diferente do que veio da nuvem e são reenviados */
  TABELAS.forEach(t=>{const orig={};res[t].data.forEach(r=>{if(r.data)orig[String(r.id)]=hashObj(r.data);});Object.keys(SNAP[t]).forEach(id=>{if(orig[id]!==SNAP[t][id])SNAP[t][id]='x';});});
  gravaSnap();BASE_OK=true;
  /* v10.155 (A1): a nuvem foi a base; ids segurados que voltaram não estão mais "sumidos" */
  TABELAS.forEach(t=>{if(SEGURA[t]){const ids=new Set(S[t].map(x=>String(x.id)));SEGURA[t]=SEGURA[t].filter(id=>!ids.has(id)&&id in SNAP[t]);if(!SEGURA[t].length)delete SEGURA[t];}});
  try{localStorage.setItem(OWNER_KEY,USER.id);}catch(err){}
  gravaLocal();
  setSync('sincronizado');
  /* v10.68: renda fixa recalcula com o que veio da nuvem */
  try{if(rfRecalc())salvar();atualizaCDI();}catch(err){}
}
/* v10.155 (C1): junta a nuvem (base) com as edições feitas neste aparelho sem base. nunca gera exclusão. */
function juntaBase(res,sd){
  const cfgRem=(sd&&sd.data)||{},loc=S;
  const nuvem={};TABELAS.forEach(t=>{nuvem[t]=res[t].data.map(r=>r.data).filter(Boolean);});
  const junta={};
  TABELAS.forEach(t=>{const m=new Map(nuvem[t].map(x=>[String(x.id),x]));(loc[t]||[]).forEach(x=>{m.set(String(x.id),x);});junta[t]=[...m.values()];});
  /* ajustes: a nuvem vence; chaves que só existem aqui ficam; listas com id (fixas, empréstimos, bens, passivos) viram união */
  const cl=cfgNuvem(),cr=Object.assign({},cfgRem);
  ['fixas','emprestimos','bens','passivos'].forEach(k=>{const r=Array.isArray(cr[k])?cr[k]:[],l=Array.isArray(cl[k])?cl[k]:[];const ids=new Set(r.map(x=>x&&String(x.id)));cr[k]=r.concat(l.filter(x=>x&&x.id!=null&&!ids.has(String(x.id))));});
  const cfg=Object.assign({},cl.cfg||{},cfgRem.cfg||{});
  {const a=(cl.cfg||{}).pagDesde,b=(cfgRem.cfg||{}).pagDesde;if(DATA_OK.test(a||'')&&DATA_OK.test(b||''))cfg.pagDesde=a<b?a:b;} // v10.157: só volta no tempo
  LEGADO=null;
  S=sanea(Object.assign({},cr,junta,{cfg:Object.assign({tema:'escuro',accent:'verde'},cfg)}));zeraCfgH();
  /* snapshot = o que está na nuvem; o que veio daqui (novo ou diferente) fica marcado para subir */
  const remS=sanea(Object.assign({},cfgRem,nuvem,{cfg:Object.assign({tema:'escuro',accent:'verde'},cfgRem.cfg||{})}));
  SNAP={};
  TABELAS.forEach(t=>{SNAP[t]={};const orig={};res[t].data.forEach(r=>{if(r.data)orig[String(r.id)]=hashObj(r.data);});S[t].forEach(x=>{const id=String(x.id);if(id in orig)SNAP[t][id]=orig[id]===hashObj(x)?orig[id]:'x';});});
  const hr=hashObj({cats:remS.cats,catIcons:remS.catIcons||{},catCores:remS.catCores||{},orc:remS.orc,orcMes:remS.orcMes||{},bens:remS.bens||[],passivos:remS.passivos||[],patHist:remS.patHist||{},cfg:remS.cfg,cfgTs:remS.cfgTs||{},fixas:remS.fixas||[],emprestimos:remS.emprestimos||[],gerados:remS.gerados||{}});
  SNAP.__cfg=hashObj(cfgNuvem())===hr?hr:'';SNAP.__cfgAt=sd.updated_at||'';SNAP.__cfgK=cfgHashes(cfgNuvem());
  gravaSnap();BASE_OK=true;
  try{localStorage.setItem(OWNER_KEY,USER.id);}catch(err){}
  gravaLocal();
  try{errRegistra('aviso','sincronização sem base: edições locais juntadas à nuvem (sem exclusões)','','');}catch(e){}
  if(temPendencia())agendaSync(0);else setSync('sincronizado');
  setTimeout(()=>{if(!document.querySelector('#modal.on')){try{applyCfg();render();}catch(e){}}},0);
}
/* v10.155 (A1): a trava segurou exclusões. baixa a nuvem (os dados voltam para este aparelho) e pergunta:
   "Restaurar da nuvem" (padrão, nada é apagado) ou "Confirmar exclusão de N itens". */
const TRAVA_NOME={tx:['lançamento','lançamentos'],fiis:['investimento','investimentos'],metas:['meta','metas'],cartoes:['cartão','cartões'],bancos:['conta','contas']};
function travaAgenda(ms){clearTimeout(TRAVA_T);TRAVA_T=setTimeout(travaResolve,ms==null?400:ms);}
async function travaResolve(){
  if(!USER||!Object.keys(SEGURA).length)return;
  if(syncBusy||document.querySelector('#modal.on')||!navigator.onLine){travaAgenda(1500);return;}
  const seg=JSON.parse(JSON.stringify(SEGURA));
  syncBusy=true;setSync('sincronizando…');
  try{await baixar();}catch(e){syncBusy=false;setSync('pendente, tenta de novo em 15s');travaAgenda(15000);return;}
  finally{syncBusy=false;if(syncPend){syncPend=false;agendaSync();}}
  try{applyCfg();render();}catch(e){}
  SEGURA={};
  /* só pergunta sobre o que de fato voltou da nuvem (se outro aparelho apagou, não há o que restaurar) */
  const volt={};let n=0;TABELAS.forEach(t=>{if(!seg[t])return;const ids=new Set(S[t].map(x=>String(x.id)));const v=seg[t].filter(id=>ids.has(id));if(v.length){volt[t]=v;n+=v.length;}});
  if(!n)return;
  const partes=TABELAS.filter(t=>volt[t]).map(t=>volt[t].length+' '+TRAVA_NOME[t][volt[t].length>1?1:0]);
  const lista=partes.length>1?partes.slice(0,-1).join(', ')+' e '+partes[partes.length-1]:partes[0];
  try{errRegistra('aviso','trava de exclusão em massa segurou '+n+' itens','','');}catch(e){}
  confirma({titulo:'Protegemos seus dados',texto:lista+' sumiram deste aparelho de uma vez. Para sua segurança, nada foi apagado da nuvem e eles já voltaram para cá. Se você quis mesmo apagar, confirme a exclusão.',
    ok:'Restaurar da nuvem',alt:'Confirmar exclusão de '+n+' '+(n>1?'itens':'item'),altPerigo:true,semNao:true,
    altCb:()=>{confirma({titulo:'Apagar '+n+' '+(n>1?'itens':'item')+'?',texto:'Vai apagar '+lista+' deste aparelho e da nuvem, em todos os aparelhos. Não dá para desfazer.',ok:'Apagar',perigo:true},()=>{
      TABELAS.forEach(t=>{if(volt[t]){const del=new Set(volt[t]);S[t]=S[t].filter(x=>!del.has(String(x.id)));}});
      APAGA_LIBERADO=true;salvar();render();toast(n+(n>1?' itens apagados':' item apagado'));});},
    },()=>toast('Tudo certo: seus dados foram restaurados da nuvem'));
}
window.addEventListener('online',()=>{if(USER)enviar();});
/* ao voltar para a aba: envia o que estiver pendente e puxa o que outro aparelho mudou */
let ultimaPuxada=0;
async function puxar(){
  if(!USER||syncBusy||!navigator.onLine||Date.now()-ultimaPuxada<20000)return;
  if(document.querySelector('#modal.on'))return;
  ultimaPuxada=Date.now();
  try{
    if(temPendencia()){await enviar();if(temPendencia())return;}
    syncBusy=true;setSync('sincronizando…');
    const igual=(await baixar())==='igual';
    const ger=geraRecorrentes();if(ger)salvar();
    if(radarMigra())salvar(); // v10.155
    if(!igual||ger)render();
  }catch(e){setSync('offline, usando cópia deste aparelho');}
  finally{syncBusy=false;}
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')puxar();});


/* ---------- utilidades ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* ocultar valores: guardado só neste aparelho; com ele ligado todo valor em R$ aparece como R$ ••••• */
let OCULTO=(()=>{try{return localStorage.getItem('gv-oculto')==='1';}catch(e){return false;}})();
let CATS_ABERTAS=false;
/* v10.65: um formatador só (toLocaleString criava um novo a cada valor, caro com milhares de lançamentos) */
const FMT_BRL=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}),FMT_NUM=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brl=v=>OCULTO?'R$ •••••':FMT_BRL.format(Number(v)||0);
const num=v=>FMT_NUM.format(Number(v)||0);
/* tags: minúsculas, sem #, até 8 por lançamento */
function limpaTags(x){
  const a=Array.isArray(x)?x:String(x==null?'':x).split(/[,;#]/);const out=[];
  a.forEach(s=>{const t=String(s==null?'':s).toLowerCase().replace(/[<>"'`]/g,'').replace(/\s+/g,' ').trim().slice(0,30);if(t&&!out.includes(t)&&out.length<8)out.push(t);});
  return out;
}
/* comprovantes no Supabase Storage (bucket privado "comprovantes", pasta = id do usuário) */
const ANX_PATH=/^[A-Za-z0-9-]{1,64}\/[A-Za-z0-9_|:.-]{1,90}\/[A-Za-z0-9_.-]{1,140}$/;
function limpaAnexos(x){
  return (Array.isArray(x)?x:[]).filter(a=>a&&ANX_PATH.test(String(a.p||''))).slice(0,10).map(a=>({p:String(a.p),n:String(a.n||'arquivo').replace(/[<>"'`]/g,'').slice(0,80),t:String(a.t||'').replace(/[^\w./+-]/g,'').slice(0,40),s:Math.max(0,Math.min(6e6,parseInt(a.s,10)||0))}));
}
const ANX_TIPOS=['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'];
function nomeSeguro(n){return String(n||'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9_.-]+/g,'-').replace(/^-+|-+$/g,'').slice(-80)||'arquivo';}
function reduzImagem(file){
  return new Promise(res=>{
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size<900e3)return res(file);
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{const k=Math.min(1,1600/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);
      c.toBlob(b=>res(b&&b.size<file.size?new File([b],file.name.replace(/\.\w+$/,'')+'.jpg',{type:'image/jpeg'}):file),'image/jpeg',.82);};
    img.onerror=()=>{URL.revokeObjectURL(url);res(file);};img.src=url;
  });
}
async function anexar(txId,file){
  const t=S.tx.find(x=>x.id===txId);if(!t)return 'Lançamento não encontrado.';
  if(!USER)return 'Entre na sua conta para guardar comprovantes.';
  if((t.anexos||[]).length>=10)return 'Limite de 10 comprovantes por lançamento.';
  const tipo=file.type||(/\.pdf$/i.test(file.name)?'application/pdf':'');
  if(!ANX_TIPOS.includes(tipo))return 'Envie uma foto (JPG, PNG, WEBP, HEIC) ou PDF.';
  const f=await reduzImagem(file);
  if(f.size>5*1024*1024)return 'Arquivo maior que 5 MB.';
  const path=USER.id+'/'+String(t.id).replace(/[^A-Za-z0-9_|:.-]/g,'').slice(0,90)+'/'+uid()+'-'+nomeSeguro(f.name);
  const {error}=await sb.storage.from('comprovantes').upload(path,f,{contentType:f.type||tipo,upsert:false});
  if(error)return 'Não foi possível enviar o comprovante.';
  if(!t.anexos)t.anexos=[];t.anexos.push({p:path,n:String(file.name).slice(0,80),t:f.type||tipo,s:f.size});
  salvar();return '';
}
async function removeArquivos(paths){paths=paths.filter(p=>ANX_PATH.test(p));if(!paths.length||!USER)return;try{await sb.storage.from('comprovantes').remove(paths);}catch(e){}}
function anexosDe(lista){return lista.reduce((a,t)=>a.concat((t.anexos||[]).map(x=>x.p)),[]);}
async function abreAnexo(p){
  const w=window.open('','_blank');
  const {data,error}=await sb.storage.from('comprovantes').createSignedUrl(p,120);
  if(error||!data||!data.signedUrl){if(w)w.close();return toast('Não foi possível abrir o comprovante',true);}
  if(w)w.location=data.signedUrl;else location.href=data.signedUrl;
}
function telaAnexos(txId){
  const t=S.tx.find(x=>x.id===txId);if(!t)return;
  const box=$('#modal');const kb=s=>s>=1048576?(s/1048576).toFixed(1).replace('.',',')+' MB':Math.max(1,Math.round(s/1024))+' KB';
  box.innerHTML=`<div class="sheet"><div class="sh-head"><h3>Comprovantes</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <p class="small" style="margin:0 0 10px">${esc(t.descricao||t.categoria)} · ${brl(t.valor)} · ${fmtData(t.data)}</p>
    <div class="anxList">${(t.anexos||[]).map((a,i)=>`<div class="anxIt"><span class="anxIc">${a.t==='application/pdf'?'PDF':'IMG'}</span><span class="anxN">${esc(a.n)}<small>${kb(a.s)}</small></span><button class="btn2 sm" data-act="anx-ver" data-id="${i}">ver</button><button class="btn2 sm danger" data-act="anx-del" data-id="${i}">remover</button></div>`).join('')||'<p class="vazio">nenhum comprovante ainda.</p>'}</div>
    ${USER?`<label class="btn full anxAdd">${I('plus')} adicionar foto ou PDF<input type="file" id="anxIn" accept="image/*,application/pdf" hidden></label><p class="small" style="margin:8px 0 0">guardado no seu espaço privado · até 5 MB · fotos grandes são reduzidas</p>`:'<p class="aviso warn">entre na sua conta para guardar comprovantes.</p>'}
  </div>`;
  box.classList.add('on');box.dataset.tx=txId;
  const inp=$('#anxIn');if(inp)inp.onchange=async()=>{const f=inp.files&&inp.files[0];if(!f)return;const lb=inp.closest('label');lb.classList.add('busy');lb.firstChild&&(lb.style.opacity='.6');
    const err=await anexar(txId,f);if(err)toast(err,true);else toast('Comprovante guardado');render();telaAnexos(txId);};
}
function todasTags(){const s=new Set();S.tx.forEach(t=>(t.tags||[]).forEach(g=>s.add(g)));return [...s].sort((a,b)=>a.localeCompare(b,'pt-BR'));}
function subsDe(cat){const s=new Set();S.tx.forEach(t=>{if(t.sub&&(!cat||t.categoria===cat))s.add(t.sub);});return [...s].sort((a,b)=>a.localeCompare(b,'pt-BR'));}
function parseBR(s){
  if(typeof s==='number')return s;
  s=String(s==null?'':s).replace(/R\$|\s/g,'');
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,''); // "25.000" e "1.200" são milhares no padrão brasileiro
  const n=parseFloat(s);return isNaN(n)?0:n;
}
const pad=n=>String(n).padStart(2,'0');
function isoDe(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
const hojeISO=()=>isoDe(new Date());
const mesAtual=()=>hojeISO().slice(0,7);
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const fmtData=s=>{const [y,m,d]=s.split('-');return d+'/'+m+'/'+y;};
const fmtHora=iso=>{const d=new Date(iso);return isNaN(d)?'':pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+pad(d.getHours())+':'+pad(d.getMinutes());};
const fmtDate=d=>pad(d.getDate())+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear();
const cor=v=>getComputedStyle(document.body).getPropertyValue(v).trim();

let toastT;
function toast(m,erro){
  const t=$('#toast');
  t.className=erro?'err':'';
  t.innerHTML=(erro?'':'<span class="ck"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>')+'<span>'+esc(m)+'</span>';
  t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),2400);
}

/* ---------- cálculos ---------- */
/* dinheiro: somas feitas em centavos inteiros para não acumular erro de ponto flutuante */
const cents=v=>Math.round((Number(v)||0)*100);
const somaC=(arr,f)=>arr.reduce((a,x)=>a+cents(f(x)),0)/100;
/* status do lançamento: sem status (dados antigos) = pago.
   só "pago" mexe em saldo, orçamento, relatório e fatura. "previsto" entra apenas na previsão; "cancelado" não conta em nada. */
const efetivo=t=>!t.status||t.status==='pago';
/* v10.81: lançamento dividido entre categorias. t.split=[{cat,v}] (2 a 10 partes, soma exata em centavos = t.valor).
   t.categoria guarda a maior parte (listas, ícone, regras antigas). totais por categoria usam as partes; o total do lançamento não muda. */
const SPLIT_MAX=10;
const temSplit=t=>!!(t&&Array.isArray(t.split)&&t.split.length>=2);
function partesTx(t){return temSplit(t)?t.split.map(p=>({cat:p.cat,c:cents(p.v)})):[{cat:t.categoria||'Outros',c:cents(t.valor)}];}
function valorNaCat(t,cat){let c=0;for(const p of partesTx(t))if(p.cat===cat)c+=p.c;return c/100;}
function temCat(t,cat){return t.categoria===cat||(temSplit(t)&&t.split.some(p=>p.cat===cat));}
/* divide um total (centavos) na proporção das partes; o resto vai para as maiores partes; soma sempre exata */
function rateiaSplit(split,totC){
  const n=split.length,base=split.reduce((a,p)=>a+cents(p.v),0);if(!(base>0)||!(totC>=n))return null;
  /* proporcional, sobras para as maiores frações; se alguma parte zerar, recebe 1 centavo da maior (nunca zera) */
  const out=split.map((p,i)=>{const x=cents(p.v)*totC/base;return {cat:p.cat,c:Math.floor(x),r:x-Math.floor(x),i};});
  let falta=totC-out.reduce((a,o)=>a+o.c,0);
  out.slice().sort((a,b)=>b.r-a.r||b.c-a.c||a.i-b.i).forEach(o=>{if(falta>0){o.c++;falta--;}});
  out.forEach(o=>{if(o.c<=0){const m=out.reduce((x,y)=>y.c>x.c?y:x);m.c--;o.c++;}});
  return out.map(o=>({cat:o.cat,v:o.c/100}));
}
/* confere uma divisão: 2..10 partes, valores > 0, categorias diferentes, soma = total. devolve a lista limpa ou uma mensagem */
function confereSplit(parts,valor){ // roda também no saneamento da abertura: não usa constantes declaradas mais abaixo
  const ct=v=>Math.round((Number(v)||0)*100),fm=c=>'R$ '+(c/100).toFixed(2).replace('.',','),MAX=10;
  const L=(Array.isArray(parts)?parts:[]).map(p=>({cat:str(p&&p.cat,60).trim(),v:c2(Math.abs(n0(p&&p.v)))}));
  if(L.length<2)return 'Divida em pelo menos 2 categorias.';
  if(L.length>MAX)return 'No máximo '+MAX+' partes.';
  if(L.some(p=>!p.cat))return 'Escolha a categoria de cada parte.';
  if(L.some(p=>!(ct(p.v)>0)))return 'Cada parte precisa de um valor maior que zero.';
  if(new Set(L.map(p=>p.cat)).size!==L.length)return 'Cada categoria só pode aparecer uma vez.';
  const soma=L.reduce((a,p)=>a+ct(p.v),0),tot=ct(valor);
  if(soma!==tot){const d=tot-soma;return 'As partes somam '+fm(soma)+(d>0?', faltam ':', passaram ')+fm(Math.abs(d))+' para fechar o total.';}
  return L;
}
function maiorParte(L){return L.reduce((m,p)=>cents(p.v)>cents(m.v)?p:m,L[0]).cat;}
function statusTx(t){if(t.status==='cancelado')return 'cancelado';if(t.status==='previsto')return t.data<hojeISO()?'atrasado':'previsto';return 'pago';}
const ST_TX={previsto:['previsto','warn'],atrasado:['atrasado','over'],cancelado:['cancelado','mut']};
/* ---------- v10.80: dia trabalhado (competência) separado do dia em que o dinheiro entra ----------
   t.data continua sendo SEMPRE o dia do recebimento: saldo, previsão, planejamento, saldo dia a dia, "atrasado", alertas e banco usam só ela.
   t.trab (opcional, receita) guarda o dia trabalhado: aparece na lista e permite ver as receitas por mês trabalhado. */
const TRAB_CATS=['Horas extras','Salário','Freelance','Bônus/Promoções'];
function trabCat(c){return TRAB_CATS.includes(c)||/hora|extra|salari|freela|plantao|comiss/.test(norm(c));}
function mesesEntre(a,b){return (+b.slice(0,4)-+a.slice(0,4))*12+(+b.slice(5,7)-+a.slice(5,7));}
function diaNoMes(m,dia){const u=new Date(+m.slice(0,4),+m.slice(5,7),0).getDate();return m+'-'+pad(Math.min(Math.max(1,dia),u));}
/* "Recebo em" sugerido pelo padrão dos recebimentos anteriores da mesma categoria (de preferência mesma descrição):
   com dia trabalhado guardado, repete a distância (ex.: dia 5 do mês seguinte); sem ele, usa o dia do mês do último recebimento, no mês seguinte.
   previstos sem dia trabalhado não servem de padrão (podem ser justamente os lançados no dia trabalhado). */
function sugereReceb(trab,cat,desc,exc){
  if(!DATA_OK.test(trab||'')||!cat)return null;
  const k=desc?chaveRegra(desc):'';
  const L=S.tx.filter(t=>t.id!==exc&&t.tipo==='receita'&&t.categoria===cat&&t.status!=='cancelado'&&DATA_OK.test(t.data||'')&&(t.trab||t.status!=='previsto'));
  if(!L.length)return null;
  const pt=t=>(t.trab?2:0)+(k&&t.descricao&&chaveRegra(t.descricao)===k?1:0);
  L.sort((a,b)=>pt(b)-pt(a)||b.data.localeCompare(a.data));
  const r=L[0],dia=+r.data.slice(8,10),md=r.trab?Math.max(0,mesesEntre(r.trab,r.data)):1;
  let m=mesAdd(trab.slice(0,7),md),d=diaNoMes(m,dia);
  if(d<=trab){m=mesAdd(m,1);d=diaNoMes(m,dia);}
  return {data:d,ref:r,dia,md};
}
function sugTxt(sg){return 'dia '+sg.dia+(sg.md===0?' do mesmo mês':sg.md===1?' do mês seguinte':', '+sg.md+' meses depois')+', como '+(sg.ref.trab?'da última vez':'o último recebimento');}
function txDatasHTML(t){return t.trab&&t.tipo==='receita'?'<span class="txDw">trabalhado</span> '+fmtDataCurta(t.trab)+' · <span class="txDw">'+(t.status==='previsto'?'recebe':'recebeu')+'</span> '+fmtDataCurta(t.data):fmtDataCurta(t.data);}
function txDatas(t){return t.trab&&t.tipo==='receita'?'trabalhado '+fmtDataCurta(t.trab)+' · '+(t.status==='previsto'?'recebe ':'recebeu ')+fmtDataCurta(t.data):fmtDataCurta(t.data);}
/* receitas previstas com data que já passou: talvez lançadas no dia trabalhado */
function receitasAtrasadas(){const hj=hojeISO();return S.tx.filter(t=>t.tipo==='receita'&&t.status==='previsto'&&t.data<hj&&!t.emp).sort((a,b)=>a.data.localeCompare(b.data));}
function trabDicaHTML(L,extra){L=L||receitasAtrasadas();if(!L.length)return '';
  return `<div class="trabDica${extra?' '+extra:''}"><span class="trabDicaI">${I('calendar')}</span><span class="trabDicaT"><b>Ainda não recebeu? Informe quando vai cair</b><small>${L.length===1?esc(nomeTx(L[0]).n||L[0].descricao||L[0].categoria)+' está como atrasada desde '+fmtDataCurta(L[0].data):L.length+' receitas previstas com data que já passou'}. A data lançada vira o dia trabalhado.</small></span><button type="button" class="btn2 sm" data-act="trab-lote">informar</button></div>`;}
/* visão de competência: receitas de um mês trabalhado (dia trabalhado; sem ele, o próprio dia do recebimento), por categoria */
function compMes(m){
  const C={};
  S.tx.forEach(t=>{if(t.tipo!=='receita'||t.status==='cancelado'||t.emp)return;const w=t.trab||t.data;if(!w||w.slice(0,7)!==m)return;
    const c=C[t.categoria]||(C[t.categoria]={cat:t.categoria,tot:0,n:0,trab:0,rec:{},prev:0});
    const v=cents(t.valor);c.tot+=v;c.n++;if(t.trab)c.trab++;const rm=t.data.slice(0,7);c.rec[rm]=(c.rec[rm]||0)+v;if(t.status==='previsto')c.prev+=v;});
  return Object.values(C).map(c=>Object.assign(c,{tot:c.tot/100,prev:c.prev/100,rec:Object.fromEntries(Object.entries(c.rec).map(([k,v])=>[k,v/100]))})).sort((a,b)=>b.tot-a.tot);
}
function nomeMesMin(m){return MESES_LONGO[+m.slice(5,7)-1].toLowerCase();}
function compRecTxt(c,m){const ks=Object.keys(c.rec).sort();const tudo=c.prev>=c.tot-0.004,nada=c.prev<0.005;const v=tudo?'recebe':nada?'recebeu':'recebe';
  if(ks.length===1&&!tudo&&!nada)return brl(c.tot-c.prev)+' recebido · '+brl(c.prev)+' a receber em '+nomeMesMin(ks[0]);
  if(ks.length===1)return ks[0]===m?(nada?'recebeu no mesmo mês':'recebe no mesmo mês'):v+' em '+nomeMesMin(ks[0])+(ks[0].slice(0,4)!==m.slice(0,4)?' de '+ks[0].slice(0,4):'');
  return ks.map(k=>brl(c.rec[k])+' em '+nomeMesMin(k)).join(' · ');}
const noPer=(d,m)=>typeof m==='string'?d.startsWith(m):(d>=m.ini&&d<=m.fim);
/* v10.65: memória de cálculo que vive só durante um render (e o desenho que vem logo depois).
   a mesma soma pedida várias vezes na mesma tela é feita uma vez; nada fica velho porque é zerada a cada render e a cada salvar. */
let MEMO=null;
function memo(k,f,clonar){if(!MEMO)return f();if(!(k in MEMO))MEMO[k]=f();const v=MEMO[k];return clonar&&v&&typeof v==='object'?JSON.parse(JSON.stringify(v)):v;}
function txPorMes(){return memo('__txm',()=>{const o={};for(const t of S.tx){if(!t.data)continue;const m=t.data.slice(0,7);(o[m]||(o[m]=[])).push(t);}return o;});}
/* lançamentos que podem cair no período: com memória, só os meses do período; sem, a lista toda (o filtro final continua o mesmo) */
function txDoPer(m){
  if(!MEMO)return S.tx;
  const ix=txPorMes();
  if(typeof m==='string')return m.length>=7?(ix[m.slice(0,7)]||[]):S.tx;
  if(!m||!m.ini||!m.fim||m.ini.length<7||m.fim.length<7)return S.tx;
  const a=m.ini.slice(0,7),b=m.fim.slice(0,7);if(a>b)return [];
  const out=[];Object.keys(ix).forEach(k=>{if(k>=a&&k<=b)for(const t of ix[k])out.push(t);});return out;
}
function somaMes(m,tipo,cat,comCartao){
  return memo('sm|'+(typeof m==='string'?m:m.ini+'>'+m.fim)+'|'+tipo+'|'+(cat||'')+'|'+(comCartao?1:0),()=>
    somaC(txDoPer(m).filter(t=>efetivo(t)&&noPer(t.data,m)&&t.tipo===tipo&&(tipo!=='despesa'||(comCartao?!t.faturaKey:!t.cartao))&&(!cat||temCat(t,cat))),t=>cat?valorNaCat(t,cat):t.valor));
}
// dinheiro em espécie só movimenta uma conta do tipo Dinheiro (antes caía na conta principal, misturando espécie com banco)
/* contas arquivadas: somem das escolhas (menos a já selecionada), continuam no saldo, histórico e relatórios */
function bancosAtivos(sel){return S.bancos.filter(b=>!b.arq||(sel&&b.id===sel));}
/* v10.51: cartão arquivado também some das escolhas; faturas e parcelas seguem valendo */
function cartoesAtivos(sel){return (S.cartoes||[]).filter(c=>!c.arq||(sel&&c.id===sel));}
function contaDinheiroId(){const d=S.bancos.find(b=>b.tipo==='Dinheiro');return d?d.id:null;}
function contaDoLanc(t){
  if(t.tipo==='despesa'){if(t.forma==='pix'||t.forma==='boleto')return t.conta||null;if(t.forma==='dinheiro')return contaDinheiroId();return null;}
  if(t.tipo==='receita'){if(t.forma==='pix')return t.conta||null;if(t.forma==='dinheiro')return contaDinheiroId();}
  return null;
}
function saldoBanco(b){return memo('sb|'+b.id+'|'+b.saldo+'|'+b.saldoData+'|'+(b.saldoFecha?1:0),()=>saldoBanco0(b));}
function saldoBanco0(b){
  let s=cents(b.saldo);
  /* saldoFecha: o saldo informado pelo banco já inclui os lançamentos do próprio dia QUE VIERAM DO BANCO.
     v10.52: lançamento manual feito hoje (sem origem no banco) também entra no saldo do dia. */
  const antes=(d,t)=>b.saldoData&&(d<b.saldoData||(b.saldoFecha&&d===b.saldoData&&(!t||(t.origem==='banco'||t.pluggyId))));
  S.fiis.forEach(f=>(f.ops||[]).forEach(o=>{if(o.tipo==='compra'&&o.conta===b.id&&o.data&&!antes(o.data))s-=cents(o.qtd*o.preco)+cents(o.taxas);}));
  S.tx.forEach(t=>{
    if(t.faturaKey)pagsFatura(t).forEach(p=>{if(p.conta===b.id&&p.data&&!antes(p.data,p))s-=cents(p.valor);}); // cada pagamento na sua data e conta
    if(!efetivo(t))return;
    if(!t.data||antes(t.data,t))return;
    if(t.tipo==='transf'){if(t.de==='b:'+b.id)s-=cents(t.valor);if(t.para==='b:'+b.id)s+=cents(t.valor);return;}
    if(contaDoLanc(t)!==b.id)return;
    s+=t.tipo==='receita'?cents(t.valor):-cents(t.valor);
  });
  return s/100;
}
/* limite comprometido: compras cuja fatura ainda não venceu (ciclo aberto + fatura fechada a pagar).
   antes somava todas as compras desde sempre, então o limite nunca era liberado. */
function usadoCartaoTotal(c){return memo('uc|'+c.id+'|'+c.fechamento+'|'+c.vencimento+'|'+c.bancoData+'|'+c.bancoUsado,()=>usadoCartaoTotal0(c));}
function usadoCartaoTotal0(c){
  if(c.bancoData&&c.bancoUsado!=null&&isFinite(c.bancoUsado))return c.bancoUsado; // o banco informa o usado de verdade
  const hj=hojeISO();let tot=0;
  /* v10.55: faturas indexadas uma vez (antes: uma busca na lista inteira para cada compra) */
  const FAT={},RF={};S.tx.forEach(x=>{if(x.faturaKey&&!FAT[x.faturaKey])FAT[x.faturaKey]=x;});
  S.tx.forEach(t=>{
    if(t.cartao!==c.id||!(t.tipo==='despesa'||t.tipo==='transf')||!t.data||!efetivo(t))return;
    const f=fechamentoDe(c,t.data);
    if(f.fecha>hj){tot+=cents(t.valor);return;} // ciclo aberto ou parcela futura: limite reservado
    const fat=FAT['fat|'+c.id+'|'+f.fecha.slice(0,7)];
    if(!fat){if(S.gerados&&S.gerados['fat|'+c.id+'|'+f.fecha.slice(0,7)]==='del')return; // fatura excluída: não prende o limite para sempre
      if(!S.cfg.pagDesde||f.vence>=S.cfg.pagDesde)tot+=cents(t.valor);return;}
    const rk=fat.faturaKey;if(!(rk in RF))RF[rk]=restanteFatura(fat);
    if(RF[rk]>0&&!(fat.pagoValor>0))tot+=cents(t.valor);
  });
  // pagamento parcial: conta só o que falta
  S.tx.forEach(t=>{if(t.faturaKey&&t.faturaKey.indexOf('fat|'+c.id+'|')===0&&t.pagoValor>0)tot+=cents(restanteFatura(t));});
  return tot/100;
}
/* v10.42: com contas cadastradas, o saldo total é o dinheiro nas contas (igual à aba Bancos e ao Patrimônio),
   mais lançamentos pagos que não caem em nenhuma conta. Fatura só sai do saldo quando é paga. */
function saldoTotal(){return memo('st',()=>saldoTotal0());}
function saldoTotal0(){
  if(S.bancos&&S.bancos.length){
    let s=S.bancos.reduce((a,b)=>a+cents(saldoBanco(b)),0);
    S.tx.forEach(t=>{
      if(t.faturaKey){pagsFatura(t).forEach(p=>{if(!(p.conta&&S.bancos.some(b=>b.id===p.conta)))s-=cents(p.valor);});return;}
      if(t.emp&&t.empDir==='perdao')return; // v10.78: perdão não move dinheiro
      if(t.tipo==='transf'&&t.emp&&efetivo(t)){const ld=(t.empDir==='in'?t.para:t.de)||'';if(!(ld&&S.bancos.some(b=>'b:'+b.id===ld)))s+=empDelta(t);return;}
      if(!efetivo(t)||t.tipo==='transf'||t.cartao)return;
      const c=contaDoLanc(t);if(c&&S.bancos.some(b=>b.id===c))return;
      s+=t.tipo==='receita'?cents(t.valor):-cents(t.valor);
    });
    return s/100;
  }
  return saldoTotalLanc();
}
/* sem contas cadastradas: mesma regra, fatura só sai do saldo pelo que foi pago */
function saldoTotalLanc(){
  return S.tx.reduce((a,t)=>a+(t.faturaKey?-cents(t.pagoValor):t.emp&&efetivo(t)?empDelta(t):!efetivo(t)||t.tipo==='transf'?0:t.tipo==='receita'?cents(t.valor):(t.cartao?0:-cents(t.valor))),0)/100;
}
/* divide o valor da fatura pelas categorias das compras do ciclo, proporcional, em centavos exatos */
function catsFatura(ft){return memo('cf|'+ft.faturaKey+'|'+ft.valor,()=>catsFatura0(ft),true);}
function catsFatura0(ft){
  const p=String(ft.faturaKey).split('|'),c=S.cartoes.find(x=>x.id===p[1]);if(!c)return null;
  const tot=cents(ft.valor);if(!tot)return null;
  const mp={};let soma=0;
  S.tx.forEach(t=>{if(t.cartao!==c.id||t.tipo!=='despesa'||!t.data||!efetivo(t))return;if(fechamentoDe(c,t.data).fecha.slice(0,7)!==p[2])return;partesTx(t).forEach(p=>{mp[p.cat]=(mp[p.cat]||0)+p.c;soma+=p.c;});});
  if(soma<=0)return null;
  const out={};let usado=0,maior=null;
  Object.keys(mp).forEach(k=>{out[k]=Math.floor(mp[k]*tot/soma);usado+=out[k];if(!maior||mp[k]>mp[maior])maior=k;});
  out[maior]+=tot-usado;
  return out;
}
function despesasPorCat(m){return memo('dc|'+(typeof m==='string'?m:m.ini+'>'+m.fim),()=>despesasPorCat0(m),true);}
function despesasPorCat0(m){
  const mp={};
  txDoPer(m).forEach(t=>{if(!(efetivo(t)&&t.tipo==='despesa'&&!t.cartao&&noPer(t.data,m)))return;
    /* v10.54: a fatura entra nas categorias das compras dela (antes aparecia tudo como "Cartão") */
    if(t.faturaKey&&t.categoria==='Cartão'){const fc=catsFatura(t);if(fc){Object.keys(fc).forEach(k=>{mp[k]=(mp[k]||0)+fc[k];});return;}}
    partesTx(t).forEach(p=>{mp[p.cat]=(mp[p.cat]||0)+p.c;});});
  /* v10.78: duas categorias do mesmo gráfico nunca com a mesma cor (com muitas categorias a paleta repetia) */
  const L=Object.keys(mp).map(c=>({l:c,v:mp[c]/100})).sort((a,b)=>b.v-a.v),usou=new Set();
  L.forEach(s=>{let c=corCat(s.l);if(usou.has(c)&&!catCor(s.l)){const livre=PAL.find(x=>!usou.has(x));if(livre)c=livre;}usou.add(c);s.color=c;});
  return L;
}
function barData(){
  const d=new Date(),out=[];
  let first=null;S.tx.forEach(t=>{if(!first||t.data<first)first=t.data;});
  if(!first)return out;
  const fm=first.slice(0,7),per=periodo(),nM=per.meses>=3?per.meses:6,fimP=per.meses>=3?new Date(+per.fim.slice(0,4),+per.fim.slice(5,7)-1,1):d;
  for(let k=nM-1;k>=0;k--){
    const x=new Date(fimP.getFullYear(),fimP.getMonth()-k,1);
    const m=x.getFullYear()+'-'+pad(x.getMonth()+1);
    if(m<fm)continue;
    out.push({l:MESES[x.getMonth()],r:somaMes(m,'receita'),d:somaMes(m,'despesa')});
  }
  return out;
}
/* ---------- ativos: tipos, listas, cotação cripto ---------- */
const TIPOS=[{k:'todos',l:'Todos'},{k:'fii',l:'FIIs'},{k:'acao',l:'Ações'},{k:'etf',l:'ETFs'},{k:'bdr',l:'BDRs'},{k:'rf',l:'Renda fixa'},{k:'cripto',l:'Cripto'}];
const TIPO_L={fii:'FII',acao:'Ação',etf:'ETF',bdr:'BDR',rf:'Renda fixa',cripto:'Cripto'};
let FTAB='todos';
const tipoOf=f=>f.tipo||'fii';
const B3_LIST=[
 {t:'HGLG11',n:'CSHG Logística',tipo:'fii'},{t:'KNRI11',n:'Kinea Renda Imobiliária',tipo:'fii'},
 {t:'XPML11',n:'XP Malls',tipo:'fii'},{t:'MXRF11',n:'Maxi Renda',tipo:'fii'},
 {t:'VISC11',n:'Vinci Shopping Centers',tipo:'fii'},{t:'BTLG11',n:'BTG Pactual Logística',tipo:'fii'},
 {t:'XPLG11',n:'XP Log',tipo:'fii'},{t:'HGRU11',n:'CSHG Renda Urbana',tipo:'fii'},
 {t:'IRDM11',n:'Iridium Recebíveis Imobiliários',tipo:'fii'},{t:'BCFF11',n:'BTG Pactual Fundo de Fundos',tipo:'fii'},
 {t:'RBRR11',n:'RBR Rendimento High Grade',tipo:'fii'},{t:'HGBS11',n:'Hedge Brasil Shopping',tipo:'fii'},
 {t:'PETR4',n:'Petrobras PN',tipo:'acao'},{t:'VALE3',n:'Vale ON',tipo:'acao'},
 {t:'ITUB4',n:'Itaú Unibanco PN',tipo:'acao'},{t:'BBDC4',n:'Bradesco PN',tipo:'acao'},
 {t:'BBAS3',n:'Banco do Brasil ON',tipo:'acao'},{t:'WEGE3',n:'WEG ON',tipo:'acao'},
 {t:'ABEV3',n:'Ambev ON',tipo:'acao'},{t:'B3SA3',n:'B3 ON',tipo:'acao'},
 {t:'RENT3',n:'Localiza ON',tipo:'acao'},{t:'PRIO3',n:'PetroRio ON',tipo:'acao'},
 {t:'BOVA11',n:'iShares Ibovespa',tipo:'etf'},{t:'IVVB11',n:'iShares S&P 500',tipo:'etf'},
 {t:'SMAL11',n:'iShares Small Caps',tipo:'etf'},{t:'DIVO11',n:'Itaú Dividendos',tipo:'etf'},
 {t:'AAPL34',n:'Apple (BDR)',tipo:'bdr'},{t:'MSFT34',n:'Microsoft (BDR)',tipo:'bdr'},
 {t:'AMZO34',n:'Amazon (BDR)',tipo:'bdr'},{t:'GOGL34',n:'Alphabet (BDR)',tipo:'bdr'},
 {t:'NVDC34',n:'NVIDIA (BDR)',tipo:'bdr'},{t:'TSLA34',n:'Tesla (BDR)',tipo:'bdr'},
 {t:'MELI34',n:'MercadoLibre (BDR)',tipo:'bdr'}
];
const CRIPTO_LIST=[
 {t:'BTC',n:'Bitcoin',id:'bitcoin'},{t:'ETH',n:'Ethereum',id:'ethereum'},{t:'SOL',n:'Solana',id:'solana'},
 {t:'XRP',n:'XRP',id:'ripple'},{t:'USDT',n:'Tether',id:'tether'},{t:'BNB',n:'BNB',id:'binancecoin'},
 {t:'ADA',n:'Cardano',id:'cardano'},{t:'DOGE',n:'Dogecoin',id:'dogecoin'},{t:'USDC',n:'USD Coin',id:'usd-coin'},
 {t:'LINK',n:'Chainlink',id:'chainlink'},
 /* v10.98: mais moedas para o seletor de "a comprar" e para o formulário de cripto */
 {t:'TRX',n:'Tron',id:'tron'},{t:'AVAX',n:'Avalanche',id:'avalanche-2'},{t:'TON',n:'Toncoin',id:'the-open-network'},
 {t:'DOT',n:'Polkadot',id:'polkadot'},{t:'LTC',n:'Litecoin',id:'litecoin'},{t:'SHIB',n:'Shiba Inu',id:'shiba-inu'},{t:'POL',n:'Polygon',id:'polygon-ecosystem-token'}
];
/* v10.98: cor de cada moeda (cartões do seletor) */
const CRYPTO_COR={BTC:'#F7931A',ETH:'#627EEA',SOL:'#9945FF',XRP:'#8b98a5',USDT:'#26A17B',BNB:'#F3BA2F',ADA:'#2a6df4',DOGE:'#C2A633',USDC:'#2775CA',LINK:'#2A5ADA',TRX:'#EB0029',AVAX:'#E84142',TON:'#0098EA',DOT:'#E6007A',LTC:'#345D9D',SHIB:'#FFA409',POL:'#8247E5'};
const CRYPTO_SVG={
 BTC:'<circle cx="12" cy="12" r="12" fill="#F7931A"/><path d="M9.2 6.8h4.1a2.4 2.4 0 0 1 0 4.8H9.2zm0 4.8h4.6a2.5 2.5 0 0 1 0 5H9.2zM9.2 6.8v9.8M10.6 5.2v1.6M12.8 5.2v1.6M10.6 16.6v1.6M12.8 16.6v1.6" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/>', /* v10.98: desenho em vez do caractere ₿ (sem fonte, virava um quadrado) */
 ETH:'<circle cx="12" cy="12" r="12" fill="#627EEA"/><path d="M12 4l5 8-5 3-5-3z" fill="#fff" opacity=".9"/><path d="M12 16l5-3-5 7-5-7z" fill="#fff"/>',
 SOL:'<circle cx="12" cy="12" r="12" fill="#0b0b12"/><path d="M6.5 7.5h11l-1.6 2h-11z" fill="#14F195"/><path d="M6.5 11h11l-1.6 2h-11z" fill="#8f6bff"/><path d="M6.5 14.5h11l-1.6 2h-11z" fill="#14F195"/>',
 XRP:'<circle cx="12" cy="12" r="12" fill="#23292F"/><path d="M7.5 7.5l9 9M16.5 7.5l-9 9" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>',
 USDT:'<circle cx="12" cy="12" r="12" fill="#26A17B"/><text x="12" y="17" text-anchor="middle" font-size="14" font-weight="700" fill="#fff" font-family="Arial">T</text>',
 /* v10.98: desenhos próprios (sem imagem de fora) */
 BNB:'<circle cx="12" cy="12" r="12" fill="#F3BA2F"/><path d="M12 5.2l2.1 2.1-2.1 2.1-2.1-2.1zM7.3 9.9l2.1 2.1-2.1 2.1L5.2 12zM16.7 9.9l2.1 2.1-2.1 2.1-2.1-2.1zM12 9.9l2.1 2.1-2.1 2.1L9.9 12zM12 14.6l2.1 2.1-2.1 2.1-2.1-2.1z" fill="#fff"/>',
 ADA:'<circle cx="12" cy="12" r="12" fill="#0033AD"/><g fill="#fff"><circle cx="12" cy="12" r="2.2"/><circle cx="12" cy="5.6" r="1.2"/><circle cx="12" cy="18.4" r="1.2"/><circle cx="6.5" cy="8.8" r="1.2"/><circle cx="17.5" cy="8.8" r="1.2"/><circle cx="6.5" cy="15.2" r="1.2"/><circle cx="17.5" cy="15.2" r="1.2"/></g>',
 DOGE:'<circle cx="12" cy="12" r="12" fill="#C2A633"/><path d="M9 7h3.4a5 5 0 0 1 0 10H9zM7.5 12h6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>',
 USDC:'<circle cx="12" cy="12" r="12" fill="#2775CA"/><circle cx="12" cy="12" r="7.2" fill="none" stroke="#fff" stroke-width="1.3" opacity=".85"/><text x="12" y="16" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Arial">$</text>',
 LINK:'<circle cx="12" cy="12" r="12" fill="#2A5ADA"/><path d="M12 5.5l5.6 3.2v6.6L12 18.5l-5.6-3.2V8.7z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>',
 TRX:'<circle cx="12" cy="12" r="12" fill="#EB0029"/><path d="M6.5 7l11 2.2-6 9.3zM6.5 7l5 11.5M17.5 9.2l-6 1.8" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>',
 AVAX:'<circle cx="12" cy="12" r="12" fill="#E84142"/><path d="M12 6l5.5 10.5h-3.4L12 12.3l-2.1 4.2H6.5z" fill="#fff"/>',
 TON:'<circle cx="12" cy="12" r="12" fill="#0098EA"/><path d="M7 8h10l-5 9.5zM12 8v9.5" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"/>',
 DOT:'<circle cx="12" cy="12" r="12" fill="#E6007A"/><ellipse cx="12" cy="6.6" rx="3.2" ry="1.9" fill="#fff"/><ellipse cx="12" cy="17.4" rx="3.2" ry="1.9" fill="#fff"/><ellipse cx="7.3" cy="9.3" rx="3.2" ry="1.9" transform="rotate(60 7.3 9.3)" fill="#fff"/><ellipse cx="16.7" cy="14.7" rx="3.2" ry="1.9" transform="rotate(60 16.7 14.7)" fill="#fff"/><ellipse cx="16.7" cy="9.3" rx="3.2" ry="1.9" transform="rotate(-60 16.7 9.3)" fill="#fff"/><ellipse cx="7.3" cy="14.7" rx="3.2" ry="1.9" transform="rotate(-60 7.3 14.7)" fill="#fff"/>',
 LTC:'<circle cx="12" cy="12" r="12" fill="#345D9D"/><path d="M10.5 6l-1.8 11h7.6M7.5 13.2l6-2.2" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
 SHIB:'<circle cx="12" cy="12" r="12" fill="#FFA409"/><path d="M6.5 7.5l3 2.5h5l3-2.5-.6 6.5L12 18l-4.9-4z" fill="#fff"/><circle cx="10" cy="12.5" r=".9" fill="#c2410c"/><circle cx="14" cy="12.5" r=".9" fill="#c2410c"/>',
 POL:'<circle cx="12" cy="12" r="12" fill="#8247E5"/><path d="M15.5 9.3l-2.6-1.5-2.6 1.5v3l-1.7 1-1.7-1v-2l1.7-1 .9.5V8.8l-.9-.5-2.6 1.5v3l2.6 1.5 2.6-1.5v-3l1.7-1 1.7 1v2l-1.7 1-.9-.5v1.9l.9.5 2.6-1.5z" fill="#fff"/>'
};
function cgCache(){try{const c=JSON.parse(localStorage.getItem('gv-cg')||'null');return c&&c.p?Object.assign({img:{}},c):{ts:0,p:{},img:{}};}catch(e){return {ts:0,p:{},img:{}};}}
let CG_ST={st:'manual',msg:'valores manuais'};
async function cgPrecos(ids,forca){
  const c=cgCache();
  if(!ids.length)return c.p;
  const ok=ids.every(i=>c.p[i]>0);
  if(!forca&&ok&&Date.now()-c.ts<60e3)return c.p;
  if(!navigator.onLine){CG_ST={st:'manual',msg:'sem conexão, usando valores manuais'};return c.p;}
  const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),8000);
  try{
    const r=await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=brl&sparkline=false&ids='+encodeURIComponent(ids.join(',')),{signal:ctl.signal});
    if(!r.ok)throw new Error('http '+r.status);
    const j=await r.json();
    j.forEach(x=>{if(x.current_price>0)c.p[x.id]=x.current_price;if(x.image)c.img[x.id]=x.image;});
    c.ts=Date.now();localStorage.setItem('gv-cg',JSON.stringify(c));
    CG_ST={st:'auto',msg:'cotação ao vivo (CoinGecko)'};
  }catch(e){CG_ST=ok?{st:'cache',msg:'CoinGecko indisponível, usando última cotação salva'}:{st:'manual',msg:'CoinGecko indisponível, digite o preço'};}
  finally{clearTimeout(to);}
  return c.p;
}
async function atualizaCripto(forca){
  const cs=S.fiis.filter(f=>tipoOf(f)==='cripto'&&f.cgId);
  if(!cs.length)return;
  const p=await cgPrecos([...new Set(cs.map(f=>f.cgId))],forca);
  let mudou=false;
  cs.forEach(f=>{if(p[f.cgId]>0&&f.preco!==p[f.cgId]){f.preco=p[f.cgId];mudou=true;}});
  if(mudou)salvar();
  if(TAB==='fii')render();
}
function cryptoIco(t,proprio){ // v10.98: proprio = só o desenho do app (seletor das metas)
  const cg=CRIPTO_LIST.find(x=>x.t===t),img=!proprio&&cg&&cgCache().img[cg.id];
  if(img)return '<img src="'+esc(img)+'" alt="'+esc(t)+'" width="26" height="26">';
  return '<svg class="coin" viewBox="0 0 24 24" aria-label="'+esc(t)+'">'+(CRYPTO_SVG[t]||'<circle cx="12" cy="12" r="12" fill="#475569"/><text x="12" y="15.5" text-anchor="middle" font-size="6" font-weight="700" fill="#fff" font-family="Arial">'+esc(t.slice(0,4))+'</text>')+'</svg>';
}
const patrimonio=()=>S.fiis.reduce((a,f)=>a+cents(f.cotas*f.preco),0)/100;
const divMensal=()=>S.fiis.reduce((a,f)=>a+(tipoOf(f)==='fii'?cents(f.cotas*f.dpc):0),0)/100;
function proximoPag(){
  const now=new Date(),h0=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  let best=null;
  S.fiis.forEach(f=>{
    if(!(f.diaPag>0))return;
    for(let k=0;k<2;k++){
      const y=h0.getFullYear(),mo=h0.getMonth()+k;
      const last=new Date(y,mo+1,0).getDate();
      const d=new Date(y,mo,Math.min(f.diaPag,last));
      if(d>=h0){if(!best||d<best.date)best={f,date:d};break;}
    }
  });
  return best;
}
const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
let LIM_LISTA=50,FILT_SIG='';
function filtrados(){
  const sig=JSON.stringify(F);if(sig!==FILT_SIG){FILT_SIG=sig;LIM_LISTA=50;}
  const nq=norm(F.q);
  /* v10.78: filtros que chegam pelos cards: intervalo de datas (período do início), conta e situação */
  const rng=F.ini&&F.fim,cb=F.conta?'b:'+F.conta:'';
  const naConta=t=>t.tipo==='transf'?(t.de===cb||t.para===cb):contaDoLanc(t)===F.conta||(t.faturaKey&&pagsFatura(t).some(p=>p.conta===F.conta));
  const st=t=>F.st==='aberto'?(t.status==='previsto'||(t.faturaKey&&restanteFatura(t)>0)):true;
  /* v10.80: "por dia trabalhado" (só em Receitas): o mês/período olha o dia trabalhado; sem ele, o dia do recebimento */
  const cp=F.comp==='trab'&&F.tipo==='receita',dR=t=>cp&&t.trab?t.trab:t.data;
  return S.tx.filter(t=>(rng?(dR(t)>=F.ini&&dR(t)<=F.fim):(!F.mes||dR(t).startsWith(F.mes)))&&(!F.conta||naConta(t))&&(!F.st||st(t))&&(!F.cat||temCat(t,F.cat))&&(!F.tipo||t.tipo===F.tipo)&&(!F.tag||(t.tags||[]).includes(F.tag))&&(!nq||norm((t.descricao||'')+' '+t.categoria+' '+(t.sub||'')+' '+(t.tags||[]).join(' ')+' '+(t.obs||'')).includes(nq)))
    .sort((a,b)=>dR(b).localeCompare(dR(a))||b.data.localeCompare(a.data));
}

/* ---------- animação e gráficos (canvas puro) ---------- */
let animTok=0;
function animar(dur,fn){
  if(RENDER_QUIETO){++animTok;fn(1);return;} // v10.91: redesenho silencioso não reanima os gráficos
  const my=++animTok,t0=performance.now();
  const step=t=>{
    if(my!==animTok)return;
    const p=Math.min(1,(t-t0)/dur);
    fn(1-Math.pow(1-p,3));
    if(p<1)requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function fitCanvas(c,h){
  const dpr=window.devicePixelRatio||1,w=c.clientWidth;
  c.width=w*dpr;c.height=h*dpr;c.style.height=h+'px';
  const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  return {ctx,w,h};
}
function bar(ctx,x,y,w,h,color){
  if(h<=0||w<=0)return;
  const r=Math.min(6,w/2,h);
  ctx.fillStyle=color;ctx.beginPath();
  ctx.moveTo(x,y+h);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);
  ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h);ctx.closePath();ctx.fill();
}
/* v10.100: no computador as barras são mais finas, em esmeralda e rosa suave, e o gráfico ocupa a altura do card ao lado */
const DESK=()=>innerWidth>=900;
const COR_REC=()=>DESK()?'#10b981':'#34d399',COR_DES=()=>DESK()?'#f08a98':'#a78bfa';
function barAltura(c){
  if(innerWidth<1200||c.id!=='cBar')return 220;
  const cat=document.querySelector('#view .hmCat'),card=c.closest('.card');if(!cat||!card)return 220;
  const cr=card.getBoundingClientRect(),vr=c.getBoundingClientRect(),lg=card.querySelector('.legend');
  const resto=(vr.top-cr.top)+(lg?lg.offsetHeight+14:0)+24;
  return Math.max(220,Math.min(460,cat.offsetHeight-resto));
}
/* v10.100: dica ao passar o mouse nas barras (só com mouse; no toque o card abre o relatório) */
function barTip(c){
  if(c.__tip||!matchMedia('(hover:hover)').matches)return;c.__tip=1;
  const card=c.closest('.card');if(!card)return;card.style.position='relative';
  const tip=document.createElement('div');tip.className='gvTip';tip.setAttribute('aria-hidden','true');card.appendChild(tip);
  c.addEventListener('mousemove',e=>{
    const ds=barData();if(!ds.length)return;
    const r=c.getBoundingClientRect(),x=e.clientX-r.left,i=Math.max(0,Math.min(ds.length-1,Math.floor(x/(r.width/ds.length)))),d=ds[i];
    tip.innerHTML='<b>'+esc(d.l)+'</b><div><span><i style="background:'+COR_REC()+'"></i>receitas</span><span class="nw">'+(OCULTO?'•••':brl(d.r))+'</span></div><div><span><i style="background:'+COR_DES()+'"></i>despesas</span><span class="nw">'+(OCULTO?'•••':brl(d.d))+'</span></div>';
    const cr=card.getBoundingClientRect(),gx=r.left-cr.left+(i+.5)*r.width/ds.length;
    const tw=tip.offsetWidth||160;tip.style.left=Math.max(8,Math.min(cr.width-tw-8,gx-tw/2))+'px';tip.style.top=(r.top-cr.top+6)+'px';tip.classList.add('on');
  });
  c.addEventListener('mouseleave',()=>tip.classList.remove('on'));
}
function drawBars(c,p){
  const {ctx,w,h}=fitCanvas(c,c.__bh||(c.__bh=barAltura(c)));
  const ds=barData(),max=Math.max(1,...ds.flatMap(d=>[d.r,d.d]));
  const top=14,base=h-26,H=base-top,gw=w/ds.length;
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle=cor('--line');ctx.lineWidth=1;
  for(let i=0;i<=3;i++){const y=top+H*i/3;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  ds.forEach((d,i)=>{
    const x0=i*gw,bw=Math.min(DESK()?12:18,gw*0.26),cx=x0+gw/2;
    const hr=d.r/max*H*p,hd=d.d/max*H*p;
    bar(ctx,cx-bw-2,base-hr,bw,hr,COR_REC());
    bar(ctx,cx+2,base-hd,bw,hd,COR_DES());
    ctx.fillStyle=cor('--mut');ctx.font='12px system-ui';ctx.textAlign='center';
    ctx.fillText(d.l,cx,h-8);
  });
}
function drawDonut(c,p){
  const size=c.clientWidth;
  const {ctx,w,h}=fitCanvas(c,size);
  const sl=despesasPorCat(periodo()),total=sl.reduce((a,s)=>a+s.v,0);
  const cx=w/2,cy=h/2,lw=DESK()?18:24,R=Math.min(w,h)/2-lw/2-2;
  ctx.clearRect(0,0,w,h);
  if(R<=0)return;
  ctx.lineWidth=lw;ctx.lineCap='butt';
  ctx.strokeStyle=cor('--card2');ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke();
  let a=-Math.PI/2;
  if(total>0)sl.forEach(s=>{
    const da=s.v/total*Math.PI*2*p;
    ctx.strokeStyle=s.color;ctx.beginPath();ctx.arc(cx,cy,R,a,a+da);ctx.stroke();a+=da;
  });
  ctx.fillStyle=cor('--txt');ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font="700 18px Inter, system-ui";
  ctx.fillText(brl(total*p),cx,cy-7);
  ctx.fillStyle=cor('--mut');ctx.font='12px system-ui';
  ctx.fillText(total>0?'em despesas':'sem despesas',cx,cy+12);
  ctx.textBaseline='alphabetic';
}

/* ---------- recorrências, faturas e alertas ---------- */
function ultimoDia(y,m){return new Date(y,m+1,0).getDate();}
function diaMes(y,m,d){const x=new Date(y,m,1);return new Date(x.getFullYear(),x.getMonth(),Math.min(d,new Date(x.getFullYear(),x.getMonth()+1,0).getDate()));}
function mesOff(k){const d=new Date(),x=new Date(d.getFullYear(),d.getMonth()-k,1);return x.getFullYear()+'-'+pad(x.getMonth()+1);}
/* ciclo de um cartão: para uma data de compra, devolve o fechamento (primeiro dia de fechamento >= compra)
   e o vencimento dessa fatura. compra no próprio dia do fechamento entra na fatura que fecha nesse dia. */
/* v10.55: resultado guardado por (fechamento, vencimento, data): é chamado milhares de vezes por tela */
const FECH_MEMO=new Map();
function fechamentoDe(c,iso){
  const mk=(c.fechamento||1)+'|'+(c.vencimento||1)+'|'+iso,mv=FECH_MEMO.get(mk);if(mv)return {fecha:mv.fecha,vence:mv.vence};
  if(FECH_MEMO.size>20000)FECH_MEMO.clear();
  const r=fechamentoCalc(c,iso);FECH_MEMO.set(mk,r);return {fecha:r.fecha,vence:r.vence};
}
function fechamentoCalc(c,iso){
  const fe=Math.max(1,Math.min(31,c.fechamento||1)),ve=Math.max(1,Math.min(31,c.vencimento||1));
  const y=+iso.slice(0,4),m=+iso.slice(5,7)-1;
  let C=diaMes(y,m,fe);
  if(isoDe(C)<iso)C=diaMes(y,m+1,fe);
  const V=diaMes(C.getFullYear(),C.getMonth()+(ve>fe?0:1),ve);
  return {fecha:isoDe(C),vence:isoDe(V)};
}
/* pagamento de fatura.
   fatura (lançamento com faturaKey) pode ter: pagamentos [{valor,data,conta}] (v10.45); pagoValor = soma deles.
   faturas que venceram antes de o controle existir (S.cfg.pagDesde) contam como pagas, para não
   transformar todo o histórico em "vencido". */
function pagsFatura(t){return Array.isArray(t.pagamentos)?t.pagamentos:[];}
function fechaPagamentos(t){const pg=pagsFatura(t),u=pg[pg.length-1];t.pagoValor=pg.reduce((a,x)=>a+Math.round((Number(x.valor)||0)*100),0)/100;t.pagaEm=u?u.data:'';t.pagoConta=u?u.conta:'';}
/* v10.123: cartão excluído guarda o vencimento na fatura (t.vence); antes o alerta caía na data do fechamento */
function venceFatura(t){const c=S.cartoes.find(x=>t.faturaKey&&t.faturaKey.indexOf('fat|'+x.id+'|')===0);return c?fechamentoDe(c,t.data).vence:(DATA_OK.test(String(t.vence||''))?String(t.vence).slice(0,10):t.data);}
function restanteFatura(t){
  if(!t.faturaKey)return 0;
  if(!pagsFatura(t).length&&!t.pagaEm&&S.cfg.pagDesde&&venceFatura(t)<S.cfg.pagDesde)return 0;
  return Math.max(0,(cents(t.valor)-cents(t.pagoValor))/100);
}
function statusFatura(t){
  const r=restanteFatura(t);
  if(r<=0)return 'paga';
  if(t.pagoValor>0)return 'parcial';
  return venceFatura(t)<hojeISO()?'vencida':'aberta';
}
const idGerado=k=>k.replace(/[^A-Za-z0-9_|:.\-]/g,'_');
const FREQ_L={diaria:'diária',semanal:'semanal',quinzenal:'quinzenal',mensal:'mensal',anual:'anual',intervalo:'personalizado'};
/* diária, quinzenal e personalizada viram "a cada n unidades" a partir de uma data inicial */
function regraIntervalo(f){const fr=f.freq;if(fr==='diaria')return {n:1,un:'dia'};if(fr==='quinzenal')return {n:2,un:'semana'};if(fr==='intervalo')return {n:Math.max(1,Math.min(365,parseInt(f.n,10)||1)),un:['dia','semana','mes'].includes(f.un)?f.un:'dia'};return null;}
function addMeses(iso,k){const y=+iso.slice(0,4),m=+iso.slice(5,7)-1+k,d=+iso.slice(8,10),Y=y+Math.floor(m/12),M=((m%12)+12)%12;return isoDe(new Date(Y,M,Math.min(d,ultimoDia(Y,M))));}
/* v10.45: data da k-ésima parcela (k=0 é a compra) ancorada no ciclo do cartão: cada parcela cai numa fatura diferente e seguida.
   mesmo dia da compra k meses depois; se esse dia cair em outra fatura, usa o 1º dia do ciclo (ou o dia do fechamento). */
function dataParcela(c,iso,k){
  if(!k)return iso;
  const fe=Math.max(1,Math.min(31,c.fechamento||1)),F0=fechamentoDe(c,iso).fecha,y=+F0.slice(0,4),m=+F0.slice(5,7)-1;
  const Ck=isoDe(diaMes(y,m+k,fe)),Cant=isoDe(diaMes(y,m+k-1,fe)),cand=addMeses(iso,k),fc=fechamentoDe(c,cand).fecha;
  if(fc===Ck)return cand;
  return fc<Ck?addDias(Cant,1):Ck;
}
function addDias(iso,k){return isoDe(new Date(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10)+k));}
const DOW_L=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
/* datas (ISO) em que a conta fixa acontece entre ini e fim. chaves: mensal fx|id|AAAA-MM (compatível), semanal fx|id|AAAA-MM-DD, anual fx|id|AAAA */
function ocorrenciasFixa(f,ini,fim){
  if(f.fim&&ISO_RE.test(f.fim)&&f.fim<fim)fim=f.fim;
  /* v10.155: nada antes da primeira cobrança (antes só a regra por intervalo respeitava f.inicio: mensal, semanal e anual
     marcavam "vence hoje" no mês atual mesmo com a primeira cobrança no mês seguinte) */
  if(ISO_RE.test(f.inicio||'')&&f.inicio>ini)ini=f.inicio;
  if(fim<ini)return [];
  const out=[],fr=f.freq||'mensal',cr=f.criadoEm||'';
  const ri=regraIntervalo(f);
  if(ri){
    const a0=ISO_RE.test(f.inicio||'')?f.inicio:(cr||ini).slice(0,10);
    if(ri.un==='mes'){
      let k=0;if(a0<ini){const meses=(+ini.slice(0,4)-+a0.slice(0,4))*12+(+ini.slice(5,7)-+a0.slice(5,7));k=Math.max(0,Math.floor(meses/ri.n)-1)*ri.n;}
      for(let g=0;g<2000;g++,k+=ri.n){const s=addMeses(a0,k);if(s>fim)break;if(s<ini||(cr&&s<cr.slice(0,10)))continue;out.push({data:s,key:'fx|'+f.id+'|'+s});}
      return out;
    }
    const passo=ri.n*(ri.un==='semana'?7:1);
    const t0=Date.UTC(+a0.slice(0,4),+a0.slice(5,7)-1,+a0.slice(8,10)),ti=Date.UTC(+ini.slice(0,4),+ini.slice(5,7)-1,+ini.slice(8,10));
    let k=a0<ini?Math.ceil((ti-t0)/864e5/passo)*passo:0;
    for(let g=0;g<2000;g++,k+=passo){const s=addDias(a0,k);if(s>fim)break;if(s<ini||(cr&&s<cr.slice(0,10)))continue;out.push({data:s,key:'fx|'+f.id+'|'+s});}
    return out;
  }
  const y0=+ini.slice(0,4),m0=+ini.slice(5,7)-1,y1=+fim.slice(0,4),m1=+fim.slice(5,7)-1;
  if(fr==='semanal'){
    const dow=Math.max(0,Math.min(6,+f.dow||0));
    const d=new Date(y0,m0,+ini.slice(8,10));while(d.getDay()!==dow)d.setDate(d.getDate()+1);
    for(;isoDe(d)<=fim;d.setDate(d.getDate()+7)){const s=isoDe(d);if(cr&&s<cr)continue;out.push({data:s,key:'fx|'+f.id+'|'+s});}
    return out;
  }
  if(fr==='anual'){
    const mes=Math.max(1,Math.min(12,+f.mes||1))-1;
    for(let y=y0;y<=y1;y++){const s=isoDe(new Date(y,mes,Math.min(Math.max(1,f.dia||1),ultimoDia(y,mes))));if(s<ini||s>fim||(cr&&s<cr))continue;out.push({data:s,key:'fx|'+f.id+'|'+y});}
    return out;
  }
  for(let k=0;;k++){
    const D=new Date(y0,m0+k,1);if(D.getFullYear()>y1||(D.getFullYear()===y1&&D.getMonth()>m1))break;
    const ym=isoDe(D).slice(0,7);
    const s=isoDe(new Date(D.getFullYear(),D.getMonth(),Math.min(Math.max(1,f.dia||1),ultimoDia(D.getFullYear(),D.getMonth()))));
    // não cria lançamento retroativo para datas antes do cadastro (evita duplicar o que já foi lançado à mão)
    if(s<ini||s>fim||(cr&&s<cr.slice(0,10)))continue;out.push({data:s,key:'fx|'+f.id+'|'+ym});
  }
  return out;
}
/* v10.71: data da primeira cobrança de uma conta fixa antiga (sem f.inicio): a 1ª ocorrência a partir do cadastro */
function primeiraFixa(f){const cr=ISO_RE.test(f.criadoEm||'')?f.criadoEm.slice(0,10):hojeISO();const o=ocorrenciasFixa(Object.assign({},f,{fim:''}),cr,addDias(cr,400))[0];return o?o.data:cr;}
function dataDaChave(f,key){const p=key.split('|')[2]||'';if((f.freq||'mensal')!=='mensal'||p.length!==7)return '';const y=+p.slice(0,4),m=+p.slice(5,7)-1;return isoDe(new Date(y,m,Math.min(Math.max(1,f.dia||1),ultimoDia(y,m))));}
function descFreq(f){const ate=f.fim&&ISO_RE.test(f.fim)?' até '+fmtData(f.fim):'';return descFreq0(f)+ate;}
function descFreq0(f){const fr=f.freq||'mensal';if(fr==='diaria')return 'todo dia';if(fr==='quinzenal')return 'a cada 2 semanas';if(fr==='intervalo'){const r=regraIntervalo(f),U={dia:['dia','dias'],semana:['semana','semanas'],mes:['mês','meses']}[r.un];return r.n===1?(r.un==='semana'?'toda semana':r.un==='mes'?'todo mês':'todo dia'):'a cada '+r.n+' '+U[1];}if(fr==='semanal'){const d=DOW_L[+f.dow||0];return (d==='sábado'||d==='domingo'?'todo ':'toda ')+d;}if(fr==='anual')return 'todo ano em '+pad(f.dia||1)+'/'+pad(f.mes||1);return 'todo dia '+(f.dia||1);}
function mensalEq(f){const v=+f.valor||0,fr=f.freq||'mensal',ri=regraIntervalo(f);if(ri)return ri.un==='dia'?v*365/12/ri.n:ri.un==='semana'?v*52/12/ri.n:v/ri.n;return fr==='semanal'?v*52/12:fr==='anual'?v/12:v;}
/* v10.72: a mesma conta não aparece duas vezes.
   nomeConta tira acento, caixa e o sufixo "(fixa)"; dedupFixas junta contas fixas idênticas e liga a conta prevista
   lançada à mão à ocorrência da conta fixa com o mesmo nome e valor no mesmo mês. */
function nomeConta(x){return String(x||'').replace(/\s*\(fixa\)\s*$/i,'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();}
function dedupFixas(){
  let mudou=false;const vistos={};
  S.fixas.slice().sort((a,b)=>(a.criadoEm||'')<(b.criadoEm||'')?-1:1).forEach(f=>{
    const k=[nomeConta(f.nome),f.tipo==='receita'?'r':'d',cents(f.valor),f.freq||'mensal',f.dia||'',f.dow||'',f.mes||'',f.n||'',f.un||'',f.fim||''].join('|');
    const keep=vistos[k];if(!keep){vistos[k]=f;return;}
    // duplicada: some a regra e os previstos dela; o que já foi pago fica
    S.tx=S.tx.filter(t=>!(t.fixaKey&&t.fixaKey.split('|')[1]===f.id&&t.status==='previsto'));
    if(f.criadoEm&&(!keep.criadoEm||f.criadoEm<keep.criadoEm))keep.criadoEm=f.criadoEm;
    S.fixas=S.fixas.filter(x=>x!==f);mudou=true;
  });
  S.tx.slice().forEach(t=>{
    if(t.fixaKey||t.status!=='previsto'||!t.data||t.parcelas>1||t.cartao)return;
    const nm=nomeConta(t.descricao);if(!nm)return;
    const f=S.fixas.find(x=>nomeConta(x.nome)===nm&&cents(x.valor)===cents(t.valor)&&(x.tipo==='receita'?'receita':'despesa')===t.tipo);if(!f)return;
    const ym=t.data.slice(0,7),D=new Date(+ym.slice(0,4),+ym.slice(5,7),0);
    const o=ocorrenciasFixa(Object.assign({},f,{criadoEm:''}),ym+'-01',isoDe(D))[0];if(!o)return;
    const ja=S.tx.find(x=>x.fixaKey===o.key);
    if(ja){S.tx=S.tx.filter(x=>x!==t);}else{t.fixaKey=o.key;if(f.auto!==false)t.fxAuto=1;S.gerados[o.key]=1;}
    mudou=true;
  });
  return mudou;
}
/* lançamento de uma ocorrência de conta fixa (id e chave determinísticos = sem duplicar entre aparelhos).
   v10.157: função própria, usada também pelo "Pagar" do Início quando a ocorrência ainda não virou lançamento */
function txDaOcorrencia(f,o,hoje){
  const tx={id:idGerado(o.key),tipo:f.tipo==='receita'?'receita':'despesa',valor:f.valor,categoria:f.categoria||'Outros',descricao:f.nome+' (fixa)',data:o.data,fixaKey:o.key};
  if(f.forma){tx.forma=f.forma;if(f.conta)tx.conta=f.conta;if(f.cartao)tx.cartao=f.cartao;if(f.pagoCom)tx.pagoCom=f.pagoCom;} // v10.51: mesma forma, conta e cartão da fixa
  if(o.data>(hoje||hojeISO())||f.auto===false){tx.status='previsto';if(f.auto!==false)tx.fxAuto=1;}
  return tx;
}
function geraRecorrentes(){
  const h=new Date(),hoje=hojeISO();let mudou=false;
  if(!S.gerados)S.gerados={};
  if(!S.fixas)S.fixas=[];
  if(dedupFixas())mudou=true;
  /* v10.154: cartão/banco citado no WhatsApp ("uber 18 no nubank") vira o cartão ou a conta cadastrada com esse nome */
  S.tx.forEach(t=>{if(t.waPago===undefined)return;const n=norm(t.waPago);delete t.waPago;mudou=true;
    const casa=x=>{const a=norm(x&&x.nome);return !!(a&&n&&(a.includes(n)||n.includes(a)));};
    const k=t.forma==='pix'||t.forma==='dinheiro'||t.forma==='boleto'?null:(S.cartoes||[]).find(c=>!c.arq&&casa(c));
    if(k){t.forma='cartao';t.cartao=k.id;return;}
    const b=(S.bancos||[]).find(casa);
    if(b){if(!t.forma||t.forma==='cartao')t.forma='pix';t.conta=b.id;}else if(!t.forma)t.forma='pix';});
  /* v10.153: lançamento do WhatsApp marcado como fixo vira conta fixa mensal (id determinístico = sem duplicar entre aparelhos) */
  S.tx.forEach(t=>{if(!t.waFixa)return;delete t.waFixa;mudou=true;const fxId='wa'+t.id;if(S.fixas.some(f=>f.id===fxId)||!ISO_RE.test(t.data||''))return;
    S.fixas.push({id:fxId,nome:t.descricao||t.categoria||'Conta fixa',valor:t.valor,dia:parseInt(t.data.slice(8,10),10)||1,tipo:t.tipo==='receita'?'receita':'despesa',freq:'mensal',auto:true,categoria:t.categoria||'Outros',inicio:t.data,criadoEm:t.data<hoje?t.data:hoje,forma:t.forma||'pix',conta:t.conta||'',cartao:t.cartao||''});
    S.gerados['fx|'+fxId+'|'+t.data.slice(0,7)]=1;});
  /* remove duplicatas de lançamentos automáticos (ex.: gerados em dois aparelhos antes do id determinístico) */
  const vistos=new Set(),antes=S.tx.length;
  S.tx=S.tx.filter(t=>{const k=t.fixaKey||t.faturaKey;if(!k)return true;if(vistos.has(k))return false;vistos.add(k);return true;});
  if(S.tx.length!==antes)mudou=true;
  /* recorrências: janela de 2 meses para trás até o fim do mês atual.
     ocorrência futura nasce "prevista"; com confirmação automática vira "paga" no dia. id e chave determinísticos = sem duplicar. */
  const iniJ=isoDe(new Date(h.getFullYear(),h.getMonth()-2,1)),fimJ=isoDe(new Date(h.getFullYear(),h.getMonth()+1,0));
  S.fixas.forEach(f=>{
    ocorrenciasFixa(f,iniJ,fimJ).forEach(o=>{
      if(S.gerados[o.key])return;
      S.tx.push(txDaOcorrencia(f,o,hoje));S.gerados[o.key]=1;mudou=true;
    });
  });
  /* v10.155: prevista gerada antes da primeira cobrança (bug acima) sai; paga fica */
  {const n0=S.tx.length;S.tx=S.tx.filter(t=>{if(!t.fixaKey||t.status!=='previsto')return true;const f=S.fixas.find(x=>x.id===t.fixaKey.split('|')[1]);return !(f&&ISO_RE.test(f.inicio||'')&&t.data<f.inicio);});if(S.tx.length!==n0)mudou=true;}
  S.tx.forEach(t=>{
    if(!t.fixaKey||t.status!=='previsto')return;
    const f=S.fixas.find(x=>x.id===t.fixaKey.split('|')[1]);
    // previstas ainda não mexidas acompanham a conta fixa editada
    if(f&&t.fxAuto!==undefined&&t.data>hoje){
      const tp=f.tipo==='receita'?'receita':'despesa',ds=f.nome+' (fixa)',dt=dataDaChave(f,t.fixaKey)||t.data;
      if(t.valor!==f.valor||t.categoria!==f.categoria||t.descricao!==ds||t.tipo!==tp||t.data!==dt){Object.assign(t,{valor:f.valor,categoria:f.categoria||'Outros',descricao:ds,tipo:tp,data:dt});mudou=true;}
    }
    if(t.fxAuto&&t.data<=hoje&&(!f||f.auto!==false)){t.status='pago';delete t.fxAuto;mudou=true;}
  });
  if(conciliaAssin())mudou=true;
  /* faturas: recalculadas a cada execução a partir das compras do ciclo.
     antes eram congeladas no dia do fechamento: compra lançada depois (retroativa), editada ou excluída
     nunca chegava à fatura. a fatura excluída pelo usuário fica marcada e não volta. */
  (S.cartoes||[]).forEach(c=>{
    const fe=Math.max(1,Math.min(31,c.fechamento||1));
    const somas={};
    S.tx.forEach(t=>{
      if(t.cartao!==c.id||!(t.tipo==='despesa'||t.tipo==='transf')||!t.data||!efetivo(t))return;
      const f=fechamentoDe(c,t.data);
      if(f.fecha>hoje)return; // ciclo ainda aberto
      const key='fat|'+c.id+'|'+f.fecha.slice(0,7);
      (somas[key]=somas[key]||{c:0,data:f.fecha}).c+=Math.round(t.valor*100);
    });
    // garante que meses fechados sem compra removam fatura antiga
    S.tx.filter(t=>t.faturaKey&&t.faturaKey.indexOf('fat|'+c.id+'|')===0).forEach(t=>{if(!somas[t.faturaKey])somas[t.faturaKey]={c:0,data:t.data};});
    Object.keys(somas).forEach(key=>{
      const v=somas[key].c/100,ex=S.tx.find(t=>t.faturaKey===key);
      if(S.gerados[key]==='del')return;
      /* v10.51: fatura com pagamento nunca some (o dinheiro já saiu da conta): fica com o valor novo e o que sobrou aparece como pago a mais */
      if(v<=0){if(ex&&pagsFatura(ex).length){if(ex.valor!==0){ex.valor=0;mudou=true;}S.gerados[key]=1;}else if(ex){S.tx=S.tx.filter(t=>t!==ex);mudou=true;}return;}
      if(ex){
        if(ex.valor!==v||ex.data!==somas[key].data||ex.descricao!=='fatura '+c.nome){ex.valor=v;ex.data=somas[key].data;ex.descricao='fatura '+c.nome;mudou=true;}
      }else{
        S.tx.push({id:idGerado(key),tipo:'despesa',valor:v,categoria:'Cartão',descricao:'fatura '+c.nome,data:somas[key].data,faturaKey:key});
        mudou=true;
      }
      S.gerados[key]=1;
    });
  });
  return mudou;
}
/* v10.88: a Início mostra no máximo 4 alertas. com 3+ faturas vencidas sem pagamento (ex.: histórico importado), elas viram
   um resumo só; o sino continua com a lista completa. antes eram dezenas de cards e a Início passava de 8.000 px */
function alertasHTML(){
  const L=listaAlertas(false),fv=L.filter(a=>/^fv\|/.test(a.id));let out=L;
  if(fv.length>2){const ids=new Set(fv.map(a=>a.id.slice(3))),F=S.tx.filter(t=>ids.has(t.id)),tot=F.reduce((s,t)=>s+cents(restanteFatura(t)),0)/100,nc=new Set(F.map(t=>String(t.faturaKey).split('|')[1])).size;
    out=[{k:'venc',h:`${I('alert')} <b>${fv.length} faturas vencidas</b> sem pagamento registrado ${nc>1?'em '+nc+' cartões':'no cartão'} · ${brl(tot)} <button class="btn2 sm" data-act="alertas-ver">ver</button>`}].concat(L.filter(a=>!/^fv\|/.test(a.id)));}
  const MAX=4,mais=out.length-MAX;
  return out.slice(0,MAX).map(a=>`<div class="card aviso-card${a.k==='venc'?' venc':''}">${a.h}</div>`).join('')+(mais>0?`<button type="button" class="card alMais" data-act="alertas-ver">${I('alert')}<span>mais ${mais} ${mais>1?'alertas':'alerta'} no sino</span>${I('chevR')}</button>`:'');
}
/* completo=true também traz orçamentos e limite do cartão (vão no sino; no início já há o card de orçamentos) */
function avisoDias(){const n=+(S.cfg&&S.cfg.avisoDias);return [0,1,2,3,5,7].includes(n)?n:3;}
function listaAlertas(completo){
  const h=new Date(),out=[],hj=new Date(h.getFullYear(),h.getMonth(),h.getDate()),AD=Math.max(1,avisoDias());
  const hjI=isoDe(hj),ate5=isoDe(new Date(hj.getFullYear(),hj.getMonth(),hj.getDate()+AD));
  (S.fixas||[]).forEach(f=>{
    if(f.tipo==='receita')return;
    const oc=ocorrenciasFixa(Object.assign({},f,{criadoEm:''}),hjI,ate5)[0];if(!oc)return;
    // já marcada como paga antes do dia: não avisa
    const tx=S.tx.find(t=>t.fixaKey===oc.key);if(tx&&tx.status!=='previsto'&&!(tx.fxAuto))return;
    const diff=Math.round((new Date(+oc.data.slice(0,4),+oc.data.slice(5,7)-1,+oc.data.slice(8,10))-hj)/864e5);
    out.push({id:'fx|'+oc.key,k:'aviso',h:`${I('alert')} conta fixa <b>${esc(f.nome)}</b> ${diff===0?'vence hoje':'vence em '+diff+(diff===1?' dia':' dias')} · ${brl(f.valor)}`});
  });
  S.tx.forEach(t=>{
    if(t.status!=='previsto'||t.tipo!=='despesa'||t.cartao||t.fxAuto)return;
    const diff=Math.round((new Date(+t.data.slice(0,4),+t.data.slice(5,7)-1,+t.data.slice(8,10))-hj)/864e5);
    if(diff>AD)return;
    out.push({id:'pv|'+t.id+'|'+(diff<0?'a':diff===0?'h':'p'),k:diff<0?'venc':'aviso',h:`${I('alert')} <b>${esc(t.descricao||t.categoria)}</b> ${diff<0?'está atrasada há '+(-diff)+(diff===-1?' dia':' dias'):diff===0?'vence hoje':'vence em '+diff+(diff===1?' dia':' dias')} · ${brl(t.valor)}`});
  });
  (S.cartoes||[]).forEach(c=>{
    const fe=Math.max(1,Math.min(31,c.fechamento||1)),ve=Math.max(1,Math.min(31,c.vencimento||1));
    for(let k=0;k<=2;k++){
      const B=new Date(h.getFullYear(),h.getMonth()-k,1);
      const C=diaMes(B.getFullYear(),B.getMonth(),fe);
      const V=diaMes(C.getFullYear(),C.getMonth()+(ve>fe?0:1),ve);
      const diff=Math.round((V-hj)/864e5);
      if(diff>=0&&diff<=Math.max(AD,3)){
        const fat=S.tx.find(t=>t.faturaKey==='fat|'+c.id+'|'+isoDe(C).slice(0,7));
        if(fat&&restanteFatura(fat)<=0)continue;
        /* v10.51: sem fatura e ciclo fechado = não houve compra; ciclo aberto só avisa se já tem compra nele */
        if(!fat){const fc=isoDe(C);if(fc<=hojeISO()||!S.tx.some(t=>t.cartao===c.id&&!t.faturaKey&&efetivo(t)&&t.data&&fechamentoDe(c,t.data).fecha===fc))continue;}
        out.push({id:'ft|'+c.id+'|'+isoDe(V)+'|'+(diff===0?'h':diff<=3?'3':'p'),k:diff<=3?'venc':'aviso',h:`${I('card')} fatura <b>${esc(c.nome)}</b> ${diff===0?'vence hoje':diff===1?'vence amanhã':'vence em '+diff+' dias'} (${fmtDate(V)}) · ${fat?brl(restanteFatura(fat)):'ainda sem valor fechado'}${fat?` <button class="btn2 sm" data-act="pagar-fat" data-id="${fat.id}">pagar</button>`:''}`});
      }
    }
  });
  S.tx.filter(t=>t.faturaKey&&statusFatura(t)==='vencida').forEach(t=>{
    out.unshift({id:'fv|'+t.id,k:'venc',h:`${I('alert')} <b>${esc(t.descricao)}</b> venceu em ${fmtData(venceFatura(t))} e não está marcada como paga · ${brl(restanteFatura(t))} <button class="btn2 sm" data-act="pagar-fat" data-id="${t.id}">pagar</button>`});
  });
  if(completo){
    const m=mesAtual();
    const LO=limOrc(m);S.cats.filter(c=>LO[c]>0).forEach(c=>{const g=somaMes(m,'despesa',c,true),p=g/LO[c]*100;
      if(p>=80)out.push({id:'or|'+c+'|'+m+'|'+(p>=100?2:1),k:p>=100?'venc':'aviso',h:`${I('alert')} orçamento de <b>${esc(c)}</b> ${p>=100?'estourou':'em '+Math.floor(p)+'%'} · ${brl(g)} de ${brl(LO[c])}`});});
    S.cartoes.forEach(c=>{if(c.arq||!(c.limite>0))return;const u=usadoCartaoTotal(c),p=u/c.limite*100;
      if(p>=90)out.push({id:'lm|'+c.id+'|'+m+'|'+(p>=100?2:1),k:p>=100?'venc':'aviso',h:`${I('card')} cartão <b>${esc(c.nome)}</b> com ${Math.round(p)}% do limite usado · livre ${brl(Math.max(0,c.limite-u))}`});});
  }
  try{out.push(...empAvisos(AD));}catch(e){}
  try{if(notifOn('metas'))out.push(...mtAvisos().map(a=>({id:a.id,k:a.k,h:a.h})));}catch(e){} // v10.87: dia de guardar
  try{out.push(...assinAvisos());}catch(e){}
  try{out.push(...irAvisos());}catch(e){} // v10.111: DARF e alerta de preço
  /* v10.66: cada alerta tem id estável; quem não tem ganha um pelo texto. excluídos somem, lidos ficam apagados */
  const est=alEst();
  return out.map(a=>{if(!a.id)a.id='tx|'+hashObj(a.h.replace(/<[^>]+>/g,''));const e=est[a.id];a.lido=!!e&&e[0]==='l';a.fora=!!e&&e[0]==='x';return a;}).filter(a=>!a.fora);
}
function alEst(){return (S.cfg&&S.cfg.alEst&&typeof S.cfg.alEst==='object')?S.cfg.alEst:{};}
function alMarca(ids,estado){
  const e=Object.assign({},alEst()),hj=hojeISO();
  ids.forEach(id=>{if(estado)e[id]=estado+':'+hj;else delete e[id];});
  S.cfg.alEst=e;salvar();atualizaSino();
}
/* notificações push: o aparelho se inscreve aqui; a função alertas-push (Supabase) manda os avisos todo dia às 9h */
const VAPID_PUB='BABTAFc-W1foM1xFylZj_HA06v-U6H5f-NsjVk_9-wuzRPHIIh6eavWXler-eTcGWD8xOsCagXVPzoGQfzeeZDo';
function pushSuportado(){try{return !!navigator.serviceWorker&&'PushManager' in window&&'Notification' in window;}catch(e){return false;}} // v10.97: !! (alguns navegadores têm a propriedade, mas vazia)
function b64uBytes(s){const p='='.repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0));}
async function inscricaoAtual(){if(!pushSuportado())return null;const r=await navigator.serviceWorker.getRegistration();return r?r.pushManager.getSubscription():null;}
async function atualizaPushUI(){
  const t=document.getElementById('pushTxt'),b=document.getElementById('pushBtns');if(!t||!b)return;
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(!pushSuportado()){t.textContent=ios&&!instalado()?'No iPhone, primeiro instale o app: no Safari, toque em Compartilhar e em Adicionar à Tela de Início. Depois abra pelo ícone e ative aqui.':'Este navegador não aceita notificações push.';b.innerHTML='';return;}
  if(Notification.permission==='denied'){t.textContent='As notificações estão bloqueadas para o GranaViva. Libere nos ajustes do aparelho e volte aqui.';b.innerHTML='';return;}
  let s=null;try{s=await inscricaoAtual();}catch(e){}
  if(s){t.innerHTML='<span class="pushOn"><i></i>Ativadas neste aparelho</span><span class="pushSub">Todo dia às 9h. Escolha o que quer receber:</span>'+notifListaHTML();b.innerHTML='<button class="pushBtn teste" data-act="push-teste">'+I('bell')+'<span>enviar teste</span></button><button class="pushBtn off" data-act="push-off"><span>desativar</span></button>';}
  else{t.textContent='Receba um aviso no celular quando uma fatura ou conta fixa estiver perto de vencer ou atrasar, ou quando um orçamento estiver acabando.';b.innerHTML='<button class="btn sm" data-act="push-on">ativar notificações</button>';}
}
const NOTIF_T=[['fatVence','card','#a78bfa','Faturas a vencer','com antecedência, na véspera e no dia'],['fatAtras','alert','#f87171','Faturas atrasadas','1, 3 e 7 dias depois do vencimento'],['fixas','calendar','#22d3ee','Contas fixas','no vencimento de cada conta'],['previstos','receipt','#fb923c','Lançamentos previstos','contas agendadas a vencer ou atrasadas'],['orc','gauge','#a3e635','Orçamentos','ao chegar em 80% e ao estourar'],['resumo','calendar','#60a5fa','Resumo diário','toda manhã, o que vence hoje (padrão)'],['semanal','report','#34d399','Resumo da semana','domingo às 9h: entrou, saiu, o que vence e o que tem a receber'],['metas','piggy','#22c55e','Dia de guardar','no sino do app, no dia do aporte de cada meta'],['guardar','piggy','#16a34a','Dia de guardar no aparelho','notificação às 9h com o app fechado, uma vez por meta no mês'],['darf','receipt','#f59e0b','Imposto das vendas (DARF)','7 dias antes e no dia do vencimento, também com o app fechado'],['alvoPreco','up','#38bdf8','Alertas do Radar','quando um ativo que você segue passa do preço ou cai forte no dia: a cada 15 min no pregão, cripto de hora em hora']]; // v10.89: guardar = push do servidor (alertas-push), padrão ligado
function notifOn(k){return !(S.cfg.notif&&S.cfg.notif[k]===false);}
function notifListaHTML(){const disc=S.cfg.pushDiscreto!==false;return '<div class="ntList">'+NOTIF_T.filter(x=>!(MVP_MODE&&x[0]==='darf')).map(([k,ic,c,t,sub])=>{const on=notifOn(k);return `<button type="button" class="ntRow" role="switch" aria-checked="${on}" data-act="notif-tog" data-id="${k}"><span class="ntIc" style="--c:${c}">${I(ic)}</span><span class="ntTx"><b>${t}</b><small>${sub}</small></span><span class="ntSw${on?' on':''}"><i></i></span></button>`;}).join('')+`<button type="button" class="ntRow" role="switch" aria-checked="${disc}" data-act="notif-disc"><span class="ntIc" style="--c:#94a3b8">${I('lock')}</span><span class="ntTx"><b>Notificações discretas</b><small>sem valores nem nomes na tela bloqueada</small></span><span class="ntSw${disc?' on':''}"><i></i></span></button>`+'</div>';}
async function ativarPush(){
  if(!USER){toast('entre na sua conta primeiro');return;}
  if(!pushSuportado()){toast('Este navegador não aceita notificações push.',true);return;}
  try{
    const p=await Notification.requestPermission();
    if(p!=='granted'){toast('permissão não concedida');atualizaPushUI();return;}
    const r=await navigator.serviceWorker.ready;
    let s=await r.pushManager.getSubscription();
    if(!s)s=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uBytes(VAPID_PUB)});
    const j=s.toJSON();
    const {error}=await sb.from('push_subs').upsert({endpoint:j.endpoint,user_id:USER.id,p256dh:j.keys.p256dh,auth:j.keys.auth,ua:navigator.userAgent.slice(0,200)});
    if(error)throw error;
    toast('notificações ativadas');
    sb.functions.invoke('alertas-push',{body:{teste:true}}).catch(()=>{});
  }catch(e){toast('não deu para ativar: '+(e&&e.message||e));}
  atualizaPushUI();
}
async function desativarPush(){
  try{const s=await inscricaoAtual();if(s){await sb.from('push_subs').delete().eq('endpoint',s.endpoint);await s.unsubscribe();}toast('notificações desativadas');}
  catch(e){toast('erro ao desativar');}
  atualizaPushUI();
}
let PROMPT_INST=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();PROMPT_INST=e;});
window.addEventListener('appinstalled',()=>{PROMPT_INST=null;try{localStorage.setItem('gv-inst-ok','1');}catch(e){}});
function instalado(){return (window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;}
function dicaInstalarHTML(forcar){
  if(instalado())return '';
  if(!forcar){try{if(localStorage.getItem('gv-inst-ok'))return '';}catch(e){}}
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(!ios&&!PROMPT_INST)return '';
  return `<div class="card instCard"><div class="instTxt"><b>Instale o GranaViva</b><small>${ios?'No Safari, toque em Compartilhar e depois em <b>Adicionar à Tela de Início</b>. Ele abre em tela cheia e funciona sem internet.':'Fica com ícone na tela inicial, abre em tela cheia e funciona sem internet.'}</small></div><div class="row" style="gap:6px">${ios?'':'<button class="btn sm" data-act="instalar">instalar</button>'}${forcar?'':'<button class="btn2 sm" data-act="inst-ok">agora não</button>'}</div></div>`;
}
function atualizaSino(){const n=listaAlertas(true).filter(a=>a.k==='venc'&&!a.lido).length,b=$('#bellN');if(!b)return;b.hidden=!n;b.textContent=n>9?'9+':String(n);$('#btnBell').setAttribute('aria-label',n?'alertas, '+n+' urgentes':'alertas');}
function alItemHTML(a){return `<div class="alItem${a.lido?' lido':''}${a.k==='venc'?' venc':''}" data-aid="${esc(a.id)}"><div class="alBg"><span class="alL">${I('check')}<b>lida</b></span><span class="alR"><b>excluir</b>${I('trash')}</span></div><div class="alFace">${a.lido?'':'<i class="alDot"></i>'}<div class="alTxt">${a.h}</div></div></div>`;}
function abrirAlertas(){
  const l=listaAlertas(true),nl=l.filter(a=>!a.lido).length;
  const box=$('#modal');
  box.innerHTML=`<div class="sheet alSheet" role="dialog" aria-modal="true" aria-label="Alertas"><div class="sh-head"><h3>Alertas${nl?` <span class="alQt">${nl}</span>`:''}</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    ${l.length?`<div class="alTools"><small>arraste → para marcar como lida, ← para excluir</small>${nl?'<button class="lnk" data-act="al-todas">marcar todas como lidas</button>':''}</div><div class="alLista">${l.map(alItemHTML).join('')}</div>`:'<div class="alVazio">'+I('check')+'<b>Tudo em dia</b><p>Nenhuma fatura vencendo, nada atrasado e orçamentos sob controle.</p></div>'}
    ${dicaInstalarHTML(true)}</div>`;
  box.classList.add('on');
}
/* v10.66: arrastar alerta. → marca como lida (ou volta a não lida), ← exclui com opção de desfazer */
(function(){
  let it=null,face=null,x0=0,y0=0,dx=0,modo=null;
  const fim=()=>{if(!it)return;const el=it,f=face,w=el.offsetWidth,lim=Math.min(110,w*.32),id=el.dataset.aid;
    el.classList.remove('arr');
    if(modo==='h'&&dx<=-lim){f.style.transition='transform .22s ease';f.style.transform=`translateX(${-w}px)`;
      setTimeout(()=>{el.style.height=el.offsetHeight+'px';void el.offsetHeight;el.classList.add('sai');el.style.height='0px';
        setTimeout(()=>{alMarca([id],'x');el.remove();alRecontar();alDesfazer('Alerta excluído',()=>{alMarca([id],null);abrirAlertas();});},220);},200);}
    else if(modo==='h'&&dx>=lim){const lido=!el.classList.contains('lido');f.style.transition='transform .25s cubic-bezier(.2,.8,.2,1)';f.style.transform='';
      el.classList.toggle('lido',lido);const dot=f.querySelector('.alDot');if(lido&&dot)dot.remove();else if(!lido&&!dot)f.insertAdjacentHTML('afterbegin','<i class="alDot"></i>');
      alMarca([id],lido?'l':null);alRecontar();}
    else{f.style.transition='transform .25s cubic-bezier(.2,.8,.2,1)';f.style.transform='';}
    el.classList.remove('dir','esq','pronto');it=null;face=null;modo=null;dx=0;};
  document.addEventListener('pointerdown',e=>{const el=e.target.closest('.alItem');if(!el||e.target.closest('button,a'))return;it=el;face=el.querySelector('.alFace');x0=e.clientX;y0=e.clientY;dx=0;modo=null;face.style.transition='none';},{passive:true});
  document.addEventListener('pointermove',e=>{if(!it)return;const mx=e.clientX-x0,my=e.clientY-y0;
    if(!modo){if(Math.abs(mx)>8&&Math.abs(mx)>Math.abs(my)*1.2){modo='h';it.classList.add('arr');}else if(Math.abs(my)>8){modo='v';}}
    if(modo!=='h')return;dx=mx;const w=it.offsetWidth,lim=Math.min(110,w*.32);
    const r=Math.abs(dx)>lim?lim+(Math.abs(dx)-lim)*.35:Math.abs(dx);face.style.transform=`translateX(${dx<0?-r:r}px)`;
    it.classList.toggle('dir',dx>0);it.classList.toggle('esq',dx<0);it.classList.toggle('pronto',Math.abs(dx)>=lim);},{passive:true});
  document.addEventListener('pointerup',fim);document.addEventListener('pointercancel',fim);
})();
function alRecontar(){const q=document.querySelectorAll('.alItem:not(.lido)').length,h=document.querySelector('.alSheet h3');if(!h)return;let b=h.querySelector('.alQt');if(!q){if(b)b.remove();const bt=document.querySelector('[data-act="al-todas"]');if(bt)bt.remove();}else{if(!b){h.insertAdjacentHTML('beforeend',' <span class="alQt"></span>');b=h.querySelector('.alQt');}b.textContent=q;}
  if(!document.querySelector('.alItem')){const L=document.querySelector('.alLista'),T=document.querySelector('.alTools');if(T)T.remove();if(L)L.outerHTML='<div class="alVazio">'+I('check')+'<b>Tudo em dia</b><p>Você limpou todos os alertas.</p></div>';}}
let alDesT=null;
function alDesfazer(m,fn){const t=$('#toast');t.className='';t.innerHTML='<span>'+esc(m)+'</span><button type="button" class="tDesf">desfazer</button>';t.classList.add('on');
  t.querySelector('.tDesf').onclick=()=>{t.classList.remove('on');clearTimeout(alDesT);fn();};clearTimeout(toastT);clearTimeout(alDesT);alDesT=setTimeout(()=>t.classList.remove('on'),4500);}
function fixasCard(){
  const h=new Date(),fx=S.fixas||[];
  const sai=fx.filter(f=>f.tipo!=='receita').reduce((a,f)=>a+cents(mensalEq(f)),0)/100,entra=fx.filter(f=>f.tipo==='receita').reduce((a,f)=>a+cents(mensalEq(f)),0)/100;
  const total=sai;
  const hjI=hojeISO(),hj0=new Date(h.getFullYear(),h.getMonth(),h.getDate());
  const lst=fx.map(f=>{
    const oc=ocorrenciasFixa(Object.assign({},f,{criadoEm:''}),hjI,isoDe(new Date(h.getFullYear(),h.getMonth(),h.getDate()+5)))[0];
    const diff=oc?Math.round((new Date(+oc.data.slice(0,4),+oc.data.slice(5,7)-1,+oc.data.slice(8,10))-hj0)/864e5):-1;
    const rec=f.tipo==='receita',due=diff>=0;
    const badge=!due?'':diff===0?`<span class="fx-badge hoje">${rec?'entra hoje':'vence hoje'}</span>`:`<span class="fx-badge">${rec?'entra':'vence'} em ${diff} ${diff===1?'dia':'dias'}</span>`;
    return `<div class="tx hov fx-row${due&&!rec?' due':''}"><span class="fx-ic sm">${I(rec?'up':'receipt')}</span><div class="txt"><b>${esc(f.nome)}</b><small>${descFreq(f)} · ${esc(f.categoria||'Outros')}${f.auto===false?' · confirmo manualmente':''}</small>${badge}</div><div class="val ${rec?'pos':'neg'}">${rec?'+':''}${brl(f.valor)}</div><div class="acts"><button data-act="edit-fixa" data-id="${f.id}" title="editar" aria-label="editar">${I('edit')}</button><button data-act="del-fixa" data-id="${f.id}" title="excluir" aria-label="excluir">${I('trash')}</button></div></div>`;
  }).join('');
  return `<div class="card fixas-card"><div class="fx-head"><span class="fx-ic">${I('receipt')}</span><div><h4>Contas fixas</h4><b class="fx-total">${brl(total)}<small> / mês</small></b>${entra>0?`<small class="fx-entra">entram ${brl(entra)} / mês</small>`:''}</div></div>${lst||'<p class="vazio">nenhuma conta fixa. cadastre aluguel, luz, internet ou o salário. elas entram sozinhas no extrato.</p>'}<button class="btn full" data-act="nova-fixa">+ conta fixa</button></div>`;
}
/* v10.89: na tela chamam-se "cobranças recorrentes" (pegam também aluguel, mercado, luz). as chaves salvas continuam
   as mesmas (f.assinatura, f.assinKey, cfg.assinIgnora, cfg.assinVisto), então nada muda nos dados.
   v10.46: assinaturas detectadas. olha as despesas dos últimos ~6 meses (banco, cartão e manuais), agrupa pelo estabelecimento
   e acha cobranças mensais de valor parecido. as que você vira conta fixa ficam marcadas (assinatura:true) e entram no mesmo card. */
const ASSIN_KW=/netflix|spotify|disney|hbo|\bmax\b|prime ?video|amazon ?prime|youtube|apple ?com|icloud|google ?one|google ?storage|deezer|globoplay|paramount|crunchyroll|chatgpt|openai|microsoft|office ?365|adobe|canva|smart ?fit|academia|gympass|wellhub|\bvivo\b|\bclaro\b|\btim\b|\boi\b|internet|assinatura|streaming/;
const ASSIN_RUIDO=/\b(pg|pag|pagseguro|pagamento|pagto|mp|mercadopago|ifd|ifood|ec|dl|ebn|htm|www|com|br|net|ltda|me|sa|eireli|bill|compra|compras|debito|credito|pix|enviado|enviada|transferencia|no|na|via|nupay|int|internacional|digital|servicos|entretenimento|brasil|do|da|de)\b/g;
function assinChave(desc){
  const n=(typeof nomeTx==='function'?nomeTx({descricao:desc}).n:String(desc||''))||String(desc||'');
  const base=chaveRegra(n.replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g,' '));
  const k=base.replace(ASSIN_RUIDO,' ').replace(/\s+/g,' ').trim();
  return (k.length>=3?k:base).slice(0,40);
}
function assinParecidas(a,b){if(!a||!b)return false;if(a===b)return true;const [c,l]=a.length<b.length?[a,b]:[b,a];return c.length>=4&&(l.startsWith(c+' ')||l.endsWith(' '+c)||l.includes(' '+c+' '));}
/* função pura: (tx, fixas, cfg, hoje) -> candidatas. sem efeitos colaterais. */
const ASSIN_MARCAS={tim:'TIM',vivo:'Vivo',claro:'Claro',oi:'Oi',netflix:'Netflix',spotify:'Spotify',disney:'Disney+',hbo:'HBO Max',globoplay:'Globoplay',deezer:'Deezer',youtube:'YouTube Premium',icloud:'iCloud',apple:'Apple',googleone:'Google One',amazon:'Amazon Prime',prime:'Amazon Prime',paramount:'Paramount+',crunchyroll:'Crunchyroll',openai:'ChatGPT',chatgpt:'ChatGPT',microsoft:'Microsoft 365',adobe:'Adobe',canva:'Canva',smartfit:'Smart Fit',wellhub:'Wellhub',gympass:'Wellhub'};
function assinNome(n){
  let s=n.replace(/\.com(\.br)?\b/ig,'').replace(/\b(s\.?\s?\/?a\.?|ltda|me|eireli|epp|s\/s|cia)\b\.?/ig,' ').replace(/[*_]+/g,' ').replace(/\s{2,}/g,' ').trim();
  const p=s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/[^a-z0-9]+/).filter(Boolean);
  if(p.length&&ASSIN_MARCAS[p[0]])return ASSIN_MARCAS[p[0]];
  if(p.length>1&&ASSIN_MARCAS[p[0]+p[1]])return ASSIN_MARCAS[p[0]+p[1]];
  if(s===s.toUpperCase()||s===s.toLowerCase())s=s.toLowerCase().replace(/(^|\s)\S/g,m=>m.toUpperCase());
  return s.slice(0,60);
}
/* v10.95: cobranças recorrentes em dois grupos.
   "Assinaturas": valor estável, mesma loja, no cartão ou débito (ou serviço conhecido: streaming, apps, academia, telefonia).
   "Contas do mês": aluguel, condomínio, luz, água, gás, internet de casa, mercado, escola, plano de saúde... (o valor pode variar até ~40%).
   fora: dinheiro, variação acima de ~40%, e lazer/restaurante/delivery que não são assinatura. o alerta "subiu X%" é só das assinaturas.
   as chaves salvas continuam as mesmas: f.assinatura, f.assinKey, cfg.assinIgnora, cfg.assinVisto. */
const ASSIN_VAR=0.4;
const ASSIN_CONTA_CAT=/moradia|contas? da casa|aluguel|condom|educa|escola|faculdade|plano de saude|seguro|imposto|agua|luz|energia|\bgas\b|internet e celular/;
const ASSIN_CONTA_KW=/aluguel|condominio|\bluz\b|energia|eletric|enel\b|cemig|copel|light\b|neoenergia|celpe|coelba|cosern|equatorial|energisa|\bagua\b|saneamento|sabesp|caesb|copasa|cedae|embasa|compesa|sanepar|\bgas\b|comgas|naturgy|iptu|ipva|escola|colegio|faculdade|mensalidade|plano de saude|unimed|amil|hapvida|seguro|financiamento|consorcio/;
const ASSIN_LAZER=/lazer|mercado|supermerc|feira|atacad|assai|carrefour|hortifruti|sacolao|alimenta|restaurant|delivery|lanche|lanchonete|\bbar\b|ifood|rappi|cinema|ingresso|pizza|burger|padaria|cafe\b|cafeteria|entretenimento|viagem|uber|99 ?app|taxi/;
const ASSIN_SERV=/netflix|spotify|disney|hbo|\bmax\b|prime ?video|amazon ?prime|youtube|apple|icloud|google ?one|google ?storage|deezer|globoplay|paramount|crunchyroll|chatgpt|openai|microsoft|office ?365|adobe|canva|smart ?fit|academia|gympass|wellhub|assinatura|streaming|\bvivo\b|\bclaro\b|\btim\b|\boi\b/;
function assinDinheiro(t){if(t.forma==='dinheiro')return true;const c=t.conta||contaDoLanc(t);if(!c)return false;const b=(S.bancos||[]).find(x=>x.id===c);return !!(b&&b.tipo==='Dinheiro');}
function assinCartaoDeb(t){if(t.cartao||t.forma==='cartao'||t.forma==='debito')return true;const n=norm((t.descricao||'')+' '+(t.sub||''));return /debito|compra no cartao|nupay/.test(n)&&!/\bpix\b|boleto/.test(n);}
/* grupo de uma cobrança: 'assin' | 'conta' | '' (fora) */
function assinGrupo(o){
  const nm=norm((o.nome||'')+' '+(o.chave||'')+' '+(o.sub||'')),cat=norm(o.cat||'');
  const serv=o.kw||ASSIN_SERV.test(nm)||/assinatura|streaming/.test(cat);
  const conta=ASSIN_CONTA_CAT.test(cat)||ASSIN_CONTA_KW.test(nm),lazer=ASSIN_LAZER.test(cat)||ASSIN_LAZER.test(nm);
  const vals=(o.vals||[]).map(Number).filter(v=>v>0),ant=vals.slice(0,-1).length?vals.slice(0,-1):vals;
  const md=ant.length?ant.slice().sort((a,b)=>a-b)[ant.length>>1]:0,dentro=p=>md>0&&ant.every(v=>Math.abs(v-md)<=md*p);
  const estavel=dentro(lazer?0.03:0.12); // lazer/restaurante/delivery só é assinatura com preço fixo (clube, plano)
  if(serv&&!(conta&&!ASSIN_SERV.test(nm)))return 'assin';
  if(conta&&!lazer)return 'conta';
  if(estavel&&o.cartaoDeb)return 'assin';
  return '';
}
function assinGrupoFixa(f){return assinGrupo({nome:f.nome,chave:f.assinKey||'',cat:f.categoria,vals:[f.valor],kw:false,cartaoDeb:f.forma==='cartao'||!!f.cartao})||(f.forma==='cartao'||f.cartao?'assin':'conta');}
function detectaAssinaturas(tx,fixas,cfg,hoje){if(!tx&&!fixas&&!cfg&&!hoje)return memo('assin',()=>detectaAssinaturas0(),true);return detectaAssinaturas0(tx,fixas,cfg,hoje);}
function detectaAssinaturas0(tx,fixas,cfg,hoje){
  tx=tx||S.tx;fixas=fixas||S.fixas||[];cfg=cfg||S.cfg||{};hoje=hoje||hojeISO();
  const dt=s=>new Date(+s.slice(0,4),+s.slice(5,7)-1,+s.slice(8,10)),dH=dt(hoje);
  const lim=isoDe(new Date(dH.getFullYear(),dH.getMonth()-6,dH.getDate())),rec=isoDe(new Date(dH.getFullYear(),dH.getMonth(),dH.getDate()-45));
  const ign=new Set(Array.isArray(cfg.assinIgnora)?cfg.assinIgnora:[]);
  const med=a=>{const s=a.slice().sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
  const G={};
  tx.forEach(t=>{
    if(t.tipo!=='despesa'||t.faturaKey||t.fixaKey||t.status==='cancelado'||t.status==='previsto'||!(+t.valor>0))return;
    if(!t.data||t.data<lim||t.data>hoje||(t.parcela&&t.parcelas)||/parc(ela)?\.?\s*\d+\s*(\/|de)\s*\d+/i.test(t.descricao||''))return;
    const k=assinChave(t.descricao||'');if(k.length<3||ign.has(k))return;
    /* v10.52: pix para pessoa (chave aleatória, cpf/cnpj, "pix enviado para") e posto de combustível não são assinatura */
    const nTx=norm(t.descricao||'')+' '+norm(t.sub||'');
    /* v10.126: pix de aluguel/escola/conta da casa (categoria ou nome de conta) continua valendo como conta do mês */
    const ehConta=ASSIN_CONTA_CAT.test(norm(t.categoria||''))||ASSIN_CONTA_KW.test(nTx);
    if(!ehConta&&/pix (enviado|para|tef)|chave aleat|\bcpf\b|\bcnpj\b|[0-9a-f]{16,}/.test(nTx))return;
    if(/posto|combust|gasolina|etanol|\balcool\b|ipiranga|shell|petrobras|br mania|ale combust/.test(nTx))return;
    if(assinDinheiro(t))return; // v10.95: compra em dinheiro (ou numa conta do tipo Dinheiro) não é cobrança recorrente
    (G[k]=G[k]||[]).push(t);
  });
  const out=[];
  Object.entries(G).forEach(([k,L])=>{
    L.sort((a,b)=>a.data<b.data?-1:a.data>b.data?1:0);
    const porMes={};L.forEach(t=>{(porMes[t.data.slice(0,7)]=porMes[t.data.slice(0,7)]||[]).push(t);});
    const meses=Object.keys(porMes).sort();
    if(meses.length<2||L.length>meses.length+1||meses.some(m=>porMes[m].length>2))return; // várias por mês (Uber, mercado): não é assinatura
    const seq=meses.map(m=>porMes[m][porMes[m].length-1]);
    const vals=seq.map(t=>+t.valor),mv=med(vals);
    if(vals.some(v=>Math.abs(v-mv)>mv*ASSIN_VAR))return; // v10.95: variação acima de ~40% não é recorrente
    const gaps=seq.slice(1).map((t,i)=>Math.round((dt(t.data)-dt(seq[i].data))/864e5)),mg=med(gaps);
    if(mg<25||mg>35)return;
    const ult=seq[seq.length-1];if(ult.data<rec)return; // parou de cobrar
    const nomeU=typeof nomeTx==='function'?nomeTx(ult).n:ult.descricao;
    const kw=ASSIN_KW.test(k)||ASSIN_KW.test(norm(nomeU))||ASSIN_KW.test(norm(ult.sub||''));
    const consec=meses.slice(1).some((m,i)=>{const [y0,m0]=meses[i].split('-').map(Number),[y1,m1]=m.split('-').map(Number);return (y1*12+m1)-(y0*12+m0)===1;});
    if(!(meses.length>=3||(kw&&consec)))return;
    const grupo=assinGrupo({nome:nomeU,chave:k,cat:ult.categoria,sub:ult.sub,vals,kw,cartaoDeb:seq.every(assinCartaoDeb)});
    if(!grupo)return;
    const dias=seq.map(t=>+t.data.slice(8,10)),dia=Math.round(med(dias));
    const coberta=fixas.some(f=>{if(f.tipo==='receita')return false;const fk=f.assinKey||assinChave(f.nome);if(assinParecidas(fk,k))return true;
      const dd=Math.abs((+f.dia||1)-dia),dc=Math.min(dd,31-dd);return Math.abs((+f.valor||0)-ult.valor)<=(+f.valor||0)*0.05&&dc<=3;});
    if(coberta)return;
    const vA=+ult.valor,prev=seq.length>1?+seq[seq.length-2].valor:null;
    let vAnt=null;for(let i=seq.length-2;i>=0;i--){if(Math.round(seq[i].valor*100)!==Math.round(vA*100)){vAnt=+seq[i].valor;break;}}
    const aumento=prev&&vA>prev*1.03&&vA-prev>=0.5?Math.floor((vA/prev-1)*100):0;
    out.push({key:k,nome:assinNome(String(nomeU||k).replace(/^\s*(pix|transfer[eê]ncia)\s+(enviad[oa]|para)\s*(para\s*)?/i,''))||k,valorAtual:vA,valorAnterior:vAnt,dia,ultimo:ult.data,mesesVistos:meses.length,categoria:ult.categoria||'Outros',sub:ult.sub||'',totalAno:Math.round(vA*1200)/100,aumento:grupo==='assin'?aumento:0,grupo});
  });
  return out.sort((a,b)=>b.valorAtual-a.valorAtual);
}
/* fixas marcadas como assinatura + a última cobrança real do mês (para avisar quando sobe) */
function assinRastreadas(){
  const m=hojeISO().slice(0,7);
  return (S.fixas||[]).filter(f=>f.assinatura&&f.tipo!=='receita').map(f=>{
    const k=f.assinKey||assinChave(f.nome);
    const t=S.tx.filter(x=>x.tipo==='despesa'&&!x.fixaKey&&!x.faturaKey&&x.status!=='cancelado'&&x.status!=='previsto'&&x.data&&x.data.slice(0,7)===m&&assinParecidas(assinChave(x.descricao||''),k)).sort((a,b)=>a.data<b.data?1:-1)[0];
    const grupo=assinGrupoFixa(f);
    const subiu=grupo==='assin'&&t&&t.valor>f.valor*1.03&&t.valor-f.valor>=0.5?Math.floor((t.valor/f.valor-1)*100):0;
    return {f,k,t,subiu,grupo};
  });
}
/* assinatura virou conta fixa: o lançamento previsto da fixa sai quando a cobrança real do mês já entrou (não conta duas vezes) */
function conciliaAssin(){
  const fx=(S.fixas||[]).filter(f=>f.assinatura&&f.tipo!=='receita');if(!fx.length)return false;
  const reais=S.tx.filter(t=>t.tipo==='despesa'&&!t.fixaKey&&!t.faturaKey&&t.status!=='cancelado'&&t.data);
  const fora=new Set();
  fx.forEach(f=>{const k=f.assinKey||assinChave(f.nome);const ms=new Set(reais.filter(t=>assinParecidas(assinChave(t.descricao||''),k)).map(t=>t.data.slice(0,7)));
    if(!ms.size)return;S.tx.forEach(t=>{if(t.fixaKey&&t.fixaKey.split('|')[1]===f.id&&t.status==='previsto'&&ms.has(t.data.slice(0,7)))fora.add(t.id);});});
  if(!fora.size)return false;S.tx=S.tx.filter(t=>!fora.has(t.id));return true;
}
function assinAvisos(){
  const out=[],vis=(S.cfg&&S.cfg.assinVisto)||{},d=new Date(),rec=isoDe(new Date(d.getFullYear(),d.getMonth(),d.getDate()-35));
  assinRastreadas().forEach(({f,k,t,subiu})=>{if(!subiu||vis[k]===t.data.slice(0,7))return;
    out.push({k:'aviso',h:`${I('lu_trending_up')} <b>${esc(f.nome)}</b> subiu de ${brl(f.valor)} para ${brl(t.valor)} (+${subiu}%) <button class="btn2 sm" data-act="assin-atualiza" data-id="${esc(f.id)}">atualizar valor</button> <button class="btn2 sm" data-act="assin-visto" data-id="${esc(k+'|'+t.data.slice(0,7))}">ok</button>`});});
  detectaAssinaturas().forEach(c=>{if(!c.aumento||c.ultimo<rec||vis[c.key]===c.ultimo.slice(0,7))return;
    const ant=c.valorAtual/(1+c.aumento/100);const prev=c.valorAnterior||ant;
    out.push({k:'aviso',h:`${I('lu_trending_up')} <b>${esc(c.nome)}</b> subiu de ${brl(prev)} para ${brl(c.valorAtual)} (+${c.aumento}%) <button class="btn2 sm" data-act="assin-visto" data-id="${esc(c.key+'|'+c.ultimo.slice(0,7))}">ok</button>`});});
  return out;
}
let ASSIN_C=[];
function assinHTML(){
  const C=detectaAssinaturas(),R=assinRastreadas();ASSIN_C=C;
  if(!C.length&&!R.length)return '';
  const mes=R.reduce((a,x)=>a+cents(mensalEq(x.f)),0)/100+C.reduce((a,c)=>a+cents(c.valorAtual),0)/100,n=C.length+R.length;
  const somaG=g=>(R.filter(x=>x.grupo===g).reduce((a,x)=>a+cents(mensalEq(x.f)),0)+C.filter(c=>c.grupo===g).reduce((a,c)=>a+cents(c.valorAtual),0))/100;
  const row=(ic,cc,nome,info,val,badge,id)=>`<div class="rmRow asRow"><span class="rmI" style="--cc:${cc}">${I(ic)}</span><div class="rmT"><b>${esc(nome)}</b><small>${info}</small></div><div class="hvR"><span class="rmV nw">${brl(val)}</span>${badge}</div><button class="asMais" data-act="assin-menu" data-id="${esc(id)}" aria-label="opções da cobrança ${esc(nome)}">${I('more')}</button></div>`;
  const bdg=p=>p?`<span class="hvQ ${p>=10?'late':'soon'}">subiu ${p}%</span>`:'';
  const linG=g=>R.filter(x=>x.grupo===g).map(x=>row(catIcon(x.f.categoria),corCat(x.f.categoria),x.f.nome,`dia ${x.f.dia} · conta fixa`,x.f.valor,bdg(x.subiu),'f:'+x.f.id))
    .concat(C.filter(c=>c.grupo===g).map(c=>row(catIcon(c.categoria),corCat(c.categoria),c.nome,`dia ${c.dia} · ${c.mesesVistos} meses seguidos${g==='conta'&&c.valorAnterior?' · varia':''}`,c.valorAtual,bdg(c.aumento),'c:'+c.key)));
  const sec=(g,tit,sub)=>{const L=linG(g);if(!L.length)return '';const v=somaG(g);
    return `<div class="asSec asSec-${g}"><div class="asSecH"><h5>${tit}</h5><span class="nw">${L.length} · ${brl(v)}/mês</span></div>${sub?`<p class="asAno">${sub(v)}</p>`:''}${L.slice(0,6).join('')}${L.length>6?`<p class="hmNota">+${L.length-6} ${L.length-6>1?'cobranças':'cobrança'}</p>`:''}</div>`;};
  return `<div class="card hmAssin"><div class="hmH"><h4>cobranças recorrentes</h4><span class="hmSub">${n} · ${brl(mes)}/mês</span></div>
    ${sec('assin','Assinaturas',v=>brl(Math.round(v*1200)/100)+' por ano')}
    ${sec('conta','Contas do mês',null)}
    ${C.length?'<p class="hmNota">detectadas pelas cobranças mensais. use o menu para virar conta fixa ou dispensar.</p>':''}
  </div>`;
}
function assinMenu(id){
  id=String(id||'');const ehF=id.startsWith('f:'),v=id.slice(2);
  const f=ehF?(S.fixas||[]).find(x=>x.id===v):null,c=ehF?null:(ASSIN_C.find(x=>x.key===v)||detectaAssinaturas().find(x=>x.key===v));
  if(!f&&!c)return;
  const ops=ehF?[['edit','Editar conta fixa',()=>fixaForm(f.id)],['close','Não é recorrente',()=>{delete f.assinatura;salvar();render();toast('Desmarcada como cobrança recorrente');}]]
    :[['receipt','Virar conta fixa',()=>ACT['assin-fixa'](c.key)],['close','Não é recorrente',()=>ACT['assin-ignora'](c.key)]];
  const nome=f?f.nome:c.nome,cat=f?f.categoria:c.categoria,val=f?f.valor:c.valorAtual;
  const box=$('#modal');
  box.innerHTML=`<div class="sheet txSheet"><div class="txsHead"><span class="ic" style="color:${corCat(cat)}">${I(catIcon(cat))}</span><div><b>${esc(nome)}</b><small>${esc(cat)} · todo dia ${f?f.dia:c.dia}${c&&c.valorAnterior?' · antes '+brl(c.valorAnterior):''}</small></div><strong class="neg nw">${brl(val)}</strong></div>
    ${ops.map(([ic,l],i)=>`<button class="txsOp${i===1?' perigo':''}" data-tm="${i}">${I(ic)}<span>${esc(l)}</span></button>`).join('')}
    <button class="btn2 full" data-tm="">Fechar</button></div>`;
  box.classList.add('on');
  box.querySelector('.txSheet').addEventListener('click',e=>{const b=e.target.closest('[data-tm]');if(!b)return;e.stopPropagation();const a=b.dataset.tm;closeModal();if(a!=='')setTimeout(ops[+a][2],30);});
}
function fixaForm(id){
  const f=id?(S.fixas||[]).find(x=>x.id===id):null;
  const tp0=f&&f.tipo==='receita'?'receita':'despesa';
  form(f?'Editar conta fixa':'Nova conta fixa',[
    {name:'tipo',label:'Tipo',type:'select',value:tp0,options:[{v:'despesa',t:'Despesa (sai dinheiro)'},{v:'receita',t:'Receita (entra dinheiro)'}]},
    {name:'nome',label:'Nome',value:f?f.nome:'',required:true,placeholder:'ex: aluguel, salário'},
    {name:'valor',label:'Valor (R$)',value:f?num(f.valor):'',required:true,inputmode:'decimal',placeholder:'0,00'},
    {name:'freq',label:'Repete',type:'select',value:f?(f.freq||'mensal'):'mensal',options:[{v:'diaria',t:'todo dia'},{v:'semanal',t:'toda semana'},{v:'quinzenal',t:'a cada 2 semanas'},{v:'mensal',t:'todo mês'},{v:'anual',t:'todo ano'},{v:'intervalo',t:'personalizado (a cada…)'}]},
    {name:'n',label:'A cada',type:'number',min:1,max:365,value:f&&f.freq==='intervalo'?f.n||1:3},
    {name:'un',label:'Unidade',type:'select',value:f&&f.un||'dia',options:[{v:'dia',t:'dias'},{v:'semana',t:'semanas'},{v:'mes',t:'meses'}]},
    {name:'inicio',label:'Primeira cobrança',type:'date',value:f?(f.inicio||primeiraFixa(f)):hojeISO()},
    {name:'dia',label:'Dia (1 a 31)',type:'number',min:1,max:31,value:f?f.dia||'':''},
    {name:'dow',label:'Dia da semana',type:'select',value:f?String(f.dow||1):'1',options:DOW_L.map((d,i)=>({v:String(i),t:d}))},
    {name:'mes',label:'Mês',type:'select',value:f?String(f.mes||1):String(new Date().getMonth()+1),options:MESES_LONGO.map((m,i)=>({v:String(i+1),t:m}))},
    {name:'categoria',label:'Categoria',type:'select',value:f?f.categoria:(tp0==='receita'?CATS_RECEITA[0]:S.cats[0]),options:(tp0==='receita'?CATS_RECEITA:S.cats).map(c=>({v:c,t:c}))},
    {name:'fim',label:'Termina em (opcional)',type:'date',value:f&&f.fim||''},
    {name:'manual',label:'confirmar manualmente (fica "previsto" até eu marcar como pago)',type:'checkbox',value:!!(f&&f.auto===false)}
  ],v=>{
    const nome=String(v.nome).trim(),valor=parseBR(v.valor),dia=parseInt(v.dia,10),freq=FREQ_L[v.freq]?v.freq:'mensal';
    if(!nome)return 'Dê um nome à conta.';
    if(!(valor>0))return 'Informe o valor.';
    const porIntervalo=['diaria','quinzenal','intervalo'].includes(freq);
    const n=parseInt(v.n,10),inicio=String(v.inicio||''),fimR=String(v.fim||'');
    if(!ISO_RE.test(inicio))return 'Escolha a data da primeira cobrança.';
    if(freq==='intervalo'&&!(n>=1&&n<=365))return 'Intervalo entre 1 e 365.';
    if(fimR&&!ISO_RE.test(fimR))return 'Data final inválida.';
    if(fimR&&fimR<inicio)return 'A data final vem antes da primeira cobrança.';
    const obj={nome,valor,tipo:v.tipo==='receita'?'receita':'despesa',freq,categoria:v.categoria||S.cats[0],auto:!v.manual,fim:fimR};
    if(porIntervalo){obj.inicio=inicio;obj.dia=+inicio.slice(8,10);if(freq==='intervalo'){obj.n=n;obj.un=['dia','semana','mes'].includes(v.un)?v.un:'dia';}}
    /* v10.71: a data da primeira cobrança define o dia (mensal), o dia da semana (semanal) e dia+mês (anual).
       se ela já passou, a conta entra agora em Despesas com essa data; se é no mês que vem, começa lá. */
    obj.inicio=inicio;
    if(freq==='semanal'){obj.dow=new Date(+inicio.slice(0,4),+inicio.slice(5,7)-1,+inicio.slice(8,10)).getDay();obj.dia=f&&f.dia||1;}
    else if(!porIntervalo)obj.dia=+inicio.slice(8,10);
    if(freq==='anual')obj.mes=+inicio.slice(5,7);
    let valorAntigo=0; // v10.79: declarado fora do bloco (antes dava "valorAntigo is not defined" ao editar conta fixa)
    if(f){
      const inicioAnt=f.inicio||primeiraFixa(f),mudouInicio=inicioAnt!==inicio;
      const mudouRegra=mudouInicio||(f.freq||'mensal')!==freq||(freq==='semanal'&&+f.dow!==obj.dow)||(freq==='anual'&&+f.mes!==obj.mes)||(porIntervalo&&(f.inicio!==obj.inicio||(freq==='intervalo'&&(+f.n!==obj.n||f.un!==obj.un))))||(f.fim||'')!==fimR;
      valorAntigo=+f.valor||0;
      Object.assign(f,obj);
      // regra mudou: previstos futuros da regra antiga saem e a nova gera os seus
      if(mudouRegra){const hj=hojeISO();S.tx=S.tx.filter(t=>{const out=t.fixaKey&&t.fixaKey.split('|')[1]===f.id&&t.status==='previsto'&&t.data>hj;if(out)delete S.gerados[t.fixaKey];return !out;});f.criadoEm=mudouInicio?inicio:(f.criadoEm&&f.criadoEm>hj?f.criadoEm:hj);}
      /* v10.157: primeira cobrança empurrada para frente: o que o app gerou sozinho antes dela some (inclusive a ocorrência
         que já tinha "entrado hoje" como paga). lançamento feito ou editado à mão (id diferente do gerado) fica. */
      if(mudouInicio&&inicio>inicioAnt){S.tx=S.tx.filter(t=>{const out=t.fixaKey&&t.fixaKey.split('|')[1]===f.id&&t.data<inicio&&t.id===idGerado(t.fixaKey)&&!t.pagoManual;if(out)delete S.gerados[t.fixaKey];return !out;});}
    }else{if(!S.fixas)S.fixas=[];S.fixas.push(Object.assign({id:uid(),criadoEm:inicio},obj));}
    if(f){
      /* v10.52: conta fixa manual ("confirmar manualmente") com valor editado: o previsto futuro que ainda
         tem o valor antigo acompanha a edição, sem mexer no que o usuário já confirmou */
      S.tx.forEach(t=>{
        if(t.fixaKey&&t.fixaKey.split('|')[1]===f.id&&t.status==='previsto'&&t.data>hojeISO()&&+t.valor===valorAntigo)t.valor=valor;
      });
    }
    geraRecorrentes();salvar();render();toast('Conta fixa salva');
  });
  const mf=$('#mf'),q=n=>mf.querySelector('[name="'+n+'"]'),w=n=>q(n).closest('label');
  const li=w('inicio'),dica=document.createElement('small');dica.className='fxDica';
  const atalhos=document.createElement('div');atalhos.className='fxAtalho';
  atalhos.innerHTML='<button type="button" class="chip" data-fx="0">este mês</button><button type="button" class="chip" data-fx="1">próximo mês</button>';
  li.after(atalhos);atalhos.after(dica);
  const fmtD=iso=>iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4);
  const explica=()=>{
    const d=q('inicio').value,hj=hojeISO(),rec=q('tipo').value==='receita',manual=q('manual')&&q('manual').checked;
    li.firstChild.textContent=rec?'Primeiro recebimento':'Primeira cobrança';
    if(!ISO_RE.test(d)){dica.textContent='';return;}
    const ym=hj.slice(0,7),nome=rec?'receitas':'despesas';
    atalhos.querySelectorAll('[data-fx]').forEach(b=>b.classList.toggle('on',(b.dataset.fx==='0'&&d.slice(0,7)===ym)||(b.dataset.fx==='1'&&d.slice(0,7)===isoDe(new Date(+hj.slice(0,4),+hj.slice(5,7),1)).slice(0,7))));
    if(f&&d===(f.inicio||primeiraFixa(f))){dica.textContent='';return;}
    if(d<=hj)dica.textContent=(d.slice(0,7)===ym?'já entra este mês em '+nome:'entra em '+nome)+', em '+fmtD(d)+(manual?', como prevista até você marcar como paga.':(rec?', como recebida.':', como paga.'));
    else if(d.slice(0,7)===ym)dica.textContent='cobra este mês, em '+fmtD(d)+', e depois se repete.';
    else dica.textContent='a primeira cobrança é em '+fmtD(d)+'. nada entra este mês.';
    if(rec&&d>hj)dica.textContent=dica.textContent.replace('cobra','entra').replace('a primeira cobrança é','o primeiro recebimento é');
  };
  atalhos.addEventListener('click',e=>{const b=e.target.closest('[data-fx]');if(!b)return;
    const hj=new Date(),cur=q('inicio').value,dia=ISO_RE.test(cur)?+cur.slice(8,10):hj.getDate(),k=+b.dataset.fx;
    const y=hj.getFullYear(),m=hj.getMonth()+k;q('inicio').value=isoDe(new Date(y,m,Math.min(dia,ultimoDia(new Date(y,m,1).getFullYear(),new Date(y,m,1).getMonth()))));explica();});
  const pinta=()=>{const fr=q('freq').value;w('dia').style.display='none';w('dow').style.display='none';w('mes').style.display='none';w('n').style.display=w('un').style.display=fr==='intervalo'?'':'none';explica();};
  q('freq').onchange=pinta;q('inicio').addEventListener('change',explica);q('inicio').addEventListener('input',explica);if(q('manual'))q('manual').addEventListener('change',explica);pinta();
  q('tipo').onchange=()=>{const l=q('tipo').value==='receita'?CATS_RECEITA:S.cats;q('categoria').innerHTML=l.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');explica();};
}

/* ---------- planejamento: projeção dos próximos meses ----------
   regra única (a mesma do saldo e da previsão do mês):
   saldo inicial = saldo de hoje (só lançamentos pagos).
   entram: receitas previstas + receitas fixas que ainda não viraram lançamento.
   saem: despesas previstas (fora do cartão) + despesas fixas ainda não lançadas + compras no cartão no mês em que a fatura fecha.
   a simulação só existe nesta tela: nada é gravado. */
let PLAN={n:6,renda:0,extra:0,corte:0,dia:false,itens:[]};
/* v10.70: itens da simulação "e se…". k = mês de início (0 = este mês, 1 = próximo…)
   tipos: rmes (renda a mais por mês) · gmes (conta nova por mês) · parc (compra parcelada: total em n vezes) · gun (gasto único) · run (entrada única) */
const SIM_TIPOS={rmes:{n:'Renda a mais por mês',s:1,ic:'up'},gmes:{n:'Conta nova por mês',s:-1,ic:'refresh'},parc:{n:'Compra parcelada',s:-1,ic:'card'},gun:{n:'Gasto único',s:-1,ic:'down'},run:{n:'Entrada única',s:1,ic:'plus'}};
function simItemMes(it,k){
  const v=cents(it.v||0);if(!v||k<(it.k||0))return 0;
  const d=k-(it.k||0);
  if(it.t==='rmes')return v;
  if(it.t==='gmes')return -v;
  if(it.t==='gun')return d===0?-v:0;
  if(it.t==='run')return d===0?v:0;
  if(it.t==='parc'){const n=Math.max(1,Math.min(48,Math.round(it.n||1)));if(d>=n)return 0;const base=Math.floor(v/n);return -(d===0?v-base*(n-1):base);}
  return 0;
}
/* gasto do dia a dia: média mensal dos 3 últimos meses fechados, só despesas pagas que não são conta fixa
   nem parcela (essas já estão na projeção). inclui o cartão (é dinheiro que vai sair na fatura). */
function gastoDiaADia(){
  return memo('gdd',()=>{
    const h=new Date(),ms=[1,2,3].map(i=>isoDe(new Date(h.getFullYear(),h.getMonth()-i,1)).slice(0,7));
    const prim=S.tx.reduce((a,t)=>t.data&&efetivo(t)&&(!a||t.data<a)?t.data:a,'');
    const usa=ms.filter(m=>prim&&prim.slice(0,7)<=m);if(!usa.length)return {v:0,meses:0};
    const nz=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
    const fixN=new Set((S.fixas||[]).filter(f=>f.tipo!=='receita').map(f=>nz(f.nome||f.descricao)).filter(Boolean));
    let tot=0;S.tx.forEach(t=>{if(t.tipo!=='despesa'||!efetivo(t)||!t.data||t.fixaKey||(t.parcelas>1)||t.emp||fixN.has(nz(t.descricao)))return;if(usa.includes(t.data.slice(0,7)))tot+=cents(t.valor);});
    return {v:Math.round(tot/usa.length)/100,meses:usa.length};
  },true);
}
function temSimulacao(P){P=P||PLAN;return !!(P.renda||P.extra||P.corte||P.dia||(P.itens&&P.itens.some(i=>i.v>0)));}
/* quanto dá pra assumir por mês (a partir do próximo) sem nenhum fim de mês ficar negativo, e quanto dá pra gastar hoje à vista */
function folgaPlano(linhas){
  const hoje=cents(saldoTotal());let mensal=Infinity,vista=hoje;
  linhas.forEach((m,k)=>{const sc=Math.round(m.saldo*100);vista=Math.min(vista,sc);if(k>0)mensal=Math.min(mensal,Math.floor(sc/k));});
  return {mensal:mensal===Infinity?0:Math.max(0,mensal)/100,vista:Math.max(0,vista)/100};
}
/* soma (em centavos) do que falta pagar das faturas fechadas com vencimento entre ini e fim */
function faturasAPagar(ini,fim){
  let r=0;
  S.tx.forEach(t=>{if(!t.faturaKey)return;const rs=cents(restanteFatura(t));if(rs<=0)return;const v=venceFatura(t);if(v>=ini&&v<=fim)r+=rs;});
  return r;
}
function projetaMeses(n,sim){if(!sim||!temSimulacao(sim))return memo('pm|'+n,()=>projetaMeses0(n),true);return projetaMeses0(n,sim);}
function projetaMeses0(n,sim){
  sim=sim||{};
  const h=new Date(),hj=hojeISO(),out=[];
  let saldo=cents(saldoTotal());
  /* v10.78: conta fixa no cartão sai no mês em que a fatura VENCE (igual ao saldo dia a dia); antes saía no mês da compra */
  const fixasFut=(ini,fim)=>{let r=0,d=0,dF=0;(S.fixas||[]).forEach(f=>{const cc=f.cartao&&f.tipo!=='receita'&&S.cartoes.find(x=>x.id===f.cartao);
    const ini2=cc?isoDe(new Date(+ini.slice(0,4),+ini.slice(5,7)-3,1)):ini;
    ocorrenciasFixa(f,ini2,fim).forEach(o=>{if(o.data<=hj||S.gerados[o.key])return;const ef=cc?fechamentoDe(cc,o.data).vence:o.data;if(ef<ini||ef>fim)return;const v=cents(f.valor);if(f.tipo==='receita')r+=v;else{d+=v;dF+=v;}});});return {r,d,dF};};
  for(let k=0;k<n;k++){
    const D=new Date(h.getFullYear(),h.getMonth()+k,1),ym=isoDe(D).slice(0,7);
    const ini=k===0?'0000-01-01':ym+'-01',fim=isoDe(new Date(D.getFullYear(),D.getMonth()+1,0));
    let rec=0,des=0,desFixa=0,cart=0;
    S.tx.forEach(t=>{
      if(t.status!=='previsto'||t.data<ini||t.data>fim)return;
      if(t.tipo==='receita')rec+=cents(t.valor);
      else if(t.tipo==='despesa'&&!t.cartao){des+=cents(t.valor);if(t.fixaKey)desFixa+=cents(t.valor);}
    });
    const fx=fixasFut(ym+'-01',fim);rec+=fx.r;des+=fx.d;desFixa+=fx.dF;
    empPrevistos(fim).forEach(x=>{if(x.data>=ym+'-01'||k===0)rec+=cents(x.valor);}); // v10.78: empréstimo com data combinada
    (S.cartoes||[]).forEach(c=>S.tx.forEach(t=>{
      if(t.cartao!==c.id||!(t.tipo==='despesa'||t.tipo==='transf')||!t.data||!efetivo(t))return;
      /* v10.52: entra no mês do VENCIMENTO da fatura, não do fechamento */
      const f=fechamentoDe(c,t.data);if(f.fecha>hj&&f.vence>hj&&f.vence>=ym+'-01'&&f.vence<=fim)cart+=cents(t.valor); // v10.56: sem contar duas vezes o ciclo já fechado
    }));
    /* v10.45: fatura já fechada e não paga sai no mês do vencimento (vencida = mês atual).
       as compras dela não entram acima (o ciclo já fechou), então não há dupla contagem. */
    cart+=faturasAPagar(k===0?'0000-01-01':ym+'-01',fim);
    // simulação vale a partir do próximo mês
    let sRec=0,sDes=0;
    if(k>0){sRec=cents(sim.renda||0);sDes=cents(sim.extra||0)-Math.round(desFixa*(Math.min(100,Math.max(0,sim.corte||0))/100));}
    (sim.itens||[]).forEach(it=>{const x=simItemMes(it,k);if(x>0)sRec+=x;else sDes-=x;});
    if(sim.dia){const g=cents(gastoDiaADia().v);if(k===0){const dm=new Date(h.getFullYear(),h.getMonth()+1,0).getDate();sDes+=Math.round(g*(dm-h.getDate())/dm);}else sDes+=g;}
    const entra=rec+sRec,sai=des+cart+sDes;
    saldo+=entra-sai;
    out.push({ym,entra:entra/100,sai:sai/100,cart:cart/100,saldo:saldo/100,rec:rec/100,des:des/100,desFixa:desFixa/100});
  }
  return out;
}

/* ---------- v10.56: saldo projetado dia a dia ----------
   parte do saldo de hoje e soma, no dia em que acontecem: previstos (atrasados contam hoje), próximas
   ocorrências das contas fixas (as no cartão caem no vencimento da fatura), compras no cartão de ciclos
   ainda abertos (no vencimento da fatura) e o que falta pagar de faturas fechadas. tudo em centavos. */
function projecaoDiaria(N){
  N=Math.max(7,Math.min(400,N||60));
  const h=new Date(),hj=hojeISO(),fimP=isoDe(new Date(h.getFullYear(),h.getMonth(),h.getDate()+N));
  const ev={},add=(d,o)=>{if(d<hj)d=hj;if(d>fimP)return;(ev[d]=ev[d]||[]).push(o);};
  const fat={},addFat=(c,vence,v)=>{if(!v)return;const k=c.id+'|'+vence;if(!fat[k])fat[k]={c,vence,v:0};fat[k].v+=v;};
  S.tx.forEach(t=>{
    if(t.status!=='previsto'||!t.data||t.cartao||t.tipo==='transf')return;
    const v=cents(t.valor);if(!v)return;
    add(t.data,{n:t.descricao||t.categoria,v:t.tipo==='receita'?v:-v,cat:t.categoria,tipo:t.tipo,atras:t.data<hj,id:t.id});
  });
  (S.fixas||[]).forEach(f=>ocorrenciasFixa(f,isoDe(new Date(h.getFullYear(),h.getMonth(),h.getDate()+1)),fimP).forEach(o=>{
    if(o.data<=hj||S.gerados[o.key])return;
    const v=cents(f.valor);if(!v)return;
    const c=f.cartao&&f.tipo!=='receita'&&S.cartoes.find(x=>x.id===f.cartao);
    if(c){addFat(c,fechamentoDe(c,o.data).vence,v);return;}
    add(o.data,{n:f.nome,v:f.tipo==='receita'?v:-v,cat:f.categoria,tipo:f.tipo,fixa:true});
  }));
  (S.cartoes||[]).forEach(c=>S.tx.forEach(t=>{
    if(t.cartao!==c.id||!(t.tipo==='despesa'||t.tipo==='transf')||!t.data||!efetivo(t))return;
    const f=fechamentoDe(c,t.data);if(f.vence>hj&&f.fecha>hj)addFat(c,f.vence,cents(t.valor)); // ciclo ainda aberto
  }));
  S.tx.forEach(t=>{if(!t.faturaKey)return;const rs=cents(restanteFatura(t));if(rs<=0)return;const c=S.cartoes.find(x=>t.faturaKey.indexOf('fat|'+x.id+'|')===0);if(c)addFat(c,venceFatura(t),rs);});
  Object.values(fat).forEach(F=>add(F.vence,{n:'fatura '+F.c.nome,v:-F.v,cat:'Cartão',tipo:'despesa',fatura:true,atras:F.vence<hj}));
  empPrevistos(fimP).forEach(x=>add(x.data,{n:'devolução · '+x.e.pessoa,v:cents(x.valor),cat:'Empréstimo',tipo:'receita',emp:x.e.id})); // v10.78
  let saldo=cents(saldoTotal());const dias=[];
  for(let i=0;i<=N;i++){
    const d=isoDe(new Date(h.getFullYear(),h.getMonth(),h.getDate()+i)),L=(ev[d]||[]).sort((a,b)=>a.v-b.v);
    const mov=L.reduce((a,o)=>a+o.v,0);saldo+=mov;
    dias.push({d,saldo:saldo/100,mov:mov/100,itens:L.map(o=>Object.assign({},o,{v:o.v/100}))});
  }
  return dias;
}

let CAL_M=0,PROJ_C=null;
function projCache(){const k=S.tx.length+'|'+(S.fixas||[]).length+'|'+hojeISO()+'|'+saldoTotal();if(!PROJ_C||PROJ_C.k!==k)PROJ_C={k,d:projecaoDiaria(100)};return PROJ_C.d;}

/* ---------- v10.61: renda comprometida ----------
   para cada um dos próximos meses: faturas de cartão já contratadas (parcelas e compras de ciclos abertos),
   contas fixas e outros previstos, contra a renda prevista do mês (ou a média recebida nos últimos 3 meses). */
function rendaMedia3(){let t=0,n=0;for(let k=1;k<=3;k++){const v=somaMes(mesOff(k),'receita');if(v>0){t+=cents(v);n++;}}return n?t/n/100:0;}
function compromissos(n){
  const pm=projetaMeses(n+1).slice(1),med=rendaMedia3();
  return pm.map(m=>{const renda=m.rec>0?m.rec:med,tot=m.cart+m.des;return {ym:m.ym,cart:m.cart,fixa:m.desFixa,outros:Math.max(0,m.des-m.desFixa),tot,renda,estim:!(m.rec>0),pct:renda>0?Math.round(tot/renda*100):null};});
}
function comprometidaHTML(){
  const L=compromissos(6);if(!L.some(m=>m.tot>0))return '';
  const nomeM=ym=>MESES[+ym.slice(5,7)-1]+'/'+ym.slice(2,4);
  const p1=L[0],cor=p=>p==null?'var(--mut)':p>=90?'#f87171':p>=70?'#fbbf24':'#4ade80';
  const pico=L.reduce((a,m)=>(m.pct||0)>(a.pct||0)?m:a,L[0]);
  /* v10.90: % acima de 999 vira "999+%" (renda quase zero gera números sem sentido) */
  const pf=p=>p==null?'':p>999?'999+%':p+'%';
  const msg=p1.pct==null?'Cadastre o salário como conta fixa para ver quanto da renda já está comprometido.':
    p1.pct>999?`Os compromissos de ${MESES_LONGO[+p1.ym.slice(5,7)-1]} (${brl(p1.tot)}) passam de 10 vezes a renda prevista (${brl(p1.renda)}). Confira o salário cadastrado.`:
    `${p1.pct}% da renda de ${MESES_LONGO[+p1.ym.slice(5,7)-1]} já tem destino. Sobram ${brl(Math.max(0,p1.renda-p1.tot))} livres${p1.estim?' (renda pela média dos últimos meses)':''}.`;
  return `<div class="card cmpCard"><h4>Renda comprometida</h4>
    <div class="cmpTop"><b style="color:${cor(p1.pct)}">${p1.pct==null?'—':pf(p1.pct)}</b><p>${msg}</p></div>
    <div class="cmpCols">${L.map(m=>{const h=Math.min(100,m.pct||0);return `<div class="cmpCol" title="${nomeM(m.ym)}"><small>${pf(m.pct)}</small><div class="cmpBar"><i style="height:${h}%;background:${cor(m.pct)}"></i></div><span>${MESES[+m.ym.slice(5,7)-1]}</span></div>`;}).join('')}</div>
    <div class="cmpLeg">${[['cartão',p1.cart],['contas fixas',p1.fixa],['outros previstos',p1.outros]].filter(x=>x[1]>0).map(x=>`<span>${x[0]} <b>${brl(x[1])}</b></span>`).join('')}</div>
    ${pico!==p1&&(pico.pct||0)>=70?`<p class="small" style="margin:8px 0 0">${MESES_LONGO[+pico.ym.slice(5,7)-1]} é o mês mais apertado: ${pf(pico.pct)} da renda.</p>`:''}
  </div>`;
}
function cdVal(v){const a=Math.abs(v),s=v<0?'−':'';return s+(a>=1e6?(a/1e6).toFixed(1).replace('.',',')+'M':a>=1e4?Math.round(a/1e3)+'k':a>=1e3?(a/1e3).toFixed(1).replace('.',',')+'k':Math.round(a));}
function calSaldoHTML(){
  const D=projCache(),hj=hojeISO(),h=new Date();
  const M=new Date(h.getFullYear(),h.getMonth()+CAL_M,1),ym=isoDe(M).slice(0,7);
  const nd=new Date(M.getFullYear(),M.getMonth()+1,0).getDate(),off=M.getDay();
  const map={};D.forEach(x=>map[x.d]=x);
  const prox=D.slice(0,61),min=prox.reduce((a,x)=>x.saldo<a.saldo?x:a,prox[0]),neg=prox.find(x=>x.saldo<0);
  const ultimo=D[D.length-1];
  let cells='';for(let i=0;i<off;i++)cells+='<span class="cdE"></span>';
  for(let d=1;d<=nd;d++){
    const iso=ym+'-'+(d<10?'0':'')+d,x=map[iso];
    if(!x){cells+=`<span class="cd past"><i>${d}</i></span>`;continue;}
    const tem=x.itens.length,cls=(x.saldo<0?' neg':'')+(iso===hj?' hoje':'')+(x===min?' min':'')+(tem?' mov':'');
    cells+=`<button type="button" class="cd${cls}" data-act="cal-dia" data-id="${iso}" aria-label="${d}: saldo ${brl(x.saldo)}${tem?', '+tem+' movimentos':''}"><i>${d}</i><b>${cdVal(x.saldo)}</b>${tem?`<em class="${x.mov>=0?'p':'n'}"></em>`:''}</button>`;
  }
  const mesN=MESES_LONGO[M.getMonth()]+(M.getFullYear()!==h.getFullYear()?' '+M.getFullYear():'');
  return `<div class="card calCard">
    <div class="calTop"><h4>Saldo dia a dia</h4><div class="calNav"><button class="btn2" data-act="cal-m" data-id="-1" ${CAL_M<=0?'disabled':''} aria-label="mês anterior">‹</button><b>${mesN}</b><button class="btn2" data-act="cal-m" data-id="1" ${CAL_M>=3?'disabled':''} aria-label="próximo mês">›</button></div></div>
    ${neg?`<div class="calAv"><span class="alIc">${I('alert')}</span><span>${neg.d===hj?'No vermelho hoje':'Fica no vermelho em '+fmtDataCurta(neg.d)}: <b class="nw">${brl(neg.saldo)}</b>. Toque no dia pra ver o que pesa.</span></div>`
      :`<p class="calRes">menor saldo nos próximos 60 dias: <b>${brl(min.saldo)}</b> em ${min.d===hj?'hoje':fmtDataCurta(min.d)}</p>`}
    <div class="calDow">${['D','S','T','Q','Q','S','S'].map(x=>`<span>${x}</span>`).join('')}</div>
    <div class="calGrid">${cells}</div>
    <p class="small" style="margin:10px 0 0">saldo de hoje mais previstos, contas fixas e faturas no dia do vencimento. ${ultimo?'até '+fmtDataCurta(ultimo.d)+'.':''}</p>
  </div>`;
}
function abreDiaSaldo(iso){
  const x=projCache().find(y=>y.d===iso);if(!x)return;
  const P=projCache(),ant=P[P.indexOf(x)-1];
  const ini=ant?ant.saldo:(x.saldo-x.mov);
  const box=$('#modal');
  box.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="Saldo do dia"><div class="sh-head"><h3>${iso===hojeISO()?'Hoje':fmtData(iso)}</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <div class="calDia"><div class="row"><span class="small">começa com</span><b>${brl(ini)}</b></div>
    ${x.itens.length?x.itens.map(o=>`<div class="tx"><span class="ic ${o.v<0?'despesa':'receita'}" style="color:${o.fatura?'#60a5fa':corCat(o.cat)}">${I(o.fatura?'card':catIcon(o.cat))}</span><div class="txt"><b>${esc(o.n)}</b><small>${o.fatura?'fatura do cartão':o.fixa?'conta fixa':o.atras?'previsto atrasado':'previsto'}</small></div><div class="val ${o.v<0?'neg':'pos'}">${o.v<0?'−':'+'} ${brl(Math.abs(o.v))}</div></div>`).join(''):'<p class="vazio">Nada previsto para este dia.</p>'}
    <div class="row calFim"><span>termina com</span><b class="${x.saldo<0?'neg':'pos'}">${brl(x.saldo)}</b></div></div></div>`;
  box.classList.add('on');
}
function alertaBox(tit,txt,acao,tom){return `<div class="card alBox ${tom||'r'}"><span class="alIc">${I('alert')}</span><div class="alTx"><b>${tit}</b><small>${txt}</small></div>${acao?`<div class="alAc">${acao}</div>`:''}</div>`;}
function alertaVermelhoHTML(){
  if(!S.bancos||!S.bancos.length)return '';
  const D=projCache().slice(0,31),neg=D.find(x=>x.saldo<0);if(!neg)return '';
  const hj=neg.d===hojeISO(),i=D.indexOf(neg),volta=D.slice(i).find(x=>x.saldo>=0),pior=D.slice(i).reduce((a,x)=>x.saldo<a.saldo?x:a,neg);
  return alertaBox(hj?'Seu saldo está no vermelho':'Saldo fica negativo em '+fmtDataCurta(neg.d),
    (pior.saldo<neg.saldo?`chega a <b class="nw">${brl(pior.saldo)}</b> em ${fmtDataCurta(pior.d)}`:`<b class="nw">${brl(neg.saldo)}</b>${hj?' hoje':''}`)+(volta?` · volta ao azul em ${fmtDataCurta(volta.d)}`:' · não volta ao azul nos próximos 30 dias'),
    '<button class="btn2 sm" data-act="ir-cal">ver dia a dia</button>');
}
function viewPlan(){
  const n=PLAN.n,base=projetaMeses(n),temSim=temSimulacao(),sim=temSim?projetaMeses(n,PLAN):base;
  const linhas=temSim?sim:base,hoje=saldoTotal();
  const temDados=(S.fixas||[]).length||S.tx.some(t=>t.status==='previsto')||base.some(m=>m.cart>0);
  const min=linhas.reduce((a,m)=>m.saldo<a.saldo?m:a,linhas[0]);
  const neg=linhas.find(m=>m.saldo<0);
  const mx=Math.max(1,...linhas.map(m=>Math.abs(m.saldo)));
  const nomeM=ym=>MESES[+ym.slice(5,7)-1]+'/'+ym.slice(2,4);
  /* v10.89: metas sem aporte definido usam o MESMO ritmo da aba Metas (ritmoMensal), dividido entre elas.
     antes cada uma usava a sobra inteira da projeção, então duas metas "chegavam" juntas com o mesmo dinheiro */
  const RM=ritmoMensal(base,linhas),ritmo=RM?Math.max(0,RM.media):0;
  const nSemAp=(S.metas||[]).filter(m=>!(m.aporteMes>0)&&alvoMeta(m)>saldoMeta(m)).length;
  const sobraMed=nSemAp?ritmo/nSemAp:0;
  /* v10.88: saldo e alvo das metas iguais aos da aba Metas (fontes, FIPE, IPCA). antes chamava mesesMeta(m) sem os argumentos
     e toda meta com aporte aparecia como "mais de 50 anos" */
  const metas=(S.metas||[]).map(m=>Object.assign({},m,{atual:saldoMeta(m),alvo:alvoMeta(m),_m:m})).filter(m=>m.alvo>m.atual).map(m=>{const falta=m.alvo-m.atual,pc=m.alvo>0?Math.min(100,m.atual/m.alvo*100):0;
    const meses=m.aporteMes>0?(mtNova(m._m)?(()=>{const p=mtProj(m._m);return p.k>0?p.k:p.k===0?1:Infinity;})():mesesMeta(m.atual,m.alvo,m.aporteMes,taxaMesMeta(m._m))):sobraMed>0?Math.ceil(falta/sobraMed):0;
    return `<div class="pmMeta"><div class="pmTop"><b>${esc(m.nome)}</b><span class="${meses?'':'pmSem'}">${meses?(meses>600||!isFinite(meses)?'mais de 50 anos':'~'+(meses>=24?Math.round(meses/12)+' anos':meses+' meses')):'sem sobra pra guardar'}</span></div><div class="bar"><i style="width:${pc.toFixed(1)}%"></i></div><small>${brl(m.atual)} de ${brl(m.alvo)} · faltam ${brl(falta)}${m.aporteMes>0?' · aporte '+brl(m.aporteMes)+'/mês':''}</small></div>`;}).join('');
  const fim=linhas[linhas.length-1];
  return `
  <div class="head"><h2>Planejamento</h2></div>
  <div class="seg" style="margin-bottom:12px">${[3,6,12].map(k=>`<button class="${n===k?'on':''}" data-act="plan-n" data-id="${k}">${k} meses</button>`).join('')}</div>
  <div class="grid2">
    <div class="card mini sumcard"><small>SALDO HOJE</small><b class="${hoje<0?'neg':'pos'}">${brl(hoje)}</b></div>
    <div class="card mini sumcard${fim.saldo<0?' sum-neg':''}"><small>EM ${nomeM(fim.ym).toUpperCase()}${temSim?' (SIMULADO)':''}</small><b class="${fim.saldo<0?'neg':'pos'}">${brl(fim.saldo)}</b>${temSim?`<small style="margin:4px 0 0">sem simulação: ${brl(base[base.length-1].saldo)}</small>`:''}</div>
  </div>
  ${calSaldoHTML()}
  ${comprometidaHTML()}
  ${!temDados?`<div class="card aviso-card"><p class="aviso">${I('alert')}Ainda não há contas fixas, salário nem lançamentos previstos, então a projeção fica parada no saldo de hoje. Cadastre o salário e as contas fixas em Despesas → conta fixa.</p></div>`:''}
  ${neg&&!projCache().slice(0,61).some(x=>x.saldo<0)?alertaBox('Fim de '+nomeM(neg.ym)+' no vermelho',`a projeção fecha o mês em <b class="nw">${brl(neg.saldo)}</b>. use a simulação abaixo pra testar cortes.`,''):''}
  <div class="card planCard">
    <h4>Mês a mês${temSim?' · com simulação':''}</h4>
    <div class="planHead"><span>mês</span><span>entra</span><span>sai</span><span>saldo no fim</span></div>
    ${linhas.map(m=>`<div class="planRow${m===min?' low':''}"><span>${nomeM(m.ym)}</span><span class="pos">${brl(m.entra)}</span><span class="neg">${brl(m.sai)}</span><span class="${m.saldo<0?'neg':'pos'}"><b>${brl(m.saldo)}</b><i class="planBar ${m.saldo<0?'n':''}" data-w="${(Math.abs(m.saldo)/mx*100).toFixed(1)}"></i></span></div>`).join('')}
  </div>
  ${simHTML(base,sim,temSim)}
  ${metas?`<div class="card"><h4>Metas no ritmo da projeção</h4>${metas}<p class="small" style="margin-top:10px">${!nSemAp?'cada meta usa o aporte por mês definido nela.':ritmo>0?'metas sem aporte definido dividem seu ritmo de economia de '+brl(ritmo)+' por mês'+(nSemAp>1?' ('+brl(sobraMed)+' para cada uma)':'')+'.':RM?'seu ritmo de economia está em '+brl(RM.media)+' por mês, então metas sem aporte definido não avançam. defina um aporte na meta ou teste cortes na simulação.':'ainda não há um mês fechado para medir seu ritmo de economia. defina um aporte na meta.'}</p></div>`:''}
  <details class="card planPremBox"><summary>Como a projeção é calculada</summary><ul class="planPrem">
    <li>Começa no saldo de hoje, que conta só os lançamentos pagos.</li>
    <li>As contas fixas e o salário se repetem como estão cadastrados.</li>
    <li>Os lançamentos previstos entram no mês da data. Os atrasados entram no mês atual.</li>
    <li>As compras no cartão, inclusive as parcelas, saem no mês em que a fatura vence.</li>
    <li>Gastos avulsos que você ainda não lançou e rendimentos de investimentos não entram.</li>
    <li>A simulação vale a partir do próximo mês. É uma estimativa, não uma garantia.</li>
    <li>Empréstimos que você fez não entram como gasto. A volta deles não entra na projeção até acontecer.</li>
  </ul></details>`;
}

/* v10.70: simulador "e se…" — responde se cabe, quanto sobra de folga e o que muda */
function simHTML(base,sim,temSim){
  const nomeM=ym=>MESES[+ym.slice(5,7)-1]+'/'+ym.slice(2,4);
  const g=gastoDiaADia(),fB=folgaPlano(base),fS=folgaPlano(sim);
  const RB=ritmoMensal(),RS=temSim?ritmoMensal(base,sim):RB; // v10.89: mesmo número da aba Metas
  const fimB=base[base.length-1],fimS=sim[sim.length-1],dif=fimS.saldo-fimB.saldo;
  const negS=sim.find(m=>m.saldo<0),minS=sim.reduce((a,m)=>m.saldo<a.saldo?m:a,sim[0]);
  const h=new Date(),mesesOpt=k=>Array.from({length:12},(_,i)=>`<option value="${i}"${i===k?' selected':''}>${i===0?'este mês':nomeM(isoDe(new Date(h.getFullYear(),h.getMonth()+i,1)).slice(0,7))}</option>`).join('');
  const itens=(PLAN.itens||[]).map((it,i)=>{const T=SIM_TIPOS[it.t]||SIM_TIPOS.gmes;
    const parcV=it.t==='parc'&&it.v>0?`<small class="simHint">${Math.max(1,Math.round(it.n||1))}x de ${brl(Math.ceil(it.v*100/Math.max(1,Math.round(it.n||1)))/100)}</small>`:'';
    return `<div class="simIt ${T.s>0?'up':'dn'}"><div class="simItH"><span class="simItI">${I(T.ic)}</span><b>${T.n}</b><button class="simX" data-act="sim-del" data-id="${i}" aria-label="remover">${I('close')}</button></div>
      <div class="simItF"><label>${it.t==='parc'?'valor total':'valor'}<input inputmode="decimal" data-sim="${i}|v" value="${it.v?num(it.v):''}" placeholder="0,00"></label>
      ${it.t==='parc'?`<label>parcelas<input inputmode="numeric" data-sim="${i}|n" value="${it.n||''}" placeholder="10"></label>`:''}
      <label>${it.t==='gun'||it.t==='run'?'quando':'a partir de'}<select data-sim="${i}|k">${mesesOpt(it.k||0)}</select></label></div>${parcV}</div>`;}).join('');
  let falta=0;sim.forEach((m,k)=>{if(k>0&&m.saldo<0)falta=Math.max(falta,Math.ceil(-m.saldo*100/k)/100);});
  const veredito=!temSim?'':negS?`<div class="simV ruim">${I('alert')}<div><b>Não cabe</b><small>fecha ${nomeM(negS.ym)} em <span class="nw">${brl(negS.saldo)}</span>${minS!==negS?` e chega a ${brl(minS.saldo)} em ${nomeM(minS.ym)}`:''}.${falta>0?` pra caber, faltam uns <b class="nw">${brl(falta)}</b> por mês (a mais de renda ou a menos de gasto).`:''}</small></div></div>`
    :`<div class="simV bom">${I('check')}<div><b>Cabe no seu bolso</b><small>o mês mais apertado é ${nomeM(minS.ym)}, fechando com <span class="nw">${brl(minS.saldo)}</span></small></div></div>`;
  return `<div class="card simCard">
    <div class="simTop"><h4>E se…</h4><small>teste antes de decidir. nada aqui muda seus lançamentos.</small></div>
    <div class="simFolga">
      <div class="simRit"><small>ritmo de economia</small><b class="nw fit${RS&&RS.media<0?' neg':''}">${RS?brl(RS.media):'—'}</b><em>${!RS?'sem mês fechado ainda':temSim&&RS.media!==RB.media?'por mês · antes '+brl(RB.media):'por mês, média de '+RS.n+' '+(RS.n>1?'meses fechados':'mês fechado')}</em></div>
      <div><small>dá pra gastar hoje</small><b class="nw fit">${brl(fS.vista)}</b><em>${temSim&&fS.vista!==fB.vista?'antes '+brl(fB.vista):'à vista, sem zerar nenhum mês'}</em></div>
    </div>
    ${g.v>0?`<button class="simDia${PLAN.dia?' on':''}" data-act="sim-dia" aria-pressed="${PLAN.dia?'true':'false'}"><span class="simTg"><i></i></span><span><b>Contar os gastos do dia a dia</b><small>mercado, delivery, transporte… média de ${brl(g.v)}/mês ${g.meses===1?'no último mês':'nos últimos '+g.meses+' meses'}</small></span></button>`:''}
    ${itens?`<div class="simLista">${itens}</div>`:''}
    <div class="simAdd">${Object.entries(SIM_TIPOS).map(([k,T])=>`<button class="chip" data-act="sim-add" data-id="${k}">${I('plus')}${T.n.replace(' por mês','')}</button>`).join('')}</div>
    <details class="simMais"${PLAN.corte?' open':''}><summary>cortar contas fixas</summary><label>reduzir todas as contas fixas em (%)<input inputmode="decimal" data-plan="corte" value="${PLAN.corte||''}" placeholder="0"></label></details>
    ${temSim?`<div class="simRes">${veredito}
      <div class="simCmp"><div><small>em ${nomeM(fimS.ym)} sem mudar nada</small><b class="nw">${brl(fimB.saldo)}</b></div><div><small>com a simulação</small><b class="nw ${fimS.saldo<0?'neg':''}">${brl(fimS.saldo)}</b></div><div><small>diferença</small><b class="nw ${dif<0?'neg':'pos'}">${dif>0?'+':''}${brl(dif)}</b></div></div>
      <button class="btn2 sm" data-act="plan-limpa">limpar simulação</button></div>`:`<p class="small simVazio">toque numa opção acima: um aumento, uma assinatura, um celular em 12x, uma viagem… e veja na hora se cabe.</p>`}
  </div>`;
}
/* ---------- relatório mensal ---------- */
let REL={a:'',b:''};
/* v10.88: sem mês escolhido, o relatório abre no mês atual; no começo do mês sem nada lançado, abre no último mês fechado (antes: mês vazio, tudo -100%) */
function relMesA(){if(REL.a)return REL.a;const r=resumoMes(mesOff(0));return r.rec||r.des?mesOff(0):mesOff(1);}
function mesNome(m){return MESES_LONGO[+m.slice(5,7)-1]+' de '+m.slice(0,4);}
function resumoMes(m){const r=somaMes(m,'receita'),d=somaMes(m,'despesa');return {rec:r,des:d,sal:(cents(r)-cents(d))/100};}
/* juros + multas pagos e descontos obtidos num mês (lançamentos efetivos) */
function encargosMes(m){let e=0,d=0;S.tx.forEach(t=>{if(t.tipo!=='despesa'||!efetivo(t)||!t.data||t.data.slice(0,7)!==m)return;e+=cents(t.multa||0)+cents(t.juros||0);d+=cents(t.desconto||0);});return {enc:e/100,desc:d/100};}
function relCats(a,b){
  const A=despesasPorCat(a),B=despesasPorCat(b),mp={};
  A.forEach(s=>{mp[s.l]=mp[s.l]||{l:s.l,va:0,vb:0};mp[s.l].va=s.v;});
  B.forEach(s=>{mp[s.l]=mp[s.l]||{l:s.l,va:0,vb:0};mp[s.l].vb=s.v;});
  return Object.values(mp).sort((x,y)=>Math.max(y.va,y.vb)-Math.max(x.va,x.vb));
}
function mesCurto(m){return MESES[+m.slice(5,7)-1]+' '+m.slice(0,4);}
// despesas (fora do cartão, igual ao resto do relatório) do mês m até o dia `dia`
function despAte(m,dia){return somaC(S.tx.filter(t=>efetivo(t)&&t.tipo==='despesa'&&!t.cartao&&t.data.startsWith(m)&&+t.data.slice(8,10)<=dia),t=>t.valor);}
function relDestaques(a,b,ra,rb){
  const dif=(cents(ra.des)-cents(rb.des))/100,out=[];
  let head;
  if(!rb.des&&!ra.des)head=`sem despesas em ${mesCurto(a)} nem em ${mesCurto(b)}`;
  else if(dif===0)head=`você gastou o mesmo que em ${mesCurto(b)}`;
  else head=`você gastou <b class="${dif>0?'neg':'pos'}">${brl(Math.abs(dif))} ${dif>0?'a mais':'a menos'}</b> que em ${mesCurto(b)}`;
  let ritmo='';
  if(a===mesOff(0)&&b<a){
    const dia=new Date().getDate(),ja=despAte(a,dia),antes=despAte(b,dia),d2=(cents(ja)-cents(antes))/100;
    if(ja||antes)ritmo=`<p class="rd-ritmo">${I("gauge")}até o dia ${dia}, ${mesCurto(b)} tinha ${brl(antes)} em despesas. ${d2===0?'você está no mesmo ritmo.':`você está <b class="${d2>0?'neg':'pos'}">${brl(Math.abs(d2))} ${d2>0?'acima':'abaixo'}</b> nesse ritmo.`}</p>`;
  }
  const vars=relCats(a,b).map(x=>Object.assign({},x,{d:(cents(x.va)-cents(x.vb))/100})).filter(x=>x.d!==0)
    .sort((x,y)=>Math.abs(y.d)-Math.abs(x.d)).slice(0,3);
  const it=vars.map(x=>{const up=x.d>0,pc=x.vb?Math.round(x.d/x.vb*100):null;
    return `<div class="rd-it tap" data-act="nav-rel-cat" data-id="${a}~${esc(x.l)}" role="button" tabindex="0" aria-label="ver despesas de ${esc(x.l)}"><span class="rd-ar ${up?'neg':'pos'}">${up?'▲':'▼'}</span><span class="rd-cat"><i class="dot" style="background:${corCat(x.l)}"></i>${esc(x.l)}</span><span class="rd-v ${up?'neg':'pos'}">${up?'+':'−'}${brl(Math.abs(x.d))}</span><span class="rd-p">${pc===null?'novo':(pc>0?'+':'')+pc+'%'}</span></div>`;}).join('');
  return `<div class="card relDest"><h4>destaques</h4><p class="rd-head">${head}</p>${ritmo}${it?`<div class="rd-list"><span class="rd-sub">maiores variações por categoria</span>${it}</div>`:''}</div>`;
}
function relPorCat(a,b){
  const cats=relCats(a,b);if(!cats.length)return '';
  const mx=Math.max(1,...cats.flatMap(x=>[x.va,x.vb]));
  const rows=cats.map(x=>{const d=(cents(x.va)-cents(x.vb))/100,pc=x.vb?Math.round(d/x.vb*100):null,c=d>0?'neg':d<0?'pos':'';
    const vtxt=pc===null?(x.va?'novo':'—'):(d>0?'▲ ':d<0?'▼ ':'')+Math.abs(pc)+'%';
    return `<div class="rcRow tap" data-act="nav-rel-cat" data-id="${a}~${esc(x.l)}" role="button" tabindex="0" aria-label="ver despesas de ${esc(x.l)} em ${mesCurto(a)}"><div class="rcTop"><span class="rc"><i class="dot" style="background:${corCat(x.l)}"></i>${esc(x.l)}</span><span class="vr ${c}">${vtxt}</span></div>
      <div class="rcBar"><i style="width:${(x.va/mx*100).toFixed(1)}%;background:${corCat(x.l)}"></i></div>
      <div class="rcVals"><span>${mesCurto(a)} <b>${brl(x.va)}</b></span><span>${mesCurto(b)} <b>${brl(x.vb)}</b></span></div></div>`;}).join('');
  return `<div class="card relCat"><h4>todas as categorias</h4>${rows}</div>`;
}

/* v10.12: relatório — dados extras */
function despMes(m){return S.tx.filter(t=>efetivo(t)&&t.tipo==='despesa'&&!t.cartao&&t.data&&noPer(t.data,m));}
function relDias(m){const y=+m.slice(0,4),mo=+m.slice(5,7)-1,n=new Date(y,mo+1,0).getDate(),v=new Array(n).fill(0);
  despMes(m).forEach(t=>{const d=+t.data.slice(8,10);if(d>=1&&d<=n)v[d-1]+=cents(t.valor);});return v.map(x=>x/100);}
function relDiasInfo(m){const v=relDias(m),hoje=new Date(),atual=m===mesOff(0),futuro=m>mesOff(0);
  const ate=atual?hoje.getDate():futuro?0:v.length,tot=v.slice(0,ate).reduce((a,b)=>a+b,0);
  let mi=-1,mv=0;v.forEach((x,i)=>{if(x>mv){mv=x;mi=i;}});
  const sem=v.slice(0,ate).filter(x=>!x).length;
  /* v10.45: projeção = ritmo diário só dos gastos do dia a dia; fatura e contas fixas entram uma vez (não se repetem a cada dia) */
  let proj=null;
  if(atual&&ate){let fx=0,fxAte=0;despMes(m).forEach(t=>{if(!(t.faturaKey||t.fixaKey))return;fx+=cents(t.valor);if(+t.data.slice(8,10)<=ate)fxAte+=cents(t.valor);});
    proj=Math.max(0,tot-fxAte/100)/ate*v.length+fx/100;}
  return {v,ate,tot,media:ate?tot/ate:0,maxD:mi+1,maxV:mv,sem,proj,atual};}
function mesAdd(m,k){const d=new Date(+m.slice(0,4),+m.slice(5,7)-1+k,1);return d.getFullYear()+'-'+pad(d.getMonth()+1);}
function relShift(k,n){const cur=REL[k]||(k==='a'?relMesA():mesAdd(relMesA(),-1));REL[k]=mesAdd(cur,n);if(k==='a')REL.b=mesAdd(REL.a,-1);render();}
function calGrid(m){
  const y=+m.slice(0,4),mo=+m.slice(5,7)-1,hoje=new Date();
  const ini=new Date(y,mo,1).getDay(),n=new Date(y,mo+1,0).getDate();
  let h='';for(let i=0;i<ini;i++)h+='<span></span>';
  for(let d=1;d<=n;d++){
    const isHoje=hoje.getFullYear()===y&&hoje.getMonth()===mo&&hoje.getDate()===d;
    h+=`<span class="mcal-d${isHoje?' hoje':''}">${d}</span>`;
  }
  return h;
}
function viewRel(){
  const a=relMesA(),b=REL.b||mesAdd(a,-1);
  const ra=resumoMes(a),rb=resumoMes(b);
  const top=m=>{const L=despesasPorCat(m),T=L.reduce((t,x)=>t+x.v,0)||1,mx=(L[0]&&L[0].v)||1;return L.slice(0,5).map(s=>`<div class="tcRow"><div class="tcTop"><span class="tcN"><i class="dot" style="background:${s.color}"></i><span>${esc(s.l)}</span></span><span class="tcV">${brl(s.v)}</span></div><div class="tcBar"><i style="width:${(s.v/mx*100).toFixed(1)}%;background:${s.color}"></i></div><span class="tcP">${Math.round(s.v/T*100)}% do mês</span></div>`).join('')||'<p class="vazio">sem despesas</p>';};
  const cel=(v,c)=>`<b class="nw ${c}">${brl(v)}</b>`;
  const linha=(nome,x,y,inv,fixo)=>{
    const v=x?Math.round((y-x)/Math.abs(x)*100):null,up=y>x,bom=inv?!up:up;
    const vc=(v===null||y===x)?'':(bom?'pos':'neg');
    const col=c=>fixo||(c>=0?'pos':'neg');
    const va=v===null?'<span class="sb">s/ base</span>':`<span class="vr ${vc}">${(v>0?'+':'')+v}%</span>`;
    return `<div class="rrow"><span>${nome}</span>${cel(y,col(y))}${cel(x,col(x))}${va}</div>`;
  };
  return `<div class="relWrap">
  <div class="head relHead"><h2>Relatório mensal</h2><div class="relPills noprint"><button class="btn2" data-act="res-rel">resumo</button><button class="btn2" data-act="rel-csv">csv</button><button class="btn2" data-act="rel-print">imprimir</button></div></div>
  <div class="card relSel noprint">
    <div class="rsTop"><button class="mcal-nav" data-act="rel-a-prev" aria-label="mês anterior">${I('chevL')}</button><div class="rsMes"><small>mês analisado</small><b>${mesNome(a)}</b></div><button class="mcal-nav" data-act="rel-a-next" aria-label="próximo mês" ${a>=mesOff(0)?'disabled':''}>${I('chevR')}</button></div>
    <div class="rsPills" id="rsPills">${Array.from({length:12},(_,k)=>mesOff(11-k)).map(m=>`<button class="rsPill${m===a?' on':''}" data-act="rel-mes" data-id="${m}"><span>${MESES[+m.slice(5,7)-1]}</span><small>${m.slice(2,4)}</small></button>`).join('')}</div>
    <label class="rsCmp"><span>${I('swap')}comparar com</span><select data-filter="relB">${Array.from({length:24},(_,k)=>mesAdd(a,-(k+1))).map(m=>`<option value="${m}"${m===b?' selected':''}>${m===mesAdd(a,-1)?'mês anterior · ':m===mesAdd(a,-12)?'mesmo mês do ano passado · ':''}${mesCurto(m)}</option>`).join('')}${b>a||b<mesAdd(a,-24)?`<option value="${b}" selected>${mesCurto(b)}</option>`:''}</select></label>
  </div>
  ${relResumo(a,b,ra,rb)}
  ${relDestaques(a,b,ra,rb)}
  ${relDiario(a,b)}
  <div class="card relChart">
    <h4>Comparação por categoria de despesa</h4>
    <canvas id="cRel" class="cv"></canvas>
    <div class="legend"><span><i class="dot" style="background:#a78bfa"></i>${mesCurto(a)}</span><span><i class="dot" style="background:#34d399"></i>${mesCurto(b)}</span></div>
  </div>
  ${relPorCat(a,b)}
  <div class="grid2 topCats">
    <div class="card"><h4>maiores categorias · ${mesNome(a)}</h4>${top(a)}</div>
    <div class="card"><h4>maiores categorias · ${mesNome(b)}</h4>${top(b)}</div>
  </div>
  ${relMaiores(a)}
  ${relComp(a)}
  </div>`;
}
/* v10.80: receitas por mês trabalhado (só aparece quando há dia trabalhado envolvido no mês) */
function relComp(a){
  const L=compMes(a).filter(c=>c.trab);
  const de=S.tx.filter(t=>t.tipo==='receita'&&efetivo(t)&&!t.emp&&t.trab&&t.data.slice(0,7)===a&&t.trab.slice(0,7)<a);
  if(!L.length&&!de.length)return '';
  const deT=somaC(de,t=>t.valor);
  return `<div class="card relComp tap" data-act="nav-rel-comp" data-id="${a}" role="button" tabindex="0" aria-label="ver receitas por dia trabalhado"><div class="hmH"><h4>por mês trabalhado · ${nomeMesMin(a)}</h4>${I('chevR','tapCh')}</div>
    ${L.map(c=>`<div class="compR"><span class="compI" style="--cc:${corCat(c.cat)}">${I(catIcon(c.cat))}</span><span class="compT"><b>${esc(c.cat)} ${/^horas/i.test(c.cat)?'trabalhadas em '+nomeMesMin(a):'de '+nomeMesMin(a)}</b><small>${compRecTxt(c,a)}</small></span><span class="compV nw">${brl(c.tot)}</span></div>`).join('')}
    ${de.length?`<p class="rsX">entrou em ${nomeMesMin(a)} referente a meses anteriores <b class="pos">${brl(deT)}</b></p>`:''}</div>`;
}
function relResumo(a,b,ra,rb){
  const pou=x=>x.rec>0?Math.round(x.sal/x.rec*100):null;
  const pa=pou(ra),pb=pou(rb);
  const dl=(y,x,inv)=>{if(!x&&!y)return '<span class="rsD">—</span>';if(!x)return '<span class="rsD">novo</span>';const v=Math.round((y-x)/Math.abs(x)*100);if(!v)return `<span class="rsD">= ${mesCurto(b)}</span>`;const bom=inv?v<0:v>0;return `<span class="rsD ${bom?'pos':'neg'}">${v>0?'▲':'▼'} ${Math.abs(v)}% vs ${MESES[+b.slice(5,7)-1]}</span>`;};
  const t=(cls,ic,lb,val,d)=>{const ac=cls==='rec'?'nav-rel-rec':cls==='des'?'nav-rel-des':cls.indexOf('sal')===0?'nav-rel-mes':'';return `<div class="rsT ${cls}${ac?' tap':''}"${ac?` data-act="${ac}" data-id="${a}" role="button" tabindex="0" aria-label="ver lançamentos de ${mesCurto(a)}"`:''}><span class="rsL">${I(ic)}${lb}</span><b class="nw">${val}</b>${d}</div>`;};
  const ea=encargosMes(a);
  const extra=(ea.enc||ea.desc)?`<p class="rsX">${ea.enc?`juros e multas <b class="neg">${brl(ea.enc)}</b>`:''}${ea.enc&&ea.desc?' · ':''}${ea.desc?`descontos obtidos <b class="pos">${brl(ea.desc)}</b>`:''}</p>`:'';
  return `<div class="relRes">${t('rec','arrowUp','receitas',brl(ra.rec),dl(ra.rec,rb.rec,false))}${t('des','arrowDown','despesas',brl(ra.des),dl(ra.des,rb.des,true))}${t('sal '+(ra.sal<0?'neg':''),'wallet','saldo do mês',brl(ra.sal),dl(ra.sal,rb.sal,false))}${t('pou','piggy','você guardou',pa===null?'—':(OCULTO?'••%':pa+'%'),pa===null?'<span class="rsD">sem receitas</span>':pb===null?'<span class="rsD">da renda</span>':`<span class="rsD ${pa>=pb?'pos':'neg'}">${pa>=pb?'▲':'▼'} ${Math.abs(pa-pb)} p.p. vs ${MESES[+b.slice(5,7)-1]}</span>`)}</div>${extra}`;
}
function relDiario(a,b){
  const A=relDiasInfo(a);
  if(!A.ate||!A.tot)return '';
  const st=(l,v,sub)=>`<div class="rdS"><small>${l}</small><b class="nw">${v}</b>${sub?`<small class="rdSub">${sub}</small>`:''}</div>`;
  return `<div class="card relDia"><h4>gastos por dia · ${mesNome(a)}</h4>
    <div class="rdStats">${st('média por dia',brl(A.media))}${st('dia mais caro',A.maxV?brl(A.maxV):'—',A.maxV?`em ${pad(A.maxD)}/${a.slice(5,7)}`:'')}${st('dias sem gastos',A.sem+' de '+A.ate)}</div>
    <canvas id="cRelDia" class="cv"></canvas>
    ${A.proj!==null?`<p class="rdProj">${I('gauge')}<span>no ritmo atual, ${MESES_LONGO[+a.slice(5,7)-1]} deve fechar em <b>${brl(A.proj)}</b> de despesas${resumoMes(b).des?` (${mesCurto(b)}: ${brl(resumoMes(b).des)})`:''}.</span></p>`:''}
  </div>`;
}
function relMaiores(a){
  const L=despMes(a).slice().sort((x,y)=>(+y.valor||0)-(+x.valor||0)).slice(0,5);
  if(!L.length)return '';
  return `<div class="card relMai"><h4>maiores despesas · ${mesNome(a)}</h4>${L.map(t=>`<div class="rmRow tap" data-act="${t.faturaKey?'fat-abre':'tx-menu'}" data-id="${t.id}" role="button" tabindex="0" aria-label="abrir lançamento"><span class="rmI" style="--cc:${corCat(t.categoria)}">${I(catIcon(t.categoria))}</span><div class="rmT"><b>${esc(nomeTx(t).n||t.categoria||'despesa')}</b><small>${esc(t.categoria||'')} · ${t.data.slice(8,10)}/${t.data.slice(5,7)}</small></div><span class="rmV nw">${brl(t.valor)}</span></div>`).join('')}</div>`;
}
function drawRelDia(c,p){
  const a=REL.a||mesOff(0),A=relDiasInfo(a),v=A.v;
  const {ctx,w,h}=fitCanvas(c,150);ctx.clearRect(0,0,w,h);
  const top=8,base=h-20,H=base-top,mx=Math.max(1,...v),gw=w/v.length,bw=Math.max(2,Math.min(10,gw*0.62));
  ctx.strokeStyle=cor('--line');ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,base+.5);ctx.lineTo(w,base+.5);ctx.stroke();
  if(A.media){const y=base-A.media/mx*H;ctx.setLineDash([4,4]);ctx.strokeStyle=cor('--mut');ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();ctx.setLineDash([]);}
  v.forEach((x,i)=>{const cx=i*gw+gw/2;const hh=Math.max(x?2:0,x/mx*H*p);const fut=A.atual&&i>=A.ate;
    if(fut){ctx.fillStyle=cor('--line');ctx.fillRect(cx-bw/2,base-2,bw,2);return;}
    if(hh)bar(ctx,cx-bw/2,base-hh,bw,hh,i+1===A.maxD?'#f87171':'#a78bfa');});
  ctx.fillStyle=cor('--mut');ctx.font='11px system-ui';ctx.textAlign='center';
  [1,8,15,22,v.length].forEach(d=>ctx.fillText(d,(d-1)*gw+gw/2,h-5));
}
function drawRel(c,p){
  const a=relMesA(),b=REL.b||mesAdd(a,-1);
  const cats=relCats(a,b).slice(0,6);
  const {ctx,w,h}=fitCanvas(c,260);
  const max=Math.max(1,...cats.flatMap(x=>[x.va,x.vb]));
  const top=14,base=h-44,H=Math.max(0,base-top),gw=w/Math.max(1,cats.length);
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle=cor('--line');ctx.lineWidth=1;
  for(let i=0;i<=3;i++){const y=top+H*i/3;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  cats.forEach((x,i)=>{
    const cx=i*gw+gw/2,bw=Math.min(16,gw*0.28);
    const clamp=v=>Math.max(0,Math.min(H,v));
    const ha=clamp(x.va/max*H*p),hb=clamp(x.vb/max*H*p);
    bar(ctx,cx-bw-2,base-ha,bw,ha,'#a78bfa');
    bar(ctx,cx+2,base-hb,bw,hb,'#34d399');
    /* v10.31: rótulo cabe na coluna; com colunas estreitas alterna em duas linhas */
    const dois=gw<74,maxW=(dois?gw*1.9:gw)-8;
    ctx.fillStyle=cor('--txt');ctx.font=(gw<60?'12px':'13px')+' system-ui';ctx.textAlign='center';
    let t=x.l;if(ctx.measureText(t).width>maxW){while(t.length>2&&ctx.measureText(t+'…').width>maxW)t=t.slice(0,-1);t=t.trim()+'…';}
    ctx.fillText(t,cx,dois&&i%2?h-6:h-24);
  });
  if(!cats.length){ctx.fillStyle=cor('--mut');ctx.font='13px system-ui';ctx.textAlign='center';ctx.fillText('sem despesas nesses meses',w/2,h/2);}
}
/* planilha dos lançamentos que estão na tela (respeita mês, categoria, tipo, tag e busca); abre no Excel/Numbers/Sheets */
/* v10.32: nome limpo do lançamento: "Transferência enviada|FULANO" vira "Fulano" + tipo "Transferência" */
const TX_KIND=[[/pix/i,'Pix'],[/d[eé]bito/i,'Débito'],[/boleto/i,'Boleto'],[/cr[eé]dito/i,'Crédito'],[/transfer|ted\b|doc\b/i,'Transf.'],[/dep[oó]sito/i,'Depósito'],[/resgate/i,'Resgate'],[/aplica/i,'Aplicação'],[/pagamento/i,'Pagamento']];
const TX_PREF=/^(transfer[eê]ncia\s+(enviada|recebida)(\s+pelo\s+pix)?|pix\s+(enviado|recebido)|compra\s+no\s+d[eé]bito(\s+via\s+nupay)?|compra\s+no\s+cr[eé]dito|compra\s+aprovada|pagamento\s+de\s+boleto(\s+efetuado)?|pagamento\s+(efetuado|recebido|enviado)|dep[oó]sito\s+recebido(\s+por\s+boleto)?|ted\s+(enviada|recebida)|doc\s+(enviado|recebido)|transfer[eê]ncia\s+(ted|doc|pix)?\s*(enviada|recebida)?)\s*(\||[-–:]\s|$)/i;
function titCase(x){if(/[a-zà-ÿ]/.test(x))return x;return x.toLowerCase().replace(/(^|[\s\-\/.(])([a-zà-ÿ])/g,(m,a,b)=>a+b.toUpperCase()).replace(/\b(De|Da|Do|Dos|Das|E|Em|Com|Ltda|Me|Sa|S\/a|Eireli)\b/g,w=>/^(Ltda|Me|Sa|S\/a|Eireli)$/.test(w)?w.toUpperCase():w.toLowerCase()).replace(/^./,c=>c.toUpperCase());}
const NOME_CACHE=new Map();
function nomeTx(t){
  const d=String((t&&t.descricao)||'').trim();if(!d)return {n:(t&&t.categoria)||'',k:''};
  if(NOME_CACHE.has(d))return NOME_CACHE.get(d);
  let est='';let d2=d;const me=d.match(/^estorno\s*(de\s+)?[-–:|]?\s*/i);if(me&&d.length>me[0].length){est='Estorno';d2=d.slice(me[0].length);}
  let pre='',rest=d2;const m=d2.match(TX_PREF);
  if(m){pre=m[1];rest=d2.slice(m[0].length);}else if(d2.includes('|')){pre=d2.split('|')[0];rest=d2.split('|').slice(1).join(' ');}
  rest=rest.replace(/\|/g,' - ');
  const lixo=x=>!/[A-Za-zÀ-ÿ]{2}/.test(x)||/^(ag[eê]ncia|ag\.?|conta|cc|cpf|cnpj)\b/i.test(x)||/^[\s•*.\d\-\/]+$/.test(x);
  const partes=rest.split(/\s+[-–]\s+/).map(x=>x.trim()).filter(x=>x&&!lixo(x));
  let n=(partes[0]||'').replace(/\s*[•*]{2,}[\d.•*\-]*\s*/g,' ').replace(/\s*\*\s*/g,' ').replace(/\s{2,}/g,' ').trim();
  const kind=est||(TX_KIND.find(([re])=>re.test(pre))||[])[1]||'';
  const res=n&&n.length>1?{n:titCase(n).slice(0,80),k:kind}:pre?{n:titCase(pre.trim()).slice(0,80),k:kind}:{n:d,k:''};
  if(NOME_CACHE.size>3000)NOME_CACHE.clear();NOME_CACHE.set(d,res);return res;
}
function fmtDataCurta(iso){return String(iso).slice(0,4)===String(new Date().getFullYear())?fmtData(iso).slice(0,5):fmtData(iso);}
function txLinhasPlanilha(lista){
  const n=v=>(+v||0).toFixed(2).replace('.',',');
  const conta=t=>{const id=contaDoLanc(t);const b=S.bancos.find(x=>x.id===id);return b?b.nome:'';};
  const cart=t=>{const c=S.cartoes.find(x=>x.id===t.cartao);return c?c.nome:'';};
  const L=[['Data','Tipo','Descrição','Categoria','Subcategoria','Valor','Status','Conta','Cartão','Parcela','Tags','Juros/multa','Desconto','Observação','Dia trabalhado','Divisão entre categorias']];
  /* v10.78: transferência e empréstimo com o tipo, o sinal e as contas certos (devolução entrava como saída) */
  const tipoL=t=>t.emp?(t.empDir==='in'?'devolução de empréstimo':t.empDir==='perdao'?'empréstimo perdoado':'empréstimo'):t.tipo==='transf'?'transferência':t.tipo;
  const valL=t=>t.emp?(t.empDir==='in'?t.valor:-t.valor):t.tipo==='receita'?t.valor:t.tipo==='transf'?t.valor:-t.valor;
  const contaL=t=>{if(t.tipo!=='transf')return conta(t);const a=t.de?nomeLado(t.de):'',b=t.para?nomeLado(t.para):'';return t.emp?(t.empAnt?'antes do app':t.empDir==='in'?b:a):[a,b].filter(Boolean).join(' → ');};
  lista.forEach(t=>L.push([t.data.split('-').reverse().join('/'),tipoL(t),t.descricao||'',t.categoria||'',t.sub||'',n(valL(t)),t.status||'pago',contaL(t),cart(t),t.parcela&&t.parcelas?t.parcela+'/'+t.parcelas:'',(t.tags||[]).join(', '),(+t.juros||0)+(+t.multa||0)?n((+t.juros||0)+(+t.multa||0)):'',+t.desconto?n(t.desconto):'',t.obs||'',t.trab&&t.tipo==='receita'?t.trab.split('-').reverse().join('/'):'',temSplit(t)?t.split.map(p=>p.cat+': '+n(p.v)).join(' | '):'']));
  return L;
}
function txPlanilha(){
  const lista=filtrados();if(!lista.length){toast('Nenhum lançamento nesse filtro.',true);return;}
  const esc=csvCel;
  const csv='\ufeff'+txLinhasPlanilha(lista).map(r=>r.map(esc).join(';')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const aa=document.createElement('a');aa.href=url;aa.download='granaviva-lancamentos-'+(F.mes||hojeISO().slice(0,10))+'.csv';
  document.body.appendChild(aa);aa.click();aa.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
  toast(lista.length+' lançamentos na planilha.');
}
function relCSV(){
  const a=relMesA(),b=REL.b||mesAdd(a,-1);
  const L=[['mes','receitas','despesas','saldo']];
  const dec=v=>v.toFixed(2).replace('.',',');
  [a,b].forEach(m=>{const r=resumoMes(m);L.push([m,dec(r.rec),dec(r.des),dec(r.sal)]);});
  L.push([]);L.push(['categoria',a,b]);
  relCats(a,b).forEach(x=>L.push([x.l,dec(x.va),dec(x.vb)]));
  const escF=csvCel;
  const csv='\ufeff'+L.map(r=>r.map(escF).join(';')).join('\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  const aa=document.createElement('a');aa.href=url;aa.download='relatorio-'+a+'-vs-'+b+'.csv';
  document.body.appendChild(aa);aa.click();
  setTimeout(()=>{URL.revokeObjectURL(url);aa.remove();},500);
}

/* ---------- cotações B3 (v10.69: função cotacoes no servidor, sem token; brapi.dev como reserva; manual por último) ---------- */
let COT={st:'manual',em:'',msg:'valores manuais'};
/* pregão da B3: seg a sex, 10h às 18h10 no horário de Brasília (inclui o after-market curto) */
function b3Aberta(d){
  const pt=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',weekday:'short',hour:'numeric',minute:'numeric',hourCycle:'h23'}).formatToParts(d||new Date());
  const g=k=>(pt.find(x=>x.type===k)||{}).value;const wd=g('weekday'),m=Number(g('hour'))*60+Number(g('minute'));
  return !['Sat','Sun'].includes(wd)&&m>=600&&m<=1090;
}
let COT_RODANDO=false;
async function atualizaCotacoes(forca){
  if(!S.fiis.length||COT_RODANDO)return;
  const ultimo=Number(localStorage.getItem('gv-cot-ts')||0);
  if(!forca&&Date.now()-ultimo<(b3Aberta()?55e3:30*60e3))return;
  if(!navigator.onLine){COT={st:'manual',msg:'sem conexão, usando o último preço salvo'};return;}
  const todos=[...new Set(S.fiis.filter(f=>tipoOf(f)!=='cripto'&&tipoOf(f)!=='rf').map(f=>f.ticker).filter(Boolean))];if(!todos.length)return;
  COT_RODANDO=true;
  try{await cotacoesB3(todos);}finally{COT_RODANDO=false;}
}
async function cotacoesB3(todos){
  const agora=new Date().toISOString();let viaSrv=0;const pegos=new Set();
  try{
    const {data:sess}=sb?await sb.auth.getSession():{data:null};
    if(sess&&sess.session){
      const {data:o,error}=await sb.functions.invoke('cotacoes',{body:{tickers:todos}});
      if(!error&&o&&o.q){
        Object.entries(o.q).forEach(([sym,q])=>{
          const pr=Number(q&&q.p);if(!(pr>0))return;pegos.add(sym);
          S.fiis.filter(f=>f.ticker===sym).forEach(f=>{
            f.preco=Math.round(pr*100)/100;f.cotEm=q.t||agora;f.cotFonte='b3';viaSrv++;
            f.ant=Number(q.ant)>0?Math.round(Number(q.ant)*100)/100:null;
            if(tipoOf(f)==='fii'&&q.div&&q.div.v>0&&(Date.now()-new Date(q.div.d+'T12:00:00'))<75*864e5)f.dpc=q.div.v;
          });
        });
      }
    }
  }catch(e){}
  const tks=todos.filter(t=>!pegos.has(t));
  if(!tks.length){localStorage.setItem('gv-cot-ts',String(Date.now()));COT={st:'auto',em:agora,msg:b3Aberta()?'cotações ao vivo da B3 (atraso de até 15 min)':'cotações de fechamento da B3'};salvar();if(TAB==='fii')render();return;}
  const tok=S.cfg.brapi?'&token='+encodeURIComponent(S.cfg.brapi):'';
  /* sem token, a brapi recusa (401) qualquer pedido com vários tickers; então pede um a um.
     com token, um pedido só. */
  const lotes=S.cfg.brapi?[tks]:tks.map(t=>[t]);
  let n=viaSrv,negados=0,falhas=0;
  for(const lote of lotes){
    const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),8000);
    try{
      const r=await fetch('https://brapi.dev/api/quote/'+encodeURIComponent(lote.join(','))+'?dividends=true'+tok,{signal:ctl.signal});
      if(r.status===401||r.status===403){negados+=lote.length;continue;}
      if(!r.ok)throw new Error('http '+r.status);
      const j=await r.json();
      (j.results||[]).forEach(q=>{
        const sym=String(q.symbol||'').toUpperCase();
        S.fiis.filter(f=>f.ticker===sym).forEach(f=>{
          const pr=Number(q.regularMarketPrice);
          if(pr>0){f.preco=pr;f.cotEm=q.regularMarketTime?new Date(q.regularMarketTime).toISOString():agora;f.cotFonte='brapi';f.ant=Number(q.regularMarketPreviousClose)>0?Number(q.regularMarketPreviousClose):null;n++;}
          // só FIIs pagam todo mês: para ações/ETFs/BDRs o último provento não é uma renda mensal
          if(tipoOf(f)==='fii'){
            const cd=(q.dividendsData&&q.dividendsData.cashDividends)||[];
            if(cd.length){const ult=cd.slice().sort((x,y)=>String(y.paymentDate||'').localeCompare(String(x.paymentDate||'')))[0];if(ult&&ult.rate>0)f.dpc=ult.rate;}
          }
        });
      });
    }catch(e){falhas+=lote.length;}
    finally{clearTimeout(to);}
  }
  if(n||(!negados&&!falhas))localStorage.setItem('gv-cot-ts',String(Date.now()));
  const resto=negados?` · ${negados} ativo${negados>1?'s':''} sem permissão na brapi: configure o token grátis em Ajustes`:'';
  if(n)COT={st:'auto',em:agora,msg:(b3Aberta()?'cotações ao vivo da B3 (atraso de até 15 min)':'cotações de fechamento da B3')+resto};
  else if(negados)COT={st:'manual',msg:'cotação automática precisa de token brapi (grátis, em Ajustes). usando preços manuais'};
  else COT={st:'manual',msg:'brapi indisponível agora, usando o último preço salvo'};
  if(n)salvar();
  if(TAB==='fii')render();
}
function infoCot(f){
  if(!(f.cotFonte==='brapi'||f.cotFonte==='b3')||!f.cotEm)return 'preço digitado manualmente';
  const vivo=b3Aberta()&&Date.now()-new Date(f.cotEm)<40*60e3;
  const dv=f.ant>0?(f.preco-f.ant)/f.ant*100:null;
  const dia=dv==null?'':` · <span class="${dv>0?'pos':dv<0?'neg':''}">hoje ${dv>0?'+':''}${dv.toFixed(2).replace('.',',')}%</span>`;
  return (vivo?'<i class="liveDot"></i>ao vivo · ':'fechamento · ')+fmtHora(f.cotEm)+dia;
}
/* ---------- histórico de operações (preço médio ponderado, como na B3/IR)
   op: inicial (posição que já existia: qtd + custo) · compra (qtd, preço, taxas) · venda (qtd, preço, taxas) · provento (valor)
   a quantidade, o custo (pago), o lucro realizado e os proventos do ativo passam a vir do histórico. */
const Q8=x=>Math.round(x*1e8)/1e8;
function calcOps(ops){
  const ord=ops.slice().sort((a,b)=>(a.tipo==='inicial'?-1:0)-(b.tipo==='inicial'?-1:0)||String(a.data).localeCompare(String(b.data)));
  let q=0,custo=0,real=0,prov=0,erro='';
  ord.forEach(o=>{
    if(o.tipo==='inicial'){q=Q8(q+o.qtd);custo+=cents(o.custo);}
    else if(o.tipo==='compra'){q=Q8(q+o.qtd);custo+=cents(o.qtd*o.preco)+cents(o.taxas);}
    else if(o.tipo==='venda'){
      if(o.qtd>q+1e-9){erro=erro||('Venda de '+num(o.qtd)+' em '+fmtData(o.data)+' maior que a posição na data ('+num(q)+').');return;}
      const baixa=q?Math.round(custo*o.qtd/q):0;
      real+=cents(o.qtd*o.preco)-cents(o.taxas)-baixa;custo-=baixa;q=Q8(q-o.qtd);if(q<=0){q=0;custo=0;}
    }else if(o.tipo==='provento')prov+=cents(o.valor);
  });
  return {qtd:q,pago:custo/100,realizado:real/100,proventos:prov/100,erro};
}
/* ---------- v10.111: imposto sobre vendas na bolsa (DARF 6015) e alerta de preço ----------
   regras (Receita Federal, 2026): operações comuns (ações, ETFs, BDRs) 15%; ganho em AÇÕES isento quando o total vendido
   em ações no mês não passa de R$ 20 mil (ETF e BDR não têm isenção); FIIs 20%, sem isenção. Prejuízo compensa só na mesma
   categoria (comuns com comuns, FII com FII), sem prazo. Desconta o IRRF de 0,005% sobre as vendas. Imposto abaixo de R$ 10
   passa para o mês seguinte. Vence no último dia útil do mês seguinte. Day trade (compra e venda no mesmo dia) e cripto não
   entram na conta: o app avisa para conferir. É uma estimativa a partir do que você registrou. */
const IR_TIPOS={acao:'comum',etf:'comum',bdr:'comum',fii:'fii'};
function irVendas(){
  const out=[];
  (S.fiis||[]).forEach(f=>{const cat=IR_TIPOS[tipoOf(f)];if(!cat)return;
    const ord=(f.ops||[]).slice().sort((a,b)=>(a.tipo==='inicial'?-1:0)-(b.tipo==='inicial'?-1:0)||String(a.data).localeCompare(String(b.data)));
    let q=0,custo=0;const compraDia=new Set();
    ord.forEach(o=>{
      if(o.tipo==='inicial'){q=Q8(q+o.qtd);custo+=cents(o.custo);}
      else if(o.tipo==='compra'){q=Q8(q+o.qtd);custo+=cents(o.qtd*o.preco)+cents(o.taxas);if(o.data)compraDia.add(o.data);}
      else if(o.tipo==='venda'&&o.data){if(o.qtd>q+1e-9||!q)return;
        const baixa=Math.round(custo*o.qtd/q),bruto=cents(o.qtd*o.preco);
        out.push({mes:o.data.slice(0,7),cat,acao:tipoOf(f)==='acao',ticker:f.ticker,venda:bruto,ganho:bruto-cents(o.taxas)-baixa,dt:compraDia.has(o.data)});
        custo-=baixa;q=Q8(q-o.qtd);if(q<=0){q=0;custo=0;}}
    });});
  return out;
}
function ultimoDiaUtil(ano,mes0){let d=new Date(ano,mes0+1,0);while(!diaUtil(isoDe(d)))d.setDate(d.getDate()-1);return isoDe(d);}
/* um registro por mês com venda: o que foi vendido, o ganho de cada categoria, o imposto e o DARF (em centavos) */
function irApura(){
  const V=irVendas();if(!V.length)return [];
  const M={};V.forEach(v=>{const m=M[v.mes]||(M[v.mes]={mes:v.mes,vAcoes:0,vComum:0,vFii:0,gAcoes:0,gOutros:0,gFii:0,dt:false,tickers:new Set()});
    if(v.cat==='fii'){m.vFii+=v.venda;m.gFii+=v.ganho;}else{m.vComum+=v.venda;if(v.acao){m.vAcoes+=v.venda;m.gAcoes+=v.ganho;}else m.gOutros+=v.ganho;}
    if(v.dt)m.dt=true;m.tickers.add(v.ticker);});
  let pC=0,pF=0,resto=0;const out=[];
  Object.keys(M).sort().forEach(k=>{const m=M[k];
    m.isento=m.vAcoes>0&&m.vAcoes<=2000000;
    /* lucro de ações isento não entra; prejuízo de ações entra sempre */
    let bC=(m.isento&&m.gAcoes>0?0:m.gAcoes)+m.gOutros,bF=m.gFii;
    if(bC>0){const u=Math.min(bC,pC);bC-=u;pC-=u;}else{pC+=-bC;bC=0;}
    if(bF>0){const u=Math.min(bF,pF);bF-=u;pF-=u;}else{pF+=-bF;bF=0;}
    const irrf=Math.round((bC>0?m.vComum:0)*0.00005)+Math.round((bF>0?m.vFii:0)*0.00005);
    m.imposto=Math.max(0,Math.round(bC*0.15)+Math.round(bF*0.20)-irrf);
    const tot=m.imposto+resto;
    if(tot>=1000){m.darf=tot;m.acumulado=resto;resto=0;}else{m.darf=0;m.acumulado=resto;resto=tot;}
    m.prejC=pC;m.prejF=pF;m.resto=resto;
    const a=+k.slice(0,4),mm=+k.slice(5,7)-1;m.vence=ultimoDiaUtil(mm===11?a+1:a,(mm+1)%12);
    m.tickers=[...m.tickers];out.push(m);});
  return out;
}
const irMesNome=k=>MESES_LONGO[+k.slice(5,7)-1]+' de '+k.slice(0,4);
function irCardHTML(){
  if(MVP_MODE)return ''; // v10.160: imposto das vendas escondido no MVP
  const A=irApura();if(!A.length)return '';
  const hj=hojeISO(),mesH=hj.slice(0,7),ab=A.filter(m=>m.darf>0&&m.vence>=hj||m.mes===mesH).slice(-3).reverse();
  if(!ab.length)return '';
  const pagos=(S.cfg&&S.cfg.darfPago)||{};
  const linha=m=>{const aberto=m.mes===mesH,pago=!!pagos[m.mes];
    const st=aberto?`mês em andamento · ${m.imposto>0?'até agora '+brl((m.imposto+m.acumulado)/100):'sem imposto até agora'}`
      :m.darf>0?(pago?'pago':`vence ${fmtData(m.vence)}`):'sem DARF';
    return `<div class="tx irRow"><div class="txt"><b>${esc(irMesNome(m.mes))}</b><small>${st}${m.isento&&m.gAcoes>0?' · ações isentas (vendas até R$ 20 mil)':''}${m.dt?' · tem venda no dia da compra: day trade não está nesta conta':''}${m.resto>0&&!aberto?' · '+brl(m.resto/100)+' passa para o mês seguinte':''}</small></div>
      <div class="val ${m.darf>0&&!pago&&!aberto?'neg':''}">${aberto?'':m.darf>0?brl(m.darf/100):'R$ 0'}</div>${m.darf>0&&!aberto?`<div class="acts"><button data-act="darf-pago" data-id="${m.mes}" title="${pago?'desmarcar':'marcar como pago'}" aria-label="${pago?'desmarcar pago':'marcar como pago'}">${I(pago?'close':'check')}</button></div>`:''}</div>`;};
  const ult=A[A.length-1];
  return `<div class="card irCard"><div class="irHead"><span class="irIc">${I('receipt')}</span><div><b>Imposto das vendas</b><small>DARF código 6015 · estimativa pelo que você registrou</small></div></div>
    <div class="lista">${ab.map(linha).join('')}</div>
    ${ult.prejC>0||ult.prejF>0?`<p class="small irPrej">prejuízo para abater depois: ${ult.prejC>0?'ações, ETFs e BDRs '+brl(ult.prejC/100):''}${ult.prejC>0&&ult.prejF>0?' · ':''}${ult.prejF>0?'FIIs '+brl(ult.prejF/100):''}</p>`:''}
    <p class="small irNota">Gere o DARF no Sicalc da Receita ou no app da corretora. Cripto e day trade não entram nesta conta.</p></div>`;
}
/* avisos no sino: DARF do mês passado a pagar (do dia 1 até o vencimento) e preço que chegou no alvo */
function irAvisos(){
  const out=[],hj=hojeISO(),pagos=(S.cfg&&S.cfg.darfPago)||{};
  if(!MVP_MODE&&notifOn('darf'))irApura().forEach(m=>{if(!(m.darf>0)||pagos[m.mes]||m.mes>=hj.slice(0,7)||m.vence<hj)return;
    const d=Math.round((new Date(m.vence+'T12:00:00')-new Date(hj+'T12:00:00'))/864e5);
    out.push({id:'darf|'+m.mes+'|'+(d<=3?'3':'p'),k:d<=3?'venc':'aviso',h:`${I('receipt')} DARF das vendas de <b>${esc(irMesNome(m.mes))}</b>: ${brl(m.darf/100)} · ${d===0?'vence hoje':d===1?'vence amanhã':'vence em '+d+' dias ('+fmtData(m.vence)+')'}`});});
  if(notifOn('alvoPreco'))(S.fiis||[]).forEach(f=>{if(!(f.alvoP>0)||!(f.preco>0))return;const sob=f.alvoDir!=='abaixo';
    if(sob?f.preco<f.alvoP:f.preco>f.alvoP)return;
    out.push({id:'alvo|'+f.id+'|'+f.alvoDir+'|'+f.alvoP,k:'aviso',h:`${I('up')} <b>${esc(f.ticker)}</b> ${sob?'subiu':'caiu'} para ${brl(f.preco)} · seu alerta era ${sob?'acima':'abaixo'} de ${brl(f.alvoP)} <button class="btn2 sm" data-act="alvo-fii" data-id="${f.id}">ajustar</button>`});});
  try{if(pode('investimentos'))out.push(...rdAvisos());}catch(e){} // v10.155: Radar
  return out;
}
function alvoForm(fid){
  const f=S.fiis.find(x=>x.id===fid);if(!f)return;
  form('Alerta de preço · '+f.ticker,[
    {type:'html',html:`<p class="small">Preço agora: <b>${f.preco>0?brl(f.preco):'sem cotação'}</b>. O aviso aparece no sino quando a cotação chegar no valor e, com notificações ligadas, chega no celular às 18h30 em dia de pregão. Deixe em branco para tirar o alerta.</p>`},
    {name:'dir',label:'Avisar quando',type:'select',value:f.alvoDir||'acima',options:[{v:'acima',t:'subir até ou acima de'},{v:'abaixo',t:'cair até ou abaixo de'}]},
    {name:'alvo',label:'Preço (R$)',value:f.alvoP?num(f.alvoP):'',inputmode:'decimal',placeholder:'0,00'}
  ],v=>{const a=c2(parseBR(v.alvo)||0);
    if(!String(v.alvo||'').trim()){delete f.alvoP;delete f.alvoDir;salvar();render();atualizaSino();toast('Alerta de preço removido');return;}
    if(!(a>0))return 'Informe um preço maior que zero.';
    f.alvoP=a;f.alvoDir=v.dir==='abaixo'?'abaixo':'acima';salvar();render();atualizaSino();toast('Alerta salvo: '+f.ticker+(f.alvoDir==='acima'?' acima de ':' abaixo de ')+brl(a));});
}
function darfPago(mes){S.cfg.darfPago=Object.assign({},(S.cfg&&S.cfg.darfPago)||{});if(S.cfg.darfPago[mes])delete S.cfg.darfPago[mes];else S.cfg.darfPago[mes]=hojeISO();salvar();render();atualizaSino();}
function aplicaOps(f){const r=calcOps(f.ops||[]);f.cotas=r.qtd;f.pago=r.pago;f.realizado=r.realizado;f.proventos=r.proventos;}
function garanteInicial(f){
  if(!f.ops)f.ops=[];
  if(!f.ops.length&&f.cotas>0)f.ops.push({id:uid(),tipo:'inicial',data:'',qtd:f.cotas,preco:0,taxas:0,valor:0,custo:c2(f.pago||0)});
}
const OP_L={inicial:'posição inicial',compra:'compra',venda:'venda',provento:'provento'};
function contaCampo(tipo){
  const pr=(S.bancos.find(b=>b.principal)||bancosAtivos()[0]||{}).id||'';
  return tipo==='compra'?{name:'conta',label:'Pago com a conta',type:'select',value:pr,options:[{v:'',t:'não descontar de nenhuma conta'}].concat(bancosAtivos().map(b=>({v:b.id,t:b.nome})))}:{name:'conta',label:'Lançar como receita na conta',type:'select',value:pr,options:[{v:'',t:'não lançar no fluxo de caixa'}].concat(bancosAtivos().map(b=>({v:b.id,t:b.nome})))};
}
function opForm(fid,tipo,deCard){
  const f=S.fiis.find(x=>x.id===fid);if(!f)return;
  const cri=tipoOf(f)==='cripto',esp=tipo==='provento'&&f.dpc>0&&f.cotas>0?c2(f.cotas*f.dpc):0;
  const campos=tipo==='provento'?[
    {name:'valor',label:'Valor recebido (R$)',value:esp?num(esp):'',required:true,inputmode:'decimal',placeholder:'0,00'},
    {name:'data',label:'Data',type:'date',value:hojeISO(),required:true},
    contaCampo()
  ].concat(rvPode(f)?[{type:'html',html:rvBlocoHTML(f)}]:[]):[
    {name:'qtd',label:cri?'Quantidade':'Cotas',required:true,inputmode:'decimal',placeholder:'0'},
    {name:'preco',label:'Preço por '+(cri?'unidade':'cota')+' (R$)',value:f.preco?num(f.preco):'',required:true,inputmode:'decimal',placeholder:'0,00'},
    {name:'taxas',label:'Taxas e corretagem (R$)',inputmode:'decimal',placeholder:'0,00'},
    {name:'data',label:'Data',type:'date',value:hojeISO(),required:true}
  ].concat([contaCampo(tipo)]);
  form((tipo==='compra'?'Compra':tipo==='venda'?'Venda':'Provento')+' · '+f.ticker,campos,v=>{
    if(!DATA_OK.test(String(v.data)))return 'Informe a data.';
    if(v.data>hojeISO())return 'A data não pode ser no futuro.';
    const op={id:uid(),tipo,data:v.data,qtd:0,preco:0,taxas:0,valor:0,custo:0};
    if(tipo==='provento'){op.valor=c2(parseBR(v.valor));if(!(op.valor>0))return 'Informe o valor recebido.';}
    else{
      op.qtd=parseBR(v.qtd);op.preco=parseBR(v.preco);op.taxas=c2(parseBR(v.taxas)||0);
      if(!(op.qtd>0))return 'Informe a quantidade.';
      if(!cri&&tipoOf(f)!=='etf'&&Math.round(op.qtd)!==op.qtd)return 'Cotas devem ser um número inteiro.';
      if(!(op.preco>0))return 'Informe o preço.';
      if(op.taxas<0)return 'Taxas não podem ser negativas.';
    }
    /* v10.95: reinvestir o provento em cotas inteiras (opcional "completar" com dinheiro da conta para +1 cota) */
    const rv=tipo==='provento'&&rvPode(f)&&$('#rvOn')&&$('#rvOn').checked?rvCalc(op.valor,f.preco,!!($('#rvCompl')&&$('#rvCompl').checked)):null;
    if(rv){
      if(!(v.conta&&S.bancos.some(b=>b.id===v.conta)))return 'Escolha a conta onde o provento entra para reinvestir.';
      if(!(rv.n>=1))return 'O provento não compra 1 cota inteira. Marque "completar" para comprar com dinheiro da conta.';
    }
    garanteInicial(f);
    const opC=rv?{id:uid(),tipo:'compra',data:v.data,qtd:rv.n,preco:c2(f.preco),taxas:0,valor:0,custo:0}:null;
    if(rv){op.g=opC.g=uid();}
    const r=calcOps(f.ops.concat(opC?[op,opC]:[op]));if(r.erro)return r.erro;
    if((tipo==='provento'||tipo==='venda')&&v.conta&&S.bancos.some(b=>b.id===v.conta)){
      const liq=tipo==='provento'?op.valor:c2((cents(op.qtd*op.preco)-cents(op.taxas))/100);
      if(liq>0){
        if(!S.cats.includes('Investimentos'))S.cats.push('Investimentos');
        op.tx='inv-'+op.id;
        /* v10.45: provento é renda (receita); venda é dinheiro que volta do investimento para a conta (transferência, não conta como renda) */
        if(tipo==='provento')S.tx.push({id:op.tx,tipo:'receita',valor:liq,categoria:'Investimentos',forma:'pix',conta:v.conta,data:op.data,descricao:'Provento '+f.ticker,invOp:f.id+'|'+op.id});
        else S.tx.push({id:op.tx,tipo:'transf',valor:liq,categoria:'Investimentos',de:'',para:'b:'+v.conta,forma:'',conta:'',cartao:'',data:op.data,
          descricao:'Venda '+f.ticker+' ('+num(op.qtd).replace(/,00$/,'')+(cri?'':' cotas')+')',invOp:f.id+'|'+op.id});
      }
    }
    if(tipo==='compra'&&v.conta&&S.bancos.some(b=>b.id===v.conta))op.conta=v.conta;
    f.ops.push(op);
    if(opC){
      /* a compra sai da mesma conta como transferência para o investimento (aplicação): não conta como gasto */
      opC.tx='inv-'+opC.id;
      S.tx.push({id:opC.tx,tipo:'transf',valor:rv.custo,categoria:'Investimentos',de:'b:'+v.conta,para:'',forma:'',conta:'',cartao:'',data:opC.data,
        descricao:'Compra '+f.ticker+' ('+rv.n+(rv.n>1?' cotas':' cota')+') · reinvestimento',invOp:f.id+'|'+opC.id});
      f.ops.push(opC);
    }
    aplicaOps(f);
    if(tipo!=='provento'&&f.cotFonte!=='brapi'&&!cri){f.preco=op.preco;f.cotFonte='manual';f.cotEm='';}
    salvar();render();if(!deCard)setTimeout(()=>historico(fid),30);
    if(opC){const g=op.g;setTimeout(()=>alDesfazer('Provento recebido · '+rv.n+(rv.n>1?' cotas compradas':' cota comprada'),()=>rvDesfaz(fid,g)),0);}
    else toast(tipo==='provento'?'Provento de '+f.ticker+' registrado'+(op.tx?' · entrou na conta':''):OP_L[tipo]+' registrada');
  });
  /* v10.91: provento com cabeçalho do ativo e a conta do valor esperado */
  if(tipo==='provento'){const mf=$('#mf');if(!mf)return;mf.closest('.sheet').classList.add('pvSheet');
    const pp=proxPags(45).find(q=>q.f===f);
    mf.insertAdjacentHTML('afterbegin',`<div class="pvForm">${assetIco(f.ticker,tipoOf(f))}<div><b>${esc(f.ticker)}</b><small>${pp?'pagamento previsto '+esc(FMT_DIA_SEM.format(pp.date)):'registrar provento recebido'}</small></div>${esp?`<span class="pvFormV"><small>esperado</small><b>${brl(esp)}</b><em>${num(f.cotas).replace(/,00$/,'')} cotas × ${brl(f.dpc)}</em></span>`:''}</div>`);
    const bt=mf.querySelector('button[type="submit"]');if(bt)bt.textContent='Registrar provento';
    const sc=mf.querySelector('[name="conta"]');if(sc&&sc.closest('label')&&sc.closest('label').firstChild)sc.closest('label').firstChild.textContent='Entrou na conta (vira receita)';
    if(rvPode(f))rvLiga(f);}
}
/* ---------- v10.95: reinvestir provento ----------
   provento ÷ cotação atual = cotas inteiras; o que sobra fica na conta. "completar" usa dinheiro da conta para +1 cota.
   ao confirmar: provento = receita na conta, compra = transferência da conta para o ativo (não é gasto), cotas e preço médio pelo histórico.
   provento e compra ficam ligados (op.g): desfazer ou excluir um tira os dois. vale para FIIs, ações, ETFs e BDRs. */
function rvPode(f){const t=tipoOf(f);return ['fii','acao','etf','bdr'].includes(t)&&f.preco>0;}
function rvCalc(valor,preco,compl){
  const vc=cents(valor),pc=cents(preco);if(!(vc>0)||!(pc>0))return {n:0,custo:0,sobra:c2(valor||0),falta:0,base:0};
  const base=Math.floor(vc/pc),faltaC=(base+1)*pc-vc,exato=vc%pc===0;
  const n=compl&&!exato?base+1:base,custoC=n*pc;
  return {n,base,custo:custoC/100,sobra:(vc-custoC)/100,falta:exato?0:faltaC/100,compl:!!(compl&&!exato)};
}
function rvCotTxt(f){
  if((f.cotFonte==='brapi'||f.cotFonte==='b3')&&f.cotEm){const d=new Date(f.cotEm);if(!isNaN(d))return 'cotação de '+['dom','seg','ter','qua','qui','sex','sáb'][d.getDay()]+' '+pad(d.getDate())+'/'+pad(d.getMonth()+1);}
  return 'preço informado por você';
}
function rvBlocoHTML(f){
  return `<div class="rvBox" id="rvBox"><label class="rvTg"><span class="rvTgT"><b>Reinvestir em cotas</b><small>compra cotas inteiras com o provento</small></span><input type="checkbox" id="rvOn" role="switch" aria-label="reinvestir em cotas"><i class="rvSw" aria-hidden="true"></i></label><div class="rvCalc" id="rvCalc" hidden></div></div>`;
}
function rvLiga(f){
  const mf=$('#mf');if(!mf)return;
  const on=$('#rvOn'),box=$('#rvCalc'),bt=mf.querySelector('button[type="submit"]'),vIn=mf.querySelector('[name="valor"]'),cIn=mf.querySelector('[name="conta"]');
  let compl=false;
  const pinta=()=>{
    const ligado=on.checked;$('#rvBox').classList.toggle('on',ligado);box.hidden=!ligado;
    if(bt)bt.textContent=ligado?'Receber e reinvestir':'Registrar provento';
    if(!ligado)return;
    const valor=c2(parseBR(vIn?vIn.value:0)||0),conta=cIn?cIn.value:'',bk=S.bancos.find(b=>b.id===conta);
    const R=rvCalc(valor,f.preco,compl),pr=f.preco,q0=+f.cotas||0,pm0=q0>0&&f.pago>0?f.pago/q0:0;
    const q1=q0+R.n,pm1=q1>0&&(f.pago>0||R.n>0)?((cents(f.pago||0)+cents(R.custo))/100)/q1:0;
    const nT=x=>num(x).replace(/,00$/,'');const ct=n=>n+(n===1?' cota':' cotas');
    const fl=R.compl?R.custo-valor:R.falta;
    const semConta=!bk?`<p class="rvAviso">${I('alert')}<span>Escolha acima a conta onde o provento entra: a compra sai dela.</span></p>`:'';
    const zero=!(R.n>=1)?`<p class="rvAviso">${I('alert')}<span>${valor>0?'O provento não compra 1 cota inteira de '+esc(f.ticker)+'.':'Informe o valor recebido.'}</span></p>`:'';
    box.innerHTML=`<div class="rvTop"><span><b class="nw">${brl(valor)}</b> ÷ cota <span class="nw">${brl(pr)}</span></span><small>${esc(rvCotTxt(f))}</small></div>
      <div class="rvTiles"><span><small>compra</small><b class="rvN">${ct(R.n)}</b></span><span><small>custo</small><b class="nw">${brl(R.custo)}</b></span><span><small>${R.sobra<0?'sai da conta':'sobra na conta'}</small><b class="nw">${brl(Math.abs(R.sobra))}</b></span></div>
      ${fl>0||R.compl?`<label class="rvCompl${R.compl?' on':''}"><input type="checkbox" id="rvCompl" ${R.compl?'checked':''}><span><span class="rvCT">Completar com <b class="nw">${brl(fl)}</b> da conta para comprar mais 1 cota</span><small>${ct(R.compl?R.n:R.n+1)} por <span class="nw">${brl(R.compl?R.custo:R.custo+pr)}</span>, sem sobra${bk?' · saldo '+esc(bk.nome)+' '+brl(saldoBanco(bk)):''}</small></span></label>`:''}
      <div class="rvAD"><div><small>hoje</small><b>${ct(nT(q0))}</b><em>preço médio <span class="nw">${pm0>0?brl(pm0):'—'}</span></em></div>${I('chevR')}<div class="rvDep"><small>depois</small><b>${ct(nT(q1))}</b><em>preço médio <span class="nw">${pm1>0?brl(pm1):'—'}</span></em></div></div>
      <div class="rvRes"><p><span>Provento entra na conta</span><b class="nw pos">+ ${brl(valor)}</b></p><p><span>Compra de ${ct(R.n)} de ${esc(f.ticker)}</span><b class="nw">− ${brl(R.custo)}</b></p><p class="rvFica"><span>${R.sobra<0?'Sai da conta':'Fica na conta'}</span><b class="nw">${R.sobra<0?'− ':''}${brl(Math.abs(R.sobra))}</b></p></div>
      ${semConta}${zero}`;
    const ck=$('#rvCompl');if(ck)ck.onchange=()=>{compl=ck.checked;pinta();};
  };
  on.onchange=pinta;if(vIn)vIn.addEventListener('input',pinta);if(cIn)cIn.addEventListener('change',pinta);
  pinta();
}
/* desfaz o "Receber e reinvestir": tira o provento, a compra e os dois lançamentos (receita e transferência) */
function rvDesfaz(fid,g){
  const f=S.fiis.find(x=>x.id===fid);if(!f||!g)return;
  const sai=(f.ops||[]).filter(o=>o.g===g);if(!sai.length)return;
  const txs=new Set(sai.map(o=>o.tx).filter(Boolean));
  f.ops=f.ops.filter(o=>o.g!==g);S.tx=S.tx.filter(t=>!txs.has(t.id));aplicaOps(f);salvar();render();toast('Desfeito: provento e compra removidos');
}
function delOp(fid,oid){
  const f=S.fiis.find(x=>x.id===fid);if(!f)return;
  const o0=(f.ops||[]).find(o=>o.id===oid);
  if(o0&&o0.g&&(f.ops||[]).some(o=>o.g===o0.g&&o.id!==oid)){ // v10.95: provento reinvestido: provento e compra saem juntos
    const resto=f.ops.filter(o=>o.g!==o0.g),r=calcOps(resto);if(r.erro){toast(r.erro);return;}
    confirma({titulo:'Excluir o reinvestimento?',texto:'O provento e a compra das cotas foram registrados juntos e saem juntos, com os lançamentos na conta. Quantidade e preço médio serão recalculados.',ok:'Excluir os dois',perigo:true},()=>{const g=o0.g;const txs=new Set(f.ops.filter(o=>o.g===g).map(o=>o.tx).filter(Boolean));S.tx=S.tx.filter(t=>!txs.has(t.id));f.ops=f.ops.filter(o=>o.g!==g);aplicaOps(f);salvar();render();setTimeout(()=>historico(fid),30);toast('Reinvestimento excluído');});
    return;}
  const resto=(f.ops||[]).filter(o=>o.id!==oid);const r=calcOps(resto);
  if(r.erro){toast(r.erro);return;}
  confirma({titulo:'Excluir operação?',texto:'Quantidade, preço médio e lucro serão recalculados.'+(((f.ops||[]).find(x=>x.id===oid)||{}).tx&&S.tx.some(t=>t.id===((f.ops||[]).find(x=>x.id===oid)||{}).tx)?' O valor lançado na conta também será removido.':''),ok:'Excluir',perigo:true},()=>{const o=(f.ops||[]).find(x=>x.id===oid);if(o&&o.tx)S.tx=S.tx.filter(t=>t.id!==o.tx);f.ops=resto;aplicaOps(f);salvar();render();setTimeout(()=>historico(fid),30);toast('Operação excluída');});
}
function historico(fid){
  const f=S.fiis.find(x=>x.id===fid);if(!f)return;
  const ops=(f.ops||[]).slice().sort((a,b)=>(b.tipo==='inicial'?-1:0)-(a.tipo==='inicial'?-1:0)||String(b.data).localeCompare(String(a.data)));
  const cri=tipoOf(f)==='cripto',pm=f.cotas>0?f.pago/f.cotas:0,lat=f.cotas*f.preco-f.pago;
  const linha=o=>{
    const v=o.tipo==='provento'?o.valor:o.tipo==='inicial'?o.custo:o.qtd*o.preco;
    const det=o.tipo==='provento'?'':o.tipo==='inicial'?num(o.qtd).replace(/,00$/,'')+(cri?'':' cotas'):num(o.qtd).replace(/,00$/,'')+' × '+brl(o.preco)+(o.taxas?' + taxas '+brl(o.taxas):'');
    return `<div class="tx opRow"><div class="txt"><b>${OP_L[o.tipo]}</b><small>${o.data?fmtData(o.data):'antes do histórico'}${det?' · '+det:''}${o.conta?' · pago com '+esc((S.bancos.find(b=>b.id===o.conta)||{}).nome||'conta removida'):''}${o.tx&&S.tx.some(t=>t.id===o.tx)?(o.tipo==='compra'?' · saiu de ':' · na conta ')+esc(((S.bancos.find(b=>b.id===(x=>x.conta||String(x.para||x.de||'').slice(2))(S.tx.find(t=>t.id===o.tx)||{})))||{}).nome||''):''}${o.g?' · reinvestimento':''}</small></div><div class="val ${o.tipo==='venda'||o.tipo==='provento'?'pos':''}">${brl(v)}</div><div class="acts"><button data-act="del-op" data-id="${f.id}|${o.id}" title="excluir operação" aria-label="excluir operação">${I('trash')}</button></div></div>`;
  };
  const box=$('#modal');
  box.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="Histórico de ${esc(f.ticker)}"><div class="sh-head"><h3>${esc(f.ticker)} · histórico</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <div class="grid2 opSum">
      <div class="card mini"><small>${cri?'quantidade':'cotas'}</small><b>${num(f.cotas).replace(/,00$/,'')}</b></div>
      <div class="card mini"><small>preço médio</small><b>${brl(pm)}</b></div>
      <div class="card mini"><small>custo da posição</small><b>${brl(f.pago)}</b></div>
      <div class="card mini"><small>resultado não realizado</small><b class="${lat>=0?'pos':'neg'}">${lat>=0?'+':''}${brl(lat)}</b></div>
      <div class="card mini"><small>lucro realizado (vendas)</small><b class="${(f.realizado||0)>=0?'pos':'neg'}">${(f.realizado||0)>=0?'+':''}${brl(f.realizado||0)}</b></div>
      <div class="card mini"><small>proventos recebidos</small><b class="pos">${brl(f.proventos||0)}</b></div>
    </div>
    <div class="opBtns"><button class="btn" data-act="op-compra" data-id="${f.id}">+ compra</button><button class="btn2" data-act="op-venda" data-id="${f.id}" ${f.cotas>0?'':'disabled'}>venda</button>${cri?'':`<button class="btn2" data-act="op-provento" data-id="${f.id}">provento</button>`}<button class="btn2" data-act="alvo-fii" data-id="${f.id}">${(()=>{const it=radarL().find(x=>x.t===f.ticker&&(x.k==='cripto')===cri);return it&&it.al.length?'Radar · '+it.al.length+(it.al.length>1?' alertas':' alerta'):f.alvoP?'alerta '+(f.alvoDir==='abaixo'?'≤ ':'≥ ')+brl(f.alvoP):'alerta de preço';})()}</button></div>
    <div class="lista opList">${ops.length?ops.map(linha).join(''):'<p class="vazio">nenhuma operação ainda. a posição atual vira a "posição inicial" quando você registrar a primeira.</p>'}</div>
  </div>`;
  box.classList.add('on');
}

/* ---------- adicionar rápido (FAB) ---------- */
function abreInvest(){
  const box=$('#modal');
  const tps=[['fii','FII','fundo imobiliário'],['acao','Ações','ações da B3'],['etf','ETFs','fundos de índice'],['bdr','BDRs','ações estrangeiras'],['cripto','Criptomoedas','bitcoin, ethereum']];
  box.innerHTML='<div class="sheet"><div class="sh-head"><h3>Investimentos</h3><button class="x" data-act="fechar" aria-label="fechar">'+I('close')+'</button></div><div class="qk-list">'+tps.map(([k,l,d])=>'<button class="qk-op" data-act="inv-tipo" data-id="'+k+'"><span class="qk-ic">'+I('chart')+'</span><span><b>'+l+'</b><small>'+d+'</small></span></button>').join('')+'</div></div>';
  box.classList.add('on');
}
/* v10.85: folha "Adicionar" com personalidade — bloco "com IA" (hero + dois cards) e "manual" (3 tiles com cor própria).
   mesmos data-act de antes; o campo do hero é falso (decorativo) e troca de exemplo sozinho. */
/* v10.141: ícones da folha Adicionar */
Object.assign(ICONS,{
  qkGasto:'<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  qkReceita:'<path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17"/><path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 16 6 6"/><circle cx="16" cy="9" r="2.9"/><circle cx="6" cy="5" r="3"/>',
  qkScan:'<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8h8"/><path d="M7 12h10"/><path d="M7 16h6"/>',
  qkAsk:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M12 7.5l1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1z"/>',
  qkInv:'<path d="M9 5v4"/><rect width="4" height="6" x="7" y="9" rx="1"/><path d="M9 15v2"/><path d="M17 3v2"/><rect width="4" height="8" x="15" y="5" rx="1"/><path d="M17 13v3"/><path d="M3 3v16a2 2 0 0 0 2 2h16"/>',
  qkDeNovo:'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>'
});
const QK_EX=['gastei 45 no iFood ontem…','uber 23,90 hoje no débito…','comprei 10 MXRF11 a 10,15…','mercado 182 no cartão…','recebi 3.200 de salário…','farmácia 37,50 no pix…'];
let QK_T=0;
function abreRapido(){
  const box=$('#modal');clearInterval(QK_T);
  const mic='<span class="qkHeroIc" aria-hidden="true">'+I('mic')+'<svg class="qkSpk" viewBox="0 0 24 24"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/></svg></span>';
  const mini=(act,ic,t,s,d)=>`<button type="button" class="qkMini" data-act="${act}" style="--d:${d}"><span class="qkMiniIc" aria-hidden="true">${I(ic)}</span><b>${t}</b><small>${s}</small></button>`;
  /* v10.137: cartões coloridos e cheios (gasto, receita, foto, perguntar e investimentos), todos no mesmo estilo */
  const cor=(act,k,ic,t,s,d,lg)=>`<button type="button" class="qkC qkC-${k}${lg?' lg':''}" data-act="${act}" style="--d:${d}" aria-label="${t}: ${s}"><span class="qkCIc" aria-hidden="true">${I(ic)}</span><span class="qkCTx"><b>${t}</b><small aria-hidden="true">${s}</small></span><span class="qkCWm" aria-hidden="true">${I(ic)}</span><span class="qkCGo" aria-hidden="true">${I('chevR')}</span></button>`;
  const tile=(act,k,ic,t,s,d)=>`<button type="button" class="qkT qkT-${k}" data-act="${act}" style="--d:${d}" aria-label="${t}: ${s}"><span class="qkTIc" aria-hidden="true">${I(ic)}</span><b>${t}</b><small aria-hidden="true">${s}</small></button>`;
  /* v10.140: "lançar de novo": os últimos gastos/receitas diferentes viram atalhos (abre o formulário já preenchido, com a data de hoje) */
  let rec='';
  try{const vis=new Set(),L=[];
    const T=(S.tx||[]).filter(t=>t&&(t.tipo==='despesa'||t.tipo==='receita')&&!t.faturaKey&&!t.emp&&!(t.parcelas>1)&&t.descricao&&+t.valor>0&&t.data<=hojeISO())
      .sort((x,y)=>(y.data||'').localeCompare(x.data||'')||(String(y.criadoEm||'')).localeCompare(String(x.criadoEm||'')));
    for(const t of T){const k=t.tipo+'|'+norm(t.descricao);if(vis.has(k))continue;vis.add(k);L.push(t);if(L.length>=6)break;}
    if(L.length)rec=`<div class="qkSec qkSecRec" style="--d:2">${I('qkDeNovo')}lançar de novo</div><div class="qkRec" role="group" aria-label="lançar de novo">${L.map((t,i)=>{const c=corCat(t.categoria);return `<button type="button" class="qkRc ${t.tipo==='receita'?'rc-in':''}" data-act="dup-tx" data-id="${esc(t.id)}" style="--d:${3+i};--cc:${c}" aria-label="lançar de novo: ${esc(t.descricao)}, ${esc(brl(t.valor))}"><span class="qkRcIc" aria-hidden="true">${I(catIcon(t.categoria))}</span><span class="qkRcTx"><b>${esc(String(t.descricao).replace(/ \(\d+\/\d+\)$/,''))}</b><small>${t.tipo==='receita'?'+ ':''}${esc(brl(t.valor))}</small></span></button>`;}).join('')}</div>`;
  }catch(e){rec='';}
  box.innerHTML=`<div class="sheet qk2">
    <div class="sh-head qkHead"><div class="qkTit"><small>${esc((d=>d.charAt(0).toUpperCase()+d.slice(1))(DATA_HOJE()))}</small><h3>O que vamos lançar?</h3></div><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    ${USER?'':'<!--'}<div class="qkSec" id="qkSecIA" style="--d:0"><svg class="qkSecIc" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z"/></svg>com IA</div>${USER?'':'-->'}
    <div class="qkIA" role="group" aria-labelledby="qkSecIA">
      ${USER?`<button type="button" class="qkHero" data-act="ia-frase" style="--d:1" aria-label="falar ou escrever: diga o gasto numa frase e a IA preenche o lançamento">
        <span class="qkAur" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="qkHeroTop">${mic}<span class="qkHeroTx"><b>Fale ou escreva</b><small>numa frase só, a IA lança pra você</small></span></span>
        <span class="qkFake" aria-hidden="true"><span class="qkPh">${QK_EX[0]}</span><span class="qkGo">${I('arrowUp')}</span></span>
      </button>`:''}
    </div>
    ${rec}
    <div class="qkCor" role="group" aria-label="lançar">
      ${cor('q-gasto','g','qkGasto','Gasto','pix, cartão, dinheiro',USER?2:1)}
      ${cor('q-receita','r','qkReceita','Receita','salário, extra, pix',USER?3:2)}
      ${USER?cor('ia-ler','f','qkScan','Comprovante','foto vira lançamento',4):''}
      ${cor('assist','a','qkAsk','Perguntar','“quanto gastei?”',USER?5:3)}
      ${cor('q-inv','i','qkInv','Investimentos','ações, FIIs, renda fixa e cripto',USER?6:4,!!USER)}
    </div></div>`;
  box.classList.add('on');
  const sh=box.querySelector('.qk2');
  /* toque: leve vibração (Android; o iOS ignora) */
  sh.addEventListener('pointerdown',e=>{if(e.target.closest('.qkHero,.qkMini,.qkT,.qkC,.qkRc'))vibra(8);});
  /* exemplos no campo falso: troca a cada 2,8 s com fade; parado se o sistema pede menos movimento */
  const ph=sh.querySelector('.qkPh');
  if(ph&&ccMov()){let i=0;QK_T=setInterval(()=>{if(!document.contains(ph)){clearInterval(QK_T);return;}
    ph.classList.add('out');setTimeout(()=>{i=(i+1)%QK_EX.length;ph.textContent=QK_EX[i];ph.classList.remove('out');},260);},2800);}
}

/* ---------- v10.160: MVP enxuto em 4 abas ----------
   Início (barra inteligente, ritmo do mês, faturas abertas, patrimônio total e proventos),
   Gastos & Cartões (limite do mês, faturas e parcelas, extrato com a origem de cada lançamento, planejamento recolhido),
   Patrimônio (carteira, cotações e alertas de preço no sino de cada ativo; o antigo Radar mora aqui),
   WhatsApp & Conta (WhatsApp em destaque, notificações, assinatura e o resto dos ajustes).
   As telas de detalhe (Extrato, Orçamentos, Cartões, Planejamento, Relatório, Metas, Bancos, Patrimônio líquido) continuam
   iguais e ficam dentro da aba do grupo: a barra de baixo acende a aba do grupo e a tela ganha "voltar". */
const MVP_GRUPO={inicio:'inicio',gastos:'gastos',lanc:'gastos',orc:'gastos',cartoes:'gastos',plan:'gastos',rel:'gastos',fii:'fii',pat:'fii',metas:'fii',bancos:'fii',cfg:'cfg'};
function grupoDe(t){return MVP_MODE?(MVP_GRUPO[t]||t):t;}
/* nomes antigos e atalhos de link (#radar, #ajustes, gv-tab de outra versão) */
const ROTA_ALIAS={gastos:'gastos',cartao:'cartoes',faturas:'cartoes',fatura:'cartoes',orcamento:'orc',orcamentos:'orc',despesas:'lanc',lancamentos:'lanc',extrato:'lanc',
  planejamento:'plan',relatorio:'rel',patrimonio:'fii',investimentos:'fii',carteira:'fii',cotacoes:'fii',radar:'fii',alertas:'fii',bens:'pat',liquido:'pat',
  conta:'cfg',ajustes:'cfg',config:'cfg',whatsapp:'cfg',assinatura:'cfg',notificacoes:'cfg',bancos:'bancos',contas:'bancos',metas:'metas',inicio:'inicio',home:'inicio'};
function rotaResolve(t){
  t=String(t||'').toLowerCase();
  if(VIEWS[t])return t;
  if(ROTA_ALIAS[t])return ROTA_ALIAS[t];
  if(/^(ir|imposto|darf)$/.test(t))return 'fii'; // o imposto das vendas ficava na carteira
  return 'inicio';
}
function pintaNav(){
  const g=grupoDe(TAB),principal=new Set(NAV.map(n=>n.t));
  document.querySelectorAll('.sb-item[data-tab]').forEach(b=>{const t=b.dataset.tab;b.classList.toggle('on',MVP_MODE&&principal.has(t)?t===g:t===TAB);});
  document.querySelectorAll('#tabbar [data-tab]').forEach(b=>{const on=b.dataset.tab===g;b.classList.toggle('on',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
}
/* faixa "voltar" das telas de detalhe: volta para onde a pessoa estava, senão para a aba do grupo */
function mvpVoltaHTML(){
  const p=NAV_PILHA[NAV_PILHA.length-1],alvo=p&&p.tab!==TAB?p.tab:grupoDe(TAB);
  return `<button type="button" class="navVolta" data-act="nav-grupo">${I('chevL')}<span>voltar para ${esc(TAB_NOME[alvo]||'a tela anterior')}</span></button>`;
}

/* ---------- origem do lançamento (selo discreto no extrato) ----------
   novos lançamentos guardam t.origem ('ia' | 'recibo' | 'manual') no próprio JSON do lançamento (tabela tx, coluna data):
   sem coluna nova nem migração. WhatsApp: o servidor (whatsapp-webhook) já grava a tag "whatsapp". Banco/extrato importado:
   pluggyId, importado ou impId. Lançamento antigo sem nenhuma marca = Manual. */
const ORIGEM_L={ia:'IA',wa:'WhatsApp',rec:'Recibo',man:'Manual',imp:'Importado'};
function origemTx(t){
  if(!t)return 'man';
  if(t.origem==='ia')return 'ia';
  if(t.origem==='recibo')return 'rec';
  if(t.origem==='whatsapp'||(Array.isArray(t.tags)&&t.tags.includes('whatsapp')))return 'wa';
  if(t.origem==='banco'||t.pluggyId||t.importado||t.impId)return 'imp';
  return 'man';
}
function origemBadge(t){
  if(!MVP_MODE||!t||t.faturaKey)return '';
  const k=origemTx(t);
  return `<span class="txOrg o-${k}" title="lançado por: ${ORIGEM_L[k]}">${ORIGEM_L[k]}</span>`;
}

/* ---------- meta mensal de gastos (S.cfg.metaMes, sincroniza com os ajustes) ---------- */
function metaMes(){const v=+(S.cfg&&S.cfg.metaMes)||0;return v>0?v:0;}
/* limite do mês: a meta mensal; sem meta, a soma dos orçamentos por categoria */
function limiteMes(m){
  const mm=metaMes();if(mm)return {v:mm,de:'meta'};
  const L=limOrc(m)||{},s=Object.values(L).reduce((a,b)=>a+(+b>0?cents(+b):0),0)/100;
  return s>0?{v:s,de:'orc'}:null;
}
function metaMesForm(){
  form('Meta de gastos do mês',[
    {type:'html',html:'<p class="small">Quanto você quer gastar, no máximo, por mês. O termômetro compara o que já saiu com quanto do mês já passou. Deixe em branco para usar a soma dos orçamentos.</p>'},
    {name:'v',label:'Meta mensal (R$)',value:metaMes()?num(metaMes()):'',inputmode:'decimal',placeholder:'ex: 3.000'}
  ],v=>{
    const tx=String(v.v||'').trim();
    if(!tx){delete S.cfg.metaMes;salvar();render();toast('Meta mensal removida');return;}
    const n=c2(parseBR(tx));if(!(n>0))return 'Informe um valor maior que zero.';
    S.cfg.metaMes=n;salvar();render();toast('Meta salva: '+brl(n)+' por mês');
  });
}
/* primeiro acesso no MVP: nada de tour, só a meta do mês e direto para o Início */
function metaOnbAbre(){
  const box=$('#modal');
  box.innerHTML=`<div class="sheet onbMeta" role="dialog" aria-modal="true" aria-label="Meta mensal de gastos">
    <span class="onbLogo" aria-hidden="true">${logoSVG()}</span>
    <h3>Quanto você quer gastar por mês?</h3>
    <p class="small">Essa é a sua meta mensal de gastos. No Início, o termômetro mostra se você está no ritmo. Dá para mudar quando quiser.</p>
    <label class="onbV"><span>R$</span><input id="onbMetaV" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="3.000" aria-label="meta mensal de gastos em reais"></label>
    <button type="button" class="btn full" id="onbMetaOk">Começar</button>
    <button type="button" class="alink onbPula" id="onbMetaPula">Pular por agora</button>
  </div>`;
  box.classList.add('on');
  const marca=()=>{try{localStorage.setItem('gv-tour-'+(USER&&USER.id),'1');}catch(e){}S.cfg.tourVisto=1;};
  const inp=$('#onbMetaV');
  const ok=()=>{const n=c2(parseBR(inp.value||''));if(!(n>0)){toast('Informe quanto quer gastar por mês.',true);inp.focus();return;}
    S.cfg.metaMes=n;marca();salvar();closeModal();go('inicio');toast('Meta de '+brl(n)+' por mês salva');};
  $('#onbMetaOk').onclick=ok;
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();ok();}});
  $('#onbMetaPula').onclick=()=>{marca();salvar();closeModal();go('inicio');};
  setTimeout(()=>{try{inp.focus({preventScroll:true});}catch(e){}},80);
}
/* termômetro do mês: % da meta já gasta x % do mês que já passou, com o marcador vertical "Hoje" */
function limiteMesHTML(){
  const m=mesAtual(),lim=limiteMes(m),r=ritmoMes(m);
  if(!lim)return `<div class="card lmCard lmVazio"><div class="lmTop"><div><small>ritmo do mês</small><b>Defina sua meta de gastos</b></div></div>
    <p class="lmTxt">Com uma meta mensal, o termômetro mostra se o gasto está no ritmo do mês.</p><button type="button" class="btn sm" data-act="meta-mes">${I('flag')}definir meta</button></div>`;
  const gasto=somaMes(m,'despesa',undefined,true),pct=lim.v>0?gasto/lim.v*100:0;
  const cl=ritmoCls(pct,r,pct>=100),resta=c2(lim.v-gasto),dRest=r?Math.max(1,r.dMes-r.dia+1):1;
  const st=pct>=100?['over','passou da meta']:cl==='warn'?['warn','acima do ritmo']:['ok','no ritmo'];
  return `<div class="card lmCard">
    <div class="lmTop"><div><small>${lim.de==='meta'?'meta de gastos do mês':'soma dos orçamentos do mês'}</small><b class="nw">${brl(gasto)} <span>de ${brl(lim.v)}</span></b></div><span class="lmSt ${st[0]}">${st[1]}</span></div>
    <div class="lmBar ${cl}" role="img" aria-label="${esc(r?ritmoTxt(pct,r):Math.round(pct)+'% da meta')}"><i data-w="${Math.min(100,Math.max(0,pct)).toFixed(1)}"></i>${r?`<b class="lmHoje" style="left:${Math.min(100,r.pct).toFixed(1)}%"><span>Hoje</span></b>`:''}</div>
    <div class="lmLeg"><span>${Math.round(pct)}% da meta gasto</span><span>${r?`dia ${r.dia} de ${r.dMes} · ${Math.round(r.pct)}% do mês`:''}</span></div>
    <p class="lmTxt">${resta>=0?`dá para gastar <b class="nw">${brl(resta/dRest)}</b> por dia até o fim do mês`:`<b class="nw neg">${brl(-resta)}</b> acima da meta do mês`}<button type="button" class="lmEd" data-act="meta-mes" aria-label="mudar a meta mensal">${I('edit')}</button></p>
  </div>`;
}

/* ---------- faturas abertas (Início e Gastos & Cartões) ---------- */
function faturasAbertasHTML(compacto){
  if(!pode('cartoes'))return compacto?'':`<button type="button" class="card gsTeaser" data-act="planos" data-id="cartoes">${I('card')}<span><b>Cartões e faturas</b><small>fatura aberta, parcelas e limite · ver planos</small></span>${I('chevR')}</button>`;
  const CA=cartoesAtivos();
  if(!CA.length)return compacto?'':`<div class="card gsCc"><div class="hmH"><h4>cartões e faturas</h4></div><p class="small" style="margin:4px 0 12px">Adicione seu cartão para ver a fatura aberta, o fechamento, o vencimento e as parcelas.</p><button type="button" class="btn sm" data-act="novo-cartao">${I('plus')} adicionar cartão</button></div>`;
  const hj=hojeISO(),dd=d=>d?d.slice(8,10)+'/'+d.slice(5,7):'';
  const dias=d=>Math.round((new Date(d+'T12:00')-new Date(hj+'T12:00'))/864e5);
  let tot=0,fut=0,nFut=0;
  const L=CA.map(c=>{let E;try{E=ccFatEstado(c);}catch(e){return null;}
    tot+=cents(E.valor||0);
    try{ccFaturasLista(c).forEach(f=>{if(f.estado==='futura'&&f.rest>0){fut+=cents(f.rest);nFut++;}});}catch(e){}
    return {c,E};}).filter(Boolean);
  const rows=L.slice(0,compacto?4:12).map(({c,E})=>{
    const n=E.vence?dias(E.vence):null,venc=E.st==='vencida'||(E.tipo==='fechada'&&n!=null&&n<0);
    const q=n==null?{t:'',c:''}:venc?{t:'vencida',c:'late'}:n===0?{t:'vence hoje',c:'now'}:n===1?{t:'vence amanhã',c:'now'}:{t:'vence '+dd(E.vence),c:n<=avisoDias()?'soon':''};
    const sub=E.tipo==='fechada'?'fechada'+(E.st==='parcial'?' · paga em parte':''):'aberta · fecha '+dd(E.fecha);
    return `<div class="rmRow tap" data-act="fat-abre" data-id="${esc(E.abre||'')}" role="button" tabindex="0" aria-label="abrir fatura do ${esc(c.nome)}"><span class="rmI" style="--cc:${esc(ccTom(c)||'#60a5fa')}">${I('card')}</span><div class="rmT"><b>${esc(c.nome)}</b><small>${sub}</small></div><div class="hvR"><span class="rmV nw">${brl(E.valor||0)}</span><span class="hvQ ${q.c}">${q.t}</span></div></div>`;}).join('');
  return `<div class="card gsCc${compacto?' gsCcHm':''}">
    <div class="hmH tap" ${compacto?'data-tab="gastos"':'data-act="nav-cartoes"'} role="button" tabindex="0" aria-label="${compacto?'abrir gastos e cartões':'abrir cartões'}"><h4>faturas abertas</h4><span class="hmSub">${brl(tot/100)}${I('chevR','tapCh')}</span></div>
    ${rows}
    ${fut>0?`<button type="button" class="gsParc" data-act="nav-cartoes">${I('calendar')}<span>parcelas e compras futuras: <b class="nw">${brl(fut/100)}</b> em ${nFut} ${nFut===1?'fatura':'faturas'}</span>${I('chevR')}</button>`:''}
  </div>`;
}

/* ---------- patrimônio total + proventos (Início) ---------- */
function patTotalHTML(){
  if(!pode('patrimonio')){
    if(!pode('investimentos'))return '';
    const patr=patrimonio(),dm=divMensal();return (patr||dm)?carteiraInicioHTML(patr,dm,proximoPag()):'';
  }
  const P=patLiquido();if(!(P.ativos||P.passivos))return '';
  return `<div class="card ptTot tap" data-tab="fii" role="button" tabindex="0" aria-label="abrir patrimônio">
    <div class="hmH"><h4>patrimônio total</h4><span class="hmSub">contas + investimentos + bens − dívidas${I('chevR','tapCh')}</span></div>
    <div class="ptTotV nw ${P.liq<0?'neg':''}">${brl(P.liq)}</div>
    <div class="ptTotL"><span><small>contas</small><b class="nw">${brl(P.contas)}</b></span><span><small>investido</small><b class="nw">${brl(P.inv)}</b></span>${P.bens?`<span><small>bens</small><b class="nw">${brl(P.bens)}</b></span>`:''}${P.passivos?`<span><small>dívidas e faturas</small><b class="nw neg">− ${brl(P.passivos)}</b></span>`:''}</div>
    ${rendaPassivaHTML('rpaHm')}
  </div>`;
}

/* ---------- Aba 1: Início ---------- */
function viewInicioMVP(){
  const per=periodo(),pl=per.label;
  const rec=somaMes(per,'receita'),des=somaMes(per,'despesa'),sal=(cents(rec)-cents(des))/100;
  const tile=(cls,ic,lb,val,sub,act)=>`<div class="rsT ${cls} tap" data-act="${act}" role="button" tabindex="0" aria-label="${esc(lb)}"><span class="rsL">${I(ic)}${lb}</span><b class="nw">${val}</b><span class="rsD">${sub}</span></div>`;
  const nome=nomeUsuario();
  return `
  <div class="hmHead"><h1>${saudHora()}${nome?', <span>'+esc(nome)+'</span>':''}</h1></div>
  ${omniHTML()}
  ${blocosInicioHTML()}${alertasHTML()}${alertaVermelhoHTML()}
  ${limiteMesHTML()}
  <div class="hmH hmResH"><h4>resumo · ${esc(pl)}</h4><button class="olhoBtn" data-act="oculta" aria-label="${OCULTO?'mostrar valores':'ocultar valores'}">${I(OCULTO?'eyeOff':'eye')}</button></div>
  <div class="relRes hmRes">
    ${tile('rec','arrowUp','receitas',brl(rec),'entradas pagas','nav-rec')}
    ${tile('des','arrowDown','despesas',brl(des),'saídas pagas','nav-des')}
    ${tile('sal '+(sal<0?'neg':''),'wallet','saldo do período',brl(sal),sal<0?'gastou mais do que entrou':'sobrou no período','nav-tudo')}
    ${tile('pou','bank','saldo nas contas',brl(saldoTotal()),'todas as contas','nav-contas')}
  </div>
  ${faturasAbertasHTML(true)}
  ${proxVencHTML()}
  ${patTotalHTML()}
  ${dicaInstalarHTML(false)}`;
}
/* barra inteligente: frase (IA ou compra de ativo) + câmera do recibo no mesmo campo + lançamento manual */
function smartBarHTML(){
  return `<div class="omniWrap">
  <form class="omni" id="omniF" role="search" aria-label="lançar numa frase ou pela foto do recibo" autocomplete="off" novalidate>
    <span class="omniIc" aria-hidden="true">${I('sparkle')}</span>
    <input id="omniTxt" type="text" enterkeyhint="send" maxlength="600" value="${esc(OMNI_TXT)}" placeholder="Ex: Almoço 45 crédito ou 10 MXRF11" aria-label="o que você gastou, recebeu ou investiu">
    <button type="button" class="omniCam" data-act="ia-ler" aria-label="foto do recibo" title="foto do recibo">${I('camera')}</button>
    <button type="submit" class="omniGo" aria-label="lançar">${I('arrowUp')}</button>
  </form>
  <button type="button" class="omniManual" data-act="lanc-manual">Lançamento manual</button>
  </div>`;
}

/* ---------- Aba 2: Gastos & Cartões ---------- */
let GS_PLAN=false;
function gsExtratoHTML(){
  const m=mesAtual(),hj=hojeISO();
  const L=(S.tx||[]).filter(t=>t&&t.data&&t.data.slice(0,7)===m&&t.data<=hj&&!t.faturaKey&&t.status!=='cancelado'&&(t.tipo==='despesa'||t.tipo==='receita'||t.tipo==='transf'))
    .sort((a,b)=>(b.data||'').localeCompare(a.data||'')||String(b.criadoEm||'').localeCompare(String(a.criadoEm||'')));
  const cont={};L.forEach(t=>{const k=origemTx(t);cont[k]=(cont[k]||0)+1;});
  const resumo=['ia','wa','rec','man','imp'].filter(k=>cont[k]).map(k=>`<span class="txOrg o-${k}">${ORIGEM_L[k]} ${cont[k]}</span>`).join('');
  const rows=L.slice(0,12).map(t=>{const r=t.tipo==='receita',tr=t.tipo==='transf',cc=r?'#4ade80':tr?'#94a3b8':corCat(t.categoria);
    return `<div class="rmRow tap" data-act="tx-menu" data-id="${esc(t.id)}" role="button" tabindex="0" aria-label="abrir lançamento"><span class="rmI" style="--cc:${cc}">${I(tr?'swap':catIcon(t.categoria))}</span><div class="rmT"><b>${esc(nomeTx(t).n||t.categoria||(r?'receita':'despesa'))}</b><small>${origemBadge(t)}${esc(tr?'transferência':t.categoria||'')} · ${t.data.slice(8,10)}/${t.data.slice(5,7)}${t.status==='previsto'?' · previsto':''}</small></div><span class="rmV nw ${r?'pos':''}">${r?'+':tr?'':'−'}${brl(t.valor)}</span></div>`;}).join('');
  return `<div class="card gsExt">
    <div class="hmH tap" data-act="gs-extrato" role="button" tabindex="0" aria-label="ver extrato completo"><h4>extrato de ${esc(MESES_LONGO[+m.slice(5,7)-1])}</h4><span class="hmSub">${L.length} ${L.length===1?'lançamento':'lançamentos'}${I('chevR','tapCh')}</span></div>
    ${resumo?`<div class="gsOrgs" aria-label="lançamentos por origem">${resumo}</div>`:''}
    ${rows||'<p class="small" style="margin:6px 0 4px">Nada lançado neste mês ainda. Use a barra do Início, a foto do recibo ou o WhatsApp.</p>'}
    ${L.length>12?`<button type="button" class="hmLink hmMais" data-act="gs-extrato">ver os ${L.length} lançamentos do mês${I('chevR')}</button>`:''}
  </div>`;
}
function gsPlanHTML(){
  if(!pode('planejamento'))return `<button type="button" class="card gsTeaser" data-act="planos" data-id="planejamento">${I('compass')}<span><b>Planejamento</b><small>saldo dos próximos meses e simulações · ver planos</small></span>${I('chevR')}</button>`;
  let corpo='';
  if(GS_PLAN){try{corpo=viewPlan().replace(/<div class="head"><h2>Planejamento<\/h2><\/div>/,'');}catch(e){corpo='<p class="small">Não consegui montar o planejamento agora.</p>';}}
  return `<details class="card gsAcc" data-acc="plan"${GS_PLAN?' open':''}><summary>${I('compass')}<span><b>Planejamento</b><small>saldo dos próximos meses, simulações e dia a dia</small></span>${I('chevD','gsAccCh')}</summary><div class="gsAccIn">${corpo}</div></details>`;
}
document.addEventListener('toggle',e=>{const d=e.target;if(!d||!d.dataset||d.dataset.acc!=='plan'||GS_PLAN===d.open)return;GS_PLAN=d.open;if(TAB==='gastos')render();},true);
function viewGastos(){
  const links=[['gs-extrato','receipt','Extrato completo'],['nav-orc','gauge','Orçamentos'],['nav-cartoes','card','Cartões e parcelas'],['nav-rel','report','Relatório'],['nova-fixa','calendar','Conta fixa'],['importar','up','Importar extrato']];
  return `
  <div class="head gsHead"><h2>Gastos &amp; Cartões</h2><button class="btn" data-act="lanc-manual">+ lançar</button></div>
  ${limiteMesHTML()}
  ${pode('orcamentos')?orcInicioHTML():''}
  ${faturasAbertasHTML(false)}
  ${gsExtratoHTML()}
  ${gsPlanHTML()}
  <div class="gsLinks" role="group" aria-label="mais em gastos e cartões">${links.map(([a,ic,l])=>`<button type="button" class="gsLk" data-act="${a}">${I(ic)}<span>${l}</span></button>`).join('')}</div>`;
}

/* ---------- Aba 3: Patrimônio (carteira + cotações + alertas de preço) ---------- */
function patHeadMVP(){
  let tot='';
  if(pode('patrimonio')){try{const P=patLiquido();tot=`<button type="button" class="card ptLinha" data-act="nav-sub" data-id="pat"><span><small>patrimônio total</small><b class="nw ${P.liq<0?'neg':''}">${brl(P.liq)}</b></span><em>contas, investimentos e bens menos dívidas</em>${I('chevR')}</button>`;}catch(e){}}
  return `<div class="head fiiHead"><h2>Patrimônio</h2><button class="btn" data-act="novo-fii">+ ativo</button></div>
  <div class="ptAcoes"><button type="button" class="btn2 sm ptAlerta" data-act="rd-busca">${I('bell')}<span>Novo alerta de ativo</span></button><button type="button" class="btn2 sm" data-act="nav-sub" data-id="metas">${I('flag')}<span>Metas</span></button><button type="button" class="btn2 sm" data-act="nav-sub" data-id="bancos">${I('bank')}<span>Contas</span></button></div>
  ${tot}`;
}
/* sino de cada ativo: cria o alerta em 1 toque (abre já com o preço de agora) e mostra se tem alerta ativo ou atingido */
function rdItemDoAtivo(f){const cri=tipoOf(f)==='cripto',t=String(f.ticker||'').toUpperCase();return radarL().find(x=>x.t===t&&rdCri(x)===cri)||null;}
function rdBellHTML(f){
  const it=rdItemDoAtivo(f),at=it?it.al.filter(a=>!rdDisp(it,a)).length:0,hit=!!(it&&it.al.some(a=>rdDisp(it,a)));
  const lb=hit?'alerta de preço atingido':at?(at>1?at+' alertas de preço ativos':'1 alerta de preço ativo'):'criar alerta de preço';
  return `<button class="astBell${hit?' hit':at?' on':''}" data-act="rd-bell" data-id="${esc(f.id)}" title="${lb}" aria-label="${lb} · ${esc(f.ticker||'')}">${I('bell')}${at?`<i>${at}</i>`:''}</button>`;
}
function alertaAtivo(fid){
  if(!pode('investimentos')){abrePlanos('investimentos');return;}
  const f=(S.fiis||[]).find(x=>x.id===fid);if(!f||tipoOf(f)==='rf')return;
  const it=rdItemDoAtivo(f)||radarAdd({t:f.ticker,k:tipoOf(f),cg:f.cgId,n:f.nome||''});if(!it)return;
  radarAlertasAbre(rdQKey(it),!it.al.length,true);
}
/* alertas de ativos que a pessoa não tem (o antigo Radar), abaixo da carteira */
function rdSecHTML(){
  const L=radarL().filter(it=>!(S.fiis||[]).some(f=>f.cotas>0&&tipoOf(f)!=='rf'&&f.ticker===it.t&&(tipoOf(f)==='cripto')===rdCri(it)));
  if(!L.length)return '';
  return `<div class="wSec" id="rdSec"><h3>Alertas de ativos que você não tem <span>${L.length}</span></h3><button type="button" class="btn2 sm" data-act="rd-busca">${I('plus')}novo</button></div>
  <div class="rrList">${L.map(rdCardHTML).join('')}</div>`;
}

/* ---------- Aba 4: WhatsApp & Conta ---------- */
const WA_EX=['Uber 28 pix','Mercado 152,40 crédito Nubank','Quanto gastei com comida esse mês?','Comprei 10 MXRF11 a 10,15'];
function waHeroHTML(){
  return `<div class="card bcCard waCard waHero">
    <div class="bcHd"><span class="bcIc">${I('chat')}</span><div><h4>Assistente no WhatsApp</h4><small>o jeito mais rápido de lançar no dia a dia</small></div><span class="bcSt" id="waSt"></span></div>
    <div class="pushTxt" id="waTxt">${USER?'verificando…':'entre na sua conta para usar o WhatsApp.'}</div>
    <div class="pushBtns" id="waBtns"></div>
    <div class="waEx" role="group" aria-label="exemplos de mensagem"><small>toque num exemplo para mandar pelo WhatsApp</small>${WA_EX.map(x=>`<button type="button" class="waExB" data-act="wa-ex" data-id="${esc(x)}">${I('chat')}<span>${esc(x)}</span></button>`).join('')}</div>
  </div>`;
}
/* exemplo: abre o WhatsApp do GranaViva com a frase escrita (número que o servidor informa); sem número, copia a frase */
function waExemplo(txt){
  txt=String(txt||'').slice(0,200);if(!txt)return;
  const st=WA_ST&&WA_ST.st,n=st&&st.ativo?String(st.numero||'').replace(/\D/g,''):'';
  if(n){location.href='https://wa.me/'+n+'?text='+encodeURIComponent(txt);return;}
  copiaTexto(txt).then(()=>toast('Copiado: '+txt)).catch(()=>toast('Não consegui copiar.',true));
}

/* ---------- navegação e renderização ---------- */
let TAB='inicio';
const F={mes:mesAtual(),cat:'',tipo:'despesa',q:'',tag:'',ini:'',fim:'',perL:'',conta:'',st:'',comp:''};
const DATA_HOJE=()=>{const d=new Date();if(innerWidth<=360)return ['dom','seg','ter','qua','qui','sex','sáb'][d.getDay()]+' · '+d.getDate()+' '+MESES[d.getMonth()];return ['domingo','segunda','terça','quarta','quinta','sexta','sábado'][d.getDay()]+' · '+d.getDate()+' de '+MESES_LONGO[d.getMonth()];}; // v10.74: curta em telas bem estreitas

function applyCfg(){
  {const k=S.cfg.tema+'|'+S.cfg.accent;if(window.__gvCfgK&&window.__gvCfgK!==k)REND.html=null;window.__gvCfgK=k; // v10.91: tema novo redesenha os gráficos com as cores certas
   try{const ac=ACCENTS[S.cfg.accent]||ACCENTS.verde,u=JSON.stringify({tema:S.cfg.tema,accent:S.cfg.accent,a1:ac[0],a2:ac[1]});if(localStorage.getItem('gv-ui')!==u)localStorage.setItem('gv-ui',u);}catch(e){}} // e o próximo boot já pinta no tema certo
  document.documentElement.dataset.ac=ACCENTS[S.cfg.accent]?S.cfg.accent:'verde'; // v10.100: o esmeralda do computador só vale para o tema verde
  document.documentElement.classList.toggle('claro',S.cfg.tema==='claro');
  document.documentElement.classList.toggle('preto',S.cfg.tema==='preto');
  {const tc=document.querySelector('meta[name="theme-color"]');if(tc)tc.setAttribute('content',S.cfg.tema==='preto'?'#000000':S.cfg.tema==='claro'?'#f2f5fb':'#0b0f1a');}
  const [a,b]=ACCENTS[S.cfg.accent]||ACCENTS.verde;
  document.documentElement.style.setProperty('--a1',a);
  document.documentElement.style.setProperty('--a2',b);
}
/* v10.90: fechar o menu sempre tira o fundo escuro/desfocado e qualquer estilo deixado pelo arrasto.
   o fundo só pode ficar visível com o menu aberto (ovConfere roda em todo fim de toque, troca de aba, volta ao app...). */
function toggleSide(on){on=!!on;const sd=$('#side'),ov=$('#ov');if(!sd||!ov)return;
  sd.style.transition='';sd.style.transform='';ov.style.transition='';ov.style.opacity='';ov.style.pointerEvents='';ov.style.visibility='';
  sd.classList.toggle('open',on);ov.classList.toggle('on',on);if(!on)ovConfere();}
let OV_ARRASTA=false;
function ovConfere(){const sd=$('#side'),ov=$('#ov');if(!sd||!ov||OV_ARRASTA)return;
  if(sd.style.transform)sd.style.transform='';
  if(!sd.classList.contains('open')){ov.classList.remove('on');['opacity','pointerEvents','transition','visibility'].forEach(k=>{if(ov.style[k])ov.style[k]='';});}
  else if(!ov.classList.contains('on'))ov.classList.add('on');}
let NAV_EXPLICITA=false;
function gravaAba(t){try{localStorage.setItem('gv-tab',t);}catch(e){}try{sessionStorage.setItem('gv-tab',t);}catch(e){}}
// restaura a aba salva (localStorage, fallback sessionStorage). não faz nada se o usuário já navegou nesta sessão.
function restauraAba(){
  if(NAV_EXPLICITA)return;
  let gt=null;
  try{gt=localStorage.getItem('gv-tab');}catch(e){}
  if(!gt){try{gt=sessionStorage.getItem('gv-tab');}catch(e){}}
  if(gt&&!VIEWS[gt])gt=rotaResolve(gt); // v10.160: aba antiga com outro nome cai na aba nova certa
  if(gt&&VIEWS[gt]&&gt!==TAB){TAB=gt;}
  pintaNav();
}
function go(t){
  if(!VIEWS[t])t=rotaResolve(t); // v10.160: nomes antigos (radar, investimentos, ajustes...) caem na aba certa
  if(MVP_MODE&&t==='fii'&&FMODO==='radar'){FMODO='carteira';try{localStorage.setItem('gv-fmodo','carteira');}catch(e){}}
  TAB=t;NAV_EXPLICITA=true;
  gravaAba(t);
  if(t==='fii'){atualizaCotacoes();atualizaCripto();atualizaCDI();}
  if(t==='metas'&&(S.metas||[]).some(m=>m.cdi||m.ipca))atualizaCDI().then(()=>{if(TAB==='metas')render();}).catch(()=>{});
  pintaNav();
  toggleSide(false);
  render();window.scrollTo(0,0);
}
/* ---------- v10.78: cards que levam ao lugar certo ----------
   navega() guarda onde a pessoa estava (aba, filtros, rolagem) e empilha no histórico do navegador:
   o voltar do celular (ou o botão "voltar" da tela) devolve exatamente para lá. */
const TAB_NOME={inicio:'Início',lanc:'Lançamentos',orc:'Orçamentos',fii:'Investimentos',metas:'Metas',pat:'Patrimônio',plan:'Planejamento',cartoes:'Cartões',bancos:'Bancos',rel:'Relatório',cfg:'Ajustes',gastos:'Gastos & Cartões'};
if(MVP_MODE)Object.assign(TAB_NOME,{lanc:'Extrato',fii:'Patrimônio',pat:'Patrimônio líquido',bancos:'Contas e bancos',cfg:'WhatsApp & Conta'});
const F_LIMPO={mes:'',cat:'',tipo:'',q:'',tag:'',ini:'',fim:'',perL:'',conta:'',st:'',comp:''};
let NAV_PILHA=[];
function navega(tab,f,depois){
  NAV_PILHA.push({tab:TAB,F:Object.assign({},F),y:window.scrollY||0,rel:typeof REL!=='undefined'?Object.assign({},REL):null});
  if(NAV_PILHA.length>30)NAV_PILHA.shift();
  try{history.pushState({gvNav:NAV_PILHA.length},'');}catch(e){}
  if(f)Object.assign(F,F_LIMPO,f);
  if($('#modal').classList.contains('on'))closeModal();
  go(tab);
  if(depois)setTimeout(depois,30);
}
/* lançamentos do período do início (ou de um mês) já filtrados */
function navLanc(tipo,extra,per){
  per=per||periodo();const um=per.ini.slice(0,7)===per.fim.slice(0,7)&&per.ini.slice(8)==='01'&&per.fim===isoDe(new Date(+per.fim.slice(0,4),+per.fim.slice(5,7),0));
  navega('lanc',Object.assign(um?{tipo,mes:per.ini.slice(0,7)}:{tipo,ini:per.ini,fim:per.fim,perL:per.label},extra||{}));
}
function navVolta(){if(NAV_PILHA.length){try{history.back();return;}catch(e){}}go('inicio');}
function navRestaura(){
  const p=NAV_PILHA.pop();if(!p)return false;
  if($('#modal').classList.contains('on'))closeModal();
  Object.keys(F).forEach(k=>{F[k]=p.F[k]!==undefined?p.F[k]:F_LIMPO[k];});
  if(p.rel&&typeof REL!=='undefined')Object.assign(REL,p.rel);
  go(p.tab);requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,p.y)));
  return true;
}
addEventListener('popstate',()=>{if($('#side').classList.contains('open'))toggleSide(false);if(!navRestaura()&&$('#modal').classList.contains('on'))closeModal();ovConfere();});
ICONS.camera='<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.2"/>';
ICONS.ccVira='<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>';
ICONS.info='<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.2"/>';
ICONS.clock='<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
ICONS.handCoins='<path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17"/><path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 16 6 6"/><circle cx="16" cy="9" r="2.9"/><circle cx="6" cy="5" r="3"/>';
ICONS.undo='<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>';
ICONS.heartHand=ICONS.lu_hand_heart||ICONS.user;
/* faixa "voltar" no topo da tela aberta por um card */
function voltaHTML(){const p=NAV_PILHA[NAV_PILHA.length-1];if(!p||p.tab===TAB&&TAB!=='lanc')return '';
  return `<button type="button" class="navVolta" data-act="nav-volta">${I('chevL')}<span>voltar para ${esc(TAB_NOME[p.tab]||'a tela anterior')}</span></button>`;}
/* teclado: elementos role=button com data-act respondem a Enter e espaço */
document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target&&e.target.matches&&e.target.matches('[role="button"][data-act]')){e.preventDefault();e.target.click();}});
document.addEventListener('input',e=>{if(e.target&&e.target.id==='catBusca'){const nz=x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const q=nz(e.target.value.trim());{const cl=e.target.closest('.card');const li=cl&&cl.querySelector('.catList');if(li)li.classList.toggle('busca',!!q);const mb=cl&&cl.querySelector('.catMaisBtn');if(mb)mb.hidden=!!q;}let n=0;document.querySelectorAll('.catRow').forEach(r=>{const ok=!q||nz(r.dataset.q).includes(q);r.hidden=!ok;if(ok)n++;});const v=document.querySelector('.catVazio');if(v)v.hidden=n>0;}});
/* v10.91: estado do último desenho da tela (para não redesenhar o que não mudou) */
let REND={tab:null,bloq:null,html:null},RENDER_QUIETO=false;
function mataGraficos(root){} /* v10.99: gráficos agora são SVG, nada a destruir */ // v10.51: gráficos da tela antiga não ficam presos na memória
function gvFilhos(html){const t=document.createElement('template');t.innerHTML=html;return [...t.content.childNodes].filter(n=>n.nodeType===1||(n.nodeType===3&&n.textContent.trim()));}
/* troca só os filhos de primeiro nível que mudaram; false = estrutura diferente (o chamador troca tudo) */
function morphView(v,antHtml,html){
  const a=gvFilhos(antHtml),b=gvFilhos(html),cur=[...v.childNodes].filter(n=>n.nodeType===1||(n.nodeType===3&&n.textContent.trim()));
  if(a.length!==b.length||cur.length!==a.length)return false;
  const ser=n=>n.nodeType===1?n.outerHTML:n.textContent;
  for(let i=0;i<b.length;i++){if(ser(a[i])===ser(b[i]))continue;mataGraficos(cur[i]);cur[i].replaceWith(b[i]);}
  return true;
}
function render(){
  {const dh=DATA_HOJE(),ix=dh.indexOf(' · ');$('#sub').innerHTML=ix>0?'<b>'+esc(dh.slice(0,ix))+'</b><span aria-hidden="true"> · </span>'+esc(dh.slice(ix+3)):esc(dh);}
  try{atualizaSino();}catch(e){}
  {const mS=/[?&]semana=(\d{4}-\d{2}-\d{2})/.exec(location.search);if(!window.__semOk&&mS&&(USER||(/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname)&&/[?&]gvtest\b/.test(location.search)))){window.__semOk=1;try{history.replaceState(null,'',location.pathname+(/[?&]gvtest\b/.test(location.search)?'?gvtest':''));}catch(e){}setTimeout(()=>abreSemana(mS[1]),350);}}
  if(!window.__alOk&&USER&&/[?&]alertas=1/.test(location.search)){window.__alOk=1;history.replaceState(null,'',location.pathname);setTimeout(abrirAlertas,300);}
  if(MVP_MODE&&!window.__hsOk){window.__hsOk=1;const h=/^#\/?([a-z]+)$/i.exec(location.hash||'');if(h){try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}const t=rotaResolve(h[1].toLowerCase());if(t!==TAB)setTimeout(()=>go(t),0);}} // v10.160: links #gastos, #patrimonio, #radar...
  if(!window.__rdOk&&USER&&/[?&]radar=1/.test(location.search)){window.__rdOk=1;history.replaceState(null,'',location.pathname);FMODO=MVP_MODE?'carteira':'radar';try{localStorage.setItem('gv-fmodo','radar');}catch(e){}setTimeout(()=>go('fii'),200);} // v10.155: push do Radar
  const v=$('#view');
  MEMO={};const memoTok=MEMO;setTimeout(()=>{if(MEMO===memoTok)MEMO=null;},120); // aba em segundo plano não roda rAF: a memória não pode ficar viva
  if(TAB==='inicio'||TAB==='metas')setTimeout(()=>{try{mtLembra();}catch(e){}},0); // v10.87
  const recT=TAB_RECURSO[TAB],bloq=!!(recT&&!pode(recT)); // v10.82: aba de outro plano mostra o convite (os dados ficam guardados)
  const espera=!!(recT&&USER&&!PLANO_LIDO&&!PLANO_FALHA&&window.GVP); // v10.129: logado e plano ainda não lido: não mostra a aba paga liberada
  if(MVP_MODE){try{document.documentElement.dataset.gvTab=TAB;}catch(e){}}
  let html;try{html=espera?`<div class="head"><h2>${esc(TAB_NOME[TAB]||'')}</h2></div><div class="card plEspera" aria-busy="true">Carregando…</div>`:bloq?viewBloqueio(recT):VIEWS[TAB]();}catch(e){MEMO=null;throw e;}
  if(MVP_MODE&&grupoDe(TAB)!==TAB&&html.indexOf('class="navVolta"')<0)html=mvpVoltaHTML()+html; // v10.160: tela de detalhe volta para a aba dela
  /* v10.91: sem "piscar". a mesma tela redesenhada (sync, cotações, CDI, volta ao app) só troca o que mudou:
     HTML igual = nada é tocado (nem os nós, nem a rolagem, nem os gráficos); HTML diferente = troca só os blocos
     de primeiro nível que mudaram, sem a animação de entrada e mantendo a rolagem. a animação fica só para troca de aba. */
  const mesma=REND.tab===TAB&&REND.bloq===bloq&&REND.html!=null&&v.childElementCount>0;
  if(mesma&&html===REND.html){MEMO=null;try{cabeNum(v);}catch(e){}return;}
  const ant=REND.html;REND={tab:TAB,bloq,html};
  v.dataset.v=bloq?'bloq':TAB; // v10.100: o layout de computador muda por tela
  if(mesma){
    const y=window.scrollY;RENDER_QUIETO=true;
    if(!morphView(v,ant,html)){mataGraficos(v);v.innerHTML=html;}
    v.classList.remove('fade');
    if(Math.abs(window.scrollY-y)>1)window.scrollTo(0,y);
  }else{
    RENDER_QUIETO=false;mataGraficos(v);v.innerHTML=html;
    v.classList.remove('fade');void v.offsetWidth;v.classList.add('fade');
  }
  const quieto=RENDER_QUIETO;
  requestAnimationFrame(()=>{
    RENDER_QUIETO=quieto;
    if(!bloq&&AFTER[TAB])AFTER[TAB]();
    RENDER_QUIETO=false;
    if(TAB==='cfg'){atualizaPushUI();atualizaLockUI();atualizaBancoUI();atualizaWaUI();}
    v.querySelectorAll('[data-w]').forEach(el=>el.style.width=el.dataset.w+'%');
    v.querySelectorAll('[data-off]').forEach(el=>el.style.strokeDashoffset=el.dataset.off);
    try{cabeNum(v);}catch(e){}
    MEMO=null;
  });
}
/* v10.34: valores grandes encolhem a fonte para caber, sem quebrar o número no meio */
function cabeNum(root){
  root.querySelectorAll('.hmSaldo,.mini b,.bk-val,.fit,.rdS b').forEach(el=>{
    el.style.fontSize='';if(!el.clientWidth)return;
    let fs=parseFloat(getComputedStyle(el).fontSize),min=Math.max(10,fs*.45),i=0;
    while(el.scrollWidth>el.clientWidth+1&&fs>min&&i++<30){fs-=1;el.style.fontSize=fs+'px';}
  });
}
let CABE_T;addEventListener('resize',()=>{clearTimeout(CABE_T);CABE_T=setTimeout(()=>{const v=$('#view');if(v)cabeNum(v);},150);});

const VIEWS={
  gastos:viewGastos,
  inicio:MVP_MODE?viewInicioMVP:viewInicio,lanc:viewLanc,orc:viewOrc,fii:viewFii,metas:viewMetas,pat:viewPat,plan:viewPlan,cartoes:viewCartoes,bancos:viewBancos,rel:viewRel,cfg:viewCfg
};
const AFTER={
  cartoes:()=>{ccIniciaTilt();ccDepois();ccPinta();},
  inicio:()=>{
    const bc=$('#cBar'),dc=$('#cDonut');
    if(bc){bc.__bh=0;barTip(bc);}
    if(bc)drawBars(bc,1);if(dc)drawDonut(dc,1);
    animar(1000,p=>{if(bc)drawBars(bc,p);if(dc)drawDonut(dc,p);});
  },
  fii:()=>{updCountdown();if(FMODO==='radar'||MVP_MODE)radarAtualiza(false);},
  rel:()=>{const c=$('#cRel'),d=$('#cRelDia');if(c||d)animar(800,p=>{if(c)drawRel(c,p);if(d)drawRelDia(d,p);});const ps=$('#rsPills');if(ps){const on=ps.querySelector('.on');if(on)ps.scrollLeft=on.offsetLeft-ps.clientWidth/2+on.clientWidth/2;}}
};

function nomeUsuario(){
  if(!USER)return '';
  const md=USER.user_metadata||{};
  const n=String(md.full_name||md.name||'').trim().split(/\s+/)[0]||String(USER.email||'').split('@')[0].split(/[._+-]/)[0];
  return n?n.charAt(0).toUpperCase()+n.slice(1).toLowerCase():'';
}
function saudHora(){const h=new Date().getHours();return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';}
function sparkSVG(vals){
  const W=320,H=120,pad=8,n=vals.length;if(!n)return '';
  const mx=Math.max(1,...vals);
  const pts=vals.map((v,i)=>[pad+(n>1?i*(W-2*pad)/(n-1):0),H-pad-(v/mx)*(H-2*pad)]);
  let d='M'+pts[0][0].toFixed(1)+','+pts[0][1].toFixed(1);
  for(let i=1;i<pts.length;i++){const [x0,y0]=pts[i-1],[x1,y1]=pts[i],cx=(x0+x1)/2;d+=' C'+cx.toFixed(1)+','+y0.toFixed(1)+' '+cx.toFixed(1)+','+y1.toFixed(1)+' '+x1.toFixed(1)+','+y1.toFixed(1);}
  const area=d+' L'+pts[n-1][0].toFixed(1)+','+H+' L'+pts[0][0].toFixed(1)+','+H+' Z';
  const last=pts[n-1];
  return '<svg class="spark" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="spG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a3e635" stop-opacity=".35"/><stop offset="1" stop-color="#a3e635" stop-opacity="0"/></linearGradient></defs><path d="'+area+'" fill="url(#spG)"/><path d="'+d+'" fill="none" stroke="#a3e635" stroke-width="2.2" stroke-linecap="round"/><circle cx="'+last[0].toFixed(1)+'" cy="'+last[1].toFixed(1)+'" r="4.5" fill="#a3e635" stroke="#0a0a0c" stroke-width="2"/></svg>';
}
/* filtro de período do painel: um único intervalo para todos os blocos dependentes do período */
const PER_OPS=[['mes','este mês'],['ant','mês anterior'],['3m','3 meses'],['6m','6 meses'],['12m','12 meses'],['custom','personalizado']];
let PER=(()=>{try{const p=JSON.parse(localStorage.getItem('gv-per')||'null');if(p&&PER_OPS.some(o=>o[0]===p.k))return p;}catch(e){}return {k:'mes',ini:'',fim:''};})();
/* v10.89: nos 3 primeiros dias do mês o "este mês" quase não tem nada e a Início mostrava cards zerados.
   até o dia 3, "este mês" mostra o mês anterior (fechado), com aviso na tela. PER_ATUAL=1 (botão "ver <mês atual>")
   volta para o mês corrente nesta sessão; a partir do dia 4 tudo volta ao normal sozinho. */
let PER_ATUAL=0;
function mesAntAuto(p){p=p||PER;return p.k==='mes'&&!PER_ATUAL&&new Date().getDate()<=3;}
function periodo(p){
  p=p||PER;const h=new Date(),y=h.getFullYear(),m=h.getMonth();
  const fimMes=(yy,mm)=>isoDe(new Date(yy,mm+1,0)),iniMes=(yy,mm)=>isoDe(new Date(yy,mm,1));
  if(mesAntAuto(p)){const d=new Date(y,m-1,1);return {ini:iniMes(y,m-1),fim:fimMes(y,m-1),label:MESES_LONGO[d.getMonth()]+' (mês anterior)',meses:1,auto:true};}
  if(p.k==='ant')return {ini:iniMes(y,m-1),fim:fimMes(y,m-1),label:'mês anterior',meses:1};
  const n={'3m':3,'6m':6,'12m':12}[p.k];
  if(n)return {ini:iniMes(y,m-n+1),fim:fimMes(y,m),label:'últimos '+n+' meses',meses:n};
  if(p.k==='custom'&&DATA_OK.test(p.ini)&&DATA_OK.test(p.fim)){const a=p.ini<=p.fim?p.ini:p.fim,b=p.ini<=p.fim?p.fim:p.ini;
    const meses=(+b.slice(0,4)-+a.slice(0,4))*12+(+b.slice(5,7)-+a.slice(5,7))+1;return {ini:a,fim:b,label:fmtData(a)+' a '+fmtData(b),meses};}
  return {ini:iniMes(y,m),fim:fimMes(y,m),label:'este mês',meses:1};
}
function salvaPer(){try{localStorage.setItem('gv-per',JSON.stringify(PER));}catch(e){}}
function sparkPer(per){
  const out=[],lab=[];let acc=0;
  const mp={};S.tx.forEach(t=>{if(efetivo(t)&&t.tipo==='despesa'&&!t.cartao&&t.data>=per.ini&&t.data<=per.fim)mp[t.data]=(mp[t.data]||0)+cents(t.valor);});
  const d=new Date(+per.ini.slice(0,4),+per.ini.slice(5,7)-1,+per.ini.slice(8,10)),hj=hojeISO();
  const ate=per.fim>hj&&per.ini<=hj?hj:per.fim;
  for(let i=0;i<800;i++){const k=isoDe(d);if(k>ate)break;acc+=mp[k]||0;out.push(acc/100);lab.push(fmtData(k));d.setDate(d.getDate()+1);}
  return {vals:out,lab};
}
const PIE_CORES=['#a3e635','#f472b6','#a78bfa'];
/* v10.99: gráfico de gastos acumulados desenhado em SVG pelo próprio app (antes biblioteca de 210 KB só para este gráfico).
   sai pronto no HTML da tela, então o redesenho por diferença (v10.91) só troca o gráfico quando os números mudam */
function gastoSVG(per){
  const sp=sparkPer(per),v=sp.vals;if(!v.length)return '';
  const W=300,H=120,T=8,B=6,mx=Math.max(...v,0)||1,n=v.length;
  const L=6,R=W-6,X=i=>n===1?R:L+i*(R-L)/(n-1),Y=y=>T+(H-T-B)*(1-y/mx),f=x=>x.toFixed(1);
  const P=v.map((y,i)=>[X(i),Y(y)]);
  /* curva monótona: suave como antes, sem passar acima ou abaixo dos pontos */
  let d;
  if(n===1)d='M'+L+' '+f(P[0][1])+'L'+R+' '+f(P[0][1]);
  else{d='M'+f(P[0][0])+' '+f(P[0][1]);const m=[];
    for(let i=0;i<n;i++){const a=i>0?(P[i][1]-P[i-1][1])/(P[i][0]-P[i-1][0]):null,b=i<n-1?(P[i+1][1]-P[i][1])/(P[i+1][0]-P[i][0]):null;
      m.push(a===null?b:b===null?a:a*b<=0?0:(a+b)/2);}
    for(let i=0;i<n-1;i++){const h=(P[i+1][0]-P[i][0])/3;d+='C'+f(P[i][0]+h)+' '+f(P[i][1]+m[i]*h)+' '+f(P[i+1][0]-h)+' '+f(P[i+1][1]-m[i+1]*h)+' '+f(P[i+1][0])+' '+f(P[i+1][1]);}}
  const ul=P[n-1];
  return `<div class="spk" aria-hidden="true"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="spkG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a3e635" stop-opacity=".35"/><stop offset="1" stop-color="#a3e635" stop-opacity="0"/></linearGradient></defs><path class="spkA" d="${d}L${R} ${H}L${L} ${H}Z" fill="url(#spkG)"/><path class="spkL" d="${d}" fill="none" stroke="#a3e635" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/></svg><i class="spkP" style="left:${(ul[0]/W*100).toFixed(2)}%;top:${(ul[1]/H*100).toFixed(2)}%"></i></div>`;
}
/* previsão do fim do mês: saldo de hoje + o que ainda está previsto até o fim do mês
   (receitas − despesas previstas, inclusive atrasadas) − compras no cartão cujo ciclo fecha até o fim do mês.
   faturas fechadas e ainda não pagas (o saldo só desconta fatura paga) entram pelo que falta pagar, se vencem até o fim do mês. */
function previsaoMes(){
  const h=new Date(),hj=hojeISO(),fim=isoDe(new Date(h.getFullYear(),h.getMonth()+1,0));
  let rec=0,des=0,cart=0;
  S.tx.forEach(t=>{
    if(t.status==='previsto'&&t.data<=fim){if(t.tipo==='receita')rec+=cents(t.valor);else if(t.tipo==='despesa'&&!t.cartao)des+=cents(t.valor);}
  });
  (S.cartoes||[]).forEach(c=>S.tx.forEach(t=>{
    if(t.cartao!==c.id||!(t.tipo==='despesa'||t.tipo==='transf')||!t.data||!efetivo(t))return;
    /* v10.52: compra entra na previsão no mês em que a fatura VENCE, não em que fecha */
    const f=fechamentoDe(c,t.data);if(f.fecha>hj&&f.vence>hj&&f.vence<=fim)cart+=cents(t.valor); // v10.56: ciclo já fechado entra só pela fatura (antes contava duas vezes)
  }));
  cart+=faturasAPagar('0000-01-01',fim); // v10.45: fatura fechada a pagar (inclusive vencida)
  const hoje=cents(saldoTotal());
  const emp=empPrevistos(fim).reduce((a,x)=>a+cents(x.valor),0); // v10.78: devolução combinada até o fim do mês
  return {hoje:hoje/100,rec:rec/100,des:des/100,cart:cart/100,emp:emp/100,fim:(hoje+rec+emp-des-cart)/100,tem:!!(rec||des||cart||emp)};
}
ICONS.inbox='<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z"/>';
if(!ICONS.check)ICONS.check='<path d="m5 12.5 4.5 4.5L19 7.5"/>';
ICONS.eye='<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>';
ICONS.eyeOff='<path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.6 3.3M6.6 7.6C4 9.3 2.5 12 2.5 12S6 18 12 18c1.9 0 3.5-.6 4.9-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18"/>';

/* ---------- v10.35: novo topo da página inicial (cartão vibrante) ---------- */

/* v10.67: barras semanais de entrou e saiu (8 semanas, segunda a domingo). mesma regra do saldo:
   compra no cartão não conta no dia, só o pagamento da fatura; transferências ficam de fora */
function semanasDados(n){
  const hj=new Date(),h0=new Date(hj.getFullYear(),hj.getMonth(),hj.getDate()),dow=(h0.getDay()+6)%7;
  const seg=new Date(h0.getFullYear(),h0.getMonth(),h0.getDate()-dow-(n-1)*7);
  const W=[];for(let i=0;i<n;i++){const a=new Date(seg.getFullYear(),seg.getMonth(),seg.getDate()+i*7),b=new Date(a.getFullYear(),a.getMonth(),a.getDate()+6);W.push({ini:isoDe(a),fim:isoDe(b),e:0,s:0});}
  const iniI=W[0].ini,hjI=hojeISO();
  S.tx.forEach(t=>{if(!t.data||t.data<iniI||t.data>hjI||t.tipo==='transf'||!efetivo(t)||empPerdao(t))return;
    const w=W.find(x=>t.data>=x.ini&&t.data<=x.fim);if(!w)return;
    if(t.tipo==='receita')w.e+=cents(t.valor);else if(t.tipo==='despesa'&&!t.cartao)w.s+=cents(t.valor);});
  return W;
}
function semanasHTML(){
  const W=semanasDados(8),mx=Math.max(1,...W.map(w=>Math.max(w.e,w.s)));
  if(!W.some(w=>w.e||w.s))return '<div class="hB-sem vazio0"><span>sem movimento nas últimas 8 semanas</span></div>';
  const H=52,bw=7,gap=3,gw=bw*2+gap,step=300/8,hh=v=>v?Math.max(3,Math.round(v/mx*(H-4))):2;
  const bars=W.map((w,i)=>{const x=i*step+(step-gw)/2,he=hh(w.e),hs=hh(w.s),cur=i===W.length-1;
    return `<g class="sg${cur?' cur':''}" data-act="hm-sem" data-id="${i}" role="button" tabindex="0" aria-label="semana de ${fmtDataCurta(w.ini)}: entrou ${brl(w.e/100)}, saiu ${brl(w.s/100)}"><rect x="${(i*step).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}" fill="transparent"/><rect class="be" x="${x.toFixed(1)}" y="${H-he}" width="${bw}" height="${he}" rx="2.5"/><rect class="bs" x="${(x+bw+gap).toFixed(1)}" y="${H-hs}" width="${bw}" height="${hs}" rx="2.5"/></g>`;}).join('');
  return `<div class="hB-sem"><svg viewBox="0 0 300 ${H}" role="group" aria-label="entrou e saiu nas últimas 8 semanas">${bars}</svg><div class="hB-semL" id="hbSemL">${semLegenda(W,W.length-1)}</div></div>`;
}
function semLegenda(W,i){const w=W[i];const f=d=>d.slice(8,10)+'/'+d.slice(5,7);
  return `<span>${i===W.length-1?'esta semana':f(w.ini)+' a '+f(w.fim)}</span><span><i class="hB-dot g"></i>${OCULTO?'•••':brl(w.e/100)}</span><span><i class="hB-dot r"></i>${OCULTO?'•••':brl(w.s/100)}</span>`;}
/* v10.67: primeiros passos para conta nova */
/* v10.122: primeiro uso com cara de boas-vindas: anel de progresso, passos numerados e o próximo passo em destaque.
   Conta vazia (nada feito) mostra o card no topo, antes do saldo zerado. */
function ppEstado(){
  if(S.cfg.onbOk)return null;
  const m=mesAtual(),P=[
    ['bank','Adicione sua conta','o banco onde seu dinheiro fica','novo-banco',(S.bancos||[]).length>0],
    ['plus','Registre um gasto ou receita',MVP_MODE?'por frase, foto do recibo ou WhatsApp':'ou conecte o banco e importe sozinho','q-gasto',S.tx.length>0],
    ['receipt','Cadastre uma conta fixa','aluguel, internet, salário','nova-fixa',(S.fixas||[]).length>0],
    ['gauge','Defina um orçamento','um limite por categoria no mês','hm-go-orc',Object.values(limOrc(m)).some(v=>v>0)]];
  const ok=P.filter(p=>p[4]).length;if(ok===P.length||S.tx.length>=30)return null;
  return {P,ok};
}
function primeirosPassosHTML(topo){
  const E=ppEstado();if(!E)return '';const {P,ok}=E,n=P.length;
  if(!!topo!==(ok===0))return '';
  const R=22,C=2*Math.PI*R,prox=P.findIndex(p=>!p[4]);
  const tit=ok===0?'Vamos deixar seu GranaViva pronto':ok===n-1?'Só falta um passo':'Falta pouco';
  const sub=ok===0?'4 passos rápidos, uns 2 minutos':`${ok} de ${n} feitos`;
  return `<div class="card pp-card${ok===0?' pp-novo':''}"><div class="pp-h">
      <div class="pp-ring" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="${R}" class="pp-rt"/><circle cx="26" cy="26" r="${R}" class="pp-rv" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C*(1-ok/n)).toFixed(1)}"/></svg><b>${ok}/${n}</b></div>
      <div class="pp-ht"><h4>${tit}</h4><small>${sub}</small></div>
      <button class="x" data-act="pp-ok" aria-label="dispensar">${I('close')}</button></div>
    <div class="pp-l">${P.map(([ic,t,d,act,f],i)=>{const nx=i===prox;
      return `<button class="pp-i${f?' ok':''}${nx?' nx':''}" ${f?'disabled':`data-act="${act}"`} aria-label="${f?'feito: ':''}${t}"><span class="pp-ic">${f?I('check'):I(ic)}</span><span class="pp-t"><b>${t}</b><small>${d}</small></span>${f?'':nx?'<span class="pp-go">começar</span>':I('chevR','pp-ch')}</button>`;}).join('')}</div></div>`;
}
/* v10.67: estado vazio com ícone, título, texto e ação */
function vazioHTML(ic,tit,txt,acts){return `<div class="card vz"><span class="vz-ic">${I(ic)}</span><b>${tit}</b><p>${txt}</p>${acts?`<div class="vz-a">${acts}</div>`:''}</div>`;}
function homeVar(){return 'b';}
function serieSaldo(dias){
  const hj=new Date();const ini=new Date(hj.getFullYear(),hj.getMonth(),hj.getDate()-dias+1);const iniISO=isoDe(ini);
  let base=0;const delta={};
  S.tx.forEach(t=>{if(!efetivo(t)||!t.data||t.tipo==='transf'||empPerdao(t))return;const v=t.tipo==='receita'?cents(t.valor):(t.cartao?0:-cents(t.valor));if(!v)return;
    if(t.data<iniISO)base+=v;else delta[t.data]=(delta[t.data]||0)+v;});
  const out=[];for(let i=0;i<dias;i++){const d=isoDe(new Date(ini.getFullYear(),ini.getMonth(),ini.getDate()+i));if(d>hojeISO())break;base+=delta[d]||0;out.push(base/100);}
  if(out.length){const off=saldoTotal()-out[out.length-1];if(Math.abs(off)>=0.01)return out.map(v=>Math.round((v+off)*100)/100);}
  return out;
}
function sparkSVG(vals,w,h,id){
  if(vals.length<2)vals=[vals[0]||0,vals[0]||0];
  const mn=Math.min(...vals),mx=Math.max(...vals),rg=(mx-mn)||1,pad=6;
  const pts=vals.map((v,i)=>[i/(vals.length-1)*(w-10),pad+(1-(v-mn)/rg)*(h-pad*2)]);
  let d='M'+pts[0][0].toFixed(1)+' '+pts[0][1].toFixed(1);
  for(let i=1;i<pts.length;i++){const [x0,y0]=pts[i-1],[x1,y1]=pts[i],cx=(x0+x1)/2;d+=` C${cx.toFixed(1)} ${y0.toFixed(1)} ${cx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;}
  const L=pts[pts.length-1];
  return `<svg class="spk" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".35"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient><linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--sk1)"/><stop offset="1" stop-color="var(--sk2)"/></linearGradient></defs><path d="${d} L${w} ${h} L0 ${h} Z" fill="url(#${id}f)"/><path d="${d}" fill="none" stroke="url(#${id}l)" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="${L[0]}" cy="${L[1]}" r="4" class="spkDot"/></svg>`;
}
function brlParts(v){const t=brl(v);const m=t.match(/^(-?)R\$\s?(.*?)(,\d\d)$/);return m?{s:m[1],i:m[2],d:m[3]}:{s:'',i:t.replace('R$',''),d:''};}
const HM_AT=[['lanc','receipt','Despesas','#f472b6','Gastos'],['orc','gauge','Orçamentos','#fbbf24','Orçamento'],['cartoes','card','Cartões','#60a5fa','Cartões'],['rel','report','Relatório','#a78bfa','Relatório'],['plan','compass','Planejamento','#34d399','Planejar'],['pat','scale','Patrimônio','#22d3ee','Patrimônio']];
const PER_CURTO={mes:'Este mês',ant:'Mês passado','3m':'3 meses','6m':'6 meses','12m':'12 meses',custom:'Personalizado'};
function homeTopo(v,o){
  const {saldo,rec,des,sal,pou,dDes,desAnt,dia,pl,per}=o;
  const ser=serieSaldo(30),var30=ser.length>1?ser[ser.length-1]-ser[0]:0;
  const bp=brlParts(saldo);
  const mesAnt=MESES[+mesOff(per&&per.auto?2:1).slice(5,7)-1]; // v10.89: mês anterior automático compara com o mês antes dele
  const gastoPct=rec>0?Math.round(des/rec*100):null;
  const eye=`<button class="olhoBtn" data-act="oculta" aria-label="${OCULTO?'mostrar valores':'ocultar valores'}">${I(OCULTO?'eyeOff':'eye')}</button>`;
  const chips=`<div class="hPer" role="tablist">${PER_OPS.map(([k])=>`<button class="hPerC${PER.k===k?' on':''}" data-act="hm-per" data-id="${k}" role="tab" aria-selected="${PER.k===k}">${PER_CURTO[k]}</button>`).join('')}</div>${PER.k==='custom'?`<div class="perBar hPerCustom"><input type="date" data-per="ini" value="${esc(PER.ini||per.ini)}" aria-label="de"><input type="date" data-per="fim" value="${esc(PER.fim||per.fim)}" aria-label="até"></div>`:''}`;
  const pc=pou===null?0:Math.max(0,Math.min(100,pou));
  const R=34,C=2*Math.PI*R;
  // variante B: cartão vibrante
  return `
  ${primeirosPassosHTML(true)}
  <div class="hB-hero${saldo<0?' hNeg':''}">
    <div class="hB-blob b1"></div><div class="hB-blob b2"></div><div class="hB-noise"></div>
    <div class="hB-top">${saldo<0?'<span class="hB-brand hB-brandNeg"><i class="hB-led"></i>Saldo negativo</span>':`<span class="hB-brand">${I('wallet')}Saldo total</span>`}${eye}</div>
    <div class="hB-tap tap" data-act="nav-contas" role="button" tabindex="0" aria-label="ver suas contas"><div class="hB-saldo nw fit${bp.s?' hB-saldoNeg':''}" aria-label="${OCULTO?'saldo oculto':(bp.s?'saldo negativo de ':'saldo de ')+brl(Math.abs(saldo))}"><span class="hB-cur">R$</span><span class="hB-num">${OCULTO?'•••••':bp.i+bp.d}</span></div>
    <div class="hB-sub">${Math.abs(var30)<0.005?'<span class="hB-var">sem variação</span> nos últimos 30 dias':`<span class="hB-var ${var30>=0?'up':'dn'}">${I(var30>=0?'up':'down')}${var30>=0?'subiu':'caiu'} ${OCULTO?'•••':brl(Math.abs(var30))}</span> nos últimos 30 dias`}</div>
    ${I('chevR','hB-tapCh')}</div>
    ${(()=>{const r=mtReservado();return r>0?`<button type="button" class="hB-mt" data-act="hm-go" data-id="metas" aria-label="${OCULTO?'valor oculto':brl(r)} reservado em metas, abrir metas">${I('piggy')}<span><b class="nw">${brl(r)}</b> reservado em metas</span>${I('chevR')}</button>`:'';})()}
    ${semanasHTML()}
    <div class="hB-strip">
      <div class="tap" data-act="nav-rec" role="button" tabindex="0" aria-label="ver receitas · ${esc(pl)}"><small><i class="hB-dot g"></i>Entrou</small><b class="nw fit">${brl(rec)}</b></div>
      <div class="tap" data-act="nav-des" role="button" tabindex="0" aria-label="ver despesas · ${esc(pl)}"><small><i class="hB-dot r"></i>Saiu</small><b class="nw fit">${brl(des)}</b></div>
      <div class="tap" data-act="nav-tudo" role="button" tabindex="0" aria-label="ver todos os lançamentos · ${esc(pl)}"><small><i class="hB-dot ${sal<0?'r':'w'}"></i>${sal<0?'Faltou':'Sobrou'}</small><b class="nw fit${sal<0?' hB-red':''}">${brl(Math.abs(sal))}</b></div>
    </div>
  </div>
  <div class="hB-at" role="navigation" aria-label="atalhos">${HM_AT.map(([t,ic,l,c,cu])=>`<button class="hB-a" data-act="hm-go" data-id="${t}" style="--c:${c}" aria-label="${l}"><span class="hB-ai">${I(ic)}</span><span class="hB-al">${t==='plan'||t==='orc'?cu:l}</span>${I('chevR','hB-ch')}</button>`).join('')}</div>
  <button class="hB-ask" data-act="assist">${I('chat','hB-askI')}<span><b>Pergunte sobre seu dinheiro</b><small>quanto gastei, maior categoria, parcelas, metas</small></span>${I('chevR','hB-ch')}</button>
  ${primeirosPassosHTML()}${blocosInicioHTML()}${alertasHTML()}${alertaVermelhoHTML()}
  ${chips}${mesAntHTML(per)}
  <div class="hB-res">
    <div class="hB-rh"><h4>Resumo · ${pl}</h4></div>
    <div class="hB-row tap" data-act="nav-rel" role="button" tabindex="0" aria-label="ver relatório do mês"><div class="hB-rl"><span class="hB-ri g">${I('piggy')}</span><div><b>Você guardou</b><small>${pou===null?'sem receitas no período':(sal<0?'gastou mais do que entrou':'da renda do período')}</small></div></div><b class="hB-rv ${sal<0?'neg':'pos'}">${pou===null?'—':(OCULTO?'••%':pou+'%')}</b></div>
    <div class="hB-bar"><i class="g" style="width:${pc}%"></i><span style="left:20%"></span></div>
    <p class="hB-tip">${pou===null?'':pou>=20?'acima da meta de 20% recomendada':'meta recomendada: guardar 20% da renda'}</p>
    <div class="hB-row tap" data-act="nav-des" role="button" tabindex="0" aria-label="ver despesas · ${esc(pl)}"><div class="hB-rl"><span class="hB-ri r">${I('arrowDown')}</span><div><b>Gastos vs ${MESES_LONGO[MESES.indexOf(mesAnt)]||mesAnt}</b><small>${per&&per.auto?'mês inteiro':'até o dia '+dia} · ${brlK(desAnt)} → ${brlK(des)}</small></div></div><b class="hB-rv ${dDes>0?'neg':'pos'}">${dDes===null?'—':(dDes>0?'+':dDes<0?'−':'')+Math.abs(dDes)+'%'}</b></div>
    <div class="hB-bar two"><i class="m" style="width:${Math.round(desAnt/Math.max(des,desAnt,1)*100)}%"></i><i class="r" style="width:${Math.round(des/Math.max(des,desAnt,1)*100)}%"></i></div>
  </div>`;
}
function mesAntHTML(per){
  if(!per||!per.auto)return '';const h=new Date(),at=MESES_LONGO[h.getMonth()],an=MESES_LONGO[new Date(h.getFullYear(),h.getMonth()-1,1).getMonth()];
  return `<div class="card mesAnt" role="status">${I('calendar')}<span><b>Mostrando ${an}, o mês anterior.</b><small>${at.charAt(0).toUpperCase()+at.slice(1)} começou há pouco. Até o dia 3 a Início mostra o mês fechado.</small></span><button type="button" class="btn2 sm" data-act="per-atual">ver ${at}</button></div>`;
}
function viewInicio(){
  const per=periodo(),pl=per.label,ehMes=PER.k==='mes'&&!per.auto;
  const saldo=saldoTotal(),rec=somaMes(per,'receita'),des=somaMes(per,'despesa'),sal=(cents(rec)-cents(des))/100;
  const sl=despesasPorCat(per),tot=sl.reduce((a,s)=>a+s.v,0);
  const p=proximoPag(),pv=previsaoMes();
  const hoje=new Date(),dia=hoje.getDate();
  /* comparação justa no mês corrente: até o mesmo dia do mês anterior */
  const desAnt=ehMes?despAte(mesOff(1),dia):per.auto?somaMes(mesOff(2),'despesa'):0;
  const dDes=(ehMes||per.auto)&&desAnt?Math.round((des-desAnt)/desAnt*100):null;
  const pou=rec>0?Math.round(sal/rec*100):null;
  const mxF=Math.max(rec,des,1);
  const tile=(cls,ic,lb,val,sub)=>`<div class="rsT ${cls}"><span class="rsL">${I(ic)}${lb}</span><b class="nw">${val}</b>${sub}</div>`;
  const nome=nomeUsuario();
  const dataLonga=hoje.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
  /* últimos lançamentos */
  const ult=S.tx.filter(t=>t.data&&t.data<=hojeISO()&&(t.tipo==='receita'||t.tipo==='despesa')).sort((a,b)=>b.data<a.data?-1:b.data>a.data?1:0).slice(0,5);
  const ultHTML=ult.length?`<div class="card hmUlt"><div class="hmH"><h4>últimos lançamentos</h4><button class="hmLink" data-act="ir-lanc">ver todos${I('chevR')}</button></div>${ult.map(t=>{const r=t.tipo==='receita';const cc=r?'#4ade80':corCat(t.categoria);return `<div class="rmRow tap" data-act="tx-menu" data-id="${t.id}" role="button" tabindex="0" aria-label="abrir lançamento"><span class="rmI" style="--cc:${cc}">${I(catIcon(t.categoria))}</span><div class="rmT"><b>${esc(nomeTx(t).n||t.categoria||(r?'receita':'despesa'))}</b><small>${esc(t.categoria||'')} · ${t.data.slice(8,10)}/${t.data.slice(5,7)}${t.status&&t.status!=='pago'?' · '+esc(t.status):''}</small></div><span class="rmV nw ${r?'pos':''}">${r?'+':'−'} ${brl(t.valor)}</span></div>`;}).join('')}</div>`:'';
  /* categorias */
  const catHTML=`<div class="card hmCat"><div class="hmH"><h4>para onde foi o dinheiro</h4><span class="hmSub">${pl}</span></div>
    ${sl.length?`<div class="donutWrap"><canvas id="cDonut"></canvas></div><div class="topCats1">${sl.slice(0,6).map(s=>`<div class="tcRow tap" data-act="nav-cat" data-id="${esc(s.l)}" role="button" tabindex="0" aria-label="ver despesas de ${esc(s.l)}"><div class="tcTop"><span class="tcN"><i class="dot" style="background:${s.color}"></i><span>${esc(s.l)}</span></span><span class="tcV">${brl(s.v)}${I('chevR','tapCh')}</span></div><div class="tcBar"><i style="width:${(s.v/(sl[0].v||1)*100).toFixed(1)}%;background:${s.color}"></i></div><span class="tcP">${tot?Math.round(s.v/tot*100):0}% das despesas</span></div>`).join('')}${sl.length>6?`<button class="hmLink hmMais" data-act="ir-rel">mais ${sl.length-6} ${sl.length-6>1?'categorias':'categoria'} no relatório${I('chevR')}</button>`:''}</div>`:'<p class="vazio">sem despesas neste período.</p>'}
  </div>`;
  /* previsão */
  const prevHTML=pv.tem?`<div class="card hmPrev tap" data-act="prev-abre" role="button" tabindex="0" aria-label="ver o que entra na previsão"><div class="hmH"><h4>previsão para o fim do mês</h4>${I('chevR','tapCh')}</div>
    <div class="hmPrevV ${pv.fim<0?'neg':'pos'} nw">${brl(pv.fim)}</div>
    <div class="hmPrevL"><span><small>hoje</small><b class="nw">${brl(pv.hoje)}</b></span>${pv.rec?`<span><small>a receber</small><b class="nw pos">+ ${brl(pv.rec)}</b></span>`:''}${pv.emp?`<span><small>empréstimos</small><b class="nw pos">+ ${brl(pv.emp)}</b></span>`:''}${pv.des?`<span><small>a pagar</small><b class="nw neg">− ${brl(pv.des)}</b></span>`:''}${pv.cart?`<span><small>cartão</small><b class="nw neg">− ${brl(pv.cart)}</b></span>`:''}</div>
    ${(()=>{const L=receitasAtrasadas();return L.length?`<button type="button" class="hmTrab" data-act="trab-lote">${I('calendar')}<span>${L.length===1?'1 receita atrasada':L.length+' receitas atrasadas'} · ainda não recebeu? informe quando cai</span>${I('chevR')}</button>`:'';})()}
    <p class="hmNota">estimativa com o que já está lançado como previsto.</p></div>`:'';
  /* carteira só aparece se houver investimentos */
  const patr=patrimonio(),dm=divMensal();
  /* v10.157: card da carteira redesenhado (rótulos curtos, variação do dia, resultado, próximo provento com valor e prazo; toque abre a Carteira) */
  const cartHTML=(patr||dm||p)?carteiraInicioHTML(patr,dm,p):'';
  const HV=homeVar();
  const TOPO=HV?homeTopo(HV,{saldo,rec,des,sal,pou,dDes,desAnt,dia,pl,per}):null;
  const avisoMesAnt=mesAntHTML(per);
  return `
  <div class="hmHead"><h1>${saudHora()}${nome?', <span>'+esc(nome)+'</span>':''}</h1></div>
  ${omniHTML()}
  ${TOPO!==null?TOPO+'<!--':''}<div class="hmHero ${saldo<0?'neg':''}">
    <div class="hmHeroTop"><span>saldo total</span><button class="olhoBtn" data-act="oculta" aria-label="${OCULTO?'mostrar valores':'ocultar valores'}">${I(OCULTO?'eyeOff':'eye')}</button></div>
    <div class="hmSaldo nw">${brl(saldo)}</div>
    <p class="hmHeroSub">${saldo<0?'você está no negativo. ':''}receitas menos despesas pagas, desde o começo</p>
  </div>
  <div class="atalhos" role="navigation" aria-label="atalhos">${[['ir-lanc','receipt','Despesas','#f472b6'],['ir-orc','gauge','Orçamentos','#fbbf24'],['ir-cartoes','card','Cartões','#60a5fa'],['ir-rel','report','Relatório','#a78bfa'],['ir-plan','compass','Planejamento','#34d399'],['ir-pat','scale','Patrimônio','#22d3ee']].map(([a,ic,l,c])=>`<button class="atalho" data-act="${a}" style="--c:${c}"><span class="atIc">${I(ic)}</span><span class="atLb">${l}</span></button>`).join('')}</div>
  ${blocosInicioHTML()}${alertasHTML()}${alertaVermelhoHTML()}
  ${avisoMesAnt}<div class="perBar"><span class="perLbl">${I('calendar')}Período</span><label class="perSel"><select data-per="k" aria-label="período">${PER_OPS.map(([k,l])=>`<option value="${k}" ${PER.k===k?'selected':''}>${l}</option>`).join('')}</select>${I('chevD')}</label>
    ${PER.k==='custom'?`<input type="date" data-per="ini" value="${esc(PER.ini||per.ini)}" aria-label="de"><input type="date" data-per="fim" value="${esc(PER.fim||per.fim)}" aria-label="até">`:''}</div>
  <div class="relRes hmRes">
    ${tile('rec','arrowUp','receitas',brl(rec),'<span class="rsD">entradas pagas</span>')}
    ${tile('des','arrowDown','despesas',brl(des),dDes===null?'<span class="rsD">saídas pagas</span>':`<span class="rsD ${dDes>0?'neg':'pos'}">${dDes>0?'▲':dDes<0?'▼':'='} ${Math.abs(dDes)}% vs ${MESES[+mesOff(1).slice(5,7)-1]} até dia ${dia}</span>`)}
    ${tile('sal '+(sal<0?'neg':''),'wallet','saldo do período',brl(sal),`<span class="rsD">${sal<0?'gastou mais do que entrou':'sobrou no período'}</span>`)}
    ${tile('pou','piggy','você guardou',pou===null?'—':(OCULTO?'••%':pou+'%'),`<span class="rsD">${pou===null?'sem receitas no período':'da renda do período'}</span>`)}
  </div>${TOPO!==null?'-->':''}
  <div class="hmDuo">${prevHTML}
  <div class="card hmSpark tap" data-act="nav-des" role="button" tabindex="0" aria-label="ver despesas · ${esc(pl)}"><div class="hmH"><h4>gastos acumulados</h4><span class="hmSub">${pl}${I('chevR','tapCh')}</span></div><div class="hmSparkV nw">${brl(des)}</div><div class="relative mt-3 h-[120px]" id="cSpark">${gastoSVG(per)}</div></div></div>
  <div class="hmDuo">${catHTML}<div>${proxVencHTML()}${assinHTML()}${orcInicioHTML()}${ultHTML}</div></div>
  <div class="card tap" data-act="nav-rel" role="button" tabindex="0" aria-label="abrir relatório">
    <h4 class="hmH0">Receitas x despesas ${per.meses>=3?'· '+pl:'· últimos 6 meses'}${I('chevR','tapCh')}</h4>
    <canvas id="cBar" class="cv"></canvas>
    <div class="legend"><span><i class="dot" style="background:${COR_REC()}"></i>receitas</span><span><i class="dot" style="background:${COR_DES()}"></i>despesas</span></div>
  </div>
  ${cartHTML}
  ${dicaInstalarHTML(false)}`;
}
function proximosVenc(dias){const h=new Date();return vencEntre(hojeISO(),isoDe(new Date(h.getFullYear(),h.getMonth(),h.getDate()+dias)),true);}
/* v10.79: o que vence entre ini e ate (atrasados=true também traz as previstas de antes de ini). a função alertas-push repete esta regra no resumo semanal */
function vencEntre(ini,ate,atrasados){
  const hj=ini,out=[],vistos=new Set();
  S.tx.forEach(t=>{
    if(t.status!=='previsto'||t.tipo!=='despesa'||t.cartao||!t.data||t.data>ate||(!atrasados&&t.data<ini))return;
    if(t.fixaKey)vistos.add(t.fixaKey);
    out.push({data:t.data,nome:t.descricao||t.categoria||'conta',valor:+t.valor||0,cat:t.categoria,tipo:t.fixaKey?'fixa':'conta',tx:t.id});
  });
  (S.fixas||[]).forEach(f=>{if(f.tipo==='receita')return;
    ocorrenciasFixa(f,hj,ate).forEach(o=>{if(vistos.has(o.key)||S.tx.some(t=>t.fixaKey===o.key))return;out.push({data:o.data,nome:f.nome,valor:+f.valor||0,cat:f.categoria,tipo:'fixa',fx:f.id});});});
  S.tx.forEach(t=>{if(!t.faturaKey)return;const r=restanteFatura(t),v=venceFatura(t);if(r>0.009&&v<=ate&&(atrasados||v>=ini))out.push({data:v,nome:t.descricao||'fatura',valor:r,cat:null,tipo:'fatura',fat:t.id});});
  // v10.72: mesma conta (nome, valor e data) só uma vez; a conta fixa ganha da prevista avulsa
  const un={};out.forEach(x=>{if(x.tipo!=='fatura')x.nome=String(x.nome).replace(/\s*\(fixa\)\s*$/i,'');const k=x.tipo==='fatura'?Math.random():nomeConta(x.nome)+'|'+x.data+'|'+Math.round(x.valor*100);if(!un[k]||(un[k].tipo!=='fixa'&&x.tipo==='fixa'))un[k]=x;});
  out.length=0;Object.values(un).forEach(x=>out.push(x));
  return out.sort((a,b)=>a.data<b.data?-1:a.data>b.data?1:0);
}
/* ---------- v10.79: resumo da semana ----------
   todo domingo às 9h (push da função alertas-push): o que entrou e saiu na semana que terminou (domingo a sábado),
   o que vence de domingo a sábado seguinte e o total a receber de empréstimos. a função repete estas mesmas contas. */
function domingoDe(iso){const x=new Date(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10));return addDias(iso,-x.getDay());}
function resumoSemana(R){
  R=DATA_OK.test(R||'')?domingoDe(R):domingoDe(hojeISO());
  const ini=addDias(R,-7),fim=addDias(R,-1),ate=addDias(R,6);let ent=0,sai=0,nE=0,nS=0;
  S.tx.forEach(t=>{if(!t.data||t.data<ini||t.data>fim||!efetivo(t))return;
    if(t.tipo==='receita'){ent+=cents(t.valor);nE++;}else if(t.tipo==='despesa'&&!t.faturaKey){sai+=cents(t.valor);nS++;}});
  const V=vencEntre(R,ate,false),P=(S.emprestimos||[]).map(e=>({e,t:empTot(e.id)})).filter(x=>x.t.aberto>0);
  return {R,ini,fim,ate,entrou:ent/100,saiu:sai/100,nE,nS,venc:V,vencTot:V.reduce((a,x)=>a+cents(x.valor),0)/100,receber:P.reduce((a,x)=>a+cents(x.t.aberto),0)/100,pessoas:P.length};
}
function fmtFaixa(a,b){const ma=+a.slice(5,7),mb=+b.slice(5,7);return ma===mb?`${+a.slice(8,10)} a ${+b.slice(8,10)} de ${MESES_LONGO[mb-1]}`:`${+a.slice(8,10)} de ${MESES_LONGO[ma-1]} a ${+b.slice(8,10)} de ${MESES_LONGO[mb-1]}`;}
function abreSemana(R){
  const r=resumoSemana(R),box=$('#modal'),hj=hojeISO();
  const quando=d=>{const n=Math.round((new Date(d+'T12:00')-new Date(hj+'T12:00'))/864e5);return n<0?{t:'atrasada',c:'late'}:n===0?{t:'hoje',c:'now'}:n===1?{t:'amanhã',c:'now'}:{t:d.slice(8,10)+'/'+d.slice(5,7),c:n<=3?'soon':''};};
  const tile=(cls,ic,lb,val,sub,act,id)=>`<div class="rsT ${cls} tap" data-act="${act}" data-id="${id||''}" role="button" tabindex="0" aria-label="${esc(lb)}"><span class="rsL">${I(ic)}${lb}</span><b class="nw">${val}</b><span class="rsD">${sub}</span></div>`;
  const rows=r.venc.slice(0,12).map(x=>{const q=quando(x.data),ic=x.tipo==='fatura'?'card':x.cat?catIcon(x.cat):'receipt',cc=x.tipo==='fatura'?'#60a5fa':x.cat?corCat(x.cat):'#fbbf24';
    const ref=x.fat?`data-act="fat-abre" data-id="${esc(x.fat)}"`:x.tx?`data-act="tx-menu" data-id="${esc(x.tx)}"`:x.fx?`data-act="edit-fixa" data-id="${esc(x.fx)}"`:'';
    return `<div class="rmRow${ref?' tap':''}" ${ref}${ref?' role="button" tabindex="0"':''}><span class="rmI" style="--cc:${cc}">${I(ic)}</span><div class="rmT"><b>${esc(x.nome)}</b><small>${x.tipo==='fatura'?'fatura do cartão':x.tipo==='fixa'?'conta fixa':'conta prevista'}</small></div><div class="hvR"><span class="rmV nw">${brl(x.valor)}</span><span class="hvQ ${q.c}">${q.t}</span></div></div>`;}).join('');
  box.innerHTML=`<div class="sheet semSheet" role="dialog" aria-modal="true" aria-label="Resumo da semana"><div class="sh-head"><h3>Resumo da semana</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <p class="small semSub">semana de ${fmtFaixa(r.ini,r.fim)}</p>
    <div class="relRes semRes">
      ${tile('rec','arrowDown','entrou',brl(r.entrou),r.nE+(r.nE===1?' receita':' receitas'),'sem-rec',r.R)}
      ${tile('des','arrowUp','saiu',brl(r.saiu),r.nS+(r.nS===1?' gasto':' gastos'),'sem-des',r.R)}
      ${tile('sal'+(r.entrou-r.saiu<0?' neg':''),'scale','saldo da semana',brl(r.entrou-r.saiu),'entrou menos saiu','sem-tudo',r.R)}
      ${tile('pou','handCoins','a receber',brl(r.receber),r.pessoas?r.pessoas+(r.pessoas===1?' pessoa te deve':' pessoas te devem'):'ninguém te deve','emp-lista','')}
    </div>
    <div class="card semVenc"><div class="hmH tap" data-act="nav-aberto" role="button" tabindex="0" aria-label="ver tudo que está em aberto"><h4>vence de ${fmtDataCurta(r.R)} a ${fmtDataCurta(r.ate)}</h4><span class="hmSub">${brl(r.vencTot)}${I('chevR','tapCh')}</span></div>
      ${rows||'<p class="small" style="margin:6px 0 2px">nada vence nesses 7 dias.</p>'}${r.venc.length>12?`<button type="button" class="hmLink hmMais" data-act="nav-aberto">+${r.venc.length-12} vencimentos${I('chevR')}</button>`:''}</div>
    <p class="small semRodape">${I('bell')}Chega todo domingo às 9h. Ligue ou desligue em Ajustes, nas notificações.</p>
  </div>`;
  box.classList.add('on');
}
/* ---------- v10.79: orçamento passou de 80% ou de 100% ----------
   um aviso por limite, por categoria, por mês (S.cfg.orcAv sincroniza entre aparelhos); o sino continua mostrando o alerta.
   o push vem da função alertas-push, que guarda o "já avisado" em push_log. mesma conta da aba Orçamentos. */
let ORC_V=false,ORC_T=null;
function orcNiveis(m){const LO=limOrc(m),out={};S.cats.forEach(c=>{const lim=LO[c];if(!(lim>0))return;const g=somaMes(m,'despesa',c,true),p=g/lim*100;out[c]={g,lim,p,nv:p>=100?100:p>=80?80:0};});return out;}
function orcVigia(){
  if(!S||!S.cfg||ORC_V)return null;const m=mesAtual(),N=orcNiveis(m),av=Object.assign({},S.cfg.orcAv||{});let msg='',mud=false;
  Object.keys(N).forEach(c=>{const x=N[c],k=c+'|'+m;if(x.nv>(+av[k]||0)){av[k]=x.nv;mud=true;if(!msg)msg='Orçamento de '+c+(x.nv>=100?' estourou: ':' passou de 80%: ')+brl(x.g)+' de '+brl(x.lim);}});
  if(!mud)return null;
  const lim=mesAdd(m,-2);Object.keys(av).forEach(k=>{if(k.slice(-7)<lim)delete av[k];});
  S.cfg.orcAv=av;ORC_V=true;try{salvar();}finally{ORC_V=false;}
  if(msg&&notifOn('orc')){clearTimeout(ORC_T);ORC_T=setTimeout(()=>{toast(msg);try{atualizaSino();}catch(e){}},2600);}
  return msg;
}
/* ---------- v10.159: renda passiva no topo do patrimônio ----------
   quanto a carteira gera por mês em proventos, com o que o app já sabe de cada ativo (FII, ação, ETF, BDR com cotas):
   1) FII com dividendo por cota cadastrado (f.dpc, o mesmo da "renda mensal"): cotas × dpc;
   2) senão, proventos registrados nos últimos 12 meses (mesma conta do yield on cost), ÷ 12;
   3) senão, só para FII com preço: estimativa de DY_FII_PADRAO (0,8% ao mês) sobre o valor de hoje, marcada como estimativa.
   ação/ETF/BDR sem provento registrado fica de fora. renda fixa e cripto não entram (não pagam dividendos).
   a equivalência usa as contas fixas de despesa mensais ativas: a maior que a renda cobre inteira;
   se não cobre nenhuma, quanto falta para cobrir a menor. */
const DY_FII_PADRAO=0.008;
function rendaPassivaEst(){
  const yc=yocCalc(),porId={};yc.lista.forEach(x=>{porId[x.f.id]=x;});
  let tot=0,est=0,n=0;
  (S.fiis||[]).forEach(f=>{const t=tipoOf(f);if(!RP_TIPOS.includes(t)||!(f.cotas>0))return;const y=porId[f.id];
    if(t==='fii'&&f.dpc>0){tot+=cents(f.cotas*f.dpc);n++;}
    else if(y&&y.renda>0){tot+=cents(y.renda/12);n++;}
    else if(t==='fii'&&f.preco>0){const v=cents(f.cotas*f.preco*DY_FII_PADRAO);tot+=v;est+=v;n++;}});
  return {v:tot/100,est:est/100,n};
}
function fixasMensaisDespesa(){
  const hj=hojeISO();
  return (S.fixas||[]).filter(f=>f&&f.tipo==='despesa'&&(f.freq||'mensal')==='mensal'&&+f.valor>0&&(!f.fim||f.fim>=hj)&&(!f.inicio||f.inicio<=hj))
    .map(f=>({nome:String(f.nome||f.categoria||'conta fixa').replace(/\s*\(fixa\)\s*$/i,'').trim()||'conta fixa',valor:+f.valor}));
}
function rendaPassivaHTML(cls){
  if(!(patrimonio()>0))return '';
  const R=rendaPassivaEst();if(!(R.v>=0.01))return '';
  const L=fixasMensaisDespesa(),cob=L.filter(x=>x.valor<=R.v).sort((a,b)=>b.valor-a.valor)[0];
  const menor=cob?null:L.slice().sort((a,b)=>a.valor-b.valor)[0];
  const nota=R.est>0?`<em class="rpaEst" title="FIIs sem dividendo cadastrado nem provento registrado entram com ${num(DY_FII_PADRAO*100)}% ao mês sobre o valor de hoje">estimativa</em>`:'';
  let eq='';
  if(cob)eq=`<p class="rpaEq">${I('check')}<span>cobre sua conta de <b>${esc(cob.nome)}</b> <span class="nw">(${brl(cob.valor)})</span></span></p>`;
  else if(menor){const pc=Math.max(2,Math.min(100,R.v/menor.valor*100));
    eq=`<p class="rpaEq">${I('flag')}<span>falta <b class="nw">${brl(menor.valor-R.v)}</b>/mês para cobrir sua conta de <b>${esc(menor.nome)}</b> <span class="nw">(${brl(menor.valor)})</span></span></p><span class="rpaBar" aria-hidden="true"><i style="width:${pc.toFixed(1)}%"></i></span>`;}
  return `<div class="rpa ${cls||''}" role="note"><p class="rpaT">${I('chart')}<span>Seu patrimônio gera aprox. <b class="nw pos">${brl(R.v)}/mês</b> em dividendos</span>${nota}</p>${eq}</div>`;
}
function carteiraInicioHTML(patr,dm,p){
  const hj=hojeISO(),ativos=S.fiis.filter(f=>f.cotas*f.preco>0).length;
  /* variação do dia: só ativos com fechamento anterior conhecido (f.ant, gravado na atualização de cotações) */
  let vd=0,base=0;S.fiis.forEach(f=>{if(f.ant>0&&f.preco>0&&f.cotas>0){vd+=f.cotas*(f.preco-f.ant);base+=f.cotas*f.ant;}});
  const vdP=base>0?vd/base*100:null;
  /* resultado: mesma conta da aba Carteira (só ativos com custo informado) */
  const cc=S.fiis.filter(f=>f.pago>0),aplic=cc.reduce((a,f)=>a+cents(f.pago),0)/100,val=cc.reduce((a,f)=>a+cents(f.cotas*f.preco),0)/100,pl=c2(val-aplic),plP=aplic?pl/aplic*100:null;
  const sg=v=>v>=0?'+':'−',pc=v=>num(Math.abs(v))+'%';
  const vdTxt=vdP!=null&&Math.abs(vd)>=0.005?`<span class="hcDia ${vd>=0?'pos':'neg'}" title="variação de hoje">${I(vd>=0?'arrowUp':'arrowDown')}${sg(vd)}${brl(Math.abs(vd))} <em>${pc(vdP)}</em></span>`:'';
  let prox='';
  if(p){const dias=Math.round((new Date(p.date.getFullYear(),p.date.getMonth(),p.date.getDate())-new Date(hj+'T00:00'))/864e5);
    const est=tipoOf(p.f)==='fii'?c2((+p.f.cotas||0)*(+p.f.dpc||0)):0;
    const qd=dias<=0?'hoje':dias===1?'amanhã':'em '+dias+' dias';
    prox=`<div class="hcProx"><span class="hcIc">${I('calendar')}</span><div class="hcPt"><small>Próximo provento</small><b>${esc(p.f.ticker)}${est>0?' · <span class="pos nw">'+brl(est)+'</span>':''}</b></div><span class="hcQd">${pad(p.date.getDate())}/${pad(p.date.getMonth()+1)}<small>${qd}</small></span></div>`;}
  return `<div class="card hmCart hcCard tap" data-act="cart-abre" role="button" tabindex="0" aria-label="abrir a carteira de investimentos">
    <div class="hmH"><h4>carteira</h4><span class="hmSub">${ativos} ${ativos===1?'ativo':'ativos'}${I('chevR','tapCh')}</span></div>
    ${rendaPassivaHTML('rpaHm')}
    <div class="hcTop"><small>Investido</small><div class="hcLn"><b class="hcVal nw">${brl(patr)}</b>${vdTxt}</div></div>
    <div class="hcGrid">
      <div class="hcK"><small>Resultado</small><b class="nw ${plP==null?'':pl>=0?'pos':'neg'}">${plP==null?'—':sg(pl)+brl(Math.abs(pl))}</b>${plP==null?'<span>informe o custo</span>':`<span>${sg(pl)}${pc(plP)}</span>`}</div>
      <div class="hcK"><small>Proventos/mês</small><b class="nw pos">${brl(dm)}</b><span>${patr>0&&dm>0?num(dm*12/patr*100)+'% ao ano':'estimado'}</span></div>
    </div>${prox}</div>`;
}
function proxVencHTML(){
  const L=proximosVenc(30),hj=hojeISO(),tot=L.reduce((a,x)=>a+x.valor,0);
  /* v10.157: receita prevista que já devia ter entrado (hoje ou atrasada) aparece com "Recebi" */
  S.tx.forEach(t=>{if(t.status==='previsto'&&t.tipo==='receita'&&t.data&&t.data<=hj)L.push({data:t.data,nome:String(t.descricao||t.categoria||'receita').replace(/\s*\(fixa\)\s*$/i,''),valor:+t.valor||0,cat:t.categoria,tipo:t.fixaKey?'fixa':'conta',tx:t.id,rec:true});});
  if(!L.length)return '';L.sort((a,b)=>a.data<b.data?-1:a.data>b.data?1:0);
  const quando=d=>{const n=Math.round((new Date(d+'T12:00')-new Date(hj+'T12:00'))/864e5);return n<0?{t:'atrasada',c:'late'}:n===0?{t:'hoje',c:'now'}:n===1?{t:'amanhã',c:'now'}:n<=avisoDias()?{t:'em '+n+' dias',c:'soon'}:{t:d.slice(8,10)+'/'+d.slice(5,7),c:''};};
  return `<div class="card hmVenc"><div class="hmH tap" data-act="nav-aberto" role="button" tabindex="0" aria-label="ver tudo que está em aberto"><h4>próximos vencimentos</h4><span class="hmSub">30 dias · ${brl(tot)}${I('chevR','tapCh')}</span></div>
    ${L.slice(0,6).map(x=>{const q=quando(x.data),ic=x.tipo==='fatura'?'card':x.cat?catIcon(x.cat):'receipt',cc=x.tipo==='fatura'?'#60a5fa':x.cat?corCat(x.cat):'#fbbf24';
      const ref=x.fat?`data-act="fat-abre" data-id="${esc(x.fat)}"`:x.tx?`data-act="tx-menu" data-id="${esc(x.tx)}"`:x.fx?`data-act="edit-fixa" data-id="${esc(x.fx)}"`:'';
      /* v10.157: vence hoje ou atrasada = botão "Pagar" (receita: "Recebi") direto na linha */
      const pid=x.data<=hj?(x.fat?'fat:'+x.fat:x.tx?'tx:'+x.tx:x.fx?'fx:'+x.fx+':'+x.data:''):'',rec=x.rec;
      const pay=pid?`<button type="button" class="rmPay" data-act="vc-pagar" data-id="${esc(pid)}" aria-label="${rec?'marcar como recebido':'pagar'} ${esc(x.nome)}">${rec?'Recebi':'Pagar'}</button>`:'';
      return `<div class="rmRow${ref?' tap':''}${pay?' rmRowPay':''}" ${ref}${ref?' role="button" tabindex="0"':''}><span class="rmI" style="--cc:${cc}">${I(ic)}</span><div class="rmT"><b>${esc(x.nome)}</b><small>${x.rec?(x.tipo==='fixa'?'receita fixa':'receita prevista'):x.tipo==='fatura'?'fatura do cartão':x.tipo==='fixa'?'conta fixa':'conta prevista'}</small></div><div class="hvR"><span class="rmV nw${x.rec?' pos':''}">${x.rec?'+':''}${brl(x.valor)}</span><span class="hvQ ${q.c}">${x.rec&&q.c==='late'?'atrasada':q.t}</span></div>${pay}</div>`;}).join('')}
    ${L.length>6?`<button type="button" class="hmLink hmMais" data-act="nav-aberto">+${L.length-6} ${L.length-6>1?'vencimentos':'vencimento'} nos próximos 30 dias${I('chevR')}</button>`:''}
  </div>`;
}
/* ---------- v10.159: termômetro de ritmo dos orçamentos ----------
   compara quanto do limite já foi usado com quanto do mês já passou. o orçamento segue o mês do calendário
   (o app não tem início de ciclo próprio), então o ritmo é dia de hoje ÷ dias do mês.
   cor da barra no mês atual: normal até o ritmo + RITMO_MARGEM pontos; acima disso, âmbar; passou do limite, vermelho.
   meses passados e futuros: sem marcador e com a regra antiga (âmbar a partir de 80%). */
const RITMO_MARGEM=10;
function ritmoMes(m){
  if(m!==mesAtual())return null;
  const dMes=new Date(+m.slice(0,4),+m.slice(5,7),0).getDate(),dia=+hojeISO().slice(8,10);
  return {dia,dMes,pct:dia/dMes*100};
}
function ritmoCls(pct,r,over){if(over)return 'over';if(r)return pct>r.pct+RITMO_MARGEM?'warn':'';return pct>=80?'warn':'';}
function ritmoTxt(pct,r){return `Dia ${r.dia} de ${r.dMes} (${Math.round(r.pct)}%) · ${Math.round(pct)}% do orçamento usado`;}
function ritmoMarca(r){return r?`<b class="orcPace" style="left:${Math.min(100,r.pct).toFixed(1)}%" title="hoje: dia ${r.dia} de ${r.dMes}" aria-hidden="true"></b>`:'';}
function orcInicioHTML(){
  const m=mesAtual(),r=ritmoMes(m);
  const LO=limOrc(m),lst=S.cats.filter(c=>LO[c]>0).map(c=>{const lim=LO[c],gasto=somaMes(m,'despesa',c,true);return {c,lim,gasto,pct:gasto/lim*100};}).sort((a,b)=>b.pct-a.pct).slice(0,4);
  if(!lst.length)return '';
  return `<div class="card hmOrc">
    <div class="hmH tap" data-act="nav-orc" role="button" tabindex="0" aria-label="abrir orçamentos"><h4>Orçamentos do mês</h4><span class="hmSub">${r?`dia ${r.dia} de ${r.dMes} · ${Math.round(r.pct)}% do mês`:''}${I('chevR','tapCh')}</span></div>
    ${lst.map(x=>{
      const cl=ritmoCls(x.pct,r,x.pct>=100);
      const badge=x.pct>=100?'<span class="badge over">estourou</span>':cl==='warn'?`<span class="badge warn">acima do ritmo · ${Math.round(x.pct)}%</span>`:'';
      return `<div class="orcRow tap" data-act="nav-cat-orc" data-id="${esc(x.c)}" role="button" tabindex="0" aria-label="ver gastos de ${esc(x.c)} no mês">
        <div class="row small"><span class="catName"><span class="ic despesa" style="color:${corCat(x.c)}">${I(catIcon(x.c))}</span><b>${esc(x.c)}</b></span>${badge}</div>
        <div class="row small"><span>${brl(x.gasto)} de ${brl(x.lim)}</span><span>${Math.round(x.pct)}%</span></div>
        <div class="ritBar"><div class="bar ${cl}"><i data-w="${Math.min(100,x.pct)}"></i></div>${ritmoMarca(r)}</div>
      </div>`;}).join('')}
  </div>`;
}
function catsFiltro(){
  const base=F.tipo==='receita'?CATS_RECEITA.slice():F.tipo==='despesa'?S.cats.slice():S.cats.concat(CATS_RECEITA.filter(c=>!S.cats.includes(c)));
  if(F.cat&&!base.includes(F.cat))base.push(F.cat);
  return base;
}
function viewLanc(){
  const lista=filtrados();
  const ef=lista.filter(efetivo);
  const tr=somaC(ef.filter(t=>t.tipo==='receita'),t=>t.valor);
  // compras no cartão saem do caixa pela fatura: somar as duas contaria o mesmo gasto duas vezes
  /* v10.81: com filtro de categoria, lançamento dividido entra só com a parte daquela categoria */
  const vF=t=>F.cat&&temSplit(t)?valorNaCat(t,F.cat):t.valor;
  const td=somaC(ef.filter(t=>t.tipo==='despesa'&&!t.cartao),vF);
  const tdCartao=somaC(ef.filter(t=>t.tipo==='despesa'&&t.cartao),vF);
  const prv=lista.filter(t=>t.status==='previsto'),prvR=somaC(prv.filter(t=>t.tipo==='receita'),t=>t.valor),prvD=somaC(prv.filter(t=>t.tipo==='despesa'),vF);
  const stB=t=>{const s=statusTx(t);if(s==='pago')return '';const [l,k]=ST_TX[s];return ` <span class="badge ${k} stb">${l}</span>`;};
  const item=t=>`<div class="tx hov txTap" data-act="tx-menu" data-id="${t.id}"${t.status==='cancelado'?' tx-cancel':''}${t.status==='previsto'?' tx-prev':''}">
      <span class="ic ${t.tipo}" style="color:${corCat(t.categoria)}">${I(catIcon(t.categoria))}</span>
      <div class="txt">${(()=>{const nm=nomeTx(t);return `<b title="${esc(t.descricao||'')}">${esc(nm.n||t.categoria)}</b><small>${nm.k?`<span class="txK">${nm.k}</span>`:''}${origemBadge(t)}<span class="txD">${txDatasHTML(t)}</span>${t.trab&&t.tipo==='receita'&&!t.sub&&norm(nm.n)===norm(t.categoria)?'<i class="txSemCat"></i>':' · '}`;})()}${t.emp||t.tipo==='transf'?esc(t.emp?empRotulo(t):nomeLado(t.de)+' → '+nomeLado(t.para)):(t.trab&&t.tipo==='receita'&&!t.sub&&norm(nomeTx(t).n)===norm(t.categoria)?'':(temSplit(t)?esc(t.split.map(p=>p.cat).slice(0,2).join(' + '))+(t.split.length>2?' +'+(t.split.length-2):''):esc(t.categoria))+(t.sub?' › '+esc(t.sub):''))+(()=>{const cn=t.cartao?S.cartoes.find(c=>c.id===t.cartao):null;const bk=t.conta?S.bancos.find(b=>b.id===t.conta):null;return cn?' · '+esc(cn.nome):(bk&&S.bancos.length>1?' · '+esc(bk.nome):'');})()}</small></div>
      ${temSplit(t)?`<div class="txMeta"><span class="encChip spChip">${I('split')}${t.split.map(p=>esc(p.cat)+' '+brl(p.v)).join(' · ')}</span></div>`:''}
      ${t.multa||t.juros||t.desconto?`<div class="txMeta"><span class="encChip">${[t.multa?'multa '+brl(t.multa):'',t.juros?'juros '+brl(t.juros):'',t.desconto?'desconto '+brl(t.desconto):''].filter(Boolean).join(' · ')}</span></div>`:''}
      ${(t.tags&&t.tags.length)||t.obs?`<div class="txMeta">${(t.tags||[]).map(g=>`<button class="tagChip" data-act="tag-filtro" data-id="${esc(g)}">#${esc(g)}</button>`).join('')}${t.obs?`<span class="txObs" title="${esc(t.obs)}">${esc(t.obs.length>70?t.obs.slice(0,70)+'…':t.obs)}</span>`:''}</div>`:''}
      <div class="val ${t.emp?(t.empDir==='in'?'pos':t.empDir==='perdao'?'neg':'neu'):t.tipo==='receita'?'pos':t.tipo==='transf'?'neu':'neg'}"><span class="sg">${t.emp?(t.empDir==='in'?'+':t.empDir==='perdao'?'−':'↗'):t.tipo==='receita'?'+':t.tipo==='transf'?'⇄':'−'}</span> ${brl(t.valor)}</div>
      ${t.faturaKey?`<div class="fatAct">${faturaBadge(t)}${restanteFatura(t)>0?`<button class="btn2 sm" data-act="pagar-fat" data-id="${t.id}">pagar</button>${t.pagoValor>0?`<button class="btn2 sm" data-act="desfaz-pag" data-id="${t.id}" title="desfazer o último pagamento">desfazer</button>`:''}`:(t.pagoValor>0?`<button class="btn2 sm" data-act="desfaz-pag" data-id="${t.id}" title="desfazer pagamento">desfazer</button>`:'')}</div>`:''}
      <button class="txMore" data-act="tx-menu" data-id="${t.id}" aria-label="ações do lançamento">${I('more')}</button>
      ${statusTx(t)!=='pago'?`<div class="stLine">${stB(t)}${t.status==='previsto'?`<button class="btn2 sm" data-act="tx-pagar" data-id="${t.id}">${t.tipo==='receita'?'marcar recebido':'marcar pago'}</button>`:''}${t.tipo==='receita'&&statusTx(t)==='atrasado'?`<button class="btn2 sm" data-act="trab-lote" data-id="${t.id}">${I('calendar')}quando cai?</button>`:''}</div>`:''}
    </div>`;
  return `
  ${voltaHTML()}<div class="head lHead"><h2>${F.st==='aberto'?'A pagar e a receber':F.tipo==='receita'?'Receitas':F.tipo==='despesa'?'Despesas':F.tipo==='transf'?'Transferências':'Lançamentos'}</h2></div>
  <div class="ltools">${PLUGGY_ON()?`<button class="ltool" data-act="banco-sync"><span>${I('refresh')}</span>Banco</button>`:''}<button class="ltool" data-act="importar"><span>${I('up')}</span>Importar</button><button class="ltool" data-act="nova-fixa"><span>${I('receipt')}</span>Conta fixa</button><button class="ltool" data-act="tx-planilha"><span>${I('down')}</span>Planilha</button></div>
  <div class="seg lseg">${[['despesa','Despesas'],['receita','Receitas'],['transf','Transf.'],['','Tudo']].map(([k,l])=>`<button class="${F.tipo===k?'on':''}" data-act="set-tipo" data-id="${k}">${l}</button>`).join('')}</div>
  <div class="lfil">
    <label class="lsrch">${I('search')}<input type="search" data-filter="q" value="${esc(F.q)}" placeholder="Buscar lançamento" aria-label="buscar"></label>
    <div class="lrow">
      <div class="lmes"><button data-act="lmes" data-id="-1" aria-label="mês anterior">${I('chevL')}</button><label><b>${F.ini&&F.fim?esc(F.perL||'período'):F.mes?(MESES[+F.mes.slice(5,7)-1]+' '+F.mes.slice(0,4)):'todos os meses'}</b><input type="month" data-filter="mes" value="${esc(F.mes)}" aria-label="mês"></label><button data-act="lmes" data-id="1" aria-label="próximo mês">${I('chevR')}</button></div>
      <label class="lcat${F.cat?' on':''}"><select data-filter="cat" aria-label="categoria"><option value="">Categorias</option>${catsFiltro().map(c=>`<option value="${esc(c)}" ${F.cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select>${I('chevD')}</label>
      ${todasTags().length||F.tag?`<label class="lcat${F.tag?' on':''}"><select data-filter="tag" aria-label="tag"><option value="">Tags</option>${todasTags().map(g=>`<option value="${esc(g)}" ${F.tag===g?'selected':''}>#${esc(g)}</option>`).join('')}</select>${I('chevD')}</label>`:''}
    </div>
  </div>
  ${(()=>{const ch=[];if(F.ini&&F.fim)ch.push(['per',I('calendar')+esc(F.perL||'período')]);if(F.conta){const b=S.bancos.find(x=>x.id===F.conta);ch.push(['conta',I('bank')+esc(b?b.nome:'conta')]);}if(F.st==='aberto')ch.push(['st',I('clock')+'em aberto']);if(F.cat)ch.push(['cat',esc(F.cat)]);
    return ch.length?`<div class="fChips" aria-label="filtros ativos">${ch.map(([k,l])=>`<button type="button" class="fChip" data-act="f-tira" data-id="${k}" aria-label="tirar filtro">${l}${I('close')}</button>`).join('')}</div>`:'';})()}
  ${F.tipo==='receita'&&(F.comp||S.tx.some(t=>t.trab))?`<div class="seg compSeg" role="group" aria-label="agrupar receitas por"><button class="${F.comp?'':'on'}" data-act="set-comp" data-id="">${I('calendar')}por recebimento</button><button class="${F.comp?'on':''}" data-act="set-comp" data-id="trab">${I('horas')}por dia trabalhado</button></div>`:''}
  ${F.tipo==='receita'&&!F.comp?trabDicaHTML(null,'card'):''}
  ${(()=>{const n=lista.length,cnt=`${n} ${n===1?'lançamento':'lançamentos'}`;
    if(F.tipo==='receita'&&F.comp==='trab')return compLancHTML(lista);
    if(F.tipo==='despesa'){const ex=[tdCartao?`compras no cartão ${brl(tdCartao)} (entram pela fatura)`:'',prvD?`+ ${brl(prvD)} previsto`:''].filter(Boolean).join(' · ');return `<div class="card lsum"><small>Gasto ${F.mes?'no mês':'no período'}</small><b class="neg">${brl(td)}</b><p>${ex||cnt}</p></div>`;}
    if(F.tipo==='receita')return `<div class="card lsum"><small>Recebido ${F.mes?'no mês':'no período'}</small><b class="pos">${brl(tr)}</b><p>${prvR?`+ ${brl(prvR)} previsto`:cnt}</p></div>`;
    if(F.tipo==='transf')return `<div class="card lsum"><small>Movimentado entre suas contas</small><b>${brl(somaC(ef.filter(t=>t.tipo==='transf'),t=>t.valor))}</b><p>${cnt} · não contam como gasto</p></div>`;
    return `<div class="card lsum lsum3"><div class="ls3top"><small>Saldo ${F.mes?'do mês':'do período'}</small><b class="${tr-td>=0?'pos':'neg'}">${brl(tr-td)}</b></div><div><small>Entrou</small><b class="pos">${brl(tr)}</b></div><div><small>Saiu</small><b class="neg">${brl(td)}</b></div>${tdCartao?`<p>+ ${brl(tdCartao)} em compras no cartão, que saem pela fatura</p>`:''}</div>`;})()}
  <div class="card lista">${lista.length?lista.slice(0,LIM_LISTA).map(item).join('')+(lista.length>LIM_LISTA?`<button class="btn2 full maisLista" data-act="mais-lista">mostrar mais (${Math.min(50,lista.length-LIM_LISTA)} de ${lista.length-LIM_LISTA} restantes)</button>`:''):(S.tx.length?'<p class="vazio">nenhum lançamento com esses filtros.</p>':vazioHTML('report','Nenhum lançamento ainda',(MVP_MODE?'Registre seus gastos e receitas aqui, por frase, foto do recibo ou WhatsApp, ou importe o extrato.':'Registre seus gastos e receitas aqui, ou conecte o banco para importar sozinho.'),'<button class="btn sm" data-act="q-gasto">+ gasto</button><button class="btn2 sm" data-act="q-receita">+ receita</button>'))}</div>
  ${fixasCard()}`;
}

/* v10.80: resumo da visão por dia trabalhado (Receitas) */
function compLancHTML(lista){
  const vivas=lista.filter(t=>t.status!=='cancelado'&&!t.emp),tot=somaC(vivas,t=>t.valor);
  const m=F.mes&&!(F.ini&&F.fim)?F.mes:'';const quando=m?'em '+nomeMesMin(m):'no período';
  const C={};vivas.forEach(t=>{const c=C[t.categoria]||(C[t.categoria]={cat:t.categoria,tot:0,prev:0,rec:{}});const v=cents(t.valor);c.tot+=v;if(t.status==='previsto')c.prev+=v;c.rec[t.data.slice(0,7)]=(c.rec[t.data.slice(0,7)]||0)+v;});
  const L=Object.values(C).map(c=>Object.assign(c,{tot:c.tot/100,prev:c.prev/100,rec:Object.fromEntries(Object.entries(c.rec).map(([k,v])=>[k,v/100]))})).sort((a,b)=>b.tot-a.tot);
  const aRec=somaC(vivas.filter(t=>t.status==='previsto'),t=>t.valor);
  return `<div class="card lsum compSum"><small>Trabalhado ${quando}</small><b class="pos">${brl(tot)}</b><p>${aRec?brl(aRec)+' ainda vai cair':vivas.length?'tudo já recebido':'nada trabalhado '+quando}</p>
    ${L.length?`<div class="compL">${L.map(c=>`<div class="compR"><span class="compI" style="--cc:${corCat(c.cat)}">${I(catIcon(c.cat))}</span><span class="compT"><b>${esc(c.cat)}${m?(/^horas/i.test(c.cat)?' trabalhadas ':' de ')+(/^horas/i.test(c.cat)?quando:nomeMesMin(m)):''}</b><small>${compRecTxt(c,m||'')}</small></span><span class="compV nw">${brl(c.tot)}</span></div>`).join('')}</div>`:''}</div>`;
}
/* orçamentos com histórico: limOrc(m) devolve os limites válidos no mês m */
let OMES='';
function limOrc(m){
  const om=S.orcMes||{};let k='';Object.keys(om).forEach(x=>{if(x<=m&&x>k)k=x;});
  return k?om[k]:(S.orc||{});
}
function setLimOrc(m,c,n){
  if(!S.orcMes)S.orcMes={};
  if(!S.orcMes[m])S.orcMes[m]=Object.assign({},limOrc(m));
  if(n>0)S.orcMes[m][c]=c2(n);else delete S.orcMes[m][c];
}
function mesMais(m,k){const d=new Date(+m.slice(0,4),+m.slice(5,7)-1+k,1);return d.getFullYear()+'-'+pad(d.getMonth()+1);}
function nomeMes(m){return MESES[+m.slice(5,7)-1]+'/'+m.slice(0,4);}
function copiaOrcAnterior(m){
  const ant=limOrc(mesMais(m,-1));
  if(!S.orcMes)S.orcMes={};
  S.orcMes[m]=Object.assign({},ant);
}
function histOrc(m,n){
  let first='';S.tx.forEach(t=>{if(t.data&&(!first||t.data<first))first=t.data;});const fm=first.slice(0,7);
  const out=[];for(let k=n-1;k>=0;k--){const mm=mesMais(m,-k);if(fm&&mm<fm&&mm!==m)continue;const lim=limOrc(mm);
    const plan=Object.values(lim).reduce((a,b)=>a+cents(b),0)/100;
    const gasto=Object.keys(lim).reduce((a,c)=>a+cents(somaMes(mm,'despesa',c,true)),0)/100;
    const est=Object.keys(lim).filter(c=>somaMes(mm,'despesa',c,true)>lim[c]).length;
    out.push({m:mm,plan,gasto,est});}
  return out;
}
/* v10.101: plano pela renda. regra 50/30/20 (Elizabeth Warren, "All Your Worth") e variações; divide cada parte pelas categorias que a pessoa mais usa */
const PERFIS={eq:{n:'Equilibrado',p:[50,30,20],d:'a regra 50/30/20'},ap:{n:'Contas apertadas',p:[60,30,10],d:'para custo fixo alto'},ac:{n:'Acelerar',p:[50,20,30],d:'para guardar mais'}};
const ESSENC=/^(moradia|aluguel|mercado|alimenta|contas|sa[uú]de|farm[aá]cia|transporte|combust|internet|educa|filhos|impostos|tarifas|manuten|pets?|seguro|condom|luz|[aá]gua|g[aá]s)/i;
let PLANO_TODOS=false;
function rendaAuto(m){let s=0,n=0;for(let k=1;k<=3;k++){const v=somaMes(mesMais(m,-k),'receita');if(v>0){s+=v;n++;}}return n?s/n:somaMes(m,'receita');}
function mediaCat(m,c){let s=0,n=0;for(let k=1;k<=3;k++){const v=somaMes(mesMais(m,-k),'despesa',c,true);if(v>0){s+=v;n++;}}return n?s/n:somaMes(m,'despesa',c,true);}
function calcPlano(m){
  const P=(S.cfg&&S.cfg.orcPlano)||{},renda=+P.renda||0,pf=PERFIS[P.perfil]||PERFIS.eq;
  const cats=S.cats.map(c=>({c,ess:ESSENC.test(c),med:mediaCat(m,c)})).filter(x=>x.med>0);
  const medE=cats.filter(x=>x.ess).reduce((s,x)=>s+x.med,0),medD=cats.filter(x=>!x.ess).reduce((s,x)=>s+x.med,0);
  let E=renda*pf.p[0]/100,D=renda*pf.p[1]/100,G=renda*pf.p[2]/100,aviso='';
  if(medE>E){const falta=medE-E;E=medE;D-=falta;aviso='Suas contas essenciais já passam de '+pf.p[0]+'% da renda, então o plano tira a diferença dos desejos.';if(D<0){G+=D;D=0;aviso='Suas contas essenciais estão altas para essa renda: sobra menos para guardar.';}if(G<0)G=0;}
  const fl=v=>Math.max(0,Math.floor(v/10)*10);
  /* teto: a parte proporcional, mas nunca muito acima do que a pessoa já gasta (média + 10%); o que sobra vira folga para guardar */
  const linhas=cats.map(x=>{const tot=x.ess?medE:medD,bud=x.ess?E:D;const sug=Math.min(fl(tot?bud*x.med/tot:0),Math.ceil(x.med*1.1/10)*10);return {c:x.c,ess:x.ess,med:x.med,sug};}).sort((a,b)=>b.med-a.med);
  const folga=Math.max(0,E+D-linhas.reduce((s,x)=>s+x.sug,0));
  return {renda,pf,perfil:P.perfil||'eq',E,D,G,aviso,linhas,medE,medD,folga};
}
function planoHTML(m){
  const P=(S.cfg&&S.cfg.orcPlano)||{};
  if(!(+P.renda>0)){const au=rendaAuto(m);return `<div class="card orcPlano vazio">
    <div class="opIco">${I('piggy')}</div>
    <div class="opTxt"><h4>Plano pela sua renda</h4><p>Diga quanto você ganha e eu sugiro quanto gastar em cada categoria e quanto guardar por mês.</p></div>
    <button class="btn" data-act="orc-renda">${au>0?'começar com '+brl(au):'informar minha renda'}</button></div>`;}
  const R=calcPlano(m),pc=v=>R.renda?Math.max(0,v/R.renda*100):0,lim=limOrc(m);
  const seg=[['ess','Essenciais',R.E],['des','Desejos',R.D],['gua','Guardar',R.G]];
  const ano=R.G*12,taxa=.008,fut=R.G?R.G*((Math.pow(1+taxa,12)-1)/taxa):0;
  const rows=PLANO_TODOS?R.linhas:R.linhas.slice(0,6);
  const linha=x=>{const d=x.sug-x.med,atual=lim[x.c]||0;return `<div class="opRow" style="--cc:${corCat(x.c)}"><span class="orcIc">${I(catIcon(x.c))}</span>
    <span class="opN"><b>${esc(x.c)}</b><small><i class="opTag ${x.ess?'ess':'des'}">${x.ess?'essencial':'desejo'}</i> média ${brl(x.med)}</small></span>
    <span class="opV"><b class="nw">${brl(x.sug)}</b><small class="${d<-0.5?'cut':'ok'}">${d<-0.5?'corta '+brl(-d):'dentro'}</small></span>
    <button class="orcEd sm" data-act="def-orc-sug" data-id="${esc(x.c)}|${x.sug}" aria-label="usar ${brl(x.sug)} como limite de ${esc(x.c)}" title="${atual?'limite atual '+brl(atual):'usar como limite'}">${I(atual&&Math.abs(atual-x.sug)<1?'check':'plus')}</button></div>`;};
  return `<div class="card orcPlano">
    <div class="opHead"><div><small>plano pela sua renda</small><h4>Renda de <span class="nw">${brl(R.renda)}</span> <button class="opEdit" data-act="orc-renda" aria-label="mudar renda">${I('edit')}</button></h4></div>
      <div class="opChips" role="tablist">${Object.entries(PERFIS).map(([k,v])=>`<button class="opChip ${R.perfil===k?'on':''}" data-act="orc-perfil" data-id="${k}" role="tab" aria-selected="${R.perfil===k}">${v.n}<small>${v.p.join(' · ')}</small></button>`).join('')}</div></div>
    <div class="opGrid">
      <div class="opL">
        <div class="opBar">${seg.map(s=>`<i class="${s[0]}" style="width:${pc(s[2]).toFixed(1)}%"></i>`).join('')}</div>
        <div class="opLeg">${seg.map(s=>`<span class="${s[0]}"><em></em><small>${s[1]} · ${Math.round(pc(s[2]))}%</small><b class="nw">${brl(s[2])}</b></span>`).join('')}</div>
        ${R.aviso?`<p class="opAviso">${I('alert')}${R.aviso}</p>`:''}
        <div class="opGuardar"><span class="opGi">${I('chart')}</span><div><small>guardando ${brl(R.G)} por mês</small><b class="nw">${brl(fut)}</b><p>em 12 meses, investindo a 0,8% ao mês (estimativa). Só guardando: ${brl(ano)}.</p></div></div>
        ${R.folga>=50?`<div class="opFolga">${I('sparkle')}<span>Mantendo os gastos de hoje, sobram mais <b class="nw">${brl(R.folga)}</b> por mês além do plano. Dá pra guardar até <b class="nw">${brl(R.G+R.folga)}</b>.</span></div>`:''}
        <p class="opComo"><b>${R.pf.n} ${R.pf.p.join('/')}</b>: ${R.pf.p[0]}% para o essencial (moradia, mercado, contas), ${R.pf.p[1]}% para desejos (lazer, restaurantes, compras) e ${R.pf.p[2]}% para guardar e investir. Baseado na regra 50/30/20 de Elizabeth Warren.</p>
      </div>
      <div class="opR">
        <div class="opRh"><b>Sugestão por categoria</b><small>pelo que você mais usa</small></div>
        ${R.linhas.length?rows.map(linha).join(''):`<p class="small">Ainda não há gastos nos últimos meses para sugerir por categoria.</p>`}
        ${R.linhas.length>6?`<button class="opMais" data-act="orc-plano-todos">${PLANO_TODOS?'mostrar menos':'ver todas ('+R.linhas.length+')'}</button>`:''}
        ${R.linhas.length?`<button class="btn opAplica" data-act="orc-aplica">${I('check')}usar como meus limites</button>`:''}
      </div>
    </div>
  </div>`;
}
function viewOrc(){
  const atual=mesAtual();if(!OMES||OMES>mesMais(atual,12))OMES=atual;
  const m=OMES,L=limOrc(m),passado=m<atual;
  const totLim=Object.values(L).reduce((a,b)=>a+b,0);
  const totGasto=somaMes(m,'despesa',undefined,true);
  const proprio=!!(S.orcMes&&S.orcMes[m]);
  const H=histOrc(m,6),mx=Math.max(1,...H.map(h=>Math.max(h.plan,h.gasto)));
  const hist=H.map(h=>`<div class="ohRow ${h.m===m?'on':''}" data-act="orc-mes" data-id="${h.m}"><span class="ohM">${MESES[+h.m.slice(5,7)-1]}</span>
    <span class="ohBars"><i class="p" style="width:${h.plan/mx*100}%"></i><i class="g ${h.plan&&h.gasto>h.plan?'over':''}" style="width:${h.gasto/mx*100}%"></i></span>
    <span class="ohV">${h.plan?Math.round(h.gasto/h.plan*100)+'%':'—'}${h.est?` <em>${h.est} estourou</em>`:''}</span></div>`).join('');
  /* v10.101: orçamento reorganizado: resumo com ritmo do mês, categorias com limite, gastos sem limite (com sugestão) e o resto recolhido */
  const vazias=S.cats.filter(c=>!(L[c]||0)&&!somaMes(m,'despesa',c,true));
  const comLim=S.cats.filter(c=>(L[c]||0)>0),semLim=S.cats.filter(c=>!(L[c]||0)&&!vazias.includes(c));
  const gLim=comLim.reduce((s,c)=>s+cents(somaMes(m,'despesa',c,true)),0)/100;
  const dMes=new Date(+m.slice(0,4),+m.slice(5,7),0).getDate(),hj=hojeISO(),dia=m===atual?+hj.slice(8,10):passado?dMes:0;
  const pctT=totLim?gLim/totLim*100:0,rest=c2(totLim-gLim),dRest=m===atual?dMes-dia+1:0;
  /* v10.159: termômetro de ritmo (ritmoMes/ritmoCls): marcador de hoje, cor pela comparação com o mês e texto de apoio */
  const rit=ritmoMes(m),clT=ritmoCls(pctT,rit,gLim>totLim);
  const st=!totLim?'':gLim>totLim?['over','estourou']:clT==='warn'&&rit?['warn','acima do ritmo']:passado?['ok','dentro do limite']:['ok','no ritmo'];
  const sug=c=>{let s=0,n=0;for(let k=1;k<=3;k++){const v=somaMes(mesMais(m,-k),'despesa',c,true);if(v>0){s+=v;n++;}}const b=n?s/n:somaMes(m,'despesa',c,true);return Math.max(50,Math.ceil(b/50)*50);};
  const hero=`<div class="card orcHero">
    <div class="orcHt"><small>orçamento de ${MESES[+m.slice(5,7)-1].toLowerCase()}</small>${st?`<span class="orcSt ${st[0]}">${st[1]}</span>`:''}</div>
    ${totLim?`<div class="orcHv"><b class="nw">${brl(gLim)}</b><span>de ${brl(totLim)}</span></div>
    <div class="orcHb"><div class="bar ${clT}"><i data-w="${Math.min(100,pctT)}"></i></div>${ritmoMarca(rit)}</div>
    ${rit?`<p class="orcRit ${clT}">${I('clock')}<span>${ritmoTxt(pctT,rit)}${clT==='warn'?' · acima do ritmo do mês':''}</span></p>`:''}
    <div class="orcHs">
      <span><small>${rest>=0?'disponível':'passou'}</small><b class="nw ${rest<0?'neg':''}">${brl(Math.abs(rest))}</b></span>
      ${dRest&&rest>0?`<span><small>por dia</small><b class="nw">${brl(rest/dRest)}</b></span>`:`<span><small>usado</small><b>${Math.round(pctT)}%</b></span>`}
      <span class="tap" data-act="nav-mes-orc" role="button" tabindex="0" aria-label="ver despesas do mês"><small>gasto total</small><b class="nw">${brl(totGasto)}${I('chevR','tapCh')}</b></span>
    </div>`:`<p class="orcVaz">Defina limites nas categorias para acompanhar o mês. Gasto total até agora: <b class="nw">${brl(totGasto)}</b>.</p>`}
  </div>`;
  const aviso=`<div class="orcInfo">${I('calendar')}<span>${proprio?'limites definidos para este mês':'limites herdados do mês anterior'}. Mudar um limite vale para ${nomeMes(m)} e os seguintes.</span><button class="btn2 sm" data-act="orc-copia">copiar limites de ${nomeMes(mesMais(m,-1))}</button>${m!==atual?`<button class="btn2 sm" data-act="orc-mes" data-id="${atual}">voltar ao mês atual</button>`:''}</div>`;
  const cards=comLim.map(c=>{
    const lim=L[c],gasto=somaMes(m,'despesa',c,true),pct=gasto/lim*100,over=gasto>lim,clB=ritmoCls(pct,rit,over),cl=clB||'ok';
    const sub=over?`estourou ${brl(gasto-lim)}`:passado?`sobrou ${brl(lim-gasto)}`:`restam ${brl(lim-gasto)}`;
    return `<div class="card orc hov ${over?'alerta':''} ${cl}" style="--cc:${corCat(c)}">
      <div class="orcTop"><span class="orcIc">${I(catIcon(c))}</span><span class="orcNm"><b>${esc(c)}</b><small class="${cl}">${sub}</small></span><button class="orcEd" data-act="def-orc" data-id="${esc(c)}" aria-label="editar limite de ${esc(c)}" title="editar limite">${I('edit')}</button></div>
      <div class="orcTap tap" data-act="nav-cat-orc" data-id="${esc(c)}" role="button" tabindex="0" aria-label="ver gastos de ${esc(c)}">
        <div class="orcVals"><span><b class="nw">${brl(gasto)}</b> de ${brl(lim)}</span><em class="${cl}">${Math.round(pct)}%</em></div>
        <div class="orcHb"><div class="bar ${clB}"><i data-w="${Math.min(100,pct)}"></i></div>${ritmoMarca(rit)}</div>
        ${rit&&clB==='warn'?`<small class="orcRitC">acima do ritmo: ${Math.round(pct)}% usado com ${Math.round(rit.pct)}% do mês</small>`:''}
      </div>
    </div>`;
  }).join('');
  const semHTML=semLim.length?`<div class="card orcSem"><div class="catHead"><h4>Gastos sem limite <span class="catQt">${semLim.length}</span></h4></div><p class="small" style="margin:0 0 6px">sugestão pela média dos últimos meses. dá pra mudar o valor antes de salvar</p>
    ${semLim.map(c=>{const g=somaMes(m,'despesa',c,true),s=sug(c);return `<div class="orcSr" style="--cc:${corCat(c)}"><span class="orcIc">${I(catIcon(c))}</span><span class="orcNm tap" data-act="nav-cat-orc" data-id="${esc(c)}" role="button" tabindex="0"><b>${esc(c)}</b><small>gastou <span class="nw">${brl(g)}</span></small></span><button class="btn2 sm" data-act="def-orc-sug" data-id="${esc(c)}|${s}">definir <span class="nw">${OCULTO?'R$ •••':'R$ '+s.toLocaleString('pt-BR')}</span></button></div>`;}).join('')}</div>`:'';
  const outrasHTML=vazias.length?`<details class="card orcMais"><summary><span>${I('plus')}Adicionar limite a outras categorias</span><span class="catQt">${vazias.length}</span>${I('chevR','tapCh')}</summary><div class="catList">${vazias.map(c=>`<button type="button" class="catRow" data-act="def-orc" data-id="${esc(c)}" aria-label="definir limite de ${esc(c)}" style="--cc:${corCat(c)}"><span class="cr-i">${I(catIcon(c))}</span><span class="cr-n">${esc(c)}</span><span class="cr-q">${I('plus')}</span></button>`).join('')}</div></details>`:'';
  return `
  <div class="head"><h2>Orçamentos</h2></div>
  <div class="mesNav"><button class="btn2" data-act="orc-mes" data-id="${mesMais(m,-1)}" aria-label="mês anterior">‹</button><b>${nomeMes(m)}${m===atual?' · atual':''}</b><button class="btn2" data-act="orc-mes" data-id="${mesMais(m,1)}" aria-label="próximo mês">›</button></div>
  ${hero}
  <div class="card orcHist"><h4 style="margin:0 0 10px">Histórico · planejado x gasto</h4>${hist}<p class="small" style="margin:8px 0 0"><span class="ohLeg p"></span> planejado <span class="ohLeg g"></span> gasto nas categorias com limite</p></div>
  ${planoHTML(m)}
  ${comLim.length?`<div class="wSec orcSec"><h3>Com limite <span>${comLim.length}</span></h3></div>`:''}
  ${cards}
  ${semHTML}
  ${outrasHTML}
  ${aviso}`;
}

const TCOR={fii:'#a3e635',acao:'#60a5fa',etf:'#f59e0b',bdr:'#f472b6',rf:'#34d399',cripto:'#fb923c'};
/* v10.91: próximos proventos. card com o selo do ativo, a data com dia da semana, o valor esperado
   (cotas × último provento por cota, quando conhecido), anel de progresso até a data e a lista dos próximos pagamentos. */
function proxPags(dias){
  const now=new Date(),h0=new Date(now.getFullYear(),now.getMonth(),now.getDate()),lim=new Date(h0.getTime()+(dias||45)*864e5),out=[];
  S.fiis.forEach(f=>{if(!(f.diaPag>0))return;
    for(let k=0;k<3;k++){const y=h0.getFullYear(),mo=h0.getMonth()+k,last=new Date(y,mo+1,0).getDate(),d=new Date(y,mo,Math.min(f.diaPag,last));
      if(d<h0)continue;if(d>lim)break;const pl=new Date(y,mo,0).getDate(),ant=new Date(y,mo-1,Math.min(f.diaPag,pl));
      out.push({f,date:d,ant,valor:f.dpc>0&&f.cotas>0?c2(f.cotas*f.dpc):0});break;}});
  return out.sort((a,b)=>a.date-b.date||String(a.f.ticker).localeCompare(String(b.f.ticker)));
}
const FMT_DIA_SEM=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long'}),FMT_DIA_CURTO=new Intl.DateTimeFormat('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'});
function diasTxt(n){return n<=0?'hoje':n===1?'amanhã':'em '+n+' dias';}
function provCardHTML(p){
  const L=proxPags(45),x=L.find(q=>q.f===p.f&&+q.date===+p.date)||{f:p.f,date:p.date,valor:p.f.dpc>0&&p.f.cotas>0?c2(p.f.cotas*p.f.dpc):0,ant:new Date(p.date.getFullYear(),p.date.getMonth()-1,p.date.getDate())};
  const now=new Date(),h0=new Date(now.getFullYear(),now.getMonth(),now.getDate()),n=Math.round((x.date-h0)/864e5);
  const per=Math.max(1,Math.round((x.date-x.ant)/864e5)),pr=Math.max(0.04,Math.min(1,1-n/per)),C=2*Math.PI*30;
  const t=tipoOf(x.f),mesmoDia=L.filter(q=>+q.date===+x.date),totDia=mesmoDia.reduce((a,q)=>a+cents(q.valor),0)/100;
  const mesFim=new Date(h0.getFullYear(),h0.getMonth()+1,0),mesL=L.filter(q=>q.date<=mesFim),totMes=mesL.reduce((a,q)=>a+cents(q.valor),0)/100;
  const dsem=FMT_DIA_SEM.format(x.date);
  const rows=L.slice(0,8).map(q=>{const nn=Math.round((q.date-h0)/864e5);return `<div class="pvRow${q===x?' on':''}">${assetIco(q.f.ticker,tipoOf(q.f))}<span class="pvRN"><b>${esc(q.f.ticker)}</b><small>${esc(FMT_DIA_CURTO.format(q.date).replace(/\./g,'').replace(',',' ·'))} · ${diasTxt(nn)}</small></span><span class="pvRV">${q.valor>0?`<b>${brl(q.valor)}</b><small>${num(q.f.cotas).replace(/,00$/,'')} × ${brl(q.f.dpc)}</small>`:'<small>valor por cota não informado</small>'}</span><button class="pvRec" data-act="prov-receber" data-id="${q.f.id}" aria-label="registrar provento recebido de ${esc(q.f.ticker)}">${I('arrowDown')}</button></div>`;}).join('');
  return `<div class="card pvCard" style="--tc:${TCOR[t]||'var(--a1)'}">
    <div class="pvHead"><small>próximo provento</small>${totMes>0?`<span class="pvMes">${MESES_LONGO[h0.getMonth()].toLowerCase()} · ${brl(totMes)}</span>`:''}</div>
    <div class="pvMain">
      <div class="pvRing" role="img" aria-label="${diasTxt(n)}"><svg viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30" class="pvRBg"/><circle cx="36" cy="36" r="30" class="pvRFg" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${C.toFixed(2)}" data-off="${(C*(1-pr)).toFixed(2)}"/></svg><span class="pvRIn">${n<=0?'<b>hoje</b>':`<b>${n}</b><small>${n===1?'dia':'dias'}</small>`}</span></div>
      <div class="pvInfo">
        <div class="pvTk">${assetIco(x.f.ticker,t)}<b>${esc(x.f.ticker)}</b>${mesmoDia.length>1?`<span class="pvMais">+${mesmoDia.length-1}</span>`:''}</div>
        <p class="pvData">${esc(dsem)}</p>
        <p class="pvVal">${x.valor>0?`<b>${brl(mesmoDia.length>1?totDia:x.valor)}</b><small>esperado${mesmoDia.length>1?' no dia':''}</small>`:'<small>informe o provento por cota para ver o valor</small>'}</p>
      </div>
    </div>
    <div class="pvCd"><span>${I('clock')}${diasTxt(n)}</span><span id="cd" class="pvCdT" data-date="${x.date.getTime()}"></span></div>
    ${L.length>1?`<div class="pvList"><h4>próximos pagamentos</h4>${rows}</div>`:`<div class="pvList pvList1">${rows}</div>`}
  </div>`;
}
/* v10.108: renda passiva mensal e yield on cost.
   Fonte: as operações "provento" dos ativos de renda variável (FII, ação, ETF, BDR). O provento já guarda o valor
   recebido, então o total do mês é a soma direta; o valor por cota usa as cotas que o ativo tinha na data do pagamento
   (compras e vendas até aquele dia). Renda fixa fica de fora: o app só estima o rendimento pelo CDI, não registra o que foi pago. */
const RP_TIPOS=['fii','acao','etf','bdr'];
let RP_SEL='',RP_VER='mes',YOC_ORD='yoc';
function rpCotasNaData(f,data){
  let q=0;(f.ops||[]).forEach(o=>{
    if(o.tipo==='inicial'){if(!o.data||o.data<=data)q=Q8(q+(+o.qtd||0));}
    else if(o.tipo==='compra'&&o.data&&o.data<=data)q=Q8(q+(+o.qtd||0));
    else if(o.tipo==='venda'&&o.data&&o.data<=data)q=Q8(Math.max(0,q-(+o.qtd||0)));
  });
  return q;
}
/* valor por cota de um provento: valor recebido ÷ cotas na data (sem histórico de cotas, usa as cotas de hoje) */
function rpPorCota(f,o){const q=rpCotasNaData(f,o.data)||(+f.cotas||0);return q>0?(+o.valor||0)/q:0;}
/* desde quando o ativo está na carteira: 1ª compra ou posição inicial com data. posição inicial sem data
   (o ativo já existia antes do app) conta a partir do 1º provento registrado, que é quando o histórico começa. */
function rpInicio(f){
  const ops=f.ops||[];let d='';
  ops.forEach(o=>{if((o.tipo==='compra'||o.tipo==='inicial')&&o.data&&(!d||o.data<d))d=o.data;});
  const semData=ops.some(o=>o.tipo==='inicial'&&!o.data);
  if(semData||!d){const pv=ops.filter(o=>o.tipo==='provento'&&o.data).map(o=>o.data).sort()[0]||'';if(semData)return pv&&(!d||pv<d)?pv:(d||pv);return d||pv;}
  return d;
}
function rpMesesEntre(a,b){return (+b.slice(0,4)-+a.slice(0,4))*12+(+b.slice(5,7)-+a.slice(5,7));}
function rpCalc(hj){
  hj=hj||hojeISO();const atual=hj.slice(0,7);
  const ativos=S.fiis.filter(f=>RP_TIPOS.includes(tipoOf(f)));
  const porMes={};let primeiro='';
  ativos.forEach(f=>(f.ops||[]).forEach(o=>{
    if(o.tipo!=='provento'||!DATA_OK.test(String(o.data))||!(+o.valor>0)||o.data>hj)return;
    const ym=o.data.slice(0,7),c=cents(o.valor);
    const M=porMes[ym]||(porMes[ym]={tot:0,por:{}});M.tot+=c;M.por[f.id]=(M.por[f.id]||0)+c;
    if(!primeiro||ym<primeiro)primeiro=ym;
  }));
  const soma=(de,ate)=>{let s=0;Object.keys(porMes).forEach(k=>{if(k>=de&&k<=ate)s+=porMes[k].tot;});return s;};
  const mesesL=[];for(let k=11;k>=0;k--){const ym=mesMais(atual,-k),M=porMes[ym]||{tot:0,por:{}};
    mesesL.push({ym,tot:M.tot/100,ativos:Object.keys(M.por).map(id=>({f:ativos.find(x=>x.id===id),v:M.por[id]/100})).filter(a=>a.f).sort((a,b)=>b.v-a.v)});}
  const ultFech=mesMais(atual,-1);
  let media=null,mediaN=0;
  if(primeiro&&primeiro<=ultFech){mediaN=Math.min(12,rpMesesEntre(primeiro,ultFech)+1);media=soma(mesMais(atual,-12),ultFech)/100/mediaN;}
  /* variação: 12 meses fechados contra os 12 anteriores, só quando o histórico cobre o período anterior (folga de 2 meses para quem paga por trimestre) */
  let vari=null;const ult=soma(mesMais(atual,-12),ultFech),ant=soma(mesMais(atual,-24),mesMais(atual,-13));
  if(ant>0&&primeiro<=mesMais(atual,-22))vari={ult:ult/100,ant:ant/100,pct:(ult-ant)/ant*100};
  /* estimativa do próximo mês: por ativo, média do valor por cota dos 3 últimos meses fechados (meses sem provento contam como zero,
     só a partir de quando o ativo entrou na carteira) × cotas de hoje */
  const projA=[];
  ativos.forEach(f=>{if(!(f.cotas>0))return;const ini=rpInicio(f);let s=0,n=0;
    for(let k=3;k>=1;k--){const ym=mesMais(atual,-k);if(ini&&ym<ini.slice(0,7))continue;n++;
      (f.ops||[]).forEach(o=>{if(o.tipo==='provento'&&o.data&&o.data.slice(0,7)===ym&&+o.valor>0)s+=rpPorCota(f,o);});}
    if(n&&s>0){const pc=s/n;projA.push({f,pc,v:c2(pc*f.cotas),n});}});
  projA.sort((a,b)=>b.v-a.v);
  const proj={ym:mesMais(atual,1),tot:projA.reduce((a,x)=>a+cents(x.v),0)/100,ativos:projA};
  /* contas fixas do mês: lançamentos gerados pelas contas fixas de despesa neste mês (pagas ou previstas) */
  let fixas=null;
  const fx=S.tx.filter(t=>t.fixaKey&&t.tipo==='despesa'&&String(t.data).slice(0,7)===atual);
  const totFx=fx.reduce((a,t)=>a+cents(t.valor),0)/100;
  if(fx.length&&totFx>0&&media>0)fixas={tot:totFx,n:fx.length,pct:media/totFx*100};
  return {atual,meses:mesesL,mesAtual:(porMes[atual]||{tot:0}).tot/100,tot12:mesesL.reduce((a,m)=>a+cents(m.tot),0)/100,media,mediaN,vari,proj,fixas,primeiro,temProv:!!primeiro,temAtivos:ativos.length>0};
}
/* yield on cost por ativo e da carteira (FII, ação, ETF, BDR com cotas hoje) */
function yocCalc(hj){
  hj=hj||hojeISO();const d=new Date(hj+'T12:00:00'),umAno=isoDe(new Date(d.getFullYear()-1,d.getMonth(),d.getDate()));
  const L=[];let rendaC=0,custoC=0,rendaM=0,mercC=0;
  S.fiis.filter(f=>RP_TIPOS.includes(tipoOf(f))&&f.cotas>0).forEach(f=>{
    const pv=(f.ops||[]).filter(o=>o.tipo==='provento'&&o.data&&o.data>umAno&&o.data<=hj&&+o.valor>0);
    const pcTTM=pv.reduce((a,o)=>a+rpPorCota(f,o),0),recebido=pv.reduce((a,o)=>a+cents(o.valor),0)/100;
    const ini=rpInicio(f);let meses=12,anualiz=false;
    if(ini&&ini>umAno){meses=Math.max(1,Math.min(12,Math.round((d-new Date(ini+'T12:00:00'))/864e5/30.4375)));anualiz=meses<12;}
    const pcAno=anualiz?pcTTM*12/meses:pcTTM;
    const pm=f.pago>0?f.pago/f.cotas:0,renda=pcAno*f.cotas;
    const yoc=pm>0?pcAno/pm*100:null,dy=f.preco>0?pcAno/f.preco*100:null;
    if(pm>0){rendaC+=renda;custoC+=+f.pago;}
    if(f.preco>0){rendaM+=renda;mercC+=f.cotas*f.preco;}
    L.push({f,yoc,dy,recebido,renda:c2(renda),pm,meses,anualiz,cot:f.cotFonte==='brapi'||f.cotFonte==='b3'});
  });
  return {lista:L,yoc:custoC>0?rendaC/custoC*100:null,dy:mercC>0?rendaM/mercC*100:null,renda:c2(rendaC),custo:c2(custoC)};
}
function yocOrdena(L,ord){
  const k=ord==='dy'?'dy':ord==='rec'?'recebido':ord==='az'?'':'yoc';
  return L.slice().sort((a,b)=>{if(!k)return String(a.f.ticker).localeCompare(String(b.f.ticker));const x=a[k],y=b[k];if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;return y-x||String(a.f.ticker).localeCompare(String(b.f.ticker));});
}
const rpPct=v=>v==null?'—':OCULTO?'•••%':num(v)+'%'; // o olho também esconde os percentuais (dariam pistas dos valores)
function rpBarsSVG(R,sel){
  /* só as barras no SVG (esticam na largura do card); os meses ficam em HTML embaixo, junto com a área de toque */
  const W=336,H=100,top=6,base=99,n=R.meses.length,slot=W/n,bw=Math.min(16,slot*.56),mx=Math.max(...R.meses.map(m=>m.tot),R.media||0,0.01);
  const bars=R.meses.map((m,i)=>{const h=m.tot>0?Math.max(3,(base-top)*m.tot/mx):2,x=i*slot+(slot-bw)/2,y=base-h;
    const cl=(m.ym===sel?'on ':'')+(m.ym===R.atual?'cur ':'')+(m.tot>0?'':'zero');
    return `<rect class="rpB ${cl}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3"><title>${esc(nomeMesL(m.ym))}: ${brl(m.tot)}</title></rect>`;}).join('');
  const my=R.media>0?base-(base-top)*R.media/mx:null;
  return `<svg class="rpSvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="proventos por mês nos últimos 12 meses">
    <line class="rpBase" x1="0" x2="${W}" y1="${base+.5}" y2="${base+.5}" vector-effect="non-scaling-stroke"/>
    ${my!=null?`<line class="rpMed" x1="0" x2="${W}" y1="${my.toFixed(1)}" y2="${my.toFixed(1)}" vector-effect="non-scaling-stroke"/>`:''}
    ${bars}</svg>`;
}
function rpDetHTML(R,sel){
  if(RP_VER==='proj'){const P=R.proj;
    return `<div class="rpDh"><span><b>${esc(nomeMesL(P.ym))}</b><small>estimativa · média dos 3 últimos meses × cotas de hoje</small></span><b class="nw">${brl(P.tot)}</b></div>
    ${P.ativos.length?P.ativos.map(a=>`<div class="rpRow">${assetIco(a.f.ticker,tipoOf(a.f))}<span class="rpRN"><b>${esc(a.f.ticker)}</b><small>${num(a.f.cotas).replace(/,00$/,'')} cotas × ${brl(a.pc)}${a.n<3?' · '+a.n+(a.n===1?' mês':' meses')+' de histórico':''}</small></span><b class="nw">${brl(a.v)}</b></div>`).join(''):'<p class="rpVaz">Sem proventos nos últimos 3 meses para estimar.</p>'}`;}
  const m=R.meses.find(x=>x.ym===sel)||R.meses[R.meses.length-1],mx=Math.max(0.01,...m.ativos.map(a=>a.v));
  return `<div class="rpDh"><span><b>${esc(nomeMesL(m.ym))}</b><small>${m.ativos.length?m.ativos.length+(m.ativos.length===1?' ativo pagou':' ativos pagaram'):'nenhum provento'}${m.ym===R.atual?' · até hoje':''}</small></span><b class="nw">${brl(m.tot)}</b></div>
  ${m.ativos.length?m.ativos.map(a=>`<div class="rpRow" style="--tc:${TCOR[tipoOf(a.f)]||'var(--a1)'}">${assetIco(a.f.ticker,tipoOf(a.f))}<span class="rpRN"><b>${esc(a.f.ticker)}${a.f.cotas>0?'':' <em class="rpVend">vendido</em>'}</b><i class="rpRb"><i style="width:${(a.v/mx*100).toFixed(1)}%"></i></i></span><b class="nw">${brl(a.v)}</b></div>`).join(''):`<p class="rpVaz">Nenhum provento registrado em ${esc(nomeMesMin(m.ym))}.</p>`}`;
}
function rpSelPadrao(R){if(RP_SEL&&R.meses.some(m=>m.ym===RP_SEL))return RP_SEL;const c=R.meses.slice().reverse().find(m=>m.tot>0);return c?c.ym:R.atual;}
function rpCardHTML(R){
  if(!R.temProv){
    const f=S.fiis.find(x=>RP_TIPOS.includes(tipoOf(x))&&x.cotas>0);
    return `<div class="card rpCard rpVazio"><div class="rpHead"><small>renda passiva</small></div>
      <div class="rpEmpty"><span class="rpEi">${I('chart')}</span><div><b>Sua renda passiva aparece aqui</b><p>${f?'Registre os proventos que caírem na conta: o app soma mês a mês, mostra quem pagou e estima o próximo mês.':'Adicione FIIs, ações, ETFs ou BDRs e registre os proventos para acompanhar quanto eles pagam por mês.'}</p>
      ${f?`<button class="btn2 sm" data-act="prov-receber" data-id="${f.id}">${I('arrowDown')} registrar provento de ${esc(f.ticker)}</button>`:`<button class="btn2 sm" data-act="novo-fii">${I('plus')} adicionar ativo</button>`}</div></div></div>`;
  }
  const sel=rpSelPadrao(R),v=R.vari;
  const bt=x=>Math.abs(x)>=1e4?brlK(x):brl(x); // valores grandes encurtados para caber nos 3 blocos a 390 px
  const tile=(lb,val,sub,act,on)=>`<${act?'button type="button" data-act="'+act+'"':'div'} class="rpT${on?' on':''}"><small>${lb}</small><b class="nw">${val}</b>${sub?`<em>${sub}</em>`:''}</${act?'button':'div'}>`;
  return `<div class="card rpCard">
    <div class="rpHead"><small>renda passiva</small><span class="rpPill">${R.mediaN&&R.mediaN<12?'desde '+esc(nomeMesMin(R.primeiro)):'últimos 12 meses'}</span></div>
    <div class="rpTop"><div class="rpMain"><b class="nw">${R.media!=null?brl(R.media):brl(R.mesAtual)}</b><small>${R.media!=null?'por mês, em média'+(R.mediaN<12?' ('+R.mediaN+(R.mediaN===1?' mês':' meses')+')':''):'recebido este mês'} · <span class="nw">${brl(R.tot12)}</span> em 12 meses</small></div>
      ${v?`<span class="plPill ${v.pct>=0?'pos':'neg'}" title="12 meses contra os 12 anteriores">${v.pct>=0?'▲ +':'▼ '}${OCULTO?'•••%':num(v.pct)+'%'} <em>vs ano anterior</em></span>`:''}</div>
    <div class="rpTiles">
      ${tile(esc(MESES_LONGO[+R.atual.slice(5,7)-1]),bt(R.mesAtual),'até hoje','rp-mes" data-id="'+R.atual,RP_VER==='mes'&&sel===R.atual)}
      ${tile('próximo mês',R.proj.tot>0?bt(R.proj.tot):'—','estimativa','rp-proj',RP_VER==='proj')}
    </div>
    <div class="rpChart">${rpBarsSVG(R,RP_VER==='mes'?sel:'')}
      <div class="rpHit">${R.meses.map(m=>`<button type="button" data-act="rp-mes" data-id="${m.ym}" class="${RP_VER==='mes'&&m.ym===sel?'on':''}" aria-label="${esc(nomeMesL(m.ym))}: ${brl(m.tot)}" aria-pressed="${RP_VER==='mes'&&m.ym===sel}"><span>${MESES[+m.ym.slice(5,7)-1]}</span></button>`).join('')}</div></div>
    ${R.media>0?`<p class="rpLeg"><i></i>média ${brl(R.media)}</p>`:''}
    <div class="rpDet" id="rpDet" aria-live="polite">${rpDetHTML(R,sel)}</div>
    ${R.fixas?`<div class="rpFx">${I('home')}<p>Sua renda passiva paga <b>${OCULTO?'•••%':R.fixas.pct>=100?'todas':Math.round(R.fixas.pct)+'%'}</b> das suas contas fixas de ${esc(nomeMesMin(R.atual))}${R.fixas.pct>=100&&!OCULTO?' (e sobra)':''} <span class="nw">(${brl(R.media)} de ${brl(R.fixas.tot)})</span>.</p></div>`:''}
    <p class="rpNota">FIIs, ações, ETFs e BDRs, pelo que você registrou como provento. O rendimento da renda fixa fica de fora.</p>
  </div>`;
}
function yocCardHTML(Y){
  if(!Y.lista.length)return '';
  const L=yocOrdena(Y.lista,YOC_ORD);
  const ords=[['yoc','YoC'],['dy','DY'],['rec','12 meses'],['az','A–Z']];
  const rows=L.map(x=>`<div class="yocRow" style="--tc:${TCOR[tipoOf(x.f)]||'var(--a1)'}">${assetIco(x.f.ticker,tipoOf(x.f))}
    <span class="yocN"><b>${esc(x.f.ticker)}${x.anualiz?` <em class="yocAn" title="menos de 12 meses na carteira: valor anualizado">anualizado · ${x.meses} ${x.meses===1?'mês':'meses'}</em>`:''}</b><small>${x.pm>0?'preço médio '+brl(x.pm):'sem preço médio'} · recebeu ${brl(x.recebido)}</small></span>
    <span class="yocV"><b>${rpPct(x.yoc)}</b><small>DY ${rpPct(x.dy)}${x.dy!=null&&!x.cot?'*':''}</small></span></div>`).join('');
  const manual=L.some(x=>x.dy!=null&&!x.cot);
  return `<div class="card yocCard">
    <div class="rpHead"><small>yield on cost</small><button type="button" class="yocInfo" data-act="yoc-info" aria-label="o que é yield on cost">${I('info')}</button></div>
    <div class="yocTop"><div><b>${rpPct(Y.yoc)}</b><small>da carteira sobre o que você pagou</small></div><div><b>${rpPct(Y.dy)}</b><small>dividend yield pelo preço de hoje</small></div></div>
    <div class="seg yocOrd" role="group" aria-label="ordenar por">${ords.map(([k,l])=>`<button type="button" data-act="yoc-ord" data-id="${k}" class="${YOC_ORD===k?'on':''}" aria-pressed="${YOC_ORD===k}">${l}</button>`).join('')}</div>
    <div class="yocList">${rows}</div>
    <p class="rpNota">Proventos dos últimos 12 meses por cota${manual?' · * preço digitado, não cotação':''}.</p>
  </div>`;
}
function yocInfo(){
  const box=$('#modal');
  box.innerHTML=`<div class="sheet yocSheet" role="dialog" aria-modal="true" aria-label="O que é yield on cost"><div class="sh-head"><h3>Yield on cost</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <p><b>Yield on cost (YoC)</b> é quanto os proventos rendem sobre o preço que <b>você pagou</b>. Pagou R$ 100 numa cota que pagou R$ 10 em 12 meses: YoC de 10%.</p>
    <p><b>Dividend yield (DY)</b> faz a mesma conta com o <b>preço de hoje</b>: mostra quanto renderia para quem comprasse agora.</p>
    <p>Se o YoC está acima do DY, você comprou mais barato do que a cota está hoje.</p>
    <p class="small">Conta com os proventos dos últimos 12 meses, por cota, usando as cotas que você tinha em cada pagamento. Ativo com menos de 12 meses na carteira tem o valor anualizado e aparece marcado. Não é garantia de que vai pagar igual.</p>
  </div>`;
  box.classList.add('on');
}
function rpAtualiza(){
  const card=document.querySelector('#view .rpCard');if(!card)return;
  const R=rpCalc(),tmp=document.createElement('div');tmp.innerHTML=rpCardHTML(R);card.replaceWith(tmp.firstElementChild);
}
function pctAloc(x){if(!(x>0))return '0%';if(x<1)return x<0.1?'<0,1%':num(x).replace(/0$/,'').replace(/,$/,'')+'%';return Math.round(x)+'%';}
function viewFii(){
  if(MVP_MODE)return viewFiiCarteira(''); // v10.160: Carteira + cotações + alertas numa tela só
  /* v10.155: Carteira | Radar */
  const nR=radarL().length;
  const modo=`<div class="seg rrModo" role="tablist" aria-label="Investimentos"><button type="button" role="tab" data-act="fmodo" data-id="carteira" class="${FMODO==='radar'?'':'on'}" aria-selected="${FMODO!=='radar'}">Carteira</button><button type="button" role="tab" data-act="fmodo" data-id="radar" class="${FMODO==='radar'?'on':''}" aria-selected="${FMODO==='radar'}">Radar${nR?`<span class="rrModoN">${nR}</span>`:''}</button></div>`;
  if(FMODO==='radar')return `<div class="head fiiHead"><h2>Investimentos</h2></div>${modo}${viewRadar()}`;
  return viewFiiCarteira(modo);
}
function viewFiiCarteira(modo){
  const pat=patrimonio(),dm=divMensal();
  const patFii=S.fiis.reduce((a,f)=>a+(tipoOf(f)==='fii'?f.cotas*f.preco:0),0);
  const yld=patFii?dm/patFii*100:0;
  const p=proximoPag();
  const filtrados=S.fiis.filter(f=>FTAB==='todos'||tipoOf(f)===FTAB);
  const comCusto=S.fiis.filter(f=>f.pago>0);
  const aplic=comCusto.reduce((a,f)=>a+cents(f.pago),0)/100,valCusto=comCusto.reduce((a,f)=>a+cents(f.cotas*f.preco),0)/100;
  const plT=c2(valCusto-aplic),plTp=aplic?plT/aplic*100:0;
  const semCusto=S.fiis.filter(f=>!(f.pago>0)&&f.cotas*f.preco>0).length;
  const temRV=S.fiis.some(f=>['fii','acao','etf','bdr'].includes(tipoOf(f)));
  const temFii=S.fiis.some(f=>tipoOf(f)==='fii');
  // alocação por tipo
  const aloc={};S.fiis.forEach(f=>{const t=tipoOf(f);aloc[t]=(aloc[t]||0)+f.cotas*f.preco;});
  const al=Object.keys(aloc).filter(t=>aloc[t]>0).sort((x,y)=>aloc[y]-aloc[x]);
  const barra=pat>0?`<div class="wAloc" role="img" aria-label="distribuição da carteira">${al.map(t=>`<i style="width:${aloc[t]/pat*100}%;background:${TCOR[t]||'var(--a1)'}"></i>`).join('')}</div>
    <div class="wLeg">${al.map(t=>`<span><i style="background:${TCOR[t]||'var(--a1)'}"></i>${TIPO_L[t]||t} <b>${pctAloc(aloc[t]/pat*100)}</b></span>`).join('')}</div>`:'';
  const plPill=(v,pc)=>`<span class="plPill ${v>=0?'pos':'neg'}">${v>=0?'▲ +':'▼ '}${brl(v)} <em>${num(pc)}%</em></span>`;
  const lista=filtrados.map(f=>{
    const t=tipoOf(f),cri=t==='cripto',rf=t==='rf';
    const posi=f.cotas*f.preco,dv=f.cotas*f.dpc,pl=posi-(f.pago||0),plp=f.pago?pl/f.pago*100:0;
    const ico=rf?`<span class="astIc" style="--tc:${TCOR.rf}">${I('bank')}</span>`:assetIco(f.ticker,t);
    const titulo=rf?esc(f.nome||f.ticker):esc(f.ticker);
    const sub=rf?'':esc(f.nome||'');
    let meta=[],info='';
    let chips=[],tagT=TIPO_L[t]||'FII';
    if(rf){
      const R=rfCardInfo(f,posi);meta=R.meta;info=R.info;chips=R.chips;tagT=R.tag;
    }else if(cri){
      meta.push(['quantidade',Number(f.cotas||0).toLocaleString('pt-BR',{maximumFractionDigits:8})+' '+esc(f.ticker)],['preço',brl(f.preco)]);
      if(f.pago>0)meta.push(['pago',brl(f.pago)]);
      info='cripto · '+esc(CG_ST.msg||'');
    }else{
      meta.push(['cotas',num(f.cotas).replace(/,00$/,'')],['cota',brl(f.preco)]);
      if(f.pago>0&&f.cotas>0)meta.push(['preço médio',brl(f.pago/f.cotas)]);
      if(t==='fii')meta.push(['renda/mês',brl(dv)]);else if(f.dpc)meta.push(['provento/cota',brl(f.dpc)]);
      if(f.diaPag)meta.push(['paga dia',String(f.diaPag)]);
      info=infoCot(f);
      if(f.ops&&f.ops.length)info+=' · '+f.ops.length+' operações'+(f.realizado?' · realizado '+brl(f.realizado):'')+(f.proventos?' · proventos '+brl(f.proventos):'');
    }
    return `<div class="ast hov" style="--tc:${TCOR[t]||'var(--a1)'}">
      <div class="astTop">${ico}
        <div class="astNm"><b>${titulo}</b><span class="astTag">${tagT}</span>${sub?`<small>${sub}</small>`:''}</div>
        <div class="astVal"><b>${brl(posi)}</b>${f.pago>0?plPill(pl,plp):''}</div>
      </div>
      ${meta.length?`<div class="astMeta${rf?' rfm':''}">${meta.map(([k,v])=>`<span><small>${k}</small><b>${v}</b></span>`).join('')}</div>`:''}
      ${chips.length?`<div class="rfChips">${chips.map(([k,txt,cl])=>`<span class="rfChip ${cl||''}">${k==='dia'?'<i></i>':''}${esc(txt)}</span>`).join('')}</div>`:''}
      ${rf&&rfIdxOf(f)!=='fixo'&&!(f.pluggyInv&&!f.manual)?`<div class="rfMov"><button class="btn2 sm" data-act="rf-ap" data-id="${f.id}">${I('plus')} aportar</button><button class="btn2 sm" data-act="rf-res" data-id="${f.id}">${I('down')} resgatar</button></div>`:''}
      <div class="astFoot"><small>${info}</small><div class="acts">${MVP_MODE&&!rf?rdBellHTML(f):''}${rf?'':`<button data-act="hist-fii" data-id="${f.id}" title="histórico de operações" aria-label="histórico de operações de ${esc(f.ticker)}">${I('list')}</button>`}<button data-act="edit-fii" data-id="${f.id}" title="editar" aria-label="editar">${I('edit')}</button><button data-act="del-fii" data-id="${f.id}" title="excluir" aria-label="excluir">${I('trash')}</button></div></div>
    </div>`;
  }).join('');
  const usados=new Set(S.fiis.map(tipoOf));
  const tabs=`<div class="seg ftabs">${TIPOS.filter(t=>t.k==='todos'||usados.has(t.k)||FTAB===t.k).map(t=>`<button data-act="ftab" data-id="${t.k}" class="${FTAB===t.k?'on':''}">${t.l}</button>`).join('')}</div>`;
  const cotAuto=COT.st==='auto';
  return `
  ${MVP_MODE?patHeadMVP():`<div class="head fiiHead"><h2>Investimentos</h2><button class="btn" data-act="novo-fii">+ ativo</button></div>`}
  ${modo}
  <div class="card wHero">
    <div class="wTop"><small>patrimônio investido</small><button class="wSt ${cotAuto?'on':''}" data-act="cot-now" title="atualizar cotações" aria-label="atualizar cotações"><i></i>${cotAuto?'cotações ao vivo':'valores manuais'}<span class="wRf">${I('cloud')}</span></button></div>
    <div class="wTot">${brl(pat)}</div>
    ${rendaPassivaHTML('rpaW')}
    ${aplic>0?`<div class="wPl">${plPill(plT,plTp)}<small>sobre ${brl(aplic)} aplicados${semCusto?` · ${semCusto} ${semCusto>1?'ativos sem':'ativo sem'} preço pago fora da conta`:''}</small></div>`:''}
    ${barra}
  </div>
  ${temRV||S.fiis.length?`<div class="wKpi${temRV?'':' semRV'}">
    ${temRV?`<div class="card mini wRenda"><small>renda mensal</small><b class="pos">${brl(dm)}</b><small class="wHint">${temFii?'yield '+num(yld)+'% ao mês':'só FIIs entram aqui'}</small></div>`:''}
    <div class="card mini wDk"><small>total aplicado</small><b>${brl(aplic)}</b><small class="wHint">custo das compras</small></div>
    <div class="card mini wDk"><small>resultado</small><b class="${plT>=0?'pos':'neg'}">${plT>0?'+':''}${brl(plT)}</b><small class="wHint">${aplic?(plTp>0?'+':'')+num(plTp)+'% no total':'sem preço médio'}</small></div>
    <div class="card mini wDk"><small>ativos</small><b>${S.fiis.length}</b><small class="wHint">${al.length} ${al.length===1?'tipo':'tipos'} na carteira</small></div>
  </div>`:''}
  ${p?provCardHTML(p)
     :temRV?'<p class="wTip">Cadastre o dia de pagamento dos fundos para ver a contagem até o próximo provento.</p>':''}
  ${S.fiis.length?(R=>rpCardHTML(R)+(R.temProv?yocCardHTML(yocCalc()):''))(rpCalc()):''}
  ${S.fiis.length?irCardHTML():''}
  <div class="wSec"><h3>Seus ativos <span>${filtrados.length}</span></h3></div>
  ${al.length>1||FTAB!=='todos'?tabs:''}
  <div class="astList">${filtrados.length?lista:'<div class="card"><p class="vazio">nenhum ativo nesta aba.</p></div>'}</div>${MVP_MODE?rdSecHTML():''}`;
}

/* ---------- v10.155: Radar (Investimentos) ----------
   Acompanhar ativos sem ter: ações, FIIs, ETFs, BDRs (B3) e cripto, com até 3 alertas cada (acima de R$ X, abaixo de R$ X,
   queda de X% no dia). Fica em S.cfg.radar (sincroniza chave a chave pelos ajustes, cfgTs). Formato de cada item:
     {t:'PETR4', k:'acao'|'fii'|'etf'|'bdr'|'cripto', cg:'bitcoin' (só cripto), n:'Petrobras PN', em:'AAAA-MM-DD',
      al:[{id:'a1', tp:'acima'|'abaixo'|'queda', v:40.5, g:<geração>, leg:'alvo|<fii>|<dir>|<preço>' (migrado)}]}
   Disparo: o servidor (função radar-precos, pg_cron) confere e grava em radar_disparos (chave 'r|b|PETR4|a1|g'); todos os
   aparelhos leem de lá e mostram "atingido em". Cada alerta dispara uma vez; "Reativar" (ou editar) troca a geração g.
   Cotações dos cartões (preço, variação do dia, 30 dias) vêm da mesma função, com o login da pessoa. */
const RD_MAX=30,RD_AL=3,RD_TIPOS=['acao','fii','etf','bdr','cripto'];
/* sem CRIPTO_LIST/B3_LIST aqui: sanea roda antes delas existirem (carregar() no começo do arquivo) */
function radarSaneia(r){
  if(!Array.isArray(r))return [];
  const out=[],vistos=new Set();
  for(const x of r){
    if(out.length>=RD_MAX)break;
    if(!x||typeof x!=='object')continue;
    const k=RD_TIPOS.includes(x.k)?x.k:'',t=String(x.t||'').toUpperCase().trim(),cri=k==='cripto';
    if(!k||(cri?!/^[A-Z0-9]{2,10}$/.test(t):!/^[A-Z0-9]{4,7}$/.test(t)))continue;
    const cg=cri?String(x.cg||''):'';if(cri&&!/^[a-z0-9-]{2,60}$/.test(cg))continue;
    const kk=(cri?'c|':'b|')+t;if(vistos.has(kk))continue;vistos.add(kk);
    const al=[],ids=new Set();
    (Array.isArray(x.al)?x.al:[]).forEach(a=>{
      if(al.length>=RD_AL||!a||typeof a!=='object')return;
      const tp=['acima','abaixo','queda'].includes(a.tp)?a.tp:'',v=Number(a.v),id=String(a.id||''),g=Math.floor(Number(a.g));
      if(!tp||!(v>0)||!isFinite(v)||(tp==='queda'&&v>=100)||!/^[a-z0-9]{1,12}$/.test(id)||ids.has(id)||!(g>=0)||!isFinite(g))return;
      ids.add(id);
      const o={id,tp,v:tp==='queda'?Math.round(v*100)/100:Math.round(v*1e8)/1e8,g};
      if(typeof a.leg==='string'&&/^alvo\|[\w-]{1,40}\|(acima|abaixo)\|[\d.]{1,16}$/.test(a.leg))o.leg=a.leg;
      al.push(o);
    });
    const it={t,k,n:String(x.n==null?'':x.n).replace(/[\u0000-\u001f]/g,'').slice(0,60),em:/^\d{4}-\d{2}-\d{2}$/.test(String(x.em||''))?x.em:'',al};
    if(cri)it.cg=cg;
    out.push(it);
  }
  return out;
}
let FMODO=(()=>{try{return localStorage.getItem('gv-fmodo')==='radar'?'radar':'carteira';}catch(e){return 'carteira';}})();
const RD_Q_KEY='gv-radar-q';
let RD_Q=(()=>{try{const c=JSON.parse(localStorage.getItem(RD_Q_KEY)||'null');return c&&c.q?c:{ts:0,q:{}};}catch(e){return {ts:0,q:{}};}})();
let RD_D={uid:'',ts:0,d:{}},RD_COT_RODANDO=false,RD_ST='';
const radarL=()=>Array.isArray(S.cfg.radar)?S.cfg.radar:[];
const rdCri=it=>it.k==='cripto';
const rdQKey=it=>rdCri(it)?'c:'+it.cg:it.t;
const rdChave=(it,a)=>'r|'+(rdCri(it)?'c':'b')+'|'+it.t+'|'+a.id+'|'+a.g;
function rdId(){return Math.random().toString(36).slice(2,8);}
function rdQ(it){const q=RD_Q.q[rdQKey(it)];if(q&&q.p>0)return q;
  /* reserva: preço que o app já tem (ativo da carteira ou cache do CoinGecko) */
  if(rdCri(it)){const p=cgCache().p[it.cg];return p>0?{p,varPct:null}:null;}
  const f=(S.fiis||[]).find(x=>x.ticker===it.t&&x.preco>0&&tipoOf(x)!=='cripto');
  return f?{p:f.preco,varPct:f.ant>0?(f.preco-f.ant)/f.ant*100:null}:null;}
function rdDisp(it,a){return RD_D.uid===(USER&&USER.id)?RD_D.d[rdChave(it,a)]||null:null;}
const rdPreco=p=>!(p>0)?'—':OCULTO?'R$ •••':p>=1?brl(p):'R$ '+Number(p).toLocaleString('pt-BR',{maximumSignificantDigits:4});
const rdPct=v=>(v>0?'+':v<0?'−':'')+Math.abs(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const rdNumTxt=v=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:v<1?8:2});
const rdValTxt=(v,tp)=>tp==='queda'?rdNumTxt(v):v>=1?Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):rdNumTxt(v);
function rdDataHora(iso){const d=new Date(iso);if(isNaN(d))return '';return pad(d.getDate())+'/'+pad(d.getMonth()+1)+' '+pad(d.getHours())+':'+pad(d.getMinutes());}
const RD_TL={acao:'Ação',fii:'FII',etf:'ETF',bdr:'BDR',cripto:'Cripto'};
function rdIco(it){return assetIco(it.t,it.k);}
/* lista de busca: B3_LIST + ativos da carteira + CRIPTO_LIST */
/* v10.156: todos os códigos da B3 (função radar-precos {lista:true}), guardados 7 dias. antes a busca só achava os ~50 da B3_LIST */
let RD_TODOS=null;
function rdTodos(){if(RD_TODOS)return RD_TODOS;try{const o=JSON.parse(localStorage.getItem('gv-b3-todos')||'null');if(o&&Array.isArray(o.t)&&Date.now()-o.ts<7*864e5)RD_TODOS=o.t.filter(x=>typeof x==='string'&&/^[A-Z0-9]{4}[0-9]{1,2}$/.test(x));}catch(e){}return RD_TODOS||[];}
let RD_TODOS_P=null;
function rdTodosBaixa(cb){if(rdTodos().length||RD_TODOS_P||!USER||!navigator.onLine)return;
  RD_TODOS_P=sb.functions.invoke('radar-precos',{body:{lista:true}}).then(({data:o})=>{if(o&&Array.isArray(o.t)&&o.t.length>100){RD_TODOS=o.t.filter(x=>typeof x==='string'&&/^[A-Z0-9]{4}[0-9]{1,2}$/.test(x));try{localStorage.setItem('gv-b3-todos',JSON.stringify({ts:Date.now(),t:RD_TODOS}));}catch(e){}if(cb)cb();}}).catch(()=>{}).finally(()=>{RD_TODOS_P=null;});}
function rdCatalogo(){
  const L=B3_LIST.map(x=>({t:x.t,k:x.tipo,n:x.n}));
  (S.fiis||[]).forEach(f=>{const k=tipoOf(f);if(k==='rf'||!f.ticker)return;if(k==='cripto'){return;}if(!L.some(x=>x.t===f.ticker))L.push({t:f.ticker,k,n:f.nome||''});});
  {const ja=new Set(L.map(x=>x.t));rdTodos().forEach(t=>{if(!ja.has(t))L.push({t,k:rdAdivinha(t),n:''});});}
  CRIPTO_LIST.forEach(x=>L.push({t:x.t,k:'cripto',n:x.n,cg:x.id}));
  return L;
}
/* tipo provável de um ticker digitado que não está na lista */
function rdAdivinha(t){if(/^[A-Z]{4}3[2-5]$/.test(t))return 'bdr';if(/^[A-Z]{4}11$/.test(t))return 'fii';return 'acao';}
function rdBusca(q,tp){
  q=norm(q).toUpperCase();const L=rdCatalogo().filter(x=>!tp||tp==='todos'||x.k===tp);
  if(!q)return L.slice(0,40);
  const comeca=[],contem=[];
  L.forEach(x=>{const nm=norm(x.n).toUpperCase();if(x.t.startsWith(q))comeca.push(x);else if(x.t.includes(q)||nm.includes(q))contem.push(x);});
  return comeca.concat(contem).slice(0,30);
}
/* ---------- cotações e disparos ---------- */
async function radarCota(forca){
  const L=radarL();if(!L.length||RD_COT_RODANDO||!USER||!navigator.onLine)return;
  const temB3=L.some(x=>!rdCri(x)),falta=L.some(x=>!RD_Q.q[rdQKey(x)]);
  const idade=Date.now()-RD_Q.ts,lim=temB3&&b3Aberta()?55e3:5*60e3;
  if(!forca&&!falta&&idade<lim)return;
  RD_COT_RODANDO=true;
  try{
    const {data:o,error}=await sb.functions.invoke('radar-precos',{body:{cotar:L.map(x=>({t:x.t,k:x.k,cg:x.cg}))}});
    if(error||!o||!o.q)throw error||new Error('sem cotações');
    const q=Object.assign({},RD_Q.q);
    Object.entries(o.q).forEach(([k,v])=>{if(v&&Number(v.p)>0)q[k]={p:+v.p,varPct:v.varPct==null||!isFinite(+v.varPct)?null:+v.varPct,serie:Array.isArray(v.serie)?v.serie.map(Number).filter(n=>n>0).slice(-31):(q[k]&&q[k].serie)||null,t:v.t||o.em||null};});
    RD_Q={ts:Date.now(),q};RD_ST='ok';
  }catch(e){
    /* reserva: B3 pela função cotacoes (sem histórico), cripto pelo CoinGecko do app */
    RD_ST='reserva';
    try{
      const b3=[...new Set(L.filter(x=>!rdCri(x)).map(x=>x.t))];
      if(b3.length){const {data:o}=await sb.functions.invoke('cotacoes',{body:{tickers:b3}});
        if(o&&o.q)Object.entries(o.q).forEach(([k,v])=>{if(v&&v.p>0)RD_Q.q[k]=Object.assign({},RD_Q.q[k]||{},{p:+v.p,varPct:v.varPct==null?null:+v.varPct,t:v.t||null});});}
      const cg=[...new Set(L.filter(rdCri).map(x=>x.cg))];
      if(cg.length){const p=await cgPrecos(cg,false);cg.forEach(id=>{if(p[id]>0)RD_Q.q['c:'+id]=Object.assign({},RD_Q.q['c:'+id]||{},{p:p[id]});});}
      RD_Q.ts=Date.now();
    }catch(x){}
  }finally{RD_COT_RODANDO=false;}
  try{localStorage.setItem(RD_Q_KEY,JSON.stringify(RD_Q));}catch(e){}
  if(rdNaTela()){if(!document.querySelector('#modal.on'))render();else RD_RENDER_PEND=true;} // v10.156: cotação que chegou com a busca/alertas abertos aparece ao fechar
}
var RD_RENDER_PEND=false;
/* disparos gravados pelo servidor (só leitura; RLS: as próprias linhas) */
async function radarDisparos(forca){
  if(!USER||!radarL().length||!navigator.onLine)return;
  if(!forca&&RD_D.uid===USER.id&&Date.now()-RD_D.ts<60e3)return;
  const uid0=USER.id;
  try{
    const {data,error}=await sb.from('radar_disparos').select('chave,em,preco').eq('user_id',uid0).limit(500);
    if(error||!Array.isArray(data)||!USER||USER.id!==uid0)return;
    const d={};data.forEach(r=>{if(r&&typeof r.chave==='string')d[r.chave]={em:String(r.em||''),preco:Number(r.preco)||0};});
    const mudou=JSON.stringify(d)!==JSON.stringify(RD_D.uid===uid0?RD_D.d:{});
    RD_D={uid:uid0,ts:Date.now(),d};
    if(mudou){try{atualizaSino();}catch(e){}if(rdNaTela()&&!document.querySelector('#modal.on'))render();}
  }catch(e){}
}
function radarAtualiza(forca){radarCota(forca);radarDisparos(forca);}
setInterval(()=>{if(rdNaTela()&&document.visibilityState==='visible')radarAtualiza(false);},60000);
function rdNaTela(){return TAB==='fii'&&(FMODO==='radar'||MVP_MODE);} // v10.160: no MVP o Radar mora dentro da carteira
/* ---------- migração do alerta antigo por ativo (fiis.alvoP/alvoDir, v10.111) ---------- */
function radarMigra(){
  let mudou=false;
  (S.fiis||[]).forEach(f=>{
    if(!(f.alvoP>0))return;
    const k=tipoOf(f);if(k==='rf')return;
    const t=String(f.ticker||'').toUpperCase(),cri=k==='cripto';
    if(cri?!(f.cgId&&/^[A-Z0-9]{2,10}$/.test(t)):!/^[A-Z0-9]{4,7}$/.test(t))return;
    const dir=f.alvoDir==='abaixo'?'abaixo':'acima',leg='alvo|'+f.id+'|'+dir+'|'+f.alvoP;
    if(!/^alvo\|[\w-]{1,40}\|(acima|abaixo)\|[\d.]{1,16}$/.test(leg))return;
    const L=radarL().slice();let it=L.find(x=>x.t===t&&(x.k==='cripto')===cri);
    if(!it){if(L.length>=RD_MAX)return;it={t,k,n:String(f.nome||'').slice(0,60),em:hojeISO(),al:[]};if(cri)it.cg=f.cgId;L.push(it);}
    if(!it.al.some(a=>a.leg===leg||(a.tp===dir&&a.v===f.alvoP))){if(it.al.length>=RD_AL)return;it.al=it.al.concat([{id:rdId(),tp:dir,v:f.alvoP,g:Date.now(),leg}]);}
    S.cfg.radar=radarSaneia(L);delete f.alvoP;delete f.alvoDir;mudou=true;
  });
  return mudou;
}
/* ---------- desenho ---------- */
function rdSpark(it,q){
  const s=q&&Array.isArray(q.serie)?q.serie.filter(n=>n>0):[];
  if(s.length<3)return `<div class="rrSpk vazio"><small>${q&&q.p>0?'histórico de 30 dias indisponível':'buscando cotação…'}</small></div>`;
  const W=300,H=56,P=3;
  const alvos=it.al.filter(a=>a.tp!=='queda'&&!rdDisp(it,a)).map(a=>a.v);
  let mn=Math.min(...s),mx=Math.max(...s);
  alvos.forEach(v=>{if(v>=mn*0.8&&v<=mx*1.2){mn=Math.min(mn,v);mx=Math.max(mx,v);}});
  if(mx-mn<mx*0.004){mx+=mx*0.004||1;mn-=mn*0.004||1;}
  const x=i=>P+(W-2*P)*i/(s.length-1),y=v=>P+(H-2*P)*(1-(v-mn)/(mx-mn));
  const d=s.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
  const sobe=s[s.length-1]>=s[0],cor=sobe?'var(--rrUp)':'var(--rrDn)',gid='rdg'+it.t+(rdCri(it)?'c':'');
  const linhas=alvos.filter(v=>v>=mn&&v<=mx).map(v=>`<line x1="${P}" x2="${W-P}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="rrAlvoL"/>`).join('');
  const var30=(s[s.length-1]-s[0])/s[0]*100;
  return `<div class="rrSpk" role="img" aria-label="30 dias: ${esc(rdPct(var30))}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${cor}" stop-opacity=".22"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/></linearGradient></defs>${linhas}<path d="${d} L${x(s.length-1).toFixed(1)} ${H} L${P} ${H}Z" fill="url(#${gid})"/><path d="${d}" fill="none" stroke="${cor}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="${x(s.length-1).toFixed(1)}" cy="${y(s[s.length-1]).toFixed(1)}" r="2.6" fill="${cor}"/></svg><span class="rrSpkL"><span>30 dias <b class="${var30>=0?'up':'dn'}">${esc(rdPct(var30))}</b></span>${linhas?'<em><i></i>seus alvos</em>':''}</span></div>`;
}
/* "quanto falta" até o alvo mais perto (só alertas ainda não atingidos) */
function rdRegua(it,q){
  const ativos=it.al.filter(a=>!rdDisp(it,a));
  if(!it.al.length)return `<button type="button" class="rrSem" data-act="rd-alertas" data-id="${esc(rdQKey(it))}">${I('bell')}<span>Crie um alerta de preço</span>${I('chevR')}</button>`;
  if(!ativos.length)return '';
  if(!q||!(q.p>0))return `<div class="rrReg"><div class="rrRegT"><span>esperando cotação</span></div><div class="rrBar"><i style="width:0"></i></div></div>`;
  const cand=ativos.map(a=>{
    if(a.tp==='queda'){const v=q.varPct;if(v==null)return {a,dist:99,fill:0,txt:'queda de '+rdNumTxt(a.v)+'% '+(rdCri(it)?'em 24 h':'no dia'),alvo:'variação indisponível'};
      const caiu=Math.max(0,-v);return {a,dist:Math.max(0,a.v-caiu),fill:Math.min(1,caiu/a.v),txt:caiu>=a.v?'caiu '+rdNumTxt(a.v)+'% ou mais':'faltam '+rdNumTxt(Math.round((a.v-caiu)*10)/10)+'% de queda',alvo:'alerta em −'+rdNumTxt(a.v)+'%',ok:caiu>=a.v};}
    const d=(a.v-q.p)/q.p*100,ok=a.tp==='acima'?q.p>=a.v:q.p<=a.v,dist=ok?0:Math.abs(d);
    return {a,dist,fill:ok?1:Math.max(0.04,1-dist/20),txt:ok?'chegou no alvo':'faltam '+rdNumTxt(Math.round(dist*10)/10)+'%',alvo:(a.tp==='acima'?'↑ ':'↓ ')+rdPreco(a.v),ok};
  }).sort((x,y)=>x.dist-y.dist);
  const c=cand[0],quase=!c.ok&&c.dist<=1.5;
  return `<div class="rrReg${c.ok?' ok':quase?' quase':''}"><div class="rrRegT"><span>${esc(c.txt)}${c.ok?' · confirmando…':''}</span><b>${esc(c.alvo)}</b></div><div class="rrBar" role="progressbar" aria-label="${esc(c.txt)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(c.fill*100)}"><i style="width:${(c.fill*100).toFixed(1)}%"></i></div></div>`;
}
function rdAlChip(it,a){
  const d=rdDisp(it,a),lab=a.tp==='queda'?'queda de '+rdNumTxt(a.v)+'% '+(rdCri(it)?'em 24 h':'no dia'):(a.tp==='acima'?'acima de ':'abaixo de ')+rdPreco(a.v);
  return `<span class="rrChip${d?' hit':''}">${d?I('check'):I(a.tp==='acima'?'up':'down')}${esc(lab)}</span>`;
}
function rdCardHTML(it){
  const q=rdQ(it),key=rdQKey(it),hits=it.al.filter(a=>rdDisp(it,a));
  const ult=hits.map(a=>({a,d:rdDisp(it,a)})).sort((x,y)=>String(y.d.em).localeCompare(String(x.d.em)))[0];
  const tem=(S.fiis||[]).some(f=>f.ticker===it.t&&(tipoOf(f)==='cripto')===rdCri(it));
  const vp=q&&q.varPct!=null&&isFinite(q.varPct)?q.varPct:null;
  return `<article class="rrC${hits.length?' temHit':''}" data-rk="${esc(key)}" style="--tc:${TCOR[it.k]||'var(--a1)'}">
    <div class="rrTop">${rdIco(it)}
      <div class="rrNm"><b>${esc(it.t)}</b><span class="astTag">${RD_TL[it.k]||''}</span><small>${esc([it.n||'',tem?'na carteira':''].filter(Boolean).join(' · '))}</small></div>
      <div class="rrPr"><b>${rdPreco(q&&q.p)}</b>${vp==null?'<small class="rrVar z">—</small>':`<small class="rrVar ${vp>=0?'up':'dn'}">${vp>=0?'▲':'▼'} ${esc(rdPct(vp).replace(/^[+−]/,''))}<em>${rdCri(it)?'24 h':'hoje'}</em></small>`}</div>
    </div>
    ${rdSpark(it,q)}
    ${ult?`<div class="rrHit">${I('check')}<span><b>Atingido em ${esc(rdDataHora(ult.d.em))}</b>${ult.d.preco>0?' · '+rdPreco(ult.d.preco):''}<small>${esc(ult.a.tp==='queda'?'queda de '+rdNumTxt(ult.a.v)+'% no dia':(ult.a.tp==='acima'?'acima de ':'abaixo de ')+rdPreco(ult.a.v))}</small></span><button type="button" class="rrReat" data-act="rd-reativa" data-id="${esc(key+'#'+ult.a.id)}">Reativar</button></div>`:''}
    ${rdRegua(it,q)}
    ${(L=>L.length?`<div class="rrChips">${L.map(a=>rdAlChip(it,a)).join('')}</div>`:'')(it.al.filter(a=>!ult||a!==ult.a))}
    <div class="rrFoot"><button type="button" class="rrB" data-act="rd-alertas" data-id="${esc(key)}">${I('bell')}<span>Alertas${it.al.length?' · '+it.al.length:''}</span></button><button type="button" class="rrB" data-act="rd-comprei" data-id="${esc(key)}">${I('plus')}<span>Comprei</span></button><button type="button" class="rrB ic" data-act="rd-remove" data-id="${esc(key)}" aria-label="parar de seguir ${esc(it.t)}" title="parar de seguir">${I('trash')}</button></div>
  </article>`;
}
const RD_RADAR_SVG='<svg class="rrRadarSvg" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" class="r1"/><circle cx="60" cy="60" r="38" class="r2"/><circle cx="60" cy="60" r="21" class="r3"/><path d="M60 60 L60 6 A54 54 0 0 1 106.8 33z" class="rrSweep"/><circle cx="60" cy="60" r="3.5" class="rc"/><circle cx="84" cy="34" r="4.5" class="p1"/><circle cx="37" cy="78" r="3.5" class="p2"/><circle cx="82" cy="86" r="3" class="p3"/></svg>';
function viewRadar(){
  const L=radarL();
  if(!L.length)return `<section class="rrVazio">
    ${RD_RADAR_SVG}
    <h3>Seu radar de oportunidades</h3>
    <p>Acompanhe ações, FIIs, ETFs, BDRs e cripto que você ainda não tem. Defina o preço que faz sentido pra você e o GranaViva avisa quando chegar.</p>
    <ul class="rrBen"><li>${I('bell')}<span><b>Alertas no celular</b> acima ou abaixo de um preço, ou queda forte no dia</span></li><li>${I('chart')}<span><b>30 dias num relance</b> preço, variação e quanto falta para o alvo</span></li><li>${I('plus')}<span><b>Comprou?</b> leve para a carteira com um toque</span></li></ul>
    <button type="button" class="btn rrCta" data-act="rd-busca">${I('search')}<span>Seguir um ativo</span></button>
    <div class="rrEx"><small>sugestões</small>${['PETR4','MXRF11','IVVB11','BTC'].map(t=>`<button type="button" data-act="rd-add-rapido" data-id="${t}">${t}</button>`).join('')}</div>
  </section>`;
  const nAl=L.reduce((a,x)=>a+x.al.filter(y=>!rdDisp(x,y)).length,0),nHit=L.reduce((a,x)=>a+x.al.filter(y=>rdDisp(x,y)).length,0);
  const temB3=L.some(x=>!rdCri(x));
  const st=RD_Q.ts?(temB3?(b3Aberta()?'B3 com até 15 min de atraso':'B3 fechada · último preço'):'cripto ao vivo')+' · '+pad(new Date(RD_Q.ts).getHours())+':'+pad(new Date(RD_Q.ts).getMinutes()):'buscando cotações…';
  return `<div class="rrHead"><div><b>${L.length} ${L.length===1?'ativo':'ativos'}</b><small>${nAl} ${nAl===1?'alerta ativo':'alertas ativos'}${nHit?` · <span class="rrHitN">${nHit} ${nHit===1?'atingido':'atingidos'}</span>`:''}</small></div><button type="button" class="btn2 sm rrAdd" data-act="rd-busca">${I('plus')}<span>Seguir</span></button></div>
  <button type="button" class="rrSt" data-act="rd-atualiza"><i class="${RD_ST==='reserva'?'res':RD_Q.ts?'on':''}"></i>${esc(st)}<span>${I('cloud')}</span></button>
  <div class="rrList">${L.map(rdCardHTML).join('')}</div>
  ${L.length>=RD_MAX?`<p class="small rrLim">Limite de ${RD_MAX} ativos no Radar.</p>`:''}`;
}
/* ---------- ações ---------- */
function rdAcha(key){return radarL().find(x=>rdQKey(x)===key);}
function rdSalva(L){S.cfg.radar=radarSaneia(L);salvar();}
function radarAdd(x){
  const L=radarL().slice();
  const t=String(x.t||'').toUpperCase();
  const ex=L.find(i=>i.t===t&&rdCri(i)===(x.k==='cripto'));
  if(ex)return ex;
  if(L.length>=RD_MAX){toast('Limite de '+RD_MAX+' ativos no Radar. Remova um para seguir outro.',true);return null;}
  const it={t,k:x.k,n:String(x.n||'').slice(0,60),em:hojeISO(),al:[]};if(x.k==='cripto')it.cg=x.cg;
  const s=radarSaneia([it])[0];if(!s){toast('Ticker inválido',true);return null;}
  L.unshift(s);rdSalva(L);
  setTimeout(()=>radarCota(true),30);
  return radarL().find(i=>rdQKey(i)===rdQKey(s));
}
function rdModoSet(m){FMODO=m==='radar'?'radar':'carteira';try{localStorage.setItem('gv-fmodo',FMODO);}catch(e){}render();if(FMODO==='radar')radarAtualiza(false);}
function radarBuscaAbre(){
  if(!pode('investimentos')){abrePlanos('investimentos');return;}
  const box=$('#modal');let tp='todos';
  const TPS=[['todos','Tudo'],['acao','Ações'],['fii','FIIs'],['etf','ETFs'],['bdr','BDRs'],['cripto','Cripto']];
  box.innerHTML=`<div class="sheet rrSh" role="dialog" aria-modal="true" aria-label="Seguir um ativo"><div class="sh-head"><h3>Seguir um ativo</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <label class="rrBusca"><span aria-hidden="true">${I('search')}</span><input id="rrQ" maxlength="20" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Ticker ou nome: PETR4, Vale, bitcoin…" aria-label="buscar ativo"></label>
    <div class="rrTps" role="radiogroup" aria-label="tipo">${TPS.map(([k,l],i)=>`<button type="button" role="radio" data-tp="${k}" class="${i?'':'on'}" aria-checked="${!i}">${l}</button>`).join('')}</div>
    <div class="rrSug" id="rrSug" role="listbox" aria-label="sugestões"></div>
    <p class="small rrNota">Cotações da B3 com até 15 min de atraso. Cripto pelo CoinGecko.</p></div>`;
  box.classList.add('on');
  const inp=$('#rrQ'),sug=$('#rrSug');
  const segue=x=>radarL().some(i=>i.t===x.t&&rdCri(i)===(x.k==='cripto'));
  const linha=x=>{const s=segue(x);return `<div class="rrSugR" role="option" aria-selected="false">${assetIco(x.t,x.k)}<div class="rrSugT"><b>${esc(x.t)}</b><small>${esc(x.n||'')}</small></div><span class="astTag">${RD_TL[x.k]}</span>${s?`<span class="rrJa">${I('check')}<span>seguindo</span></span>`:`<button type="button" class="rrFol" data-rs="${esc(x.t)}" data-rk="${x.k}" aria-label="seguir ${esc(x.t)}">${I('plus')}<span>Seguir</span></button>`}</div>`;};
  const pinta=()=>{
    const q=inp.value.trim().toUpperCase().replace(/[^A-Z0-9 À-ÿ.-]/gi,'');
    const L=rdBusca(q,tp);
    let extra='';
    const tk=q.replace(/\s/g,'');
    if(tp!=='cripto'&&/^[A-Z]{4}[0-9]{1,2}[A-Z]?$/.test(tk)&&!L.some(x=>x.t===tk&&x.k!=='cripto')){const k=tp!=='todos'?tp:rdAdivinha(tk);extra=linha({t:tk,k,n:'código digitado'});}
    sug.innerHTML=extra+L.map(linha).join('')||`<p class="small rrNada">Nada encontrado. Digite o código da B3 (ex.: ${tp==='fii'?'HGLG11':'PETR4'}).</p>`;
  };
  inp.addEventListener('input',pinta);
  rdTodosBaixa(()=>{if(inp.isConnected)pinta();});
  box.querySelector('.rrTps').addEventListener('click',e=>{const b=e.target.closest('[data-tp]');if(!b)return;tp=b.dataset.tp;box.querySelectorAll('.rrTps button').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-checked',on);});pinta();});
  sug.addEventListener('click',e=>{const b=e.target.closest('[data-rs]');if(!b)return;
    const t=b.dataset.rs,k=b.dataset.rk,c=k==='cripto'?CRIPTO_LIST.find(x=>x.t===t):null,bl=B3_LIST.find(x=>x.t===t);
    const it=radarAdd({t,k,cg:c&&c.id,n:c?c.n:bl?bl.n:((S.fiis||[]).find(f=>f.ticker===t)||{}).nome||''});
    if(!it)return;closeModal();render();toast(it.t+' entrou no seu Radar');setTimeout(()=>radarAlertasAbre(rdQKey(it),true),250);});
  pinta();setTimeout(()=>{try{inp.focus({preventScroll:true});}catch(e){}},80);
}
function radarAlertasAbre(key,novo,atual){
  if(!pode('investimentos')){abrePlanos('investimentos');return;}
  const it=rdAcha(key);if(!it)return;
  const q=rdQ(it),p=q&&q.p>0?q.p:0;
  let A=it.al.map(a=>Object.assign({},a));
  const box=$('#modal');
  const sug=[['acima',5],['abaixo',5],['queda',3]];
  const linha=(a,i)=>{const d=rdDisp(it,a);
    const ref=p>0&&a.tp!=='queda'&&a.v>0?((a.v-p)/p*100):null;
    return `<div class="rrAl${d?' hit':''}" data-i="${i}">
      <div class="rrAlTop"><div class="seg rrAlTp" role="radiogroup" aria-label="tipo do alerta ${i+1}">${[['acima','Acima de'],['abaixo','Abaixo de'],['queda','Queda no dia']].map(([k,l])=>`<button type="button" role="radio" data-tp="${k}" class="${a.tp===k?'on':''}" aria-checked="${a.tp===k}">${l}</button>`).join('')}</div><button type="button" class="rrAlDel" data-del="${i}" aria-label="remover alerta ${i+1}">${I('trash')}</button></div>
      <label class="rrAlV${a.tp==='queda'?' q':''}">${a.tp==='queda'?'':`<span class="rrUn">R$</span>`}<input inputmode="decimal" data-v="${i}" value="${a.vTxt!=null?esc(a.vTxt):a.v>0?esc(rdValTxt(a.v,a.tp)):''}" placeholder="${a.tp==='queda'?'3':p>0?esc(rdNumTxt(Math.round(p*(a.tp==='acima'?1.05:0.95)*100)/100)):'0,00'}" aria-label="valor do alerta ${i+1}">${a.tp==='queda'?'<span class="rrUn">% de queda</span>':''}</label>
      <small class="rrAlH">${a.tp==='queda'?(rdCri(it)?'variação nas últimas 24 h':'variação desde o fechamento de ontem'):ref==null?'':(Math.abs(ref)<0.005?'igual ao preço de agora':esc(rdPct(ref))+' do preço de agora')}</small>
      ${d?`<div class="rrAlHit">${I('check')}<span>Atingido em ${esc(rdDataHora(d.em))}${d.preco>0?' · '+rdPreco(d.preco):''}</span><button type="button" class="rrReat" data-reat="${i}">Reativar</button></div>`:''}
    </div>`;};
  const pinta=()=>{
    box.querySelector('#rrAls').innerHTML=A.length?A.map(linha).join(''):`<p class="small rrAlVz">Nenhum alerta ainda. Escolha um atalho abaixo ou toque em “Adicionar alerta”.</p>`;
    box.querySelector('#rrAlAdd').hidden=A.length>=RD_AL;
    box.querySelector('#rrAlSug').hidden=A.length>=RD_AL;
    box.querySelector('#rrAlN').textContent=A.length+' de '+RD_AL;
  };
  const vp=q&&q.varPct!=null?q.varPct:null;
  box.innerHTML=`<div class="sheet rrSh rrAlSh" role="dialog" aria-modal="true" aria-label="Alertas de ${esc(it.t)}"><div class="sh-head"><h3>Alertas · ${esc(it.t)}</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <div class="rrAlAt">${rdIco(it)}<div><small>preço agora</small><b>${rdPreco(p)}</b></div>${vp==null?'':`<span class="rrVar ${vp>=0?'up':'dn'}">${vp>=0?'▲':'▼'} ${esc(rdPct(vp).replace(/^[+−]/,''))}<em>${rdCri(it)?'24 h':'hoje'}</em></span>`}</div>
    <div class="rrAlCab"><span>Seus alertas</span><small id="rrAlN"></small></div>
    <div id="rrAls"></div>
    <div class="rrAlSug" id="rrAlSug">${sug.map(([tp,v])=>`<button type="button" data-sg="${tp}|${v}">${tp==='queda'?I('down'):I(tp==='acima'?'up':'down')}<span>${tp==='queda'?'queda de '+v+'% no dia':(tp==='acima'?'+':'−')+v+'% do preço'}</span></button>`).join('')}</div>
    <button type="button" class="btn2 full rrAlAddB" id="rrAlAdd">${I('plus')}<span>Adicionar alerta</span></button>
    <p class="small rrAlNota">Cada alerta avisa uma vez. Ações, FIIs, ETFs e BDRs são conferidos a cada 15 min no pregão (cotação com até 15 min de atraso); cripto, de hora em hora.${notifOn('alvoPreco')?'':' <b>As notificações de alerta de preço estão desligadas em Ajustes › Notificações.</b>'}</p>
    <button type="button" class="btn full" id="rrAlOk">Salvar alertas</button></div>`;
  box.classList.add('on');
  const lerV=()=>{box.querySelectorAll('[data-v]').forEach(i=>{const a=A[+i.dataset.v];if(a)a.vTxt=i.value;});};
  box.querySelector('#rrAls').addEventListener('click',e=>{
    const tb=e.target.closest('[data-tp]');
    if(tb){lerV();const i=+tb.closest('.rdAl').dataset.i;if(A[i].tp!==tb.dataset.tp){A[i].tp=tb.dataset.tp;A[i].v=0;A[i].vTxt='';}pinta();return;}
    const dl=e.target.closest('[data-del]');if(dl){lerV();A.splice(+dl.dataset.del,1);pinta();return;}
    const re=e.target.closest('[data-reat]');if(re){lerV();const a=A[+re.dataset.reat];a.g=Date.now();a.reat=1;pinta();toast('Alerta reativado: salve para valer');}
  });
  box.querySelector('#rrAls').addEventListener('input',e=>{const i=e.target.closest('[data-v]');if(!i)return;const a=A[+i.dataset.v];a.vTxt=i.value;
    if(a.tp!=='queda'&&p>0){const v=parseBR(i.value),h=i.closest('.rrAl').querySelector('.rrAlH');if(h)h.textContent=v>0?(Math.abs((v-p)/p*100)<0.005?'igual ao preço de agora':rdPct((v-p)/p*100)+' do preço de agora'):'';}});
  const cabeAl=()=>cabeNoPlano('radar',rdAlertasAtivos(it)+A.filter(a=>!rdDisp(it,a)).length); // v10.161: Grátis = 1 alerta ativo (somando todos os ativos e o sino)
  box.querySelector('#rrAlAdd').onclick=()=>{lerV();if(A.length>=RD_AL)return;if(!cabeAl())return;A.push({id:rdId(),tp:A.some(a=>a.tp==='acima')?'abaixo':'acima',v:0,g:0,novo:1});pinta();const ins=box.querySelectorAll('[data-v]');const l=ins[ins.length-1];if(l)l.focus();};
  box.querySelector('#rrAlSug').onclick=e=>{const b=e.target.closest('[data-sg]');if(!b)return;lerV();if(A.length>=RD_AL)return;if(!cabeAl())return;const [tp,v]=b.dataset.sg.split('|');
    const val=tp==='queda'?+v:p>0?Math.round(p*(tp==='acima'?1+v/100:1-v/100)*(p<1?1e6:100))/(p<1?1e6:100):0;A.push({id:rdId(),tp,v:val,vTxt:val?rdValTxt(val,tp):'',g:0,novo:1});pinta();};
  box.querySelector('#rrAlOk').onclick=()=>{
    lerV();const out=[];
    for(let i=0;i<A.length;i++){const a=A[i];const v=a.vTxt!=null?parseBR(String(a.vTxt)):a.v;
      if(!(v>0)){toast('Informe o valor do alerta '+(i+1)+'.',true);const el=box.querySelector('[data-v="'+i+'"]');if(el)el.focus();return;}
      if(a.tp==='queda'&&v>=100){toast('A queda no dia vai de 0,1% a 99%.',true);return;}
      if(atual&&a.novo&&p>0&&(a.tp==='acima'?v<=p:a.tp==='abaixo'?v>=p:false)){toast('O alvo '+(i+1)+' já foi alcançado pelo preço de agora ('+rdPreco(p)+'). Ajuste o valor para ele avisar no futuro.',true);const el=box.querySelector('[data-v="'+i+'"]');if(el)el.focus();return;}
      const orig=it.al.find(x=>x.id===a.id),mudou=!orig||orig.tp!==a.tp||Math.abs(orig.v-v)>1e-9;
      const o={id:a.id,tp:a.tp,v,g:mudou||a.reat||!(a.g>0)?Date.now()+i:a.g};
      if(a.leg&&!mudou)o.leg=a.leg; // alerta migrado sem mudança continua com a chave antiga (não avisa de novo)
      out.push(o);}
    { const p0=planoAgora(),lim=p0&&window.GVP?GVP.limite(p0.nivel,'max_alertas_radar'):-1;
      const depois=rdAlertasAtivos(it)+out.filter(o=>!rdDisp(it,o)).length,antes=rdAlertasAtivos(null);
      if(lim!==-1&&depois>lim&&depois>antes){abrePaywall('radar');return;} } // v10.161: diminuir sempre pode
    const L=radarL().map(x=>x===it?Object.assign({},x,{al:out}):x);
    rdSalva(L);closeModal();render();toast(out.length?'Alertas de '+it.t+' salvos':'Alertas de '+it.t+' removidos');
  };
  if(novo&&!A.length&&!cabeNoPlano('radar',rdAlertasAtivos(it)))return; // v10.161: já tem o alerta do Grátis -> aviso do Pro
  if(novo&&!A.length&&p>0){A.push({id:rdId(),tp:'acima',v:Math.round(p*(atual?1:1.05)*(p<1?1e6:100))/(p<1?1e6:100),g:0,novo:1});A[0].vTxt=rdValTxt(A[0].v,'acima');} // v10.160: pelo sino, começa no preço de agora
  pinta();
}
function rdReativa(arg){
  const [key,id]=String(arg||'').split('#');const it=rdAcha(key);if(!it)return;
  const L=radarL().map(x=>x===it?Object.assign({},x,{al:x.al.map(a=>a.id===id?Object.assign({},a,{g:Date.now()}):a)}):x);
  rdSalva(L);render();toast('Alerta reativado: avisa de novo quando chegar no preço');
}
function rdRemove(key){
  const it=rdAcha(key);if(!it)return;
  confirma({titulo:'Parar de seguir '+it.t+'?',texto:it.al.length?'Os '+it.al.length+(it.al.length>1?' alertas':' alerta')+' deste ativo também saem do Radar.':'O ativo sai do seu Radar.',ok:'Parar de seguir',perigo:true},()=>{rdSalva(radarL().filter(x=>x!==it));render();toast(it.t+' saiu do Radar');});
}
/* "Comprei": já tem o ativo -> registra a compra no histórico; não tem -> abre o cadastro do ativo já preenchido */
function rdComprei(key){
  const it=rdAcha(key);if(!it)return;
  const f=(S.fiis||[]).find(x=>x.ticker===it.t&&(tipoOf(x)==='cripto')===rdCri(it)&&tipoOf(x)!=='rf');
  if(f){opForm(f.id,'compra');return;}
  fiiForm(null,it.k);
  const mf=$('#mf');if(!mf)return;
  const inp=mf.querySelector('input[name="ticker"]');if(inp){inp.value=it.t;inp.dispatchEvent(new Event('change',{bubbles:true}));}
  const q=rdQ(it),pr=mf.querySelector('[name="preco"]');if(pr&&q&&q.p>0&&!rdCri(it)&&!pr.value)pr.value=num(Math.round(q.p*100)/100);
  const ab=mf.querySelector('[name="cotas"]');if(ab)setTimeout(()=>{try{ab.focus();}catch(e){}},60);
}
/* alerta de preço antigo no cartão do ativo -> Radar */
function rdDoAtivo(fid){
  const f=(S.fiis||[]).find(x=>x.id===fid);if(!f)return;
  const k=tipoOf(f);if(k==='rf')return;
  const it=radarAdd({t:f.ticker,k,cg:f.cgId,n:f.nome||''});if(!it)return;
  radarAlertasAbre(rdQKey(it),!it.al.length);
}
/* sino: alertas que o servidor marcou como atingidos (últimos 7 dias) */
function rdAvisos(){
  const out=[];if(!notifOn('alvoPreco'))return out;
  const lim=Date.now()-7*864e5;
  radarL().forEach(it=>it.al.forEach(a=>{const d=rdDisp(it,a);if(!d||!(new Date(d.em).getTime()>lim))return;
    out.push({id:rdChave(it,a),k:'aviso',h:`${I(a.tp==='acima'?'up':'down')} <b>${esc(it.t)}</b> ${a.tp==='queda'?'caiu mais de '+esc(rdNumTxt(a.v))+'% no dia':(a.tp==='acima'?'chegou acima de ':'chegou abaixo de ')+rdPreco(a.v)}${d.preco>0?' ('+rdPreco(d.preco)+')':''} · ${esc(rdDataHora(d.em))} <button class="btn2 sm" data-act="rd-ver" data-id="${esc(rdQKey(it))}">ver no Radar</button>`});}));
  return out;
}
function rdVer(){closeModal();if(MVP_MODE){if(TAB!=='fii')go('fii');setTimeout(()=>{const e=document.getElementById('rdSec')||document.querySelector('.astBell.hit');if(e)e.scrollIntoView({block:'center'});},120);return;}if(TAB!=='fii')go('fii');rdModoSet('radar');}

function updCountdown(){
  const el=document.getElementById('cd');if(!el)return;
  const ms=Number(el.dataset.date)-Date.now();
  if(ms<=0){el.textContent='hoje';return;}
  const d=Math.floor(ms/864e5),h=Math.floor(ms%864e5/36e5),mi=Math.floor(ms%36e5/6e4);
  el.textContent=d+'d '+pad(h)+'h '+pad(mi)+'min';
}
setInterval(()=>{if(TAB==='fii')updCountdown();},30000);

/* patrimônio líquido = contas + investimentos + bens − (cartões em aberto + dívidas) */
const BEM_L={imovel:'imóvel',veiculo:'veículo',outro:'outro bem'},PAS_L={emprestimo:'empréstimo',financiamento:'financiamento',divida:'dívida',outro:'outro'};
function patLiquido(){
  const contas=saldoTotal();
  const inv=patrimonio(),bens=(S.bens||[]).reduce((a,b)=>a+cents(b.valor),0)/100;
  const cartoes=S.cartoes.reduce((a,c)=>a+cents(usadoCartaoTotal(c)),0)/100;
  const dividas=(S.passivos||[]).reduce((a,p)=>a+cents(p.saldo),0)/100;
  const rec=empAbertoTotal(),mts=mtReservado(); // v10.87: o que saiu das contas para metas (guardei) continua no patrimônio
  const ativos=(cents(Math.max(0,contas))+cents(inv)+cents(bens)+cents(rec)+cents(mts))/100,passivos=(cents(cartoes)+cents(dividas)+cents(Math.max(0,-contas)))/100;
  const r={contas,inv,bens,rec,cartoes,dividas,ativos,passivos,liq:(cents(ativos)-cents(passivos))/100};if(mts>0)r.metas=mts;return r;
}
function fotoPat(){
  if(!S.patHist)S.patHist={};
  const p=patLiquido(),m=mesAtual(),v={a:c2(p.ativos),p:c2(p.passivos)},o=S.patHist[m];
  if(!o||o.a!==v.a||o.p!==v.p)S.patHist[m]=v;
}
function viewPat(){
  const P=patLiquido();
  const H=Object.keys(S.patHist||{}).sort().slice(-12).map(k=>({m:k,a:S.patHist[k].a,p:S.patHist[k].p,l:c2(S.patHist[k].a-S.patHist[k].p)}));
  const ant=H.length>1?H[H.length-2]:null,dif=ant?c2(P.liq-ant.l):null;
  const mx=Math.max(1,...H.map(h=>Math.abs(h.l)));
  const evo=H.length?H.map(h=>`<div class="ohRow"><span class="ohM">${MESES[+h.m.slice(5,7)-1]}/${h.m.slice(2,4)}</span><span class="ohBars"><i class="g ${h.l<0?'over':''}" style="width:${Math.abs(h.l)/mx*100}%"></i></span><span class="ohV">${brl(h.l)}</span></div>`).join(''):'';
  const linha=(l,v,cls)=>`<div class="row" style="margin-top:6px"><span class="small" style="margin:0">${l}</span><b class="${cls||''}">${brl(v)}</b></div>`;
  const bens=(S.bens||[]).map(b=>`<div class="card hov"><div class="row"><span><b>${esc(b.nome)}</b><br><small class="small" style="margin:0">${BEM_L[b.tipo]}</small></span><b class="pos">${brl(b.valor)}</b></div>
    <div class="acts2"><button class="btn2" data-act="edit-bem" data-id="${b.id}">editar</button><button class="btn2 danger" data-act="del-bem" data-id="${b.id}">excluir</button></div></div>`).join('');
  const pas=(S.passivos||[]).map(p=>{const jm=p.juros?cents(p.saldo*p.juros/100)/100:0;
    const info=[PAS_L[p.tipo],p.parcela?'parcela '+brl(p.parcela):'',p.restantes?p.restantes+' parcelas restantes':'',p.juros?num(p.juros)+'% a.m. ≈ '+brl(jm)+' de juros/mês':''].filter(Boolean).join(' · ');
    return `<div class="card hov"><div class="row"><span><b>${esc(p.nome)}</b><br><small class="small" style="margin:0">${esc(info)}</small></span><b class="neg">${brl(p.saldo)}</b></div>
    <div class="acts2"><button class="btn2" data-act="edit-pas" data-id="${p.id}">editar</button><button class="btn2 danger" data-act="del-pas" data-id="${p.id}">excluir</button></div></div>`;}).join('');
  const parcelas=(S.passivos||[]).reduce((a,p)=>a+cents(p.parcela),0)/100;
  const pctD=P.ativos>0?Math.round(P.passivos/P.ativos*100):null;
  const st=pctD==null?(P.passivos>0?['alto','dívidas sem ativos']:null):pctD<30?['ok','saudável · dívidas '+pctD+'% dos ativos']:pctD<60?['warn','atenção · dívidas '+pctD+'% dos ativos']:['alto','alto · dívidas '+pctD+'% dos ativos'];
  const SH='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>';
  const bp=brlParts(P.liq),totA=P.ativos||0;
  const PT_ACT={'Investimentos':'nav-fii','Contas':'nav-contas','Saldo':'nav-contas','A receber (empréstimos)':'emp-lista','Cartões':'nav-cartoes','Contas no negativo':'nav-contas'};
  const ptA=l=>PT_ACT[l]?` tap" data-act="${PT_ACT[l]}" role="button" tabindex="0" aria-label="abrir ${esc(l)}`:'';
  const itA=(ic,c,l,v)=>{const pc=totA>0?Math.max(0,v)/totA*100:0;return `<div class="ptRow${ptA(l)}"><span class="ptIc" style="--c:${c}">${I(ic)}</span><div class="ptMid"><b>${l}</b><span class="ptBar"><i style="width:${pc>0?Math.max(1.5,pc):0}%;background:${c}"></i></span></div><div class="ptV ${v>0?'':'z'}"><b class="pv">${brl(v)}</b><small>${String(Math.round(pc*10)/10).replace('.',',')}%</small></div></div>`;};
  const itP=(ic,c,l,sub,v)=>`<div class="ptRow${ptA(l)}"><span class="ptIc" style="--c:${c}">${I(ic)}</span><div class="ptMid"><b>${l}</b>${sub?`<small>${sub}</small>`:''}</div><div class="ptV ${v>0?'neg':'z'}"><b class="pv">${brl(v)}</b></div></div>`;
  return `
  <div class="head"><h2>Patrimônio</h2></div>
  <div class="ptHero${P.liq<0?' ptNeg':''}">
    <div class="ptLb">patrimônio líquido</div>
    <div class="ptBig pv">${bp.s}R$ ${bp.i}<small>${bp.d}</small></div>
    ${st?`<span class="ptChip ${st[0]}">${SH}<span>${st[1]}</span></span>`:''}
    ${dif!=null?`<div class="ptDif">${dif>=0?'+':''}${brl(dif)} desde ${MESES[+ant.m.slice(5,7)-1]}</div>`:''}
    <div class="ptSplit"><div><span>você tem</span><b class="pv">${brl(P.ativos)}</b></div><div><span>você deve</span><b class="pv">${brl(P.passivos)}</b></div></div>
  </div>
  ${(h=>h?`<div class="card rpaCard tap" data-act="nav-fii" role="button" tabindex="0" aria-label="abrir investimentos">${h}</div>`:'')(rendaPassivaHTML('rpaPt'))}
  <div class="ptGrid"><div class="card ptCard"><div class="ptHd"><span class="ptT">O que você tem</span><button class="ptAdd" data-act="novo-bem">+ bem</button></div>
    ${itA('chart','#a3e635','Investimentos',P.inv)}${itA('wallet','#22d3ee',S.bancos.length?'Contas':'Saldo',Math.max(0,P.contas))}${itA('casa','#a78bfa','Bens',P.bens)}${P.rec>0?itA('handCoins','#fbbf24','A receber (empréstimos)',P.rec):''}</div>
  <div class="card ptCard"><div class="ptHd"><span class="ptT">O que você deve</span><button class="ptAdd" data-act="novo-pas">+ dívida</button></div>
    ${itP('card','#f87171','Cartões','faturas e parcelas a vencer',P.cartoes).replace(/<span class="ptIc" style="--c:#f87171">[\s\S]*?<\/span>/,m=>cartoesAtivos().length?'<span class="ptIc ptCc" aria-hidden="true">'+cartoesAtivos().slice(0,2).map(c=>cartaoMini(c)).join('')+'</span>':m)}${itP('receipt','#fb923c','Dívidas e empréstimos',parcelas?'parcelas: '+brl(parcelas)+'/mês':'',P.dividas)}${P.contas<0?itP('bank','#f43f5e','Contas no negativo','',-P.contas):''}</div>
  </div>
  ${evo?`<div class="card"><h4 style="margin:0 0 10px">Evolução do patrimônio líquido</h4>${evo}</div>`:''}
  <div class="ptGrid"><div><div class="head" style="margin-top:8px"><h3 style="margin:0">Bens</h3><button class="btn2" data-act="novo-bem">+ bem</button></div>
  ${bens||'<div class="card"><p class="vazio">imóvel, carro ou outro bem que entra no patrimônio.</p></div>'}</div>
  <div><div class="head" style="margin-top:8px"><h3 style="margin:0">Dívidas e empréstimos</h3><button class="btn2" data-act="novo-pas">+ dívida</button></div>
  ${pas||'<div class="card"><p class="vazio">empréstimo, financiamento ou outra dívida (o cartão já entra automaticamente).</p></div>'}</div></div>`;
}
function bemForm(id){
  const b=(S.bens||[]).find(x=>x.id===id)||{};
  form(id?'Editar bem':'Novo bem',[
    {name:'nome',label:'Nome',value:b.nome||'',required:true,placeholder:'ex.: carro, apartamento'},
    {name:'tipo',label:'Tipo',type:'select',value:b.tipo||'veiculo',options:Object.entries(BEM_L).map(([v,t])=>({v,t}))},
    {name:'valor',label:'Valor atual estimado (R$)',value:b.valor?num(b.valor):'',inputmode:'decimal',required:true,placeholder:'0,00'}
  ],v=>{const nome=String(v.nome).trim().slice(0,80),val=parseBR(v.valor);
    if(!nome)return 'Dê um nome.';if(!(val>0))return 'Valor inválido.';
    if(!S.bens)S.bens=[];
    if(id){Object.assign(b,{nome,tipo:v.tipo,valor:c2(val)});}else S.bens.push({id:uid(),nome,tipo:v.tipo,valor:c2(val)});
    salvar();render();toast('Bem salvo');});
}
function pasForm(id){
  const p=(S.passivos||[]).find(x=>x.id===id)||{};
  form(id?'Editar dívida':'Nova dívida',[
    {name:'nome',label:'Nome',value:p.nome||'',required:true,placeholder:'ex.: empréstimo do banco'},
    {name:'tipo',label:'Tipo',type:'select',value:p.tipo||'emprestimo',options:Object.entries(PAS_L).map(([v,t])=>({v,t}))},
    {name:'saldo',label:'Quanto falta pagar hoje (R$)',value:p.saldo?num(p.saldo):'',inputmode:'decimal',required:true,placeholder:'0,00'},
    {name:'parcela',label:'Parcela mensal (R$, opcional)',value:p.parcela?num(p.parcela):'',inputmode:'decimal',placeholder:'0,00'},
    {name:'restantes',label:'Parcelas restantes (opcional)',value:p.restantes||'',inputmode:'numeric',placeholder:'0'},
    {name:'juros',label:'Juros ao mês em % (opcional)',value:p.juros?num(p.juros):'',inputmode:'decimal',placeholder:'0,00'}
  ],v=>{const nome=String(v.nome).trim().slice(0,80),saldo=parseBR(v.saldo),parc=v.parcela?parseBR(v.parcela):0,jr=v.juros?parseBR(v.juros):0,rest=v.restantes?parseInt(String(v.restantes).replace(/\D/g,''),10)||0:0;
    if(!nome)return 'Dê um nome.';if(!(saldo>=0)||isNaN(saldo))return 'Valor inválido.';if(isNaN(parc)||parc<0||isNaN(jr)||jr<0||jr>100)return 'Confira parcela e juros.';
    if(!S.passivos)S.passivos=[];
    const d={nome,tipo:v.tipo,saldo:c2(saldo),parcela:c2(parc),juros:jr,restantes:Math.min(600,rest)};
    if(id)Object.assign(p,d);else S.passivos.push(Object.assign({id:uid()},d));
    salvar();render();toast('Dívida salva');});
}
/* v10.14: ritmo de economia = média do que sobrou (receitas − despesas pagas) nos últimos 3 meses fechados com movimento */
function ritmoEconomia(){
  const ms=[1,2,3].map(k=>mesOff(k)).filter(m=>{const r=resumoMes(m);return r.rec||r.des;});
  if(!ms.length)return null;
  const tot=ms.reduce((a,m)=>a+cents(resumoMes(m).sal),0)/100;
  return {media:tot/ms.length,n:ms.length,ult:resumoMes(mesOff(1)).sal,mesUlt:mesOff(1)};
}
/* v10.89: UM número só para "quanto sobra por mês", usado na aba Metas ("seu ritmo de economia") e no Planejamento
   (bloco "E se…" e "Metas no ritmo da projeção"). Antes eram dois números que não batiam:
   - Metas: média do que sobrou (receitas − despesas pagas) nos últimos 3 meses fechados com movimento;
   - Planejamento ("folga por mês"): o menor (saldo projetado no fim do mês k ÷ k). Esse dividia o dinheiro que JÁ está
     na conta pelos meses (R$ 9 mil parados viravam "R$ 3 mil por mês" em 3 meses) e só enxergava contas fixas e
     previstos, sem mercado, delivery e o resto do dia a dia que ainda não foi lançado. Ele dizia quanto dá para
     gastar a mais até zerar, não quanto você consegue guardar todo mês.
   Ficou o primeiro método: é dinheiro que de fato sobrou, com todos os gastos reais. Transferências (inclusive o
   "guardei" das metas) não entram em receitas/despesas, então guardar não derruba o próprio ritmo.
   Com simulação no Planejamento, soma o efeito médio por mês do que foi simulado: (fim simulado − fim sem simulação) ÷ meses. */
function ritmoMensal(base,sim){
  const R=ritmoEconomia();if(!R)return null;
  let adj=0;
  if(base&&sim&&sim!==base&&base.length&&sim.length===base.length)adj=(cents(sim[sim.length-1].saldo)-cents(base[base.length-1].saldo))/base.length/100;
  return Object.assign({},R,{base:R.media,adj:c2(adj),media:c2(R.media+adj)});
}
/* meses até o prazo contando o mês atual: prazo neste mês = 1; vencido só quando o prazo é antes do mês atual (<= 0) */
function mesesAte(ym){const h=new Date();return (+ym.slice(0,4)-h.getFullYear())*12+(+ym.slice(5,7)-1-h.getMonth())+1;}
const META_COR=[['#22c55e','#0ea5e9'],['#8b5cf6','#ec4899'],['#f59e0b','#ef4444'],['#06b6d4','#6366f1'],['#10b981','#84cc16']];
function brlK(v){if(OCULTO)return 'R$ •••';v=+v||0;const a=Math.abs(v),sg=v<0?'-':'';if(a<1000)return brl(v);const f=(x,u)=>sg+'R$ '+String(x>=100?Math.round(x):Math.round(x*10)/10).replace('.',',')+' '+u;if(a<999500)return f(a/1e3,'mil');if(a<999500000)return f(a/1e6,'mi');return f(a/1e9,'bi');}
function metaIcone(n){const x=norm(n||'');const L=[[/aposent|previd|velhice|futuro/,'aposentadoria'],[/carro|moto|veic|automo/,'carro'],[/casa|apart|imovel|terreno|entrada|reforma/,'casa'],[/viag|ferias|mala|intercambio/,'mala'],[/estud|faculd|curso|educa|pos/,'educacao'],[/reserva|emergenc|seguran/,'piggy'],[/casament|presente|aniver|natal/,'presente'],[/celular|iphone|notebook|computador|pc|laptop|tv/,'laptop'],[/saude|cirurg|dente|tratament/,'saude'],[/pet|cachorro|gato/,'pet'],[/divida|quitar|emprest/,'receipt'],[/invest|acoes|fii|cripto/,'chart']];const h=L.find(([re])=>re.test(x));return h?h[1]:'flag';}
/* v10.160: card de notificações separado para o MVP colocá-lo logo depois do WhatsApp */
function notifCardHTML(){return `  <div class="card">
    <h4>Notificações no celular</h4>
    <p class="pushTxt" id="pushTxt">verificando…</p>
    <div class="pushBtns" id="pushBtns"></div>
    <button type="button" class="semLink" data-act="sem-abre">${I('report')}<span><b>Resumo da semana</b><small>${notifOn('semanal')?'chega domingo às 9h · ver o desta semana':'desligado · ver o desta semana'}</small></span>${I('chevR')}</button>
    <label class="avisoSel"><span>${I('bell')}avisar contas com antecedência de</span><select data-aviso="1">${[[0,'só no dia'],[1,'1 dia'],[2,'2 dias'],[3,'3 dias'],[5,'5 dias'],[7,'7 dias']].map(([v,l])=>`<option value="${v}" ${avisoDias()===v?'selected':''}>${l}</option>`).join('')}</select></label>
    <p class="hmNota">vale para os avisos do app e para as notificações. no dia e na véspera você também é avisado.</p>
  </div>`;}
function viewCfg(){
  const claro=S.cfg.tema==='claro';
  return `
  <div class="head"><h2>${MVP_MODE?'WhatsApp &amp; Conta':'Ajustes'}</h2></div>
  ${MVP_MODE?waHeroHTML()+notifCardHTML()+cardPlanoCfg():cardPlanoCfg()}
  <div class="card">
    <h4>Tema</h4>
    <div class="seg">
      <button data-act="tema" data-id="escuro" class="${S.cfg.tema==='escuro'?'on':''}">Escuro</button>
      <button data-act="tema" data-id="preto" class="${S.cfg.tema==='preto'?'on':''}">Preto OLED</button>
      <button data-act="tema" data-id="claro" class="${claro?'on':''}">Claro</button>
    </div>
    <h4 style="margin-top:16px">Cor de destaque</h4>
    <div class="swatches">${Object.keys(ACCENTS).map(k=>`<button class="sw ${S.cfg.accent===k?'on':''}" data-act="accent" data-id="${k}" title="${k}" style="background:linear-gradient(135deg,${ACCENTS[k][0]},${ACCENTS[k][1]})"></button>`).join('')}</div>
  </div>
  <div class="card">
    <div class="catHead"><h4>Categorias <span class="catQt">${S.cats.length}</span></h4><button class="btn2 sm" data-act="nova-cat">${I('plus')} nova</button></div>
    ${S.cats.length>8?`<label class="catBusca">${I('search')}<input type="search" id="catBusca" placeholder="buscar categoria" autocomplete="off" aria-label="buscar categoria"></label>`:''}
    <div class="catList${CATS_ABERTAS?' aberta':''}">${(()=>{const n={};S.tx.forEach(t=>{if(t.categoria)n[t.categoria]=(n[t.categoria]||0)+1;});return S.cats.map((c,i)=>`<button type="button" class="catRow${i>=10?' crMais':''}" data-act="edit-cat" data-id="${esc(c)}" data-q="${esc(c.toLowerCase())}" style="--cc:${corCat(c)}"><span class="cr-i">${I(catIcon(c))}</span><span class="cr-n">${esc(c)}</span><span class="cr-q">${n[c]?n[c]:''}</span></button>`).join('');})()}</div>
    <p class="catVazio" hidden>Nenhuma categoria com esse nome.</p>
    ${S.cats.length>10?`<button type="button" class="catMaisBtn" data-act="cats-toggle">${CATS_ABERTAS?'mostrar menos':'ver todas as '+S.cats.length+' categorias'}</button>`:''}
  </div>
  ${lockCardHTML()}
  ${MVP_MODE?'':notifCardHTML()}
  ${MVP_MODE?'':`  <div class="card bcCard">
    <div class="bcHd"><span class="bcIc">${I('bank')}</span><div><h4>Conexão bancária</h4><small>Open Finance · Meu Pluggy</small></div><span class="bcSt" id="bcSt"></span></div>
    <div class="pushTxt" id="bcTxt">${USER?'verificando…':'entre na sua conta para conectar seus bancos.'}</div>
    <div class="pushBtns" id="bcBtns"></div>
  </div>
  <div class="card bcCard waCard">
    <div class="bcHd"><span class="bcIc">${I('chat')}</span><div><h4>WhatsApp</h4><small>lance por mensagem</small></div><span class="bcSt" id="waSt"></span></div>
    <div class="pushTxt" id="waTxt">${USER?'verificando…':'entre na sua conta para usar o WhatsApp.'}</div>
    <div class="pushBtns" id="waBtns"></div>
  </div>`}
  <div class="card lkCard">
    <div class="lkHead"><span class="lkIc dkIc">${I('lu_chart_candlestick')}</span><div><h4>Cotações</h4><small>preços de ações e FIIs da carteira</small></div></div>
    <div class="lkList"><button class="lkRow" data-act="brapi-token"><span class="lkRi">${I('lu_key_round')}</span><span class="lkRt"><b>Token brapi</b><small>opcional, deixa as cotações mais rápidas</small></span><span class="dkSt${S.cfg.brapi?' on':''}">${S.cfg.brapi?'configurado':'não configurado'}</span><span class="lkCh">${I('chevR')}</span></button></div>
  </div>
  <div class="card lkCard">
    <div class="lkList"><button class="lkRow" data-act="tour"><span class="lkRi">${I('compass')}</span><span class="lkRt"><b>Fazer o tour do app</b><small>um minuto para conhecer cada seção</small></span><span class="lkCh">${I('chevR')}</span></button></div>
  </div>
  <div class="card lkCard">
    <div class="lkHead"><span class="lkIc dkIc">${I('cloud')}</span><div><h4>Dados e backup</h4><small>tudo salvo na sua conta e sincronizado</small></div></div>
    <div class="lkList">
      <button class="lkRow" data-act="exportar"><span class="lkRi">${I('lu_download')}</span><span class="lkRt"><b>Exportar backup</b><small>baixa um arquivo com todos os seus dados</small></span><span class="lkCh">${I('chevR')}</span></button>
      <label class="lkRow"><span class="lkRi">${I('lu_upload')}</span><span class="lkRt"><b>Importar backup</b><small>restaura de um arquivo exportado</small></span><span class="lkCh">${I('chevR')}</span><input type="file" id="imp" accept="application/json,.json" class="sr"></label>
    </div>
    <button class="lkOff" data-act="limpar">limpar todos os dados</button>
  </div>
  ${(()=>{const n=errLista().reduce((a,x)=>a+(x.n||1),0);return `<div class="card lkCard erCard">
    <div class="lkHead"><span class="lkIc dkIc">${I('alert')}</span><div><h4>Erros recentes</h4><small>falhas do app neste aparelho, sem seus dados</small></div></div>
    <div class="lkList"><button class="lkRow" data-act="erros-ver"><span class="lkRi">${I('list')}</span><span class="lkRt"><b>${n?n+(n>1?' erros registrados':' erro registrado'):'Nenhum erro registrado'}</b><small>${n?'ver, copiar para enviar ao suporte ou limpar':'se algo der errado, aparece aqui'}</small></span><span class="lkCh">${I('chevR')}</span></button></div>
  </div>`;})()}
  <div class="card lkCard lgCard">
    <div class="lkHead"><span class="lkIc dkIc">${I('shield')}</span><div><h4>Privacidade e seus dados</h4><small>seus direitos pela LGPD</small></div></div>
    <div class="lkList">
      <button class="lkRow" data-act="lg-dados"><span class="lkRi">${I('lu_download')}</span><span class="lkRt"><b>Exportar meus dados</b><small>arquivo completo (JSON) e planilha dos lançamentos (CSV)</small></span><span class="lkCh">${I('chevR')}</span></button>
      ${USER?`<button class="lkRow perigo" data-act="lg-excluir"><span class="lkRi">${I('userX')}</span><span class="lkRt"><b>Excluir minha conta</b><small>apaga a conta e todos os dados, para sempre</small></span><span class="lkCh">${I('chevR')}</span></button>`:''}
      <a class="lkRow" href="site/privacidade.html" target="_blank" rel="noopener"><span class="lkRi">${I('shield')}</span><span class="lkRt"><b>Política de privacidade</b><small>quais dados guardamos, com quem e por quanto tempo</small></span><span class="lkCh">${I('chevR')}</span></a>
      <a class="lkRow" href="site/termos.html" target="_blank" rel="noopener"><span class="lkRi">${I('list')}</span><span class="lkRt"><b>Termos de uso</b><small>planos, pagamento e cancelamento</small></span><span class="lkCh">${I('chevR')}</span></a>
    </div>
  </div>
  <p class="rod">GranaViva v${GV_BUILD} · seus dados ficam na sua conta e sincronizam entre dispositivos, com uma cópia local para quando estiver offline</p>`;
}

/* v10.30: cartão com a cara do banco emissor (cores oficiais aproximadas) */
const CARD_MARCA={'Nubank':['#9b2fe0','#5f0a9e','#fff'],'Banco Inter':['#ff8a00','#ff5a00','#fff'],'Itaú Unibanco':['#ff7a00','#ec5b00','#fff'],'Banco do Brasil':['#0a4fc4','#062f7a','#fcfc30'],
 'Caixa Econômica Federal':['#0a6cc2','#003e7e','#f39200'],'Bradesco':['#e1173f','#8a0620','#fff'],'Santander':['#f21d1d','#a30000','#fff'],'Banco C6':['#2b2b2b','#050505','#d9d9d9'],
 'BTG Pactual':['#163a6b','#0b2240','#fff'],'BTG Pactual Digital':['#163a6b','#0b2240','#fff'],'Mercado Pago':['#14b8f0','#0089d0','#fff'],'PicPay':['#2fd36b','#0f9e48','#fff'],'PagBank':['#2ccfae','#119178','#fff'],
 'Neon':['#16d4f5','#0067e0','#fff'],'Will Bank':['#ffe14d','#f5c400','#1d1d1b'],'Sicredi':['#4cb52a','#2b7a14','#fff'],'Sicoob':['#00ae9d','#003641','#c9d200'],'Banrisul':['#1866b4','#003b73','#fff'],
 'BRB Banco de Brasília':['#1a5aa6','#002f6c','#fff'],'XP Investimentos':['#2a2a2a','#000','#fff'],'Banco Pan':['#1ec0f5','#0077b6','#fff'],'Banco Digio':['#1b3a66','#0a2342','#fff'],'Banco Original':['#1fc46a','#00843d','#fff'],
 'Agibank':['#1d63e0','#0039a6','#fff'],'Banco Safra':['#1d3f66','#0f2c4c','#d6b25e'],'Banco BMG':['#ff7a1a','#e05400','#fff'],'Banco Votorantim':['#2e5bff','#0028a8','#fff'],'Cora':['#ff4f6e','#e0284a','#fff'],'Banco Next':['#00e17c','#00a85a','#fff']};
const BANDEIRAS=[{v:'',t:'não sei'},{v:'mastercard',t:'Mastercard'},{v:'visa',t:'Visa'},{v:'elo',t:'Elo'},{v:'amex',t:'American Express'},{v:'hipercard',t:'Hipercard'}];
function bancoDoCartao(c){
  const tx=String(c.banco||'')+' '+String(c.nome||'');
  let b=BANCOS_BR.find(x=>x.c&&x.n===c.banco)||BANCOS_BR.find(x=>x.c&&x.n.length>3&&new RegExp('\\b'+x.n.split(' ')[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b','i').test(tx)&&!/^banco$/i.test(x.n.split(' ')[0]));
  if(!b&&/\bnu\b|nubank|roxinho|ultravioleta/i.test(tx))b=BANCOS_BR.find(x=>x.n==='Nubank');
  if(!b&&c.bancoAuto)b=BANCOS_BR.find(x=>x.n===c.bancoAuto);
  return b||null;
}
const NOME_CURTO={'Itaú Unibanco':'Itaú','Caixa Econômica Federal':'Caixa','Banco Inter':'Inter','Banco C6':'C6 Bank','BRB Banco de Brasília':'BRB','XP Investimentos':'XP'};
const CARD_COR=[['#22c55e','#0f766e','Verde'],['#8b5cf6','#312e81','Violeta'],['#06b6d4','#1e3a8a','Azul'],['#ec4899','#7e1d6b','Rosa'],['#f59e0b','#9a3412','Âmbar']];
const BANCO_TIPOS=['Conta corrente','Poupança','Carteira digital','Investimentos','Dinheiro','Outros'];
/* bancos e instituições brasileiros: c = código de compensação (compe), d = domínio para a logo, t = tipo sugerido */
const BANCOS_BR=[
{c:'001',n:'Banco do Brasil',d:'bb.com.br'},
{c:'033',n:'Santander',d:'santander.com.br'},
{c:'104',n:'Caixa Econômica Federal',d:'caixa.gov.br'},
{c:'237',n:'Bradesco',d:'bradesco.com.br'},
{c:'341',n:'Itaú Unibanco',d:'itau.com.br'},
{c:'260',n:'Nubank',d:'nubank.com.br'},
{c:'077',n:'Banco Inter',d:'bancointer.com.br'},
{c:'336',n:'Banco C6',d:'c6bank.com.br'},
{c:'208',n:'BTG Pactual',d:'btgpactual.com'},
{c:'399',n:'BTG Pactual Digital',d:'btgpactual.com'},
{c:'409',n:'Unibanco',d:'unibanco.com.br'},
{c:'735',n:'Neon',d:'neon.com.br'},
{c:'290',n:'PagBank',d:'pagbank.com.br'},
{c:'380',n:'PicPay',d:'picpay.com'},
{c:'197',n:'Stone',d:'stone.com.br'},
{c:'323',n:'Mercado Pago',d:'mercadopago.com.br'},
{c:'748',n:'Sicredi',d:'sicredi.com.br'},
{c:'756',n:'Sicoob',d:'sicoob.com.br'},
{c:'422',n:'Banco Safra',d:'safra.com.br'},
{c:'745',n:'Citibank',d:'citibank.com.br'},
{c:'655',n:'Banco Votorantim',d:'bv.com.br'},
{c:'318',n:'Banco BMG',d:'bmg.com.br'},
{c:'623',n:'Banco Pan',d:'bancopan.com.br'},
{c:'212',n:'Banco Original',d:'original.com.br'},
{c:'707',n:'Banco Daycoval',d:'daycoval.com.br'},
{c:'246',n:'Banco ABC Brasil',d:'abcbrasil.com.br'},
{c:'243',n:'Banco Master',d:'bancomaster.com.br'},
{c:'746',n:'Banco Modal',d:'modal.com.br'},
{c:'271',n:'Banco Genial',d:'genialinvestimentos.com.br'},
{c:'280',n:'Will Bank',d:'willbank.com.br'},
{c:'335',n:'Banco Digio',d:'digio.com.br'},
{c:'637',n:'Banco Sofisa',d:'sofisa.com.br'},
{c:'218',n:'Banco BS2',d:'bs2.com'},
{c:'082',n:'Banco Topázio',d:'bancotopazio.com.br'},
{c:'634',n:'Banco Triângulo',d:'bancotriangulo.com.br'},
{c:'613',n:'Omni Banco',d:'omni.com.br'},
{c:'102',n:'XP Investimentos',d:'xpi.com.br'},
{c:'121',n:'Agibank',d:'agibank.com.br'},
{c:'403',n:'Cora',d:'cora.com.br'},
{c:'136',n:'Unicred',d:'unicred.com.br'},
{c:'084',n:'Uniprime',d:'uniprime.com.br'},
{c:'041',n:'Banrisul',d:'banrisul.com.br'},
{c:'070',n:'BRB Banco de Brasília',d:'brb.com.br'},
{c:'004',n:'Banco do Nordeste',d:'bnb.gov.br'},
{c:'003',n:'Banco da Amazônia',d:'basa.com.br'},
{c:'389',n:'Banco Mercantil do Brasil',d:'mercantildobrasil.com.br'},
{c:'',n:'Dinheiro',d:'',t:'Dinheiro'},
{c:'',n:'Carteira digital',d:'',t:'Carteira digital'},
{c:'',n:'Binance',d:'binance.com',t:'Carteira digital'}
];
/* v10.40: ícones dos apps dos bancos (quadrados, ocupam o ícone todo), servidos pelo próprio app */
const LOGO_LOCAL=new Set(['agibank.com.br','bancointer.com.br','banrisul.com.br','bb.com.br','binance.com','bmg.com.br','bnb.gov.br','bradesco.com.br','brb.com.br','btgpactual.com','bv.com.br','c6bank.com.br','caixa.gov.br','cora.com.br','daycoval.com.br','digio.com.br','genialinvestimentos.com.br','itau.com.br','mercadopago.com.br','mercantildobrasil.com.br','neon.com.br','nubank.com.br','pagbank.com.br','picpay.com','safra.com.br','santander.com.br','sicoob.com.br','sicredi.com.br','sofisa.com.br','stone.com.br','unicred.com.br','xpi.com.br']);
function bancoLogo(d){return d?(LOGO_LOCAL.has(d)?'logos/'+d+'.png':'https://www.google.com/s2/favicons?domain='+d+'&sz=128'):'';}
/* segunda fonte da cadeia de logos (usada se a primeira falhar) */
function bancoLogo2(d){return d?'https://icon.horse/icon/'+d:'';}
function bancoNext(im){if(im.dataset.s2){const u=im.dataset.s2;im.removeAttribute('data-s2');im.src=u;}else{im.remove();}}
/* se a primeira fonte devolver ícone pequeno (ex.: 16px borrado), troca pela segunda */
function bancoLoad(im){if(im.naturalWidth<40&&im.dataset.s2)bancoNext(im);}
window.bancoNext=bancoNext;window.bancoLoad=bancoLoad;
/* v10.69: sem onload/onerror no HTML (a CSP não permite script embutido em atributo) */
document.addEventListener('error',e=>{const t=e.target;if(t&&t.tagName==='IMG'&&t.closest('.bl-wrap'))bancoNext(t);},true);
document.addEventListener('load',e=>{const t=e.target;if(t&&t.tagName==='IMG'&&t.closest('.bl-wrap'))bancoLoad(t);},true);
function bancoIni(n){const w=String(n||'').split(/\s+/).filter(x=>x&&!/^(do|da|de|dos|das|e)$/i.test(x));return ((w[0]||'?').charAt(0)+(w[1]?w[1].charAt(0):'')).toUpperCase();}
/* logo em <img>; se não carregar, troca por círculo com as iniciais */
function bancoLogoHTML(logo,nome,cls,logo2){
  const ini=bancoIni(nome).replace(/[^A-Za-zÀ-ÿ0-9?]/g,'');
  const fb='<span class="bl-ini">'+ini+'</span>';
  if(!logo)return '<span class="'+cls+' bl-wrap">'+fb+'</span>';
  const s2=logo2?' data-s2="'+esc(logo2)+'"':'';
  return '<span class="'+cls+' bl-wrap'+(logo.startsWith('logos/')?' bl-fw':'')+'">'+fb+'<img'+(logo.startsWith('logos/')?' class="bl-full"':'')+' src="'+esc(logo)+'"'+s2+' alt="" decoding="async" loading="lazy"></span>';
}
function cicloCartao(c){
  const h=new Date(),y=h.getFullYear(),mo=h.getMonth();
  const fe=Math.max(1,Math.min(31,c.fechamento||1)),ve=Math.max(1,Math.min(31,c.vencimento||1));
  const ult=(a,m)=>new Date(a,m+1,0).getDate();
  const off=h.getDate()<=fe?0:1;
  const endMo=mo+off;
  const fim=new Date(y,endMo,Math.min(fe,ult(y,endMo)));
  const pm=new Date(y,endMo-1,1);
  const prevClose=new Date(pm.getFullYear(),pm.getMonth(),Math.min(fe,ult(pm.getFullYear(),pm.getMonth())));
  const ini=new Date(prevClose.getFullYear(),prevClose.getMonth(),prevClose.getDate()+1);
  const dueMo=ve>fe?endMo:endMo+1;
  const due=new Date(y,dueMo,Math.min(ve,ult(y,dueMo)));
  return {ini:isoDe(ini),fim:isoDe(fim),due};
}
function usoCartao(c){
  const ci=cicloCartao(c);
  const l=S.tx.filter(t=>efetivo(t)&&t.cartao===c.id&&(t.tipo==='despesa'||t.tipo==='transf')&&t.data>=ci.ini&&t.data<=ci.fim);
  return {used:l.reduce((a,t)=>a+t.valor,0),n:l.length,ci,due:ci.due};
}
/* estimativa do custo de atrasar 30 dias o que está em aberto nas faturas */
function custoAtraso(c,valor){const mu=c.multaPct||0,mo=c.moraPct||0,ro=c.rotativo||0;return Math.round(valor*(mu+mo+ro))/100;}
function pctTxt(v){return String(Math.round(v*100)/100).replace('.',',');}
function custoAtrasoHTML(c){
  if(!c.rotativo)return '';
  const aberto=S.tx.filter(t=>t.faturaKey&&t.faturaKey.indexOf('fat|'+c.id+'|')===0&&statusFatura(t)!=='paga').reduce((a,t)=>a+cents(restanteFatura(t)),0)/100;
  const aa=Math.round((Math.pow(1+c.rotativo/100,12)-1)*1000)/10;
  const txt=aberto>0?`atrasar ${brl(aberto)} por 30 dias custaria ≈ <b class="neg">${brl(custoAtraso(c,aberto))}</b> (multa ${pctTxt(c.multaPct||0)}% + mora ${pctTxt(c.moraPct||0)}% + rotativo ${pctTxt(c.rotativo)}%)`:`rotativo ${pctTxt(c.rotativo)}% ao mês ≈ ${String(aa).replace('.',',')}% ao ano`;
  return `<p class="small encAviso">${txt}</p>`;
}
function nomeMesFat(d){const m=+String(d).slice(5,7),y=String(d).slice(0,4);return (MESES[m-1]||'')+'/'+y.slice(2);}
function faturasCartaoHTML(c,excl){
  const fs=S.tx.filter(t=>t.faturaKey&&t.faturaKey.indexOf('fat|'+c.id+'|')===0&&t.id!==excl).sort((a,b)=>b.data.localeCompare(a.data));
  const mostrar=fs.filter(t=>statusFatura(t)!=='paga').concat(fs.filter(t=>statusFatura(t)==='paga').slice(0,2)).sort((a,b)=>b.data.localeCompare(a.data)).slice(0,4);
  if(!mostrar.length)return '';
  return '<div class="fatList"><small class="fatTit">faturas</small>'+mostrar.map(t=>`<div class="row fatRow"><span class="fatNm tap" data-act="fat-abre" data-id="${t.id}" role="button" tabindex="0" aria-label="ver compras da fatura de ${nomeMesFat(t.data)}"><b>${nomeMesFat(t.data)}${I('chevR','tapCh')}</b><small>vence ${fmtData(venceFatura(t)).slice(0,5)}</small></span><span class="row" style="gap:6px"><b>${brl(t.valor)}</b>${faturaBadge(t)}${restanteFatura(t)>0?`<button class="btn2 sm" data-act="pagar-fat" data-id="${t.id}">pagar</button>`:''}</span></div>`).join('')+'</div>';
}
/* ---------- v10.81: cartão com o visual do cartão físico do banco ----------
   tudo desenhado em CSS/SVG próprio (nada de imagem dos bancos). proporção ISO 85,6 × 54 mm.
   g: gradiente (claro, meio, escuro) · ink: cor do texto · ac: cor de destaque · tex: fosco | metal | carbono
   mk: marca discreta do cartão (wordmark simples) · art: desenho de fundo · grp: banco (para as variantes) */
const CC_DES={
 nubank:{n:'Nubank roxo',grp:'nubank',g:['#a24bf2','#820ad1','#5c0b9c'],ink:'#fff',tex:'fosco',mk:'nu'},
 nubank_uv:{n:'Ultravioleta preto',grp:'nubank',g:['#34343a','#1b1b1f','#08080a'],ink:'#e4e4ea',tex:'metal',mk:'nu',art:'uv'},
 dm:{n:'DM azul',grp:'dm',g:['#3d4cf5','#2532d8','#1a1fa6'],ink:'#fff',ac:'#5ce1e6',tex:'fosco',mk:'dm',art:'dm'},
 inter:{n:'Inter laranja',grp:'inter',g:['#ffa040','#ff7a00','#e05200'],ink:'#fff',tex:'fosco',mk:'inter',art:'onda'},
 inter_black:{n:'Inter Black',grp:'inter',g:['#33302d','#1a1817','#070707'],ink:'#f2ede6',ac:'#ff7a00',tex:'metal',mk:'inter',art:'linhaAc'},
 itau:{n:'Itaú laranja',grp:'itau',g:['#ff9a33','#ec7000','#bf4f00'],ink:'#fff',tex:'fosco',mk:'itau',art:'onda'},
 itau_black:{n:'Itaú preto',grp:'itau',g:['#2f3136','#18191c','#060607'],ink:'#ecedf0',ac:'#ec7000',tex:'metal',mk:'itau',art:'linhaAc'},
 c6:{n:'C6 carbono',grp:'c6',g:['#3b3b3f','#202023','#0b0b0c'],ink:'#e8e8ea',tex:'carbono',mk:'c6'},
 c6_grafite:{n:'C6 grafite',grp:'c6',g:['#5b5d63','#3a3c41','#1f2024'],ink:'#f1f1f3',tex:'metal',mk:'c6'},
 bb:{n:'BB azul',grp:'bb',g:['#2563d6','#0b3fa3','#05286b'],ink:'#fff',ac:'#fcfc30',tex:'fosco',mk:'bb',art:'bb'},
 santander:{n:'Santander vermelho',grp:'santander',g:['#ff3b30','#e30000','#9e0000'],ink:'#fff',tex:'fosco',mk:'santander',art:'curva'},
 bradesco:{n:'Bradesco vermelho',grp:'bradesco',g:['#f0325a','#cc092f','#78051e'],ink:'#fff',tex:'fosco',mk:'bradesco',art:'curva'},
 caixa:{n:'Caixa azul',grp:'caixa',g:['#1a7fd4','#005ca9','#00386e'],ink:'#fff',ac:'#f39200',tex:'fosco',mk:'caixa',art:'caixa'},
 picpay:{n:'PicPay verde',grp:'picpay',g:['#22c773','#0fa75c','#06733f'],ink:'#fff',tex:'fosco',mk:'picpay',art:'circ'},
 mercadopago:{n:'Mercado Pago azul',grp:'mercadopago',g:['#1aa8e8','#0086cf','#00559a'],ink:'#fff',tex:'fosco',mk:'mercadopago',art:'onda'},
 neon:{n:'Neon',grp:'neon',g:['#0fb4e6','#0577d1','#0a3fb4'],ink:'#fff',tex:'fosco',mk:'neon',art:'circ'},
 next:{n:'Next preto e verde',grp:'next',g:['#242424','#121212','#030303'],ink:'#f4f4f4',ac:'#00e17c',tex:'fosco',mk:'next',art:'brilhoAc'},
 pagbank:{n:'PagBank verde',grp:'pagbank',g:['#1fbf95','#0e9a80','#086656'],ink:'#fff',ac:'#ffd21f',tex:'fosco',mk:'pagbank',art:'linhaAc'}
};
const CC_MK_TXT={inter:'inter',itau:'itaú',c6:'C6',bb:'BB',santander:'santander',bradesco:'bradesco',caixa:'CAIXA',picpay:'picpay',mercadopago:'mercado pago',neon:'neon',next:'next',pagbank:'pagbank'};
const CC_BAND_N={mastercard:'Mastercard',visa:'Visa',elo:'Elo',amex:'American Express',hipercard:'Hipercard'};
const ccNz=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
/* visual automático: lê o banco, o nome do cartão e a instituição (v10.85: normalizado, campo a campo)
   normaliza: minúsculas, sem acento, pontuação vira espaço ("Nu Pagamentos S.A." -> "nu pagamentos s a").
   o banco manda; depois o nome do cartão; depois a instituição/banco deduzido. "nu" e "dm" só como palavra. */
const ccTk=s=>' '+ccNz(s).replace(/[^a-z0-9]+/g,' ').trim()+' ';
const CC_GRP=[
 ['dm',/ (dm|dm ?card|d m card|cartao dm|dmcard ?(visa|mastercard)?) /],
 ['nubank',/ (nu|nubank|nu ?bank|nu ?pagamentos|nu ?financeira|roxinho|ultravioleta) /],
 ['inter',/ (inter|banco inter|inter ?co|bancointer) /],
 ['itau',/ (itau|itau ?unibanco|unibanco|personnalite|iti) /],
 ['c6',/ (c6|c6 ?bank|c6bank|banco c6) /],
 ['bb',/ (bb|banco do brasil|ourocard|ouro card) /],
 ['santander',/ (santander) /],
 ['bradesco',/ (bradesco|bradescard) /],
 ['caixa',/ (caixa|cef|caixa economica( federal)?) /],
 ['picpay',/ (pic ?pay) /],
 ['mercadopago',/ (mercado ?pago|mercadopago) /],
 ['neon',/ (neon) /],
 ['next',/ (next|banco next) /],
 ['pagbank',/ (pag ?bank|pag ?seguro) /]
];
function ccGrupo(s){const t=ccTk(s);if(t.length<3)return '';
  /* o texto tem espaço nas pontas e as regex exigem espaço antes e depois: só palavra inteira */
  for(const [g,re] of CC_GRP)if(re.test(t))return g;
  return '';}
function ccAuto(c){
  if(!c)return '';
  const bk=bancoDoCartao(c);
  const campos=[c.banco,c.nome,c.instituicao,c.bancoAuto,bk?bk.n:''];
  let g='';for(const f of campos){g=ccGrupo(f);if(g)break;}
  if(!g)return '';
  const tx=ccTk([c.banco,c.nome,c.instituicao].join(' '));
  if(g==='nubank')return /ultravioleta| uv /.test(tx)?'nubank_uv':'nubank';
  if(g==='inter')return / (black|win|duo) /.test(tx)?'inter_black':'inter';
  if(g==='itau')return / (black|the one|personnalite) /.test(tx)?'itau_black':'itau';
  return g;
}
function ccHex(h,f){const m=String(h).replace('#','');const n=m.length===3?m.split('').map(x=>x+x).join(''):m;let r=parseInt(n.slice(0,2),16),g=parseInt(n.slice(2,4),16),b=parseInt(n.slice(4,6),16);
  const k=f>0?(x=>Math.round(x+(255-x)*f)):(x=>Math.round(x*(1+f)));return '#'+[k(r),k(g),k(b)].map(x=>Math.max(0,Math.min(255,x)).toString(16).padStart(2,'0')).join('');}
/* visual em uso: o escolhido no cartão, senão o automático pelo banco, senão o genérico com a cor */
function ccVisual(c){
  const v=String(c.visual||'');
  const nomeBk=(()=>{const bk=bancoDoCartao(c);return bk?(NOME_CURTO[bk.n]||bk.n):(c.banco||'');})();
  const gen=(p,k,n)=>({k,d:{n,g:[ccHex(p[0],.12),p[0],p[1]],ink:p[2]||'#fff',tex:'fosco',mk:'txt',art:'guil',txt:nomeBk||c.nome||'cartão'}});
  const corP=i=>{const p=CARD_COR[(i||0)%CARD_COR.length]||CARD_COR[0];return gen(p,'cor','Cor própria · '+p[2]);};
  /* v10.85: cor própria só quando escolhida no campo Visual ("cor:N") */
  if(v.indexOf('cor:')===0)return corP(parseInt(v.slice(4),10)||0);
  if(v&&CC_DES[v])return {k:v,d:CC_DES[v]};
  /* sem visual (inclui cartões antigos com cor salva): o design do banco sempre que reconhecido */
  const a=ccAuto(c);if(a)return {k:a,d:CC_DES[a]};
  if(c.corPropria)return corP(c.cor);
  const bk=bancoDoCartao(c),mc=bk&&CARD_MARCA[bk.n];
  if(mc)return gen(mc,'gen',nomeBk);
  return gen(CARD_COR[(c.cor||0)%CARD_COR.length]||CARD_COR[0],'gen','genérico');
}
/* marcas das bandeiras: desenho simples e nítido em SVG */
function ccBand(m){
  if(m==='mastercard')return '<svg class="gvc-band mc" viewBox="0 0 50 31" role="img" aria-label="Mastercard"><circle cx="15.5" cy="15.5" r="15.5" fill="#eb001b"/><circle cx="34.5" cy="15.5" r="15.5" fill="#f79e1b"/><path d="M25 3.2a15.5 15.5 0 0 1 0 24.6a15.5 15.5 0 0 1 0-24.6z" fill="#ff5f00"/></svg>';
  if(m==='visa')return '<svg class="gvc-band visa" viewBox="0 0 64 22" role="img" aria-label="Visa"><text x="32" y="19" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="800" font-style="italic" font-size="22.5" letter-spacing="-.4" fill="currentColor">VISA</text></svg>';
  if(m==='elo')return '<svg class="gvc-band elo" viewBox="0 0 54 24" role="img" aria-label="Elo"><circle cx="6" cy="5" r="3.6" fill="#ffcb05"/><circle cx="6" cy="12" r="3.6" fill="#00a4e0"/><circle cx="6" cy="19" r="3.6" fill="#ef4123"/><text x="33" y="19" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="700" font-size="20" fill="currentColor">elo</text></svg>';
  if(m==='amex')return '<svg class="gvc-band amex" viewBox="0 0 52 30" role="img" aria-label="American Express"><rect width="52" height="30" rx="4" fill="#2e77bc"/><text x="26" y="20" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="800" font-size="12.5" letter-spacing=".6" fill="#fff">AMEX</text></svg>';
  if(m==='hipercard')return '<svg class="gvc-band hiper" viewBox="0 0 70 26" role="img" aria-label="Hipercard"><rect width="70" height="26" rx="5" fill="#b3131b"/><text x="35" y="17.5" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="700" font-style="italic" font-size="12.5" fill="#fff">Hipercard</text></svg>';
  return '';
}
/* marca discreta do cartão (só um wordmark simples, como no cartão de verdade) */
function ccMarca(d){
  if(d.mk==='nu')return '<svg class="gvc-mk gvc-mk-nu" viewBox="0 0 64 36" aria-hidden="true"><path d="M5 34V17.5a10 10 0 0 1 20 0V34M36 2v16.5a10 10 0 0 0 20 0V2" fill="none" stroke="currentColor" stroke-width="7"/></svg>';
  if(d.mk==='dm')return '<svg class="gvc-mk gvc-mk-dm" viewBox="0 0 60 44" aria-hidden="true"><text x="30" y="25" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-weight="700" font-size="29" letter-spacing="-1.2" fill="currentColor">dm</text><path d="M14 33q16 11 32 0" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round"/></svg>';
  if(d.mk==='txt')return '<span class="gvc-mk gvc-wm gvc-wm-txt">'+esc(String(d.txt||'').slice(0,22))+'</span>';
  return '<span class="gvc-mk gvc-wm gvc-wm-'+d.mk+'">'+esc(CC_MK_TXT[d.mk]||'')+'</span>';
}
/* desenho de fundo, no sistema de coordenadas do cartão (856 × 540 = décimos de mm) */
let CC_UID=0;
function ccArte(d){
  const a=d.art,ac=d.ac||'#fff';let s='';
  if(a==='dm'){const gi='gvcDm'+String(ac).replace(/[^0-9a-z]/gi,''); /* v10.94: id fixo por cor: o mesmo cartão gera o mesmo HTML (render sem troca de nós) */s=`<defs><linearGradient id="${gi}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${ac}" stop-opacity=".78"/><stop offset=".5" stop-color="#8ef0f2"/><stop offset="1" stop-color="${ac}" stop-opacity=".78"/></linearGradient></defs><path d="M502 258q96 64 192 0" fill="none" stroke="#000" stroke-opacity=".14" stroke-width="24" stroke-linecap="round" transform="translate(0 5)"/><path d="M502 258q96 64 192 0" fill="none" stroke="url(#${gi})" stroke-width="22" stroke-linecap="round"/>`;}
  else if(a==='uv')s='<circle cx="860" cy="-40" r="330" fill="none" stroke="#fff" stroke-opacity=".05" stroke-width="2"/><circle cx="860" cy="-40" r="300" fill="none" stroke="#b46cff" stroke-opacity=".08" stroke-width="2"/>';
  else if(a==='onda')s='<path d="M-20 410C180 330 360 470 560 400S820 300 880 330V560H-20Z" fill="#fff" fill-opacity=".07"/><path d="M-20 470C200 400 380 520 600 455S830 380 880 400V560H-20Z" fill="#000" fill-opacity=".06"/>';
  else if(a==='curva')s='<path d="M520 -20C700 120 760 330 900 420V-20Z" fill="#fff" fill-opacity=".08"/><path d="M640 -20C760 110 800 260 900 330V-20Z" fill="#fff" fill-opacity=".06"/>';
  else if(a==='bb')s=`<path d="M856 300C700 330 600 420 560 560H620C660 450 750 375 856 352Z" fill="${ac}" fill-opacity=".92"/><path d="M856 380C760 400 690 470 670 560H700C720 485 785 425 856 410Z" fill="${ac}" fill-opacity=".5"/>`;
  else if(a==='caixa')s=`<path d="M650 -10H720L520 550H450Z" fill="#fff" fill-opacity=".08"/><path d="M745 -10H800L600 550H545Z" fill="${ac}" fill-opacity=".9"/>`;
  else if(a==='circ')s='<circle cx="760" cy="80" r="250" fill="#fff" fill-opacity=".08"/><circle cx="760" cy="80" r="160" fill="#fff" fill-opacity=".06"/>';
  else if(a==='brilhoAc')s=`<circle cx="840" cy="560" r="300" fill="${ac}" fill-opacity=".14"/><circle cx="840" cy="560" r="170" fill="${ac}" fill-opacity=".14"/>`;
  else if(a==='linhaAc')s=`<path d="M0 500L856 300" stroke="${ac}" stroke-opacity=".7" stroke-width="3"/><path d="M0 520L856 320" stroke="${ac}" stroke-opacity=".25" stroke-width="2"/>`;
  else if(a==='guil'){for(let r=150;r<=520;r+=26){const x0=(780-Math.sqrt(r*r-400)).toFixed(1),y1=(560-Math.sqrt(r*r-5776)).toFixed(1);s+=`<path d="M${x0} 540A${r} ${r} 0 0 1 856 ${y1}" fill="none" stroke="#fff" stroke-opacity="${(.075-(r-150)/9000).toFixed(3)}" stroke-width="1.6"/>`;}}
  return s?'<svg class="gvc-art" viewBox="0 0 856 540" preserveAspectRatio="none" aria-hidden="true">'+s+'</svg>':'';
}
const CC_CHIP='<span class="gvc-chip" aria-hidden="true"><svg viewBox="0 0 64 48"><path d="M0 16.5h19M0 31.5h19M45 16.5h19M45 31.5h19M19 0v48M45 0v48M19 24h26M32 0v10M32 38v10" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="24" y="10" width="16" height="28" rx="5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span>';
const CC_NFC='<svg class="gvc-nfc" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 8.2a6 6 0 0 1 0 7.6M11 5.8a10 10 0 0 1 0 12.4M14.5 3.4a14 14 0 0 1 0 17.2M18 1.4a17.5 17.5 0 0 1 0 21.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
function ccNomeCurto(c){const bk=bancoDoCartao(c);if(ccAuto(c)==='dm')return 'DM';return bk?(NOME_CURTO[bk.n]||bk.n):(c.banco||c.nome||'Cartão');}
function ccRotulo(c){return 'Cartão '+(c.nome||ccNomeCurto(c))+(c.bandeira&&CC_BAND_N[c.bandeira]?', '+CC_BAND_N[c.bandeira]:'')+(c.final?', final '+c.final:'');}
/* o cartão. o: {verso:true} desenha o verso (limite, fechamento, vencimento, fatura); {mini:true} versão pequena; {tilt:true} acompanha a inclinação */
function cartaoHTML(c,o){
  o=o||{};const V=ccVisual(c),d=V.d,g=d.g;
  const st=`--g0:${g[0]};--g1:${g[1]};--g2:${g[2]};--ink:${d.ink};--ac:${d.ac||d.ink}`;
  const fin=String(c.final||'').replace(/\D/g,'').slice(-4);
  const frente=`<span class="gvc-face gvc-front"><span class="gvc-tex"></span>${ccArte(d)}${ccMarca(d)}${CC_CHIP}${CC_NFC}<span class="gvc-num" aria-hidden="true"><i>••••</i>${fin?' '+esc(fin):''}</span>${ccBand(c.bandeira)}<span class="gvc-shine" aria-hidden="true"></span></span>`;
  let verso='';
  if(o.verso){
    const u=usoCartao(c),usedT=usadoCartaoTotal(c),pct=c.limite?Math.min(100,usedT/c.limite*100):0,disp=c.limite-usedT,over=usedT>c.limite;
    const atual=u.used;
    verso=`<span class="gvc-face gvc-back" aria-hidden="true"><span class="gvc-tex"></span><span class="gvc-mag"></span>
      <span class="gvc-bk">
        <span class="gvc-bkR"><span>limite usado</span><b class="nw">${brl(usedT)}</b></span>
        <span class="gvc-bar${over?' over':''}"><i style="width:${OCULTO?0:pct.toFixed(1)}%"></i></span>
        <span class="gvc-bkR gvc-bkS"><span>disponível <b class="nw">${brl(disp)}</b></span><span>${OCULTO?'••':Math.round(pct)}% de ${brl(c.limite)}</span></span>
        <span class="gvc-bkG"><span><small>fecha</small><b>dia ${c.fechamento}</b></span><span><small>vence</small><b>dia ${c.vencimento}</b></span><span><small>fatura atual</small><b class="nw">${brl(atual)}</b></span></span>
      </span><span class="gvc-shine"></span></span>`;
  }
  return `<span class="gvc gvc-k-${V.k} gvc-t-${d.tex||'fosco'}${o.mini?' gvc-mini':''}${o.cls?' '+o.cls:''}" style="${st}"${o.tilt?' data-tilt="1"':''} data-cc="${esc(c.id||'')}"${o.mini?' aria-hidden="true"':' role="img" aria-label="'+esc(ccRotulo(c))+'"'}><span class="gvc-in">${frente}${verso}</span></span>`;
}
/* v10.97: a miniatura (formulário, fatura, patrimônio) aparece por cima do carrossel, que já tem o mesmo cartão:
   o degradê da DM ganha sufixo próprio para não repetir id no documento (continua fixo, sem troca de nós a cada render) */
function cartaoMini(c,cls){return '<span class="gvcMini '+(cls||'')+'">'+cartaoHTML(c,{mini:true}).replace(/(id="|url\(#)(gvcDm[0-9a-z]+)/gi,'$1$2m')+'</span>';}
/* ---------- brilho que acompanha o aparelho (ou o dedo) ---------- */
const CC_T={on:false,raf:0,x:0,y:0,b0:null,ori:0};
function ccMov(){try{return !matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){return true;}}
function ccPinta(){CC_T.raf=0;document.querySelectorAll('.gvc[data-tilt]').forEach(e=>{e.style.setProperty('--tx',CC_T.x.toFixed(3));e.style.setProperty('--ty',CC_T.y.toFixed(3));});}
function ccAgenda(x,y){CC_T.x=Math.max(-1,Math.min(1,x));CC_T.y=Math.max(-1,Math.min(1,y));if(!CC_T.raf)CC_T.raf=requestAnimationFrame(ccPinta);}
function ccOri(e){
  if(e.gamma==null||e.beta==null||TAB!=='cartoes')return;
  if(CC_T.b0==null)CC_T.b0=e.beta;CC_T.b0+=(e.beta-CC_T.b0)*.02; // devagar, a posição em que a pessoa segura vira o "zero"
  CC_T.ori=Date.now();ccAgenda(e.gamma/28,(e.beta-CC_T.b0)/28);
}
function ccLigaOri(){if(CC_T.on||!ccMov())return;CC_T.on=true;addEventListener('deviceorientation',ccOri,{passive:true});}
/* no iOS a permissão só pode ser pedida num toque da pessoa */
function ccPedeOri(){
  const D=window.DeviceOrientationEvent;if(!D||!ccMov()||CC_T.on)return;
  if(typeof D.requestPermission==='function'){
    let st='';try{st=localStorage.getItem('gv-tilt')||'';}catch(e){}
    if(st==='nao')return;
    try{D.requestPermission().then(r=>{try{localStorage.setItem('gv-tilt',r==='granted'?'ok':'nao');}catch(e){}if(r==='granted')ccLigaOri();}).catch(()=>{});}catch(e){}
  }else ccLigaOri();
}
function ccIniciaTilt(){
  const D=window.DeviceOrientationEvent;if(!D||!ccMov())return;
  if(typeof D.requestPermission!=='function')ccLigaOri();
  else{let st='';try{st=localStorage.getItem('gv-tilt')||'';}catch(e){}if(st==='ok')ccLigaOri();}
}
/* sem sensor (ou sem permissão): o brilho segue o dedo / o mouse */
document.addEventListener('pointermove',e=>{
  if(TAB!=='cartoes'||!ccMov()||Date.now()-CC_T.ori<1500)return;
  const el=e.target.closest&&e.target.closest('.gvc[data-tilt]');if(!el)return;
  const r=el.getBoundingClientRect();ccAgenda(((e.clientX-r.left)/r.width-.5)*2,((e.clientY-r.top)/r.height-.5)*2);
},{passive:true});
document.addEventListener('pointerout',e=>{if(TAB!=='cartoes'||Date.now()-CC_T.ori<1500)return;const el=e.target.closest&&e.target.closest('.gvc[data-tilt]');if(el&&!el.contains(e.relatedTarget))ccAgenda(0,0);},{passive:true});
/* ---------- tela Cartões: carteira empilhada ---------- */
/* v10.86: cor que representa o cartão fora dele (barra, legenda, realce). desenho quase preto vira a cor de destaque ou um cinza */
function ccLum(h){const m=/^#?([0-9a-f]{6})$/i.exec(String(h||''));if(!m)return 0;const n=parseInt(m[1],16),f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};return .2126*f(n>>16&255)+.7152*f(n>>8&255)+.0722*f(n&255);}
function ccTom(c){const d=ccVisual(c).d;const L=[d.g[1],d.ac,d.g[0]].filter(Boolean);return L.find(x=>ccLum(x)>.045)||'#9ca3af';}
/* dias até a data (meia-noite local) */
function diasAte(iso){const a=new Date(hojeISO()+'T00:00:00'),b=new Date(String(iso).slice(0,10)+'T00:00:00');return Math.round((b-a)/864e5);}
function fechaChip(iso){const n=diasAte(iso);return n<=0?'fecha hoje':n===1?'fecha amanhã':'fecha em '+n+' dias';}
/* anel pequeno: quanto da fatura já ocupa do limite (v10.110: arco de no mínimo 4% para 1% a 11% não sumir) */
function anelFat(pct){const p=OCULTO?0:Math.max(0,Math.min(100,pct));
  return `<span class="fatAnel${pct>80&&!OCULTO?' alerta':''}${pct>100&&!OCULTO?' over':''}" aria-hidden="true"><svg viewBox="0 0 48 48"><circle class="faT" cx="24" cy="24" r="20"/>${p>0?`<circle class="faA" cx="24" cy="24" r="20" pathLength="100" stroke-dasharray="${Math.max(p,4).toFixed(1)} 100"/>`:''}</svg><span class="faP">${OCULTO?'•••':Math.round(pct)+'%'}</span></span>`;}
/* resumo da carteira: barra segmentada (cada cartão ocupa a fatia do seu limite e preenche o quanto usa) */
function ccResumoDados(CA){
  const L=CA.map(c=>({c,lim:Math.max(0,+c.limite||0),uso:usadoCartaoTotal(c),cor:ccTom(c)}));
  const tL=L.reduce((a,x)=>a+x.lim,0),tU=L.reduce((a,x)=>a+x.uso,0);
  /* dois cartões de cor parecida (ex. Inter e Itaú laranja): o seguinte fica um tom mais claro para a barra não virar um bloco só */
  const hx=h=>{const n=parseInt(String(h).slice(1),16);return [n>>16&255,n>>8&255,n&255];},usados=[];
  L.forEach(x=>{if(!/^#[0-9a-f]{6}$/i.test(x.cor))return;let c=hx(x.cor),k=0;
    while(k<3&&usados.some(u=>Math.abs(u[0]-c[0])+Math.abs(u[1]-c[1])+Math.abs(u[2]-c[2])<90)){c=c.map(v=>Math.round(v+(255-v)*.38));k++;}
    usados.push(c);x.cor='#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');});
  const eq=100/(L.length||1);
  L.forEach(x=>{x.w=OCULTO||tL<=0?eq:x.lim/tL*100;x.f=OCULTO?0:x.lim>0?Math.max(0,Math.min(100,x.uso/x.lim*100)):(x.uso>0?100:0);});
  return {L,tL,tU};
}
function limCurto(v){if(OCULTO)return 'R$ •••';v=+v||0;return Math.abs(v)<1000?'R$ '+Math.round(v):brlK(v);}
function ccResumoHTML(CA){
  const {L,tL,tU}=ccResumoDados(CA),pct=tL>0?tU/tL*100:0,disp=tL-tU;
  const lvl=pct>100?'over':pct>80?'alerta':pct>50?'meio':'ok';
  return `<div class="card ccHero ccResumo">
    <div class="crHd"><small>disponível nos cartões</small><span class="crN">${CA.length} cart${CA.length===1?'ão':'ões'}</span></div>
    <div class="bkBig nw ${disp<0?'neg':''}">${brl(disp)}</div>
    <div class="crBar" aria-hidden="true">${L.map(x=>`<span class="crSeg" data-id="${x.c.id}" data-p="${x.w.toFixed(3)}" style="flex:${x.w.toFixed(3)} 1 0;--c:${x.cor}"><i style="width:${x.f.toFixed(1)}%"></i></span>`).join('')}</div>
    <ul class="crLeg" aria-label="uso do limite por cartão">${L.map(x=>`<li data-id="${x.c.id}"><span class="crDot" style="--c:${x.cor}" aria-hidden="true"></span><span class="crNm">${esc(x.c.nome||ccNomeCurto(x.c))}</span><span class="crV nw"><b class="${x.uso>x.lim?'neg':''}">${brl(x.uso)}</b><small> de ${limCurto(x.lim)}</small></span></li>`).join('')}</ul>
    <div class="bkMeta crMeta"><div><small>usado</small><b class="nw ${tU>tL?'neg':''}">${brl(tU)}${tL>0&&!OCULTO?` <em class="crPct ${lvl}">${Math.round(pct)}%</em>`:''}</b></div><div><small>limite total</small><b class="nw">${brl(tL)}</b></div></div>
  </div>`;
}
let CC_AT=(()=>{try{return localStorage.getItem('gv-cc-ativo')||'';}catch(e){return '';}})();
function ccFatPend(c){
  return S.tx.filter(t=>t.faturaKey&&t.faturaKey.indexOf('fat|'+c.id+'|')===0&&restanteFatura(t)>0).sort((a,b)=>a.data.localeCompare(b.data))[0]||null;
}
/* ---------- v10.94: tela Cartões = carrossel + fatura do cartão escolhido + melhor cartão para comprar hoje + agenda ----------
   o carrossel (#ccRail) não depende do cartão escolhido: o HTML dele só muda quando os dados dos cartões mudam,
   então um render igual (sync, volta ao app) não toca nele e a rolagem/virada ficam como estão (v10.91).
   destaque, pontos e o resto da tela seguem CC_AT; o destaque é aplicado no AFTER (antes da pintura). */
function ccDatasOk(c){const f=+c.fechamento,v=+c.vencimento;return f>=1&&f<=31&&v>=1&&v<=31;}
function ccDiasEntre(a,b){return Math.round((new Date(String(b).slice(0,10)+'T12:00:00')-new Date(String(a).slice(0,10)+'T12:00:00'))/864e5);}
function ccDM(iso){return String(iso).slice(8,10)+'/'+String(iso).slice(5,7);}
function ccNome(c){return c.nome||ccNomeCurto(c);}
/* compra no dia iso: em que fatura cai, quando vence e quantos dias até pagar */
function ccPrazo(c,iso){const f=fechamentoDe(c,iso);return {c,fecha:f.fecha,vence:f.vence,dias:ccDiasEntre(iso,f.vence)};}
/* melhor dia de compra do cartão a partir de iso: o dia seguinte ao próximo fechamento (iso, se iso já é esse dia) */
function ccMelhorDia(c,iso){const ontem=addDias(iso,-1);const f=fechamentoDe(c,ontem).fecha;return f===ontem?iso:addDias(f,1);}
/* melhor cartão para comprar no dia hj: o que dá mais dias até pagar. empate = todos os que têm o máximo.
   prox: o primeiro dia (até 62 à frente) em que um único cartão passa a ser o melhor e ele não é o de hoje (ou hoje é empate). */
function ccMelhor(CA,hj){
  hj=hj||hojeISO();
  const ok=CA.filter(ccDatasOk),pulados=CA.length-ok.length;
  if(!ok.length)return null;
  const L=ok.map(c=>ccPrazo(c,hj)).sort((a,b)=>b.dias-a.dias||ccNome(a.c).localeCompare(ccNome(b.c),'pt-BR'));
  const max=L[0].dias,top=L.filter(x=>x.dias===max);
  let prox=null;
  if(L.length>1)for(let k=1;k<=62&&!prox;k++){const d=addDias(hj,k);const M=ok.map(c=>ccPrazo(c,d));const mx=Math.max(...M.map(x=>x.dias));const tp=M.filter(x=>x.dias===mx);
    if(tp.length===1&&(top.length>1||tp[0].c!==top[0].c))prox=Object.assign({data:d,em:k},tp[0]);}
  const md=ccMelhorDia(L[0].c,hj);
  return {L,top,max,prox,pulados,melhorDia:md,melhorDiaPrazo:ccPrazo(L[0].c,md)};
}
/* compras (efetivas) do cartão somadas por data de fechamento do ciclo, em centavos */
function ccCiclos(c){return memo('ccc|'+c.id+'|'+c.fechamento+'|'+c.vencimento,()=>{const m={};S.tx.forEach(t=>{if(t.cartao!==c.id||t.faturaKey||!(t.tipo==='despesa'||t.tipo==='transf')||!t.data||!efetivo(t))return;const f=fechamentoDe(c,t.data).fecha;m[f]=(m[f]||0)+cents(t.valor);});return m;});}
/* agenda: fecha, vence e melhor dia de cada cartão de hj a hj+n dias, em ordem */
const CC_AG_ORD={fecha:0,vence:1,melhor:2};
function ccAgendaLista(CA,hj,n){
  hj=hj||hojeISO();n=n==null?30:n;const ate=addDias(hj,n),out=[];
  CA.filter(ccDatasOk).forEach(c=>{
    const cic=ccCiclos(c),y=+hj.slice(0,4),m=+hj.slice(5,7)-1;
    for(let k=-2;k<=2;k++){
      const F=isoDe(diaMes(y,m+k,Math.min(31,+c.fechamento))),fd=fechamentoDe(c,F);if(fd.fecha!==F)continue;
      const key='fat|'+c.id+'|'+F.slice(0,7),ft=S.tx.find(t=>t.faturaKey===key),soma=(cic[F]||0)/100;
      if(F>=hj&&F<=ate){const depois=fechamentoDe(c,addDias(F,1)).vence;out.push({d:F,k:'fecha',c,v:soma,key,sub:'compras depois vão para '+MESES_LONGO[+depois.slice(5,7)-1]});}
      const M=addDias(F,1);if(M>=hj&&M<=ate)out.push({d:M,k:'melhor',c,v:null,sub:'compra paga só em '+ccDM(fechamentoDe(c,M).vence)});
      const V=fd.vence;if(V>=hj&&V<=ate){const resta=ft?restanteFatura(ft):soma,paga=ft&&statusFatura(ft)==='paga';
        out.push({d:V,k:'vence',c,v:paga?ft.valor:resta,key:ft?ft.id:key,paga,sub:paga?'fatura paga':(ft||soma>0)?'pagar fatura':'sem compras nesta fatura'});}
    }
  });
  return out.sort((a,b)=>a.d.localeCompare(b.d)||CC_AG_ORD[a.k]-CC_AG_ORD[b.k]||ccNome(a.c).localeCompare(ccNome(b.c),'pt-BR'));
}
/* estado da fatura que aparece no card: a fechada que ainda falta pagar (fechou antes de hoje) ou a aberta */
function ccFatEstado(c){
  const hj=hojeISO(),u=usoCartao(c),pend=ccFatPend(c);
  if(pend&&pend.data<hj){const st=statusFatura(pend);return {tipo:'fechada',st,t:pend,valor:restanteFatura(pend),fecha:pend.data,vence:venceFatura(pend),abre:pend.id,pagar:pend.id,u,prox:{valor:u.used,fecha:u.ci.fim}};}
  const fk='fat|'+c.id+'|'+fechamentoDe(c,u.ci.fim).fecha.slice(0,7);
  return {tipo:'aberta',st:'aberta',t:pend,valor:u.used,fecha:u.ci.fim,vence:isoDe(u.due),abre:pend&&pend.faturaKey===fk?pend.id:fk,pagar:pend?pend.id:'',u};
}
function ccBig(v){if(OCULTO)return '<span class="ccRs">R$</span><span class="ccInt">•••••</span>';const p=brlParts(Math.abs(v));return `<span class="ccRs">${v<0?'−':''}R$</span><span class="ccInt">${p.i}</span><span class="ccCt">${p.d}</span>`;}
function ccEmDias(n){return n===0?'hoje':n===1?'amanhã':n>1?'em '+n+' dias':n===-1?'ontem':'há '+(-n)+' dias';}
const CC_IC_CAL='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',CC_IC_PAY='<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/></svg>';
/* ---------- v10.95: faturas por mês na tela Cartões ----------
   todas as faturas do cartão (anteriores, a atual e as próximas com parcelas ou compras com data futura), com total,
   vencimento, situação e lançamentos. o que falta pagar nas fechadas + a aberta + as futuras = limite usado (usadoCartaoTotal0). */
function ccFaturasLista(c){return memo('cfl|'+c.id+'|'+c.fechamento+'|'+c.vencimento,()=>{
  const hj=hojeISO(),FAT={},M={};
  S.tx.forEach(t=>{if(t.faturaKey&&t.faturaKey.indexOf('fat|'+c.id+'|')===0)FAT[t.faturaKey.split('|')[2]]=t;});
  const add=f=>M[f.fecha]||(M[f.fecha]={fecha:f.fecha,vence:f.vence,c:0,txs:[]});
  S.tx.forEach(t=>{if(t.cartao!==c.id||t.faturaKey||!(t.tipo==='despesa'||t.tipo==='transf')||!t.data||!efetivo(t))return;const m=add(fechamentoDe(c,t.data));m.c+=cents(t.valor);m.txs.push(t);});
  Object.keys(FAT).forEach(k=>{if(!Object.keys(M).some(f=>f.slice(0,7)===k))add(fechamentoDe(c,FAT[k].data));});
  add(fechamentoDe(c,hj));
  const f0=fechamentoDe(c,hj).fecha;
  return Object.values(M).sort((a,b)=>a.fecha.localeCompare(b.fecha)).map(m=>{
    const mk=m.fecha.slice(0,7),key='fat|'+c.id+'|'+mk,ft=FAT[mk],soma=m.c/100;let estado,valor,rest;
    if(m.fecha>hj){estado=m.fecha===f0?'aberta':'futura';valor=soma;rest=soma;}
    else if(ft){const st=statusFatura(ft);estado=st==='aberta'?'fechada':st;valor=ft.valor;rest=restanteFatura(ft);}
    else if(S.gerados&&S.gerados[key]==='del'){estado='excluida';valor=soma;rest=0;}
    else if(!S.cfg.pagDesde||m.vence>=S.cfg.pagDesde){estado=m.vence<hj?'vencida':'fechada';valor=soma;rest=soma;}
    else{estado='paga';valor=soma;rest=0;}
    return {key,mk,fecha:m.fecha,vence:m.vence,valor,rest,estado,ft,txs:m.txs.slice().sort((a,b)=>b.data.localeCompare(a.data))};
  });});}
const CC_FM_L={aberta:'aberta',futura:'próxima',fechada:'fechada',vencida:'vencida',parcial:'parcial',paga:'paga',excluida:'excluída'};
let CC_FSEL='';
function ccFmNome(f){const m=+f.vence.slice(5,7)-1,y=f.vence.slice(0,4);return MESES_LONGO[m]+(y!==hojeISO().slice(0,4)?' de '+y:'');}
function ccFmHTML(c,E){
  const L=ccFaturasLista(c);if(!L.length)return '';
  const atualK=E.tipo==='fechada'&&E.t?E.t.faturaKey:'fat|'+c.id+'|'+E.fecha.slice(0,7);
  const iA=Math.max(0,L.findIndex(f=>f.key===atualK));
  const vis=L.filter((f,i)=>i>=iA-3||f.rest>0);
  const sel=vis.find(f=>f.key===CC_FSEL)||L[iA]||vis[0];
  const emAb=L.reduce((a,f)=>a+cents(f.rest),0)/100;
  const pills=vis.map(f=>`<button type="button" class="ccFmP${f===sel?' on':''} st-${f.estado}" data-act="cc-fm" data-id="${esc(f.key)}" aria-pressed="${f===sel}"><b>${MESES[+f.vence.slice(5,7)-1]}${f.vence.slice(0,4)!==hojeISO().slice(0,4)?' '+f.vence.slice(2,4):''}</b><small class="nw">${f.valor>0.004?brl(f.valor):'—'}</small></button>`).join('');
  const rows=sel.txs.slice(0,5).map(t=>`<div class="ccFmR"><span class="ccFmRd">${ccDM(t.data)}</span><span class="ccFmRn">${esc(nomeTx(t).n||t.descricao||t.categoria)}${t.parcelas>1?' <em>'+t.parcela+'/'+t.parcelas+'</em>':''}</span><b class="nw">${brl(t.valor)}</b></div>`).join('');
  const bco=c.bancoData&&c.bancoUsado!=null&&isFinite(c.bancoUsado);
  return `<div class="ccFm" aria-label="faturas por mês">
    <div class="ccFmH"><span>faturas por mês</span><small>${L.filter(f=>f.estado==='futura').length?L.filter(f=>f.estado==='futura').length+(L.filter(f=>f.estado==='futura').length>1?' próximas':' próxima'):'nenhuma próxima'}</small></div>
    <div class="ccFmPs rolaH" role="group" aria-label="escolher a fatura">${pills}</div>
    <div class="ccFmD"><div class="ccFmDh"><span><b>Fatura de ${ccFmNome(sel)}</b><small>${CC_FM_L[sel.estado]} · fecha ${ccDM(sel.fecha)} · vence ${ccDM(sel.vence)}</small></span><b class="nw ccFmV">${brl(sel.valor)}</b></div>
      ${rows||'<p class="ccFmVz">nenhum lançamento nesta fatura.</p>'}
      ${sel.txs.length?`<button type="button" class="ccLink" data-act="fat-abre" data-id="${esc(sel.ft?sel.ft.id:sel.key)}">${sel.txs.length>5?'ver todos os '+sel.txs.length+' lançamentos':'ver detalhes'}</button>`:''}</div>
    <p class="ccFmT">em aberto (fechadas a pagar + atual + próximas): <b class="nw">${brl(emAb)}</b>${bco?` · o banco informa <b class="nw">${brl(c.bancoUsado)}</b> usados`:' = limite usado'}</p>
  </div>`;
}
function ccFatHTML(c){
  const E=ccFatEstado(c),usedT=usadoCartaoTotal(c),lim=+c.limite||0,disp=lim-usedT,pct=lim>0?usedT/lim*100:0,tom=ccTom(c);
  const band=c.bandeira&&CC_BAND_N[c.bandeira]?CC_BAND_N[c.bandeira]:ccNomeCurto(c);
  const dF=ccDiasEntre(hojeISO(),E.fecha),dV=ccDiasEntre(hojeISO(),E.vence);
  const lbl=E.tipo==='fechada'?(E.st==='vencida'?'vencida':'fechada'):'aberta';
  const ccTi=(ic,k,d,n,w)=>`<span class="ccChip2 ccTi${w?' warn':''}" role="group" aria-label="${k} ${ccDM(d)}, ${ccEmDias(n)}">${ic}<span aria-hidden="true"><small>${k}</small><b>${ccDM(d)}</b><em>${ccEmDias(n)}</em></span></span>`;
  const chips=E.tipo==='fechada'
    ?ccTi(CC_IC_PAY,'vence',E.vence,dV,dV<=3)+ccTi(CC_IC_CAL,'fecha',E.prox.fecha,ccDiasEntre(hojeISO(),E.prox.fecha),false)
    :ccTi(CC_IC_CAL,'fecha',E.fecha,dF,dF<=7)+ccTi(CC_IC_PAY,'vence',E.vence,dV,false);
  const badge=E.t&&E.tipo==='fechada'&&E.st!=='aberta'?faturaBadge(E.t):'';
  return `<div class="card ccFat" data-id="${c.id}" style="--tom:${tom}">
    <div class="ccFatTop"><b class="ccFatNm">${esc(ccNome(c))}${c.final?` <span class="ccFin">· final ${esc(c.final)}</span>`:''}</b><span class="ccBand">${esc(band)}</span></div>
    <div class="ccFatSub"><span>fatura atual · ${lbl}</span><span>vence ${ccDM(E.vence)}</span></div>
    <div class="ccFatV nw">${ccBig(E.valor)}</div>
    ${badge?`<div class="ccFatBadge">${badge}</div>`:''}
    ${lim>0?`<div class="ccUsoB${usedT>lim?' over':''}" aria-hidden="true"><i data-w="${OCULTO?0:Math.max(1.5,Math.min(100,pct)).toFixed(1)}"></i></div>
    <div class="ccLimR"><span><b class="nw ${disp<0?'neg':''}">${brl(disp)}</b> disponível</span><span class="nw">limite ${brl(lim)}</span></div>`:`<div class="ccLimR"><span>limite não informado</span><button type="button" class="ccLink" data-act="edit-cartao" data-id="${c.id}">informar</button></div>`}
    <div class="ccChips">${chips}</div>
    ${E.tipo==='fechada'?`<p class="ccProx">fatura aberta até ${ccDM(E.prox.fecha)}: <b class="nw">${brl(E.prox.valor)}</b></p>`:''}
    ${E.tipo==='aberta'&&!(E.valor>0.004)&&c.bancoData&&c.bancoUsado>0?`<p class="ccProx ccBcoNota">o banco informa <b class="nw">${brl(c.bancoUsado)}</b> usados do limite, mas nenhuma compra deste ciclo chegou ao app. Parcelas de compras antigas e compras novas entram na próxima sincronização.</p>`:''}
    <div class="ccActs"><button type="button" class="btn2" data-act="fat-abre" data-id="${esc(E.abre)}">${I('list')}ver lançamentos</button>${E.pagar?`<button type="button" class="btn" data-act="pagar-fat" data-id="${E.pagar}">${I('check')}pagar fatura</button>`:`<button type="button" class="btn ccOff" data-act="cc-pagar-aberta" data-id="${c.id}" aria-disabled="true">${I('lock')}pagar fatura</button>`}</div>
    ${ccFmHTML(c,E)}
  </div>`;
}
function ccMelhorHTML(CA){
  const R=ccMelhor(CA);if(!R)return '';
  const hj=hojeISO(),d=n=>n+(n===1?' dia':' dias'),T=R.top[0];
  let h3,p;
  if(R.L.length===1){
    h3=`Comprando hoje, paga em ${d(T.dias)}`;
    p=R.melhorDia===hj?`Hoje é o melhor dia do <b>${esc(ccNome(T.c))}</b>: a compra só vence em ${ccDM(T.vence)}.`:`A fatura do <b>${esc(ccNome(T.c))}</b> vence ${ccDM(T.vence)}. O melhor dia de compra é <b>${ccDM(R.melhorDia)}</b> (daqui a ${d(ccDiasEntre(hj,R.melhorDia))}): paga só em ${ccDM(R.melhorDiaPrazo.vence)}.`;
  }else if(R.top.length>1){
    h3=`Empate: ${R.top.map(x=>esc(ccNome(x.c))).join(' e ')}`;
    p=`Comprando hoje, ${R.top.length===2?'os dois':'eles'} te dão <b>${d(R.max)}</b> até pagar (vence ${ccDM(T.vence)}).`;
  }else{
    h3=`${esc(ccNome(T.c))}: paga só em ${ccDM(T.vence)}`;
    p=`Comprando hoje, o <b>${esc(ccNome(T.c))}</b> te dá <b>${d(T.dias)}</b> até pagar; ${R.L.slice(1).map(x=>'o '+esc(ccNome(x.c))+', '+x.dias).join('; ')}.`;
  }
  const tiles=R.L.length>1?`<div class="ccCmp${R.L.length>2?' rola':''}" role="list">${R.L.map(x=>`<button type="button" role="listitem" class="ccCmpT${x.dias===R.max?' on':''}" data-act="cc-ativa" data-id="${x.c.id}" style="--tom:${ccTom(x.c)}"><small>hoje no ${esc(ccNome(x.c))}</small><b>paga em ${d(x.dias)}</b><em>vence ${ccDM(x.vence)}</em></button>`).join('')}</div>`:'';
  const tip=R.prox?`<div class="ccTip"><i aria-hidden="true"></i><span>A partir de <b>${ccDM(R.prox.data)}</b> (${R.prox.em===1?'amanhã':'daqui a '+R.prox.em+' dias'}) o melhor passa a ser o <b>${esc(ccNome(R.prox.c))}</b>: a compra só é paga em <b>${ccDM(R.prox.vence)}</b>.</span></div>`:'';
  return `<div class="card ccBest"><span class="ccCap">melhor cartão para comprar hoje</span><h3>${h3}</h3><p>${p}</p>${tiles}${tip}${R.pulados?`<p class="ccNota">${R.pulados} cart${R.pulados===1?'ão':'ões'} sem dia de fechamento e vencimento fica${R.pulados===1?'':'m'} de fora.</p>`:''}</div>`;
}
let CC_AG=(()=>{try{return localStorage.getItem('gv-cc-ag')==='este'?'este':'todos';}catch(e){return 'todos';}})();
const CC_DSEM=['dom','seg','ter','qua','qui','sex','sáb'];
function ccAgendaHTML(CA,at){
  const hj=hojeISO(),este=CA.length>1&&CC_AG==='este';
  const L=ccAgendaLista(este?[at]:CA,hj,30);
  const tg=CA.length>1?`<div class="ccAgTg" role="group" aria-label="mostrar na agenda"><button type="button" class="${este?'':'on'}" data-act="cc-ag" data-id="todos" aria-pressed="${!este}">os ${CA.length} cartões</button><button type="button" class="${este?'on':''}" data-act="cc-ag" data-id="este" aria-pressed="${este}">este cartão</button></div>`:'';
  let mes=hj.slice(0,7),rows='';
  L.forEach(e=>{
    if(e.d.slice(0,7)!==mes){mes=e.d.slice(0,7);rows+=`<div class="ccAgMes">${MESES_LONGO[+mes.slice(5,7)-1]}</div>`;}
    const nm=esc(ccNome(e.c)),tit=e.k==='fecha'?nm+' fecha':e.k==='vence'?nm+' vence':'Melhor dia no '+nm;
    const dt=new Date(e.d+'T12:00:00'),act=e.k==='melhor'?`data-act="cc-ativa" data-id="${e.c.id}"`:`data-act="fat-abre" data-id="${esc(e.key)}"`;
    rows+=`<div class="ccAgE tap k-${e.k}${e.paga?' paga':''}" ${act} role="button" tabindex="0"><span class="ccAgD"><b>${e.d.slice(8,10)}</b><small>${e.d===hj?'hoje':CC_DSEM[dt.getDay()]}</small></span><span class="ccAgB" style="background:${e.k==='melhor'?'#fbbf24':ccTom(e.c)}"></span><span class="ccAgT"><b>${tit}</b><small>${e.sub}</small></span>${e.v!=null&&(e.v>0.004||e.paga)?`<span class="ccAgV nw">${brl(e.v)}</span>`:''}</div>`;
  });
  return `<div class="ccAgW"><div class="ccAgH"><h3>Agenda de ${MESES_LONGO[+hj.slice(5,7)-1]}</h3>${tg}</div><div class="card ccAg">${rows||'<p class="small" style="margin:6px 0">nada nos próximos 30 dias.</p>'}</div></div>`;
}
function ccMaisHTML(c){
  const usedT=usadoCartaoTotal(c),lim=+c.limite||0,pctR=lim?usedT/lim*100:(usedT>0?100:0),nivel=usedT>lim?'over':pctR>80?'alerta':'ok';
  const fl=faturasCartaoHTML(c);
  return `<div class="card ccMais"><h3>Mais do ${esc(ccNome(c))}</h3>
    ${fl||'<p class="small ccSemFat">nenhuma fatura fechada ainda.</p>'}
    <div class="walLimGr ccLimGr"><span><small>${c.bancoData?'usado · banco '+fmtData(c.bancoData).slice(0,5):'usado'}</small><b class="nw">${brl(usedT)}</b></span><span class="wlPct"><small>uso</small><b class="nw ${nivel}">${OCULTO?'•••':Math.round(pctR)+'%'}</b></span><span><small>fecha · vence</small><b class="nw">dia ${c.fechamento} · ${c.vencimento}</b></span></div>
    ${custoAtrasoHTML(c)}
    <div class="walActs ccMaisActs" role="group" aria-label="ações do cartão ${esc(ccNome(c))}"><button type="button" class="walAct ccViraB" data-act="cc-vira" data-id="${c.id}">${I('ccVira')}<span>virar</span></button><button type="button" class="walAct" data-act="edit-cartao" data-id="${c.id}">${I('edit')}<span>editar</span></button><button type="button" class="walAct" data-act="arq-cartao" data-id="${c.id}">${I('arquivo')}<span>arquivar</span></button><button type="button" class="walAct perigo" data-act="del-cartao" data-id="${c.id}">${I('trash')}<span>excluir</span></button></div>
  </div>`;
}
function ccRailHTML(CA){
  return `<div class="ccRail${CA.length===1?' um':''}" id="ccRail" role="group" aria-label="seus cartões, ${CA.length}">${CA.map(c=>`<div class="ccIt" data-id="${c.id}"><button type="button" class="ccCard" data-act="cc-ativa" data-id="${c.id}" data-nm="${esc(ccNome(c))}" aria-label="${esc(ccNome(c))}">${cartaoHTML(c,{verso:true,tilt:true})}</button></div>`).join('')}</div>`;
}
function ccDotsHTML(CA,at){
  return `<div class="ccDots">${CA.length>1?`<div class="ccDotL" role="tablist" aria-label="escolher cartão">${CA.map(c=>`<button type="button" role="tab" class="${c===at?'on':''}" aria-selected="${c===at}" data-act="cc-ativa" data-id="${c.id}" aria-label="${esc(ccNome(c))}"></button>`).join('')}</div>`:''}<button type="button" class="ccViraP" data-act="cc-vira" data-id="${at.id}" aria-label="virar o cartão e ver limite, fechamento e vencimento">${I('ccVira')}<span>virar</span></button></div>`;
}
function ccAtual(CA){const at=CA.find(c=>c.id===CC_AT)||CA[0];if(at&&CC_AT!==at.id)CC_AT=at.id;return at;}
function viewCartoes(){
  const CA=cartoesAtivos(),arqC=S.cartoes.filter(c=>c.arq);
  const head=`<div class="head ccHead"><h2>Cartões</h2><button type="button" class="ccPlus" data-act="novo-cartao" aria-label="novo cartão" title="novo cartão">${I('plus')}</button></div>`;
  const arq=arqC.length?`<details class="card arqBox"><summary>cartões arquivados (${arqC.length})</summary>${arqC.map(c=>`<div class="tx arqRow">${cartaoMini(c,'arqMini')}<div class="txt"><b>${esc(c.nome)}</b><small>${c.final?'final '+esc(c.final)+' · ':''}${c.arqEm?'arquivado em '+fmtData(c.arqEm):'arquivado'}</small></div><div class="val">${brl(usadoCartaoTotal(c))}</div><div class="acts2"><button class="btn2 sm" data-act="desarq-cartao" data-id="${c.id}">desarquivar</button><button class="btn2 sm danger" data-act="del-cartao" data-id="${c.id}">excluir</button></div></div>${faturasCartaoHTML(c)}`).join('')}<p class="small" style="margin:8px 0 0">as faturas e parcelas seguem valendo e aparecem nos avisos.</p></details>`:'';
  if(!CA.length)return head+`<div class="card ccVazio"><div class="ccVzArt" aria-hidden="true"><span class="ccVzC c1"></span><span class="ccVzC c2"><i></i></span></div>
      <b>${S.cartoes.length?'Todos os cartões estão arquivados':'Nenhum cartão ainda'}</b>
      <p>${S.cartoes.length?'Desarquive um cartão abaixo ou adicione outro para ver a fatura, o limite e o melhor dia de compra.':'Adicione seu cartão de crédito para acompanhar a fatura, o limite, as parcelas e saber qual cartão usar em cada dia.'}</p>
      <button type="button" class="btn" data-act="novo-cartao">${I('plus')} adicionar cartão</button></div>`+arq;
  const at=ccAtual(CA);
  return head+ccRailHTML(CA)+ccDotsHTML(CA,at)+ccFatHTML(at)+ccMelhorHTML(CA)+ccAgendaHTML(CA,at)+ccMaisHTML(at)+(CA.length>1?ccResumoHTML(CA):'')+(PLUGGY_ON()||S.tx.some(t=>t.cartao&&(t.pluggyId||t.parcGer))?prcBotaoHTML():'')+arq;
}
/* ---------- carrossel: escolha por rolagem, pontos, toque ---------- */
let CC_ROL=0,CC_ROL_T=0,CC_DET_T=0;
function ccItens(){const r=$('#ccRail');return r?[...r.querySelectorAll('.ccIt')]:[];}
function ccIdxRolagem(r){const its=[...r.querySelectorAll('.ccIt')];if(!its.length)return -1;
  if(r.scrollLeft>=r.scrollWidth-r.clientWidth-2&&r.scrollLeft>2)return its.length-1;
  const pl=parseFloat(getComputedStyle(r).scrollPaddingLeft)||0,x=r.getBoundingClientRect().left+pl;let b=0,bd=1e9;
  its.forEach((e,i)=>{const d=Math.abs(e.getBoundingClientRect().left-x);if(d<bd){bd=d;b=i;}});return b;}
function ccMarcaSel(){const its=ccItens();its.forEach(e=>{const on=e.dataset.id===CC_AT;e.classList.toggle('on',on);const b=e.querySelector('.ccCard');if(b){b.setAttribute('aria-current',on?'true':'false');b.setAttribute('aria-label',(b.dataset.nm||'')+(on?', em destaque. toque para virar':'. toque para escolher'));}});
  document.querySelectorAll('.ccDotL button').forEach(b=>{const on=b.dataset.id===CC_AT;b.classList.toggle('on',on);b.setAttribute('aria-selected',String(on));});}
function ccRolaPara(id,suave){const r=$('#ccRail');if(!r)return;const e=r.querySelector('.ccIt[data-id="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]');if(!e)return;
  const alvo=Math.max(0,Math.min(r.scrollWidth-r.clientWidth,e.offsetLeft-r.firstElementChild.offsetLeft));
  if(Math.abs(r.scrollLeft-alvo)<2)return;if(suave&&ccMov())r.scrollTo({left:alvo,behavior:'smooth'});else r.scrollLeft=alvo;}
function ccEscolhe(id,rolar){
  if(!cartoesAtivos().some(c=>c.id===id))return;
  const mudou=id!==CC_AT;CC_AT=id;try{localStorage.setItem('gv-cc-ativo',id);}catch(e){}
  ccMarcaSel();if(rolar)ccRolaPara(id,true);
  if(mudou){clearTimeout(CC_DET_T);CC_DET_T=setTimeout(()=>{if(TAB==='cartoes')render();},rolar?0:90);}
}
function ccRailLiga(){const r=$('#ccRail');if(!r||r.__lig)return;r.__lig=1;
  r.addEventListener('scroll',()=>{CC_ROL_T=Date.now();if(CC_ROL)return;CC_ROL=requestAnimationFrame(()=>{CC_ROL=0;const i=ccIdxRolagem(r),its=r.querySelectorAll('.ccIt');if(i<0||!its[i])return;const id=its[i].dataset.id;if(id!==CC_AT)ccEscolhe(id,false);});},{passive:true});}
/* depois de cada render: liga a rolagem, marca o destaque e, se o carrossel é novo (ou foi trocado), põe o cartão escolhido no lugar sem animação */
function ccDepois(){const r=$('#ccRail');if(!r)return;ccRailLiga();ccMarcaSel();
  if(Date.now()-CC_ROL_T<350)return; // o dedo ainda está rolando: não briga com ele
  const its=r.querySelectorAll('.ccIt'),i=ccIdxRolagem(r);if(its[i]&&its[i].dataset.id!==CC_AT)ccRolaPara(CC_AT,false);}
function ccAtiva(id){
  ccPedeOri();
  if(id===CC_AT){ccVira(id);return;}
  ccEscolhe(id,true);
}
function ccVira(id){
  const it=document.querySelector('.ccIt[data-id="'+id+'"]');if(!it)return;
  const b=it.querySelector('.ccCard'),g=it.querySelector('.gvc');if(!g)return;const v=!g.classList.contains('virado');
  g.classList.toggle('virado',v);if(b)b.setAttribute('aria-pressed',v?'true':'false');
  const fr=g.querySelector('.gvc-front'),bk=g.querySelector('.gvc-back');if(bk)bk.setAttribute('aria-hidden',v?'false':'true');if(fr)fr.setAttribute('aria-hidden',v?'true':'false');
  document.querySelectorAll('.ccViraP,.ccViraB').forEach(x=>x.classList.toggle('on',v));
}
/* toque longo no cartão em destaque também vira */
(()=>{let lp=null,dis=false;
  document.addEventListener('pointerdown',e=>{const b=e.target.closest&&e.target.closest('.ccIt.on .ccCard');if(!b)return;dis=false;lp={x:e.clientX,y:e.clientY,t:setTimeout(()=>{lp=null;dis=true;ccVira(b.dataset.id);try{navigator.vibrate&&navigator.vibrate(8);}catch(er){}},480)};},{passive:true});
  const solta=()=>{if(lp){clearTimeout(lp.t);lp=null;}};
  document.addEventListener('pointermove',e=>{if(lp&&(Math.abs(e.clientX-lp.x)>8||Math.abs(e.clientY-lp.y)>8))solta();},{passive:true});
  document.addEventListener('pointerup',solta,{passive:true});document.addEventListener('pointercancel',solta,{passive:true});
  document.addEventListener('click',e=>{if(dis&&e.target.closest&&e.target.closest('.ccCard')){dis=false;e.stopPropagation();e.preventDefault();}},true);
  document.addEventListener('contextmenu',e=>{if(e.target.closest&&e.target.closest('.ccCard'))e.preventDefault();});
})();
function viewBancos(){
  const total=S.bancos.reduce((a,b)=>a+saldoBanco(b),0);
  const pos=S.bancos.reduce((a,b)=>a+Math.max(0,saldoBanco(b)),0);
  const main=S.bancos.find(b=>b.principal);
  const ativos=bancosAtivos(),arqs=S.bancos.filter(b=>b.arq);
  const lst=ativos.map(b=>{
    const sb=saldoBanco(b);
    const share=pos&&sb>0?sb/pos*100:0;
    return `<div class="card bk hov ${b.principal?'main':''}">
      <button class="bk-star ${b.principal?'on':''}" data-act="principal" data-id="${b.id}" title="${b.principal?'conta principal':'definir como principal'}" aria-label="${b.principal?'conta principal':'definir como principal'}" aria-pressed="${b.principal?'true':'false'}"><svg viewBox="0 0 24 24" width="18" height="18" fill="${b.principal?'currentColor':'none'}" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.5l-5.1 2.7 1-5.7-4.1-4 5.7-.8z"/></svg></button>
      <div class="row"><div class="bk-l">${(()=>{const inf=BANCOS_BR.find(x=>x.n===b.nome);const dm=inf?inf.d:'';return (dm||b.logo)?bancoLogoHTML(dm?bancoLogo(dm):b.logo,b.nome,'bk-ic bk-logo',dm?bancoLogo2(dm):''):'<span class="bk-ic">'+I('bank')+'</span>';})()}<div><b title="${esc(b.nome)}" aria-label="${esc(b.nome)}">${esc(b.nome)}</b><small>${b.codigo?'cód. '+esc(b.codigo)+' · ':''}${esc(b.tipo)}</small></div></div></div>
      <div class="bk-val tap ${sb<0?'neg':''}" data-act="nav-conta" data-id="${b.id}" role="button" tabindex="0" aria-label="ver extrato de ${esc(b.nome)}">${brl(sb)}</div>
      <small>informado ${brl(Number(b.saldo)||0)}${b.saldoData?' em '+fmtData(b.saldoData):''}</small>
      <div class="bar"><i data-w="${share.toFixed(1)}"></i></div>
      <div class="row small"><span>${pos?Math.round(share)+'% do saldo positivo':'sem saldo positivo'}</span><button type="button" class="hmLink" data-act="nav-conta" data-id="${b.id}">ver extrato${I('chevR')}</button></div>
      <div class="acts2"><button class="btn2" data-act="edit-banco" data-id="${b.id}">editar</button><button class="btn2" data-act="arq-banco" data-id="${b.id}">arquivar</button><button class="btn2 danger" data-act="del-banco" data-id="${b.id}">excluir</button></div>
    </div>`;
  }).join('');
  return `
  <div class="head"><h2>Bancos</h2><button class="btn" data-act="novo-banco">${I('plus')} conta</button></div>
  <div class="bkActs">${PLUGGY_ON()?`<button class="bkAct" data-act="banco-sync"><span>${I('refresh')}</span>sincronizar</button>`:''}<button class="bkAct" data-act="importar"><span>${I('arrowDown')}</span>importar</button><button class="bkAct" data-act="nova-transf"><span>${I('swap')}</span>transferir</button><button class="bkAct" data-act="emp-lista"><span>${I('handCoins')}</span>empréstimos</button></div>
  ${S.bancos.length?(()=>{const st=saldoTotal(),sc=(cents(st)-cents(total))/100;return `<div class="card bkHero${total<0?' bkNeg':''}"><small>total em bancos</small><div class="bkBig nw">${total<0?'−':''}${brl(Math.abs(total))}</div>${total<0?`<span class="hB-neg">${I('alert')}no vermelho</span>`:''}
    <div class="bkMeta"><div><small>contas</small><b>${ativos.length}${arqs.length?` <em>+${arqs.length} arq.</em>`:''}</b></div><div><small>principal</small><b>${main?esc(main.nome):'nenhuma'}</b></div>${sc?`<div><small>fora de banco</small><b class="${sc<0?'neg':''}">${sc<0?'−':'+'}${brl(Math.abs(sc))}</b></div>`:''}${sc?`<div><small>saldo total</small><b class="${st<0?'neg':''}">${brl(st)}</b></div>`:''}</div></div>`;})()+`
    <div class="grid2">${lst||'<div class="card"><p class="vazio">todas as contas estão arquivadas.</p></div>'}</div>
    ${arqs.length?`<details class="card arqBox"><summary>contas arquivadas (${arqs.length})</summary>${arqs.map(b=>`<div class="tx arqRow"><div class="txt"><b>${esc(b.nome)}</b><small>${esc(b.tipo||'conta')}${b.arqEm?' · arquivada em '+fmtData(b.arqEm):''}</small></div><div class="val ${saldoBanco(b)<0?'neg':''}">${brl(saldoBanco(b))}</div><div class="acts2"><button class="btn2 sm" data-act="desarq-banco" data-id="${b.id}">desarquivar</button><button class="btn2 sm danger" data-act="del-banco" data-id="${b.id}">excluir</button></div></div>`).join('')}<p class="small" style="margin:8px 0 0">o histórico continua no extrato e nos relatórios. o saldo delas ainda entra no total.</p></details>`:''}`
    :vazioHTML('bank','Nenhuma conta ainda','Adicione seus bancos para ver quanto você tem no total e o saldo de cada um.','<button class="btn sm" data-act="novo-banco">+ conta</button>')}`;
}
/* v10.81: DM (emissora de cartões de loja) não é banco, mas aparece na escolha do cartão */
const CC_EXTRA=[{c:'',n:'DM',d:'',t:'',sub:'cartão de loja · DMCard'}];
function ccOpcoesVisual(t,atual){
  const auto=ccAuto(Object.assign({},t,{visual:''}));
  const nomeAuto=auto?CC_DES[auto].n:'genérico, na cor do banco';
  const op=(v,tx)=>`<option value="${esc(v)}" ${v===atual?'selected':''}>${esc(tx)}</option>`;
  const ks=Object.keys(CC_DES),grp=auto?CC_DES[auto].grp:'';
  const doBanco=grp?ks.filter(k=>CC_DES[k].grp===grp):[];
  const outros=ks.filter(k=>!doBanco.includes(k));
  return op('','Automático pelo banco · '+nomeAuto)
    +(doBanco.length?`<optgroup label="variantes do banco">${doBanco.map(k=>op(k,CC_DES[k].n)).join('')}</optgroup>`:'')
    +`<optgroup label="outros visuais">${outros.map(k=>op(k,CC_DES[k].n)).join('')}</optgroup>`
    +`<optgroup label="cor própria">${CARD_COR.map((x,i)=>op('cor:'+i,'Cor própria · '+x[2])).join('')}</optgroup>`;
}
function cartaoForm(id){
  const c=id?S.cartoes.find(x=>x.id===id):null;
  if(!c&&!cabeNoPlano('cartoes',cartoesAtivos().length))return; // v10.161: Grátis até 2 cartões
  const bk=c&&bancoDoCartao(c);
  const bVal=bk?bk.n:(c&&ccAuto(c)==='dm'?'DM':'');
  const visAt=c?(c.visual||(c.corPropria&&!ccAuto(c)?'cor:'+((c.cor||0)%CARD_COR.length):'')):'';
  form(c?'Editar cartão':'Novo cartão',[
    {name:'nome',label:'Nome do cartão',value:c?c.nome:'',required:true,placeholder:'ex: Platinum'},
    {name:'banco',type:'bancoPick',value:bVal,outro:(c&&!bVal)?c.banco:'',extra:CC_EXTRA},
    {name:'bandeira',label:'Bandeira',type:'select',value:c?c.bandeira||'':'',options:BANDEIRAS},
    {name:'visual',label:'Visual',type:'select',value:visAt,options:[{v:visAt,t:''}]},
    {name:'limite',label:'Limite (R$)',value:c?num(c.limite):'',required:true,inputmode:'decimal',placeholder:'0,00'},
    {name:'final',label:'Últimos 4 dígitos (opcional)',value:c?c.final:'',inputmode:'numeric',placeholder:'0000'},
    {name:'fechamento',label:'Dia de fechamento (1 a 31)',type:'number',min:1,max:31,required:true,value:c?c.fechamento:''},
    {name:'vencimento',label:'Dia de vencimento (1 a 31)',type:'number',min:1,max:31,required:true,value:c?c.vencimento:''},
    {name:'rotativo',label:'Juros do rotativo (% ao mês, opcional)',value:c&&c.rotativo?num(c.rotativo):'',inputmode:'decimal',placeholder:'ex: 14,5'},
    {name:'multaPct',label:'Multa por atraso (%)',value:c?num(c.multaPct||2):'2',inputmode:'decimal'},
    {name:'moraPct',label:'Juros de mora (% ao mês)',value:c?num(c.moraPct||1):'1',inputmode:'decimal'}
  ],v=>{
    const nome=String(v.nome).trim(),limite=parseBR(v.limite),fech=parseInt(v.fechamento,10),venc=parseInt(v.vencimento,10);
    const fin=String(v.final||'').replace(/\D/g,'').slice(-4);
    if(!nome)return 'Dê um nome ao cartão.';
    if(!(limite>0))return 'Informe o limite.';
    if(!(fech>=1&&fech<=31)||!(venc>=1&&venc<=31))return 'Dias de fechamento e vencimento entre 1 e 31.';
    const rot=parseBR(v.rotativo||''),mu=parseBR(v.multaPct||''),mo=parseBR(v.moraPct||'');
    if(rot>30)return 'Rotativo acima de 30% ao mês? Confira a taxa.';
    if(mu>10||mo>10)return 'Multa e mora costumam ser 2% e 1%. Confira.';
    const lv=(document.querySelector('#mf [name="nomeLivre"]')||{}).value||'';
    const banco=String(v.banco||lv).trim().slice(0,60);
    const vis=String(v.visual||''),ehCor=vis.indexOf('cor:')===0;
    const obj={nome,banco,bandeira:String(v.bandeira||''),visual:/^(cor:\d{1,2}|[a-z][a-z0-9_]{1,24})$/.test(vis)?vis:'',corPropria:ehCor,limite,final:fin,fechamento:fech,vencimento:venc,cor:ehCor?(parseInt(vis.slice(4),10)||0):(c&&!c.corPropria?c.cor||0:0),rotativo:pct(rot,30),multaPct:pct(mu,10),moraPct:pct(mo,10)};
    if(c)Object.assign(c,obj);else S.cartoes.push(Object.assign({id:uid()},obj));
    if(!c)CC_AT=S.cartoes[S.cartoes.length-1].id;
    geraRecorrentes();salvar();render();toast('Cartão salvo');
  });
  const mf=$('#mf');if(!mf)return;
  const q=n=>mf.querySelector('[name="'+n+'"]');
  const selV=q('visual');
  const prev=document.createElement('div');prev.className='ccPrev';prev.setAttribute('aria-live','polite');mf.insertBefore(prev,mf.firstChild);
  const tmp=()=>({id:'ccprev',nome:q('nome').value,banco:q('banco').value||(q('nomeLivre')?q('nomeLivre').value:''),bandeira:q('bandeira').value,final:String(q('final').value||'').replace(/\D/g,'').slice(-4),visual:selV.value,limite:0,fechamento:1,vencimento:1});
  const opcoes=()=>{const at=selV.value;selV.innerHTML=ccOpcoesVisual(tmp(),at);if(selV.value!==at)selV.value='';};
  const pinta=()=>{prev.innerHTML=cartaoHTML(tmp(),{cls:'gvc-prev'});};
  selV.innerHTML=ccOpcoesVisual(tmp(),visAt);pinta();
  ['nome','nomeLivre','final'].forEach(n=>{const e=q(n);if(e)e.addEventListener('input',()=>{if(n!=='final')opcoes();pinta();});});
  ['bandeira','visual'].forEach(n=>q(n).addEventListener('change',pinta));
  /* escolha do banco (antes, no cartão, o toque na lista não marcava nada) */
  const bl=mf.querySelector('.bkList');
  if(bl)bl.addEventListener('click',e=>{
    const o=e.target.closest('.bkOpt');if(!o)return;
    bl.querySelectorAll('.bkOpt').forEach(x=>{const on=x===o;x.classList.toggle('on',on);x.setAttribute('aria-selected',String(on));});
    const other=o.classList.contains('bkOther');
    q('banco').value=other?'':o.dataset.n;
    mf.querySelector('.bkOutro').style.display=other?'':'none';
    if(other)setTimeout(()=>{const i=q('nomeLivre');if(i)i.focus();},30);
    opcoes();pinta();
  });
}
function bancoForm(id){
  const b=id?S.bancos.find(x=>x.id===id):null;
  const info=b?BANCOS_BR.find(x=>x.n===b.nome):null;
  form(b?'Editar conta':'Nova conta',[
    {name:'nome',type:'bancoPick',value:info?info.n:'',outro:(b&&!info)?b.nome:''},
    {name:'codigo',type:'hidden',value:b?(b.codigo||(info?info.c:'')):''},
    {name:'logo',type:'hidden',value:b?(b.logo||(info?bancoLogo(info.d):'')):''},
    {name:'tipo',label:'Tipo',type:'select',value:b?b.tipo:BANCO_TIPOS[0],options:BANCO_TIPOS.map(x=>({v:x,t:x}))},
    {name:'saldo',label:'Saldo atual (R$)',value:b?num(b.saldo):'',inputmode:'decimal',placeholder:'0,00'}
  ],v=>{
    const lv=(document.querySelector('#mf [name="nomeLivre"]')||{}).value||'';
    const nome=String(v.nome||lv).trim();
    if(!nome)return 'Escolha um banco da lista ou informe o nome.';
    const sal=parseBR(v.saldo);
    const obj={nome,codigo:String(v.codigo||'').trim(),logo:String(v.logo||'').trim(),tipo:v.tipo||BANCO_TIPOS[0],saldo:sal,saldoData:(b&&Number(b.saldo)===sal&&b.saldoData)?b.saldoData:hojeISO()};
    if(b)Object.assign(b,obj);else S.bancos.push(Object.assign({id:uid(),principal:S.bancos.length===0},obj));
    if(!S.bancos.some(x=>x.principal)&&bancosAtivos().length)bancosAtivos()[0].principal=true;
    salvar();render();toast('Conta salva');
  });
  const mf=$('#mf');
  const bl=mf.querySelector('.bkList');
  bl.addEventListener('click',e=>{
    const o=e.target.closest('.bkOpt');if(!o)return;
    bl.querySelectorAll('.bkOpt').forEach(x=>{const on=x===o;x.classList.toggle('on',on);x.setAttribute('aria-selected',String(on));});
    const other=o.classList.contains('bkOther');
    mf.querySelector('[name="nome"]').value=other?'':o.dataset.n;
    mf.querySelector('[name="codigo"]').value=other?'':o.dataset.c;
    mf.querySelector('[name="logo"]').value=other?'':o.dataset.l;
    mf.querySelector('.bkOutro').style.display=other?'':'none';
    if(!other&&o.dataset.t)mf.querySelector('[name="tipo"]').value=o.dataset.t;
    if(other)setTimeout(()=>{const i=mf.querySelector('[name="nomeLivre"]');if(i)i.focus();},30);
  });
}

/* ---------- modal de formulário genérico ---------- */
function campoHTML(c){
  if(c.type==='hidden')return `<input type="hidden" name="${c.name}" value="${esc(c.value==null?'':c.value)}">`;
  if(c.type==='bancoPick'){
    const opts=(c.extra||[]).concat(BANCOS_BR).map(b=>{const sel=c.value===b.n;const lg=bancoLogo(b.d);return `<button type="button" class="bkOpt${sel?' on':''}" aria-selected="${sel}" data-n="${esc(b.n)}" data-c="${esc(b.c)}" data-l="${esc(lg)}" data-t="${esc(b.t||'')}" title="${esc(b.n)}">${bancoLogoHTML(lg,b.n,'bo-logo',bancoLogo2(b.d))}<span class="bo-txt"><b>${esc(b.n)}</b><small>${b.sub?esc(b.sub):b.c?'código '+esc(b.c):'sem código'}</small></span></button>`;}).join('');
    return `<div class="bkPick"><input type="hidden" name="${c.name}" value="${esc(c.value||'')}"><span class="bkPickLbl">Banco ou instituição</span><div class="bkList" role="listbox" aria-label="lista de bancos">${opts}<button type="button" class="bkOpt bkOther${c.outro?' on':''}" aria-selected="${!!c.outro}" data-n="" data-c="" data-l="" data-t=""><span class="bo-logo bo-plain"><span class="bl-ini">+</span></span><span class="bo-txt"><b>outra instituição</b><small>digitar o nome</small></span></button></div><label class="bkOutro" style="${c.outro?'':'display:none'}">Nome da instituição<input name="nomeLivre" value="${esc(c.outro||'')}" placeholder="ex: cooperativa X" autocomplete="off"></label></div>`;
  }
  if(c.type==='seg')return segHTML(c);
  if(c.type==='html')return c.html||''; // v10.87: bloco montado pela tela (ex.: seletor da FIPE)
  if(c.type==='checkbox')return `<label class="ckrow"><input type="checkbox" name="${c.name}" value="1" ${c.value?'checked':''}><span>${esc(c.label)}</span></label>`;
  if(c.type==='select')return `<label>${esc(c.label)}<select name="${c.name}">${c.options.map(o=>`<option value="${esc(o.v)}" ${String(o.v)===String(c.value)?'selected':''}>${esc(o.t)}</option>`).join('')}</select></label>`;
  const attrs=[
    c.required?'required':'',
    c.placeholder?`placeholder="${esc(c.placeholder)}"`:'',
    c.inputmode==='decimal'&&/\(R\$\)/.test(c.label||'')?'class="money"':'',
    c.inputmode?`inputmode="${c.inputmode}"`:'',
    c.min!=null?`min="${c.min}"`:'',
    c.max!=null?`max="${c.max}"`:''
  ].join(' ');
  const dl=Array.isArray(c.list)&&c.list.length?`<datalist id="dl-${c.name}">${c.list.map(o=>`<option value="${esc(o)}"></option>`).join('')}</datalist>`:'';
  if(c.type==='textarea')return `<label>${esc(c.label)}<textarea name="${c.name}" rows="2" maxlength="${c.maxlength||300}" ${attrs}>${esc(c.value==null?'':c.value)}</textarea></label>`;
  return `<label>${esc(c.label)}<input name="${c.name}" type="${c.type||'text'}" value="${esc(c.value==null?'':c.value)}" ${dl?`list="dl-${c.name}"`:''} ${c.maxlength?`maxlength="${c.maxlength}"`:''} ${attrs}>${dl}</label>`;
}
/* máscara de moeda pt-BR: digitar 1500 -> 15,00 ; 150000 -> 1.500,00 */
/* valor em reais como a pessoa digita: "300" = R$ 300,00 e "12,5" = R$ 12,50.
   antes a máscara tratava os dígitos como centavos, então "300" virava R$ 3,00. */
function maskMoney(el){
  let v=String(el.value);
  if(/\.$/.test(v)&&!v.includes(','))v=v.slice(0,-1)+','; // teclado com ponto decimal
  v=v.replace(/[^\d,]/g,'');
  const i=v.indexOf(',');
  let int=i<0?v:v.slice(0,i),dec=i<0?null:v.slice(i+1).replace(/,/g,'').slice(0,2);
  int=int.replace(/^0+(?=\d)/,'').slice(0,10);
  if(int===''&&dec!==null)int='0';
  int=int.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  el.value=int+(dec!==null?','+dec:'');
}
function fechaMoney(el){if(!el.value)return;const n=parseBR(el.value);el.value=n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
document.addEventListener('input',e=>{if(e.target&&e.target.matches&&e.target.matches('input.money'))maskMoney(e.target);});
document.addEventListener('blur',e=>{if(e.target&&e.target.matches&&e.target.matches('input.money'))fechaMoney(e.target);},true);
function form(titulo,campos,onSubmit){
  const box=$('#modal');
  box.innerHTML=`<div class="sheet">
    <div class="sh-head"><h3>${esc(titulo)}</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <form id="mf" autocomplete="off" novalidate>${campos.map(campoHTML).join('')}
      <button class="btn full" type="submit">Salvar</button>
    </form></div>`;
  box.classList.add('on');
  $('#mf').onsubmit=e=>{
    e.preventDefault();
    const fd=new FormData(e.target),vals={};
    campos.forEach(c=>{vals[c.name]=fd.get(c.name)||'';});
    box.querySelectorAll('label.bad').forEach(l=>l.classList.remove('bad'));
    const err=onSubmit(vals);
    if(err){
      campos.forEach(c=>{if(c.required&&!String(vals[c.name]).trim()){const el=box.querySelector('[name="'+c.name+'"]');if(el)el.closest('label').classList.add('bad');}});
      const f=box.querySelector('label.bad input,label.bad select');if(f)f.focus();
      toast(err,true);return;
    }
    closeModal();
  };
  const first=box.querySelector('input,select');if(first&&first.type!=='date')setTimeout(()=>{if(box.querySelector('.roda'))return;const a=document.activeElement;if(!(a&&box.contains(a)&&/INPUT|SELECT|TEXTAREA/.test(a.tagName)))first.focus();},60);
}
let focoAntes=null;
/* ---------- importar extrato (OFX / CSV) ---------- */
function numExt(v){
  let x=String(v==null?'':v).trim().replace(/\s|R\$/g,'');if(!x)return NaN;
  let neg=false;if(/^\(.*\)$/.test(x)){neg=true;x=x.slice(1,-1);}
  if(/-$/.test(x)){neg=true;x=x.slice(0,-1);}
  if(/^[-−]/.test(x)){neg=true;x=x.slice(1);}
  const c=x.lastIndexOf(','),d=x.lastIndexOf('.');
  /* v10.52: "1.500" com só ponto e grupos de 3 é milhar (R$ 1.500), não decimal */
  if(c<0&&d>=0&&/^\d{1,3}(\.\d{3})+$/.test(x))x=x.replace(/\./g,'');
  else if(c>d)x=x.replace(/\./g,'').replace(',','.');else x=x.replace(/,/g,'');
  if(!/^\d*\.?\d+$/.test(x))return NaN; // v10.54: nada de Infinity, 1e5 ou texto
  const n=parseFloat(x);return !isFinite(n)||n>1e10?NaN:(neg?-Math.abs(n):n);
}
/* v10.54: só aceita data que existe no calendário (31/02, 2026-13-01 e 9999 viram vazio) */
function dataOk(y,m,d){y=+y;m=+m;d=+d;if(y<1990||y>2100||m<1||m>12||d<1)return '';const dt=new Date(Date.UTC(y,m-1,d));const p2=n=>(n<10?'0':'')+n;return dt.getUTCDate()===d?y+'-'+p2(m)+'-'+p2(d):'';}
function dataExt(v){
  const s=String(v||'').trim();let m;
  if((m=s.match(/^(\d{4})-?(\d{2})-?(\d{2})/)))return dataOk(m[1],m[2],m[3]);
  if((m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))){const y=m[3].length===2?'20'+m[3]:m[3];return dataOk(y,m[2],m[1]);}
  return '';
}
function lerOFX(txt){
  const tag=(b,t)=>{const m=b.match(new RegExp('<'+t+'>([^<\\r\\n]*)','i'));return m?m[1].trim():'';};
  const cartao=/<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(txt);
  const out=[];
  (txt.match(/<STMTTRN>[\s\S]*?(<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi)||[]).forEach(b=>{
    const valor=numExt(tag(b,'TRNAMT')),data=dataExt(tag(b,'DTPOSTED'));
    const desc=(tag(b,'MEMO')||tag(b,'NAME')).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
    if(!isNaN(valor)&&data)out.push({data,valor,desc,fitid:tag(b,'FITID')});
  });
  return {linhas:out,cartao};
}
function splitCSV(line,sep){
  const r=[];let cur='',q=false;
  for(let i=0;i<line.length;i++){const ch=line[i];
    if(q){if(ch==='"'){if(line[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=ch;}
    else if(ch==='"')q=true;else if(ch===sep){r.push(cur);cur='';}else cur+=ch;}
  r.push(cur);return r.map(x=>x.trim());
}
function lerCSV(txt){
  const ls=txt.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim());
  if(ls.length<2)return {linhas:[],cartao:false,erro:'Arquivo sem linhas.'};
  const sep=(ls[0].split(';').length>ls[0].split(',').length)?';':',';
  const h=splitCSV(ls[0],sep).map(norm);
  const idx=re=>h.findIndex(x=>re.test(x));
  const iD=idx(/^(data|date|dt)/),iV=idx(/^(valor|amount|value|quantia)/),iDesc=idx(/(descri|title|titulo|historico|memo|estabelecimento|lancamento)/),iId=idx(/^(identificador|id|fitid)$/);
  /* v10.84: a planilha do próprio app tem "Dia trabalhado" (dd/mm/aaaa ou ISO); sem a coluna, segue como antes */
  const iTrab=idx(/^(dia trabalhado|data trabalhada|trabalhado em|competencia)$/);
  const iTipo=idx(/^tipo$/); // v10.88: planilha do próprio app traz o tipo (transferência, empréstimo...)
  if(iD<0||iV<0)return {linhas:[],cartao:false,erro:'Não encontrei as colunas de data e valor no CSV.'};
  // Nubank cartão (date,title,amount): compras vêm positivas
  const cartao=h[iD]==='date'&&h[iV]==='amount'&&h[iDesc]==='title';
  const out=[];
  ls.slice(1).forEach(l=>{const c=splitCSV(l,sep);const data=dataExt(c[iD]);let valor=numExt(c[iV]);
    if(!data||isNaN(valor))return;if(cartao)valor=-valor;
    /* v10.52: fitid vem do arquivo: só caracteres seguros (senão vira id novo na importação) */
    out.push({data,valor,desc:iDesc>=0?c[iDesc]:'',fitid:iId>=0?String(c[iId]).replace(/[^A-Za-z0-9_.\-:|]/g,'').slice(0,90):'',trab:iTrab>=0&&!cartao&&valor>0?dataExt(c[iTrab]):'',tipoPlan:iTipo>=0?norm(c[iTipo]).slice(0,30):''});});
  return {linhas:out,cartao};
}
const REGRAS_CAT=[
  [/ifood|rappi|99 ?food|ze delivery|aiqfome|james delivery|delivery/,'Delivery'],
  [/supermerc|mercado(?! ?(livre|pago))|atacad|assai|carrefour|pao de acucar|hortifruti|acougue|sacolao|big box|\bdia\b|extra\b|oba\b|st marche|swift/,'Mercado'],
  [/restaur|lanchon|burger|mc ?donald|pizza|outback|subway|habib|giraffas|spoleto|madero|churrasc|sushi|bk\b|coco bambu/,'Restaurantes'],
  [/posto|combust|gasolina|etanol|ipiranga|shell|petrobras|br mania|ale combust/,'Combustível'],
  [/uber(?! ?eats)|99 ?(app|pop|tecnologia|taxi)|cabify|indrive|taxi/,'Uber e táxi'],
  [/metro|onibus|\bbus\b|bilhete unico|sptrans|cptm|brt|top transporte|riocard/,'Transporte público'],
  [/oficina|mecanic|auto ?pecas|borracharia|lava ?jato|pneu|funilaria/,'Manutenção do carro'],
  [/energia|neoenergia|enel|cemig|light\b|copel|celpe|coelba|sabesp|caesb|saneamento|copasa|comgas|naturgy|agua e esgoto/,'Contas da casa'],
  [/vivo|claro|\btim\b|telefonica|\boi\b|net servicos|internet|fibra|starlink/,'Internet e celular'],
  [/netflix|spotify|disney|hbo|\bmax\b|prime video|youtube|deezer|globoplay|apple\.com|icloud|google one|chatgpt|openai|paramount|crunchyroll/,'Assinaturas'],
  [/farmac|drogar|droga ?raia|drogasil|pague menos|panvel|ultrafarma/,'Farmácia'],
  [/academia|smart ?fit|bluefit|selfit|crossfit|bodytech|gympass|wellhub|totalpass/,'Academia'],
  [/petz|cobasi|petlove|veterin|pet ?shop/,'Pets'],
  [/latam|gol linhas|azul linhas|smart travel|decolar|booking|airbnb|hotel|pousada|123 ?milhas|maxmilhas|cvc|hurb/,'Viagem'],
  [/renner|riachuelo|c ?& ?a\b|cea\b|zara|shein|hering|marisa|centauro|netshoes|nike|adidas/,'Roupas'],
  [/salao|barbear|cabeleire|manicure|estetica|boticario|natura|sephora|avon/,'Beleza'],
  [/kabum|fast shop|apple store|samsung|dell|pichau|terabyte/,'Eletrônicos'],
  [/amazon|mercado ?livre|shopee|magalu|magazine luiza|americanas|casas bahia|aliexpress|temu/,'Compras'],
  [/leroy|telhanorte|material de constru|madeireira|tok ?& ?stok|camicado|ikea/,'Casa e reformas'],
  [/iof|tarifa|anuidade|juros|encargo|multa|mora\b/,'Tarifas e juros'],
  [/darf|ipva|iptu|detran|licenciamento|receita federal|gru\b|das\b|simples nacional/,'Impostos e taxas'],
  [/doacao|vakinha|unicef|dizimo|oferta/,'Doações'],
  [/ifood|rappi|restaur|lanchon|padaria|mercado|supermerc|atacad|assai|carrefour|pao de acucar|hortifruti|acougue|burger|mc ?donald|pizza|cafe|almoco|jantar|lanche|sorvet|acai|bk\b|subway|outback|feira|big box|dia\b|extra\b|atacadao|comida|marmita/,'Alimentação'],
  [/uber|99 ?(app|pop|tecnologia)?|cabify|posto|combust|gasolina|etanol|alcool|ipiranga|shell|petrobras br|estacion|metro|onibus|\bbus\b|mobilida|brt|pedagio|sem parar|veloe|passagem|mecanic|oficina|ipva|licenciament|seguro auto/,'Transporte'],
  [/farmac|drogar|academia|smart ?fit|bluefit|selfit|crossfit|droga ?raia|pague menos|hospital|clinica|laborat|odonto|unimed|amil|hapvida/,'Saúde'],
  [/netflix|spotify|disney|hbo|max\b|prime video|youtube|cinema|ingresso|steam|playstation|xbox|bar\b|show/,'Lazer'],
  [/aluguel|imobiliar|condomin|energia|neoenergia|enel|cemig|light\b|caesb|sabesp|saneamento|agua|internet|vivo|claro|tim\b|oi\b|net\b|gas\b/,'Moradia'],
  [/escola|faculdade|universid|curso|udemy|alura|livrar|mensalidade/,'Educação']
];
function chaveRegra(desc){return norm(desc).replace(/\d+/g,'').replace(/[^a-z ]+/g,' ').replace(/\s+/g,' ').trim().slice(0,60);}
/* v10.14: sugestão para o formulário: só devolve quando há um motivo (regra aprendida, histórico ou palavra-chave) */
function sugestaoCat(desc,tipo){
  const n=norm(desc||'').trim();if(n.length<3)return null;
  const lista=tipo==='receita'?CATS_RECEITA:S.cats;
  const rg=(S.cfg.regras||{})[tipo[0]+':'+chaveRegra(desc)];
  if(rg&&lista.includes(rg))return {c:rg,por:'regra'};
  const hist=S.tx.filter(t=>t.tipo===tipo&&t.descricao&&!t.faturaKey&&lista.includes(t.categoria));
  const conta=f=>{const mp={};hist.forEach(t=>{if(f(norm(t.descricao)))mp[t.categoria]=(mp[t.categoria]||0)+1;});const k=Object.keys(mp).sort((a,b)=>mp[b]-mp[a])[0];return k||null;};
  let c=conta(x=>x===n);if(c)return {c,por:'hist'};
  const p1=n.split(' ')[0];
  if(p1.length>=3){c=conta(x=>x.split(' ')[0]===p1||x.startsWith(n));if(c)return {c,por:'hist'};}
  if(tipo==='despesa')for(const [re,cc] of REGRAS_CAT){if(re.test(n)&&lista.includes(cc))return {c:cc,por:'palavra'};}
  if(tipo==='receita'){const R=[[/salari|folha|holerite|pagamento empresa/,'Salário'],[/hora extra|horas extras/,'Horas extras'],[/dividend|jcp|juros sobre capital|provento/,'Dividendos'],[/bonus|bônus|plr|premio|comiss/,'Bônus/Promoções'],[/rendiment|cdb|tesouro|poupanca/,'Rendimentos'],[/inss|aposentad/,'Aposentadoria']];for(const [re,cc] of R)if(re.test(n)&&lista.includes(cc))return {c:cc,por:'palavra'};}
  return null;
}
function catSugerida(desc,tipo){
  const n=norm(desc);const rg=(S.cfg.regras||{})[tipo[0]+':'+chaveRegra(desc)];
  if(rg&&(tipo==='receita'?CATS_RECEITA.concat(S.cats):S.cats).includes(rg))return rg;
  const igual=S.tx.filter(t=>t.tipo===tipo&&norm(t.descricao)===n&&!t.faturaKey).sort((a,b)=>b.data.localeCompare(a.data))[0];
  if(igual&&S.cats.includes(igual.categoria))return igual.categoria;
  if(tipo==='despesa')for(const [re,c] of REGRAS_CAT){if(re.test(n)&&S.cats.includes(c))return c;}
  return S.cats.includes('Outros')?'Outros':S.cats[0];
}
const IGNORA_RE=[[/pagamento (de )?fatura|pgto fatura|pag fatura|fatura (do )?cartao/,'pagamento de fatura (as compras do cartão já contam)'],[/aplicacao|resgat|rdb|cdb|poupanca|caixinha|guardad|renda variavel|renda fixa|de investimentos|saldo de investimentos/,'movimentação de investimento ou caixinha'],[/transferencia (enviada|recebida) .*(mesma titularidade|propria)|entre contas/,'transferência entre suas contas']];
function idImport(destino,l){const k=destino+'|'+(l.fitid||(l.data+'|'+l.valor+'|'+norm(l.desc)));let h=2166136261;for(let i=0;i<k.length;i++){h^=k.charCodeAt(i);h=Math.imul(h,16777619);}return 'imp-'+(h>>>0).toString(36)+'-'+k.length.toString(36);}
let IMP=null;
/* v10.17: dinheiro entre contas suas (seu nome, corretoras, câmbio) não é receita nem despesa */
function nomeProprio(){const md=(USER&&USER.user_metadata)||{};const n=norm(String(md.full_name||md.name||S.cfg.nomeCompleto||''));return n.split(/\s+/).filter(Boolean).length>=2?n:'';}
function ehPropria(desc){const n=norm(desc);if(!n)return false;
  const cp=norm(String(desc).split('|').slice(1).join('|'));if(cp&&(S.cfg.proprias||[]).includes(cp))return true;
  if(/mesma titularidade|conta propria|entre contas|renda variavel|renda fixa|de investimentos|saldo de investimentos|resgat|aplicacao|caixinha|\bwise\b|foxbit|binance|mercado bitcoin|nomad|avenue|inter&co|corretora de cambio|ativos virtuais|tokenizadora|avenia|corretora|corretora de valores|xp investimentos|btg pactual|rico investimentos|clear corretora/.test(n))return true;
  const nm=nomeProprio();if(!nm)return false;const p=nm.split(/\s+/);return n.includes(p[0]+' '+p[1])&&(p.length<3||n.includes(p[p.length-1]));}
/* v10.24: reclassifica uma vez o que veio do banco nas categorias novas e mais específicas */
function recatBanco(){if(S.cfg.recatV>=1)return 0;let k=0;const amplas=['Alimentação','Transporte','Saúde','Lazer','Moradia','Educação','Outros'];
  S.tx.forEach(t=>{if(t.origem!=='banco'||t.faturaKey||!t.descricao)return;const n=norm(t.descricao);
    if((S.cfg.regras||{})[t.tipo[0]+':'+chaveRegra(t.descricao)])return; // você já escolheu
    if(t.tipo==='despesa'&&amplas.includes(t.categoria)){for(const [re,c] of REGRAS_CAT){if(re.test(n)){if(CATS_NOVAS.includes(c)&&S.cats.includes(c)&&c!==t.categoria){t.categoria=c;t.sub='';k++;}break;}}}
    else if(t.tipo==='receita'&&(t.categoria==='Outros'||!t.categoria)&&/reembolso|estorno|devolu|cashback/.test(n)){t.categoria='Reembolso';k++;}});
  S.cfg.recatV=1;salvar();return k;}
function migraPropria(){if(!USER||S.cfg.migPropria>=2)return false;let k=0;
  S.tx.forEach(t=>{if(t.origem!=='banco'||!t.conta||t.tipo==='transf'||!ehPropria(t.descricao))return;
    const b='b:'+t.conta;Object.assign(t,{tipo:'transf',de:t.tipo==='despesa'?b:'',para:t.tipo==='receita'?b:'',categoria:'Transferência',conta:'',forma:'',cartao:''});k++;});
  S.cfg.migPropria=2;salvar();return k;}
/* ---------- v10.15: conexão com o banco (Meu Pluggy, via Edge Function pluggy-sync) ---------- */
/* v10.160: no MVP a conexão bancária some da tela e nenhuma chamada (automática ou não) vai ao pluggy-sync.
   o que já entrou do banco continua no app como qualquer lançamento. */
function PLUGGY_ON(){return !MVP_MODE&&!!(S.cfg&&S.cfg.pluggyOn);}
async function pluggy(body){
  if(MVP_MODE)throw new Error('conexão bancária indisponível nesta versão');
  const {data,error}=await sb.functions.invoke('pluggy-sync',{body});
  if(error){let m='não consegui falar com o servidor';try{const j=await error.context.json();if(j&&j.erro)m=j.erro;}catch(e){}throw new Error(m);}
  if(data&&data.erro)throw new Error(data.erro);
  return data;
}
/* v10.136: WhatsApp. O app só gera o código de ligação e mostra o estado; ler e salvar acontece no servidor (whatsapp-webhook).
   O lançamento salvo pelo WhatsApp chega aqui na próxima sincronização (tag "whatsapp"). */
let WA_ST=null;
async function waChama(acao){
  const {data,error}=await sb.functions.invoke('whatsapp-vincular',{body:{acao}});
  if(error){let m='não consegui falar com o servidor';try{const j=await error.context.json();if(j&&j.erro)m=j.erro;}catch(e){}throw new Error(m);}
  if(data&&data.erro)throw new Error(data.erro);
  return data;
}
async function atualizaWaUI(){
  const tx=$('#waTxt'),bt=$('#waBtns'),sc=$('#waSt');if(!tx||!bt)return;
  if(!USER){bt.innerHTML='';return;}
  try{
    const st=(WA_ST&&WA_ST.uid===USER.id&&Date.now()-WA_ST.t<300000)?WA_ST.st:await waChama('status');
    WA_ST={st,t:WA_ST&&WA_ST.st===st?WA_ST.t:Date.now(),uid:USER.id};
    const t2=$('#waTxt'),b2=$('#waBtns'),s2=$('#waSt');if(!t2||!b2)return;
    const pinta=(k,l)=>{if(s2){s2.className='bcSt'+(k?' on':'');s2.innerHTML='<i></i>'+l;}};
    if(!st.ativo){pinta(false,'em breve');t2.textContent='mande "gastei 32 no almoço" para o WhatsApp do GranaViva e o lançamento entra aqui, já com a categoria. está chegando.';b2.innerHTML='';return;}
    if(!st.pode){pinta(false,'Pro');t2.textContent='mande "gastei 32 no almoço" e o lançamento entra aqui, já com a categoria. faz parte do Pro.';b2.innerHTML=`<button class="btn" data-act="planos" data-id="leitura_ia">ver planos</button>`;return;}
    if(st.vinculado){pinta(true,'ligado');t2.textContent='ligado ao número '+st.telefone+'. mande o gasto do jeito que você falaria, como "uber 18,50 ontem", e toque em Salvar.';
      b2.innerHTML=`<button class="btn" data-act="wa-abrir">${I('chat')}abrir</button><div class="bcSec"><button class="bcDel" data-act="wa-desligar">${I('logout')}desligar</button></div>`;return;}
    pinta(false,'desligado');t2.textContent='mande "gastei 32 no almoço" e o lançamento entra aqui, já com a categoria. você confere e toca em Salvar.';
    b2.innerHTML=`<button class="btn" data-act="wa-ligar">${I('link')}ligar meu WhatsApp</button>`;
  }catch(e){const t2=$('#waTxt'),b2=$('#waBtns');if(t2)t2.textContent='o WhatsApp ainda não está disponível no servidor.';if(b2)b2.innerHTML='';}
}
async function waLigar(){
  if(!USER){toast('Entre na sua conta primeiro.',true);return;}
  let o;try{o=await waChama('codigo');}catch(e){toast(e.message,true);return;}
  WA_ST=null;
  const url='https://wa.me/'+String(o.numero).replace(/\D/g,'')+'?text='+encodeURIComponent('GV '+o.codigo);
  confirma({titulo:'Código '+o.codigo,texto:'Toque em Abrir: o WhatsApp do GranaViva abre com a mensagem já escrita, é só enviar. O código vale '+(o.expiraMin||15)+' minutos.',ok:'Abrir'},()=>{location.href=url;});
}
function waDesligar(){
  confirma({titulo:'Desligar o WhatsApp?',texto:'As mensagens desse número deixam de virar lançamentos. O que já foi salvo continua no app.',ok:'Desligar',perigo:true},async()=>{
    try{await waChama('desvincular');WA_ST=null;toast('WhatsApp desligado');atualizaWaUI();}catch(e){toast(e.message,true);}});
}
let BC_ST=null;
async function atualizaBancoUI(){
  if(MVP_MODE)return;
  const tx=$('#bcTxt'),bt=$('#bcBtns');if(!tx||!bt)return;
  if(!USER){bt.innerHTML='';return;}
  try{
    /* v10.54: status guardado por 5 min (antes: uma chamada ao servidor a cada vez que a tela desenhava) */
    const st=(BC_ST&&BC_ST.uid===USER.id&&Date.now()-BC_ST.t<300000)?BC_ST.st:await pluggy({acao:'status'});
    BC_ST={st,t:BC_ST&&BC_ST.st===st?BC_ST.t:Date.now(),uid:USER.id};
    if(!!st.conectado!==!!S.cfg.pluggyOn){S.cfg.pluggyOn=!!st.conectado;salvar();}
    if(st.conectado){
      const ul=st.ultima?new Date(st.ultima):null,sc=$('#bcSt');if(sc){sc.className='bcSt on';sc.innerHTML='<i></i>conectado';}
      const bks=[...new Set(S.bancos.map(b=>b.nome))].filter(n=>BANCOS_BR.some(x=>x.c&&x.n===n));
      tx.innerHTML=`<div class="bcGrid"><span><small>conexões</small><b>${st.itens}</b></span><span><small>última busca</small><b>${ul?ul.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' · '+ul.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'—'}</b></span>${bks.length?`<span class="bcBks"><small>instituições</small><b>${bks.map(n=>{const x=BANCOS_BR.find(y=>y.n===n);return bancoLogoHTML(bancoLogo(x.d),n,'bcLg',bancoLogo2(x.d));}).join('')}${bks.length===1?esc(NOME_CURTO[bks[0]]||bks[0]):''}</b></span>`:''}</div><p class="bcNota">${I('refresh')}o banco atualiza os dados cerca de uma vez por dia.</p>`;
      bt.innerHTML=`<button class="btn bcSync" data-act="banco-sync">${I('refresh')}buscar agora</button><div class="bcSec"><button class="btn2" data-act="banco-config">${I('sliders')}editar conexão</button><button class="bcDel" data-act="banco-remover">${I('logout')}desconectar</button></div><button class="btn2 bcParc" data-act="parc-verif">${I('card')}verificar parcelas</button>`;
    }else{
      {const sc=$('#bcSt');if(sc){sc.className='bcSt';sc.innerHTML='<i></i>desligado';}}
      tx.classList.add('bcIntro');tx.innerHTML='traga os lançamentos das suas contas e cartões direto do banco, sem digitar. usa o Meu Pluggy, gratuito para uso pessoal. você revisa tudo antes de entrar no app.';
      bt.innerHTML=`<button class="btn" data-act="banco-config">${I('link')}conectar banco</button>`;
    }
  }catch(e){tx.textContent='a conexão com o banco ainda não está disponível no servidor.';bt.innerHTML='';}
}
function bancoConfig(){
  if(!USER){toast('Entre na sua conta primeiro.',true);return;}
  form('Conectar banco',[
    {name:'clientId',label:'Client ID (dashboard.pluggy.ai → Aplicações)',value:'',required:true,placeholder:'xxxxxxxx-xxxx-…'},
    {name:'clientSecret',label:'Client Secret',type:'password',value:'',required:true,placeholder:'aparece uma vez só, quando você gera'},
    {name:'itemIds',label:'itemId (um por conexão, separe por vírgula)',type:'textarea',value:'',required:true,placeholder:'Demo → Itens conectados → copie o id'}
  ],v=>{
    if(!String(v.clientId).trim()||!String(v.clientSecret).trim()||!String(v.itemIds).trim())return 'Preencha os três campos.';
    (async()=>{toast('Conferindo com o Pluggy…');
    try{BC_ST=null;const r=await pluggy({acao:'salvar',clientId:v.clientId,clientSecret:v.clientSecret,itemIds:v.itemIds});
      S.cfg.pluggyOn=true;salvar();render();toast('Banco conectado · '+r.contas+' '+(r.contas===1?'conta encontrada':'contas encontradas'));setTimeout(bancoSync,400);
    }catch(e){toast(e.message,true);}
    })();
  });
}
const CAT_PLUGGY=[[/groceries|supermarket/i,'Mercado'],[/food delivery/i,'Delivery'],[/restaurant|eating out/i,'Restaurantes'],[/gas station|fuel/i,'Combustível'],[/taxi|ride/i,'Uber e táxi'],[/public transport/i,'Transporte público'],[/vehicle maintenance|car maintenance/i,'Manutenção do carro'],[/electricity|water|utilities/i,'Contas da casa'],[/telecom|internet|mobile/i,'Internet e celular'],[/streaming|digital services|subscription/i,'Assinaturas'],[/pharmac|drug/i,'Farmácia'],[/gym|fitness/i,'Academia'],[/pet/i,'Pets'],[/travel|airline|accommodation|hotel/i,'Viagem'],[/clothing/i,'Roupas'],[/electronics/i,'Eletrônicos'],[/online shopping|shopping/i,'Compras'],[/bank fees|interest charge|late payment/i,'Tarifas e juros'],[/taxes/i,'Impostos e taxas'],[/donation/i,'Doações'],[/food|restaurant|groceries|supermarket|eating/i,'Alimentação'],[/transport|taxi|ride|gas station|fuel|parking|toll|public transport/i,'Transporte'],[/health|pharmac|drug|hospital|dentist|gym|fitness/i,'Saúde'],[/entertainment|leisure|streaming|cinema|games|music|travel|tickets/i,'Lazer'],[/education|school|course|book/i,'Educação'],[/housing|rent|utilities|electricity|water|internet|telecom|mobile/i,'Moradia'],[/salary/i,'Salário'],[/investment income|interest|dividend/i,'Rendimentos']];
function catDoBanco(l){
  const sg=sugestaoCat(l.desc,l.valor<0?'despesa':'receita');if(sg&&sg.por!=='palavra')return sg.c;
  const lista=l.valor<0?S.cats:CATS_RECEITA;
  for(const [re,c] of CAT_PLUGGY)if(re.test(l.catBanco||'')&&lista.includes(c))return c;
  return sg?sg.c:catSugerida(l.desc,l.valor<0?'despesa':'receita');
}
/* v10.54: lê o que o webhook do Pluggy já guardou no servidor (pluggy_tx / pluggy_acc). null = usar 'sincronizar' */
let IMP_VISTO='';
async function bancoDaTabela(){
  try{
    const visto=S.cfg.pluggyVisto||'';
    const {data:accs,error:e1}=await sb.from('pluggy_acc').select('id,item_id,data,updated_at');
    if(e1||!accs||!accs.length)return null;               // tabela vazia / sem webhook ainda → fallback
    const desde=S.cfg.pluggyDesde
      ?new Date(new Date(S.cfg.pluggyDesde).getTime()-5*864e5).toISOString().slice(0,10)
      :new Date(Date.now()-60*864e5).toISOString().slice(0,10);
    const rows=[];let maxUpd=visto;
    for(let de=0;de<20000;de+=1000){                       // PostgREST devolve no máx. 1000 por página
      let q=sb.from('pluggy_tx').select('id,account_id,data,removed,updated_at').order('updated_at',{ascending:true}).range(de,de+999);
      q=visto?q.gt('updated_at',visto):q.gte('data->>data',desde);
      const {data,error}=await q;if(error)return null;
      rows.push(...data);if(data.length<1000)break;
    }
    rows.forEach(t=>{if(t.updated_at>maxUpd)maxUpd=t.updated_at;});
    accs.forEach(a=>{if(a.updated_at>maxUpd)maxUpd=a.updated_at;});
    IMP_VISTO=maxUpd;
    const porConta={};
    rows.forEach(t=>{if(t.removed)return;(porConta[t.account_id]||(porConta[t.account_id]=[])).push(t.data);});
    const contas=accs.map(a=>({...a.data,tx:(porConta[a.id]||[]).sort((x,y)=>x.data<y.data?-1:x.data>y.data?1:0)}));
    let investimentos=null;
    /* investimentos não ficam na tabela: 1 busca ao vivo por dia só para eles */
    if(S.cfg.pluggyInvDia!==hojeISO()){
      try{const r2=await pluggy({acao:'sincronizar',dias:7});investimentos=r2.investimentos||[];S.cfg.pluggyInvDia=hojeISO();}catch(e){}
    }
    return {ok:true,desde:visto?visto.slice(0,10):desde,contas,investimentos,tabela:true};
  }catch(e){return null;}
}
async function bancoSync(forcar=false){
  if(MVP_MODE){toast('A conexão com o banco não está disponível nesta versão. Importe o extrato em Gastos & Cartões.',true);return;}
  BC_ST=null;
  if(!USER){toast('Entre na sua conta primeiro.',true);return;}
  const mg=migraPropria();if(mg){render();toast(mg+' lançamentos entre contas suas viraram transferência');}
  toast('Buscando lançamentos no banco…');
  try{
    IMP_VISTO='';
    const r=(!forcar&&await bancoDaTabela())||await pluggy({acao:'sincronizar',dias:S.cfg.pluggyDesde?Math.min(365,Math.ceil((Date.now()-new Date(S.cfg.pluggyDesde))/864e5)+5):60});
    if(!S.cfg.pluggyMap)S.cfg.pluggyMap={};const mapa=S.cfg.pluggyMap;
    r.contas.forEach(c=>{const m=mapa[c.id];if(c.tipo!=='CREDIT'&&typeof m==='string'&&m[0]==='b')saldoDoBanco(m.slice(2),c.saldo);});
    let novos=0;r.contas.forEach(c=>{if(c.tipo==='CREDIT'&&mapa[c.id]!=='x'&&cartaoDoBanco(c))novos++;});
    const ni=investDoBanco(r.investimentos||[]);if(ni)toast(ni+' investimento'+(ni>1?'s':'')+' atualizado'+(ni>1?'s':'')+' pelo banco');
    geraRecorrentes();render();
    if(novos)toast(novos===1?'Cartão do banco adicionado em Cartões':novos+' cartões do banco adicionados');
    const fila=r.contas.filter(c=>mapa[c.id]!=='x').map(c=>{
      const cartao=c.tipo==='CREDIT';
      const linhas=c.tx.map(t=>({data:t.data,valor:t.valor,desc:t.desc,fitid:'plg-'+t.id,catBanco:t.cat}));
      return {nome:c.nome,conta:c.id,cartao,linhas,saldo:c.saldo};
    }).map(c=>{const ign=new Set(S.cfg.pluggyIgn||[]);c.linhas=c.linhas.filter(l=>!ign.has(l.fitid));return c;})
      .filter(c=>c.linhas.some(l=>!(c.cartao&&l.valor>0)&&!S.tx.some(t=>t.pluggyId===l.fitid)));
    /* v10.51: a data da última busca só avança quando a revisão termina (fechar no X não perde lançamentos) */
    if(!fila.length){S.cfg.pluggyDesde=hojeISO();if(IMP_VISTO)S.cfg.pluggyVisto=IMP_VISTO;salvar();toast('Nada novo no banco por enquanto.');atualizaBancoUI();return;}
    IMP_CURSOR=hojeISO();IMP_VISTO_CURSOR=IMP_VISTO;IMP_FILA=fila;proxImportBanco();
  }catch(e){toast(e.message,true);}
}
let IMP_FILA=[],IMP_CURSOR='',IMP_VISTO_CURSOR='';
function arqCartao(c){c.arq=true;c.arqEm=hojeISO();salvar();render();toast('Cartão arquivado');}
/* v10.20: posições de investimento do banco (Pluggy /investments) entram em Investimentos */
function tipoInvBanco(v){const t=v.tipo,st=v.subtipo;
  if(t==='EQUITY'){if(st==='REAL_ESTATE_FUND')return 'fii';if(st==='BDR')return 'bdr';if(st==='ETF')return 'etf';return 'acao';}
  if(t==='ETF')return 'etf';if(st==='REAL_ESTATE_FUND')return 'fii';return 'rf';}
function investDoBanco(L0){let n=0;const hj=hojeISO();
  /* renda fixa do mesmo emissor vira uma posição só (o Nubank manda cada aplicação de CDB separada) */
  const G={},L=[];
  L0.forEach(v=>{if(tipoInvBanco(v)!=='rf'){L.push(v);return;}
    const nm=String(v.nome||'Renda fixa').replace(/\s*-\s*SOCIEDADE.*$/i,'').replace(/ S\.?A\.?.*$/i,'').trim();
    const k='g:'+norm((v.subtipo||'')+'|'+nm);
    const g=G[k]||(G[k]={id:k,nome:nm,codigo:(v.subtipo||'RF')+' '+nm.split(/[\s-]+/).filter(x=>x.length>1&&!/^(CDB|LCI|LCA|LC|RDB)$/i.test(x))[0],tipo:v.tipo,subtipo:v.subtipo,saldo:0,original:0,status:'TOTAL_WITHDRAWAL',vencimento:''});
    if(v.status!=='TOTAL_WITHDRAWAL'&&+v.saldo>0){g.saldo+= +v.saldo;g.original+= +v.original||0;g.status='ACTIVE';if(v.vencimento&&(!g.vencimento||v.vencimento<g.vencimento))g.vencimento=v.vencimento;}});
  Object.values(G).forEach(g=>{g.saldo=c2(g.saldo);g.original=c2(g.original);L.push(g);});
  L.forEach(v=>{const tp=tipoInvBanco(v),saldo=+v.saldo,fim=v.status==='TOTAL_WITHDRAWAL'||!(saldo>0);
    let f=S.fiis.find(x=>x.pluggyInv===v.id);
    const tk=tp==='rf'?rfCodigo(v.codigo||v.nome||''):String(v.codigo||v.nome).toUpperCase().replace(/[^A-Z0-9.]/g,'').slice(0,12)||'INV'; // v10.98: rf sem cortar palavra
    if(!f&&tp!=='rf')f=S.fiis.find(x=>!x.pluggyInv&&x.ticker===tk&&tipoOf(x)===tp);
    if(fim){if(f&&f.pluggyInv){S.fiis=S.fiis.filter(x=>x!==f);n++;}return;}
    if(!f){f={id:uid(),ticker:tk,nome:v.nome,tipo:tp,cotas:0,preco:0,dpc:0,pago:0,diaPag:0,realizado:0,proventos:0,ops:[]};S.fiis.push(f);}
    f.pluggyInv=v.id;f.bancoData=hj;if(v.vencimento&&!f.semVenc)f.venc=v.vencimento;if(!f.nome)f.nome=v.nome;
    if(f.manual||f.idx==='cdi'){f.bancoValor=c2(saldo);n++;return;} // você corrigiu o valor: o do banco fica só como referência
    if(tp==='rf'){f.cotas=1;f.preco=c2(saldo);if(+v.original>0)f.pago=c2(+v.original);}
    else{const q=+v.qtd,pr=+v.preco;if(q>0){f.cotas=q;f.preco=pr>0?pr:c2(saldo/q);}else{f.cotas=1;f.preco=c2(saldo);}if(+v.original>0&&!f.pago)f.pago=c2(+v.original);}
    n++;});
  if(n)salvar();return n;}
/* v10.18: o cartão do banco aparece em Cartões com limite, usado, fechamento e vencimento informados pelo banco */
function cartaoDoBanco(c){const k=c.credito;if(!k)return false;
  if(!S.cfg.pluggyMap)S.cfg.pluggyMap={};const mapa=S.cfg.pluggyMap;
  let id=typeof mapa[c.id]==='string'&&mapa[c.id][0]==='c'?mapa[c.id].slice(2):'';
  let cc=id&&S.cartoes.find(x=>x.id===id);
  const errado=cc&&k.final&&cc.final&&cc.final!==k.final?cc:null; // estava ligado a outro cartão seu
  if(errado)cc=null;
  if(!cc&&k.final)cc=S.cartoes.find(x=>x.final===k.final);
  let criou=false;
  if(!cc){cc={id:uid(),nome:String(c.nome||'Cartão').replace(/\s*··\d+$/,'').slice(0,60)||'Cartão',banco:String(k.banco||c.nome||'').slice(0,60),final:k.final||'',limite:0,fechamento:1,vencimento:10,cor:S.cartoes.length%CARD_COR.length,rotativo:0,multaPct:2,moraPct:1};S.cartoes.push(cc);criou=true;}
  mapa[c.id]='c:'+cc.id;
  if(errado){const ids=new Set((c.tx||[]).map(t=>'plg-'+t.id));S.tx.forEach(t=>{if(t.cartao===errado.id&&t.pluggyId&&(ids.has(t.pluggyId)||t.origem==='banco'))t.cartao=cc.id;});}
  const lim=+k.limite,disp=+k.disponivel;
  if(isFinite(lim)&&lim>0)cc.limite=c2(lim);
  if(isFinite(lim)&&lim>0&&isFinite(disp)){cc.bancoUsado=c2(Math.max(0,lim-disp));cc.bancoData=hojeISO();}
  const dia=x=>{const d=String(x||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(d)?parseInt(d.slice(8),10):0;};
  if(dia(k.fecha))cc.fechamento=dia(k.fecha);if(dia(k.vence))cc.vencimento=dia(k.vence);
  if(k.final&&!cc.final)cc.final=k.final;
  if(k.bandeira&&!cc.bandeira){const bd=String(k.bandeira).toLowerCase();cc.bandeira=/master/.test(bd)?'mastercard':/visa/.test(bd)?'visa':/elo/.test(bd)?'elo':/amex|american/.test(bd)?'amex':/hiper/.test(bd)?'hipercard':'';}
  if(!bancoDoCartao(cc)){const bs=[...new Set(S.bancos.map(b=>b.nome).filter(n=>BANCOS_BR.some(x=>x.c&&x.n===n)))];if(bs.length===1&&!cc.bancoAuto){cc.bancoAuto=bs[0];}}
  salvar();return criou;}
/* o saldo que o banco informa vira o saldo da conta no app, valendo a partir de hoje */
function saldoDoBanco(id,v){const b=S.bancos.find(x=>x.id===id);if(!b||v==null||!isFinite(+v))return;b.saldo=c2(+v);b.saldoData=hojeISO();b.saldoFecha=true;salvar();}
function fimFilaBanco(){if(IMP_FILA.length||!IMP_CURSOR)return;S.cfg.pluggyDesde=IMP_CURSOR;IMP_CURSOR='';if(IMP_VISTO_CURSOR){S.cfg.pluggyVisto=IMP_VISTO_CURSOR;IMP_VISTO_CURSOR='';}salvar();}
function proxImportBanco(){
  const c=IMP_FILA.shift();if(!c){fimFilaBanco();return;}
  const mapa=S.cfg.pluggyMap||{};
  IMP={nome:'Banco · '+c.nome,cartao:c.cartao,linhas:c.linhas.slice(0,3000),destino:'',pluggyConta:c.conta,banco:true,saldo:c.saldo};
  const salvo=mapa[c.conta];
  /* v10.123: destino salvo que foi arquivado não recebe importação */
  if(salvo&&((salvo[0]==='c'&&cartoesAtivos().some(x=>x.id===salvo.slice(2)))||(salvo[0]==='b'&&bancosAtivos().some(x=>x.id===salvo.slice(2)))))IMP.destino=salvo;
  else if(c.cartao&&cartoesAtivos().length)IMP.destino='c:'+cartoesAtivos()[0].id;
  else if(!c.cartao&&bancosAtivos().length)IMP.destino='b:'+((S.bancos.find(b=>b.principal)||bancosAtivos()[0]).id);
  /* v10.56: conta que você já importou antes entra sozinha; os lançamentos ficam na caixa Revisar */
  if(salvo&&IMP.destino===salvo&&S.cfg.autoImp!==false){IMP.silent=true;montaImport();confirmaImport();return;}
  montaImport();
}
function importarExtrato(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.ofx,.csv,.txt,text/csv,application/x-ofx,application/pdf,.pdf,image/*';
  inp.onchange=()=>{const f=inp.files&&inp.files[0];if(!f)return;
    if(f.type==='application/pdf'||/\.pdf$/i.test(f.name)||/^image\//.test(f.type)){importarExtratoIA(f);return;}
    if(f.size>5e6){toast('Arquivo grande demais (máx. 5 MB).',true);return;}
    const rd=new FileReader();
    rd.onload=()=>{let txt=String(rd.result||'');
      // OFX de bancos brasileiros às vezes vem em latin-1
      if(/\uFFFD/.test(txt)&&f.text){const r2=new FileReader();r2.onload=()=>abreImport(f.name,String(r2.result||''));r2.readAsText(f,'iso-8859-1');return;}
      abreImport(f.name,txt);};
    rd.readAsText(f,'utf-8');};
  inp.click();
}
/* v10.145: extrato ou fatura em PDF/foto: a IA lista os lançamentos e eles caem na mesma tela de revisar do OFX/CSV */
async function importarExtratoIA(f){
  if(!USER){toast('Entre na sua conta para importar PDF.',true);return;}
  const pdf=f.type==='application/pdf'||/\.pdf$/i.test(f.name);
  if(f.size>4.5e6){toast('Arquivo grande demais (máx. 4,5 MB).',true);return;}
  toast('Lendo o extrato com a IA… pode levar até 1 minuto.');
  try{
    let imagem,mime;
    if(pdf){imagem=await b64DeArquivo(f);mime='application/pdf';}
    else{try{imagem=await imgParaJpeg(f,2000);mime='image/jpeg';}catch(e){imagem=await b64DeArquivo(f);mime=f.type||'image/jpeg';}}
    const r=await invokeIA('ler-comprovante',{imagem,mime,extrato:true,hoje:hojeISO()},()=>toast(IA_OCUPADA));
    if(trataLimitePlano(r.o,r.status,'ia_comprovante',{manual:false}))return; // v10.161: cota do plano -> aviso do Pro
    if(r.erro||!r.o||r.status!==200)throw new Error(r.erro||(r.rede?'sem conexão com a IA, tente de novo':'não consegui ler o extrato'));
    const hj=hojeISO();
    const linhas=(Array.isArray(r.o.linhas)?r.o.linhas:[]).map(l=>({data:String(l&&l.data||''),desc:str(l&&l.desc,120).trim(),valor:Math.round(Number(l&&l.valor)*100)/100}))
      .filter(l=>DATA_OK.test(l.data)&&l.data<=hj&&isFinite(l.valor)&&l.valor!==0);
    if(!linhas.length){toast('Não encontrei lançamentos nesse arquivo.',true);return;}
    IMP={nome:f.name,cartao:!!r.o.cartao,linhas:linhas.slice(0,3000),destino:'',ia:true};
    if(IMP.cartao&&cartoesAtivos().length)IMP.destino='c:'+cartoesAtivos()[0].id;
    else if(!IMP.cartao&&bancosAtivos().length)IMP.destino='b:'+((S.bancos.find(b=>b.principal)||bancosAtivos()[0]).id);
    montaImport();
  }catch(e){toast(String(e&&e.message||'não consegui ler o extrato'),true);}
}
function abreImport(nome,txt){
  const r=/<OFX>|OFXHEADER/i.test(txt)?lerOFX(txt):lerCSV(txt);
  if(r.erro){toast(r.erro,true);return;}
  if(!r.linhas.length){toast('Não encontrei lançamentos nesse arquivo.',true);return;}
  IMP={nome,cartao:r.cartao,linhas:r.linhas.slice(0,3000),destino:''};
  if(r.cartao&&cartoesAtivos().length)IMP.destino='c:'+cartoesAtivos()[0].id;
  else if(!r.cartao&&bancosAtivos().length)IMP.destino='b:'+((S.bancos.find(b=>b.principal)||bancosAtivos()[0]).id);
  montaImport();
}
/* v10.95: número da parcela escrito na descrição do banco. só com a palavra parc/parcela (dd/mm solto é data, não parcela) */
function parcelaDesc(desc){const m=String(desc||'').match(/parc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})/i);if(!m)return null;const k=+m[1],n=+m[2];return k>=1&&n>=2&&n<=48&&k<=n?{k,n}:null;}
function parcelaBase(desc){return norm(String(desc||'').replace(/parc(?:ela)?\.?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}/ig,' ')).replace(/[^a-z0-9]+/g,' ').trim();}
function parcelaIgual(t,l){if(!l.parc)return true;const p=parcelaDesc(t.bancoDesc||t.descricao);return !p||p.k===l.parc.k;}
/* data da parcela k no cartão c. a data do banco é a da compra quando: (a) outra parcela da mesma compra veio com a mesma data,
   ou (b) a data é de um ciclo anterior ao último fechado (o banco só manda a parcela quando a fatura dela abre/fecha) */
function parcelaDataBanco(c,l,linhas){
  const base=l.data0||l.data,k=l.parc.k,b0=parcelaBase(l.desc),vc=cents(Math.abs(l.valor));
  const irma=x=>{const p=parcelaDesc(x.desc!=null?x.desc:(x.bancoDesc||x.descricao));return p&&p.k!==k&&p.n===l.parc.n&&parcelaBase(x.desc!=null?x.desc:(x.bancoDesc||x.descricao))===b0&&cents(Math.abs(x.valor))===vc;};
  const mesma=(linhas||[]).some(x=>x!==l&&(x.data0||x.data)===base&&irma(x))||S.tx.some(t=>t.cartao===c.id&&(t.dataCompra||t.data)===base&&irma(t));
  const hj=hojeISO(),prev=fechamentoDe(c,addMeses(hj,-1)).fecha,fb=fechamentoDe(c,base).fecha;
  if(!mesma&&!(fb<prev))return base;
  const nd=dataParcela(c,base,k-1);
  return mesma||fechamentoDe(c,nd).fecha>=prev?nd:base;
}
function montaImport(){
  const d=IMP.destino,ehCartao=d.indexOf('c:')===0,ehConta=d.indexOf('b:')===0,usados=new Set();
  const idOcc=new Map(); // v10.123: linhas iguais no mesmo arquivo ganham ids diferentes (antes viravam um lançamento só)
  IMP.linhas.forEach(l=>{
    l.tipo=l.valor<0?'despesa':'receita';
    l.transf=ehCartao&&l.valor<0&&/limite convertido|credito do limite|saldo .*limite/.test(norm(l.desc));
    if(l.transf){l.tipo='transf';if(!l.para||l._d!==d)l.para='b:'+bancoPadrao();}
    l.propria=!ehCartao&&!l.transf&&ehPropria(l.desc);
    if(l.propria){l.tipo='transf';l.de=l.valor<0?d:'';l.para=l.valor>0?d:'';}
    /* v10.95: parcela 2+ de compra no cartão (ex.: "PARC 03/10", "Parcela 3/10"). alguns bancos mandam todas as parcelas com a data
       da COMPRA: a parcela caía no ciclo antigo (fatura aberta zerada com o limite usado) e, igual à parcela 1 no dia e no valor,
       era descartada como "já está no app". a data passa a ser a do ciclo da parcela; a da compra fica em l.data0. */
    if(l.data0)l.data=l.data0;
    l.parc=ehCartao&&l.tipo==='despesa'?parcelaDesc(l.desc):null;
    if(l.parc&&l.parc.k>=2){const cc=S.cartoes.find(x=>x.id===d.slice(2));const nd=cc?parcelaDataBanco(cc,l,IMP.linhas):l.data;if(nd!==l.data){l.data0=l.data;l.data=nd;}}
    if(IMP.banco)l.id=l.fitid;else{const b=idImport(d,l),k=idOcc.get(b)||0;idOcc.set(b,k+1);l.id=k?b+'-'+k:b;}
    const dup=S.tx.some(t=>t.id===l.id||(t.impId&&t.impId===l.id)||(IMP.banco&&t.pluggyId===l.fitid)||(t.par&&(t.par.id===l.id||(IMP.banco&&t.par.pluggyId===l.fitid))))||S.tx.some(t=>!t.faturaKey&&!(t.tipo==='receita'&&t.status==='previsto'&&!t.pluggyId&&!t.impId)&&t.data===l.data&&cents(t.valor)===cents(Math.abs(l.valor))&&t.tipo===l.tipo&&(!IMP.banco||(ehCartao?t.cartao===d.slice(2):t.conta===d.slice(2)))&&parcelaIgual(t,l)); // v10.54 · v10.95: parcela diferente não é duplicata: mesmo dia, valor e tipo já no app = duplicata também no arquivo próprio
    /* v10.52: em CSV próprio, duas compras iguais são reais (ex.: dois cafés no mesmo dia): entram selecionadas, com aviso */
    const dupLinha=!IMP.banco&&(IMP.linhas||[]).some(x=>x!==l&&x.data===l.data&&cents(x.valor)===cents(l.valor)&&x.desc===(l.desc||''));
    const n=norm(l.desc);let ign='';
    /* v10.79: empréstimo ou devolução lançado à mão que o banco trouxe agora: liga um ao outro em vez de duplicar */
    const vm=!dup&&ehConta&&!l.propria&&!l.transf?empManualIgual(l,d,usados):null;
    /* v10.87: aporte de meta lançado à mão (guardei, saindo desta conta) */
    const vmt=!dup&&!vm&&ehConta&&!l.transf?metaManualIgual(l,d,usados):null;l.vincMeta=vmt?vmt.id:'';if(vmt)usados.add(vmt.id);
    l.vinc=vm?vm.id:'';if(vm)usados.add(vm.id);
    /* v10.80: receita prevista que o banco trouxe: casa pela data de RECEBIMENTO (até 3 dias), nunca pelo dia trabalhado.
       vira recebida com a data e o id do banco, sem lançar de novo */
    const pv=!dup&&!vm&&!vmt&&ehConta&&l.valor>0&&!l.propria&&!l.transf?prevReceitaIgual(l,d,usados):null;
    l.vincPrev=pv?pv.id:'';if(pv)usados.add(pv.id);
    /* v10.79: Pix com o nome de quem te deve (entrada até o que falta) ou de quem já pegou emprestado (saída) */
    const es=!dup&&!vm&&!vmt&&ehConta&&!l.propria&&!l.transf?empCasa(l.desc,Math.abs(l.valor),l.data,l.valor>0?'in':'out'):null;
    if(!es||l.empSug!==es.id)l.empOk=false;l.empSug=es?es.id:'';
    const dupT=!vm&&!ehCartao&&l.valor>0&&S.tx.some(t=>t.tipo==='transf'&&t.para===d&&cents(t.valor)===cents(l.valor)&&Math.abs(new Date(t.data)-new Date(l.data))<=2*864e5);
    /* v10.88: planilha do próprio app importada de volta: fatura e transferência/empréstimo que já estão no app não entram de novo
       (antes as faturas viravam despesas duplicadas e a transferência virava receita) */
    const trPlan=!IMP.banco&&/transfer|emprest|devolu/.test(l.tipoPlan||'');
    const dupPlan=!dup&&!IMP.banco&&((trPlan&&S.tx.some(t=>t.tipo==='transf'&&t.data===l.data&&cents(t.valor)===cents(Math.abs(l.valor))))||(/^fatura\b/.test(n)&&S.tx.some(t=>t.faturaKey&&t.data===l.data&&cents(t.valor)===cents(Math.abs(l.valor)))));
    /* v10.96: parcela gerada por "verificar parcelas" que agora chegou do banco: fica com o id da Pluggy em vez de entrar de novo */
    l.adota=dup&&IMP.banco&&ehCartao?((S.tx.find(t=>t.parcGer&&!t.pluggyId&&t.cartao===d.slice(2)&&t.data===l.data&&cents(t.valor)===cents(Math.abs(l.valor))&&parcelaIgual(t,l))||{}).id||''):'';
    if(dup||dupT||dupPlan)l.dup=true; // v10.54: linha repetida no arquivo continua marcada, só com aviso
    if(dup||dupPlan)ign='já está no app';
    else if(trPlan)ign='transferência ou empréstimo na planilha · confira antes de importar';
    else if(pv)ign='é a receita prevista '+(nomeTx(pv).n||pv.descricao||pv.categoria).slice(0,40)+' (recebe '+fmtDataCurta(pv.data)+') · fica marcada como recebida';
    else if(vmt)ign='já lançado como guardado na meta '+((S.metas.find(x=>x.id===vmt.meta)||{}).nome||'').slice(0,30)+' · fica ligado ao do banco';
    else if(vm)ign='já lançado como '+(vm.empDir==='in'?'devolução de ':'empréstimo para ')+primeiroNome(empNome(vm.emp))+' · fica ligado ao do banco';
    else if(dupT)ign='já lançado como transferência';
    else if(dupLinha)ign='igual a outra linha do arquivo (confira)';
    else if(ehCartao&&l.valor>0)ign='pagamento ou estorno no cartão';
    else for(const [re,m] of IGNORA_RE){if(re.test(n)){ign=m;break;}}
    if(l.cat==null||l._d!==d){l.cat=l.transf||l.propria?'Transferência':IMP.banco?catDoBanco(l):catSugerida(l.desc,l.tipo);l.cat0=l.cat;}
    if(l._d!==d){l.on=!ign||dupLinha;l._d=d;}
    l.ign=ign;l.dup=dup||dupT||dupPlan||!!vm||!!pv||!!vmt;if(vm||pv||vmt)l.on=false;
  });
  if(IMP.silent)return; // v10.56: conta já conhecida, entra direto e vai para Revisar
  const opts=[].concat(bancosAtivos().map(b=>`<option value="b:${b.id}" ${d==='b:'+b.id?'selected':''}>conta · ${esc(b.nome)}</option>`),cartoesAtivos(d.indexOf('c:')===0&&d.slice(2)).map(c=>`<option value="c:${c.id}" ${d==='c:'+c.id?'selected':''}>cartão · ${esc(c.nome)}</option>`)).join('');
  const catOpts=(c,tp)=>(tp==='receita'?CATS_RECEITA.concat(S.cats.filter(x=>!CATS_RECEITA.includes(x))):S.cats).map(x=>`<option ${x===c?'selected':''}>${esc(x)}</option>`).join('');
  const sel=IMP.linhas.filter(l=>l.on),tot=sel.reduce((a,l)=>a+cents(l.valor),0)/100;
  const box=$('#modal');
  box.innerHTML=`<div class="sheet impSheet" role="dialog" aria-modal="true" aria-label="Importar extrato"><div class="sh-head"><h3>${IMP.banco?'Lançamentos do banco':'Importar extrato'}</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <p class="small">${esc(IMP.nome)} · ${IMP.linhas.length} lançamentos${IMP.cartao?' · extrato de cartão':''}${IMP.banco&&IMP_FILA.length?' · depois: '+IMP_FILA.length+(IMP_FILA.length>1?' contas':' conta'):''}</p>
    ${opts?`<label>Lançar em<select id="impDest">${opts}</select></label>`:'<p class="aviso">Cadastre uma conta em Bancos ou um cartão antes de importar.</p>'}
    <div class="row small impTop"><span id="impResumo">${sel.length} selecionados · saldo ${tot>=0?'+':''}${brl(tot)}</span><span class="row" style="gap:6px"><button class="btn2 sm" data-imp="todos">marcar todos</button><button class="btn2 sm" data-imp="nenhum">nenhum</button></span></div>
    <div class="lista impList">${IMP.linhas.map((l,i)=>`<div class="tx impRow ${l.on?'':'off'}">
      <input type="checkbox" data-i="${i}" ${l.on?'checked':''} aria-label="importar ${esc(l.desc)}">
      <div class="txt"><b>${esc(l.desc||'(sem descrição)')}</b><small>${fmtData(l.data)}${l.trab&&l.valor>0?' · trabalhado '+fmtDataCurta(l.trab):''}${l.ign?' · <span class="impIgn">'+esc(l.ign)+'</span>':''}</small>
        ${l.propria?`<span class="impTr">entre contas suas · não conta como ${l.valor>0?'receita':'despesa'}</span>`:l.transf?`<span class="impTr">transferência para</span><select data-p="${i}" aria-label="conta de destino">${bancosAtivos().map(b=>`<option value="b:${b.id}" ${l.para==='b:'+b.id?'selected':''}>${esc(b.nome)}</option>`).join('')}</select>`:`<select data-c="${i}" aria-label="categoria">${catOpts(l.cat,l.tipo)}</select>`}${l.empSug&&!l.vinc?(()=>{const e=empPorId(l.empSug);if(!e)return '';return `<label class="impEmp"><input type="checkbox" data-emp="${i}" ${l.empOk?'checked':''}><span>${l.valor>0?'É devolução do empréstimo de '+esc(primeiroNome(e.pessoa))+'?':'É empréstimo para '+esc(primeiroNome(e.pessoa))+' (vai voltar)?'}<small>${l.valor>0?'falta '+brl(empTot(e.id).aberto)+' · ':''}não conta como ${l.valor>0?'receita':'gasto'}</small></span></label>`;})():''}</div>
      <div class="val ${l.valor<0?'neg':'pos'}">${l.valor<0?'-':'+'}${brl(Math.abs(l.valor))}</div></div>`).join('')}</div>
    <button class="btn full" id="impOk" ${opts&&sel.length?'':'disabled'}>importar ${sel.length} lançamentos</button>${IMP.banco?`<div class="row" style="gap:8px;margin-top:8px"><button class="btn2 sm" data-imp="pular">pular esta conta</button><button class="btn2 sm danger" data-imp="nunca">não importar esta conta</button></div>`:''}
  </div>`;
  box.classList.add('on');
  const ds=$('#impDest');if(ds)ds.onchange=()=>{IMP.destino=ds.value;montaImport();};
  box.querySelectorAll('input[data-i]').forEach(c=>c.onchange=()=>{IMP.linhas[+c.dataset.i].on=c.checked;c.closest('.impRow').classList.toggle('off',!c.checked);resumoImp();});
  box.querySelectorAll('select[data-c]').forEach(s=>s.onchange=()=>{IMP.linhas[+s.dataset.c].cat=s.value;});
  box.querySelectorAll('input[data-emp]').forEach(c=>c.onchange=()=>{const l=IMP.linhas[+c.dataset.emp];l.empOk=c.checked;if(c.checked&&!l.on){l.on=true;const ck=box.querySelector('input[data-i="'+c.dataset.emp+'"]');if(ck){ck.checked=true;ck.closest('.impRow').classList.remove('off');}resumoImp();}});
  box.querySelectorAll('select[data-p]').forEach(s=>s.onchange=()=>{IMP.linhas[+s.dataset.p].para=s.value;});
  box.querySelectorAll('[data-imp]').forEach(b=>b.onclick=()=>{
    if(b.dataset.imp==='pular'||b.dataset.imp==='nunca'){if(b.dataset.imp==='nunca'){if(!S.cfg.pluggyMap)S.cfg.pluggyMap={};S.cfg.pluggyMap[IMP.pluggyConta]='x';salvar();}const eb=IMP.banco;IMP=null;closeModal();if(IMP_FILA.length)setTimeout(proxImportBanco,250);else if(eb)fimFilaBanco();return;}
    const v=b.dataset.imp==='todos';IMP.linhas.forEach(l=>{if(!l.dup)l.on=v;});montaImport();});
  const ok=$('#impOk');if(ok)ok.onclick=confirmaImport;
}
function resumoImp(){const sel=IMP.linhas.filter(l=>l.on),tot=sel.reduce((a,l)=>a+cents(l.valor),0)/100;$('#impResumo').textContent=sel.length+' selecionados · saldo '+(tot>=0?'+':'')+brl(tot);const ok=$('#impOk');ok.textContent='importar '+sel.length+' lançamentos';ok.disabled=!sel.length;}
function confirmaImport(){
  const d=IMP.destino;if(!d)return;const ehCartao=d.indexOf('c:')===0,alvo=d.slice(2);
  let n=0,lig=0,rcb=0;
  IMP.linhas.forEach(l=>{
    /* v10.79: liga o lançamento manual de empréstimo ao do banco (o saldo do banco já inclui esse Pix) */
    if(l.vincPrev){const m=S.tx.find(t=>t.id===l.vincPrev);if(m&&m.status==='previsto'&&!m.pluggyId&&!m.impId){m.status='pago';if(l.trab&&!m.trab&&m.tipo==='receita')m.trab=l.trab;delete m.fxAuto;m.data=l.data;if(!m.conta){m.conta=alvo;m.forma='pix';}if(IMP.banco){m.pluggyId=l.fitid;m.origem='banco';}else m.impId=l.id;m.bancoDesc=String(l.desc||'').slice(0,120);rcb++;}return;}
    if(l.vincMeta){const m=S.tx.find(t=>t.id===l.vincMeta);if(m&&!m.pluggyId&&!m.impId){if(IMP.banco){m.pluggyId=l.fitid;m.origem='banco';}else m.impId=l.id;m.bancoDesc=String(l.desc||'').slice(0,120);lig++;}return;}
    if(l.vinc){const m=S.tx.find(t=>t.id===l.vinc);if(m&&!m.pluggyId&&!m.impId){if(IMP.banco){m.pluggyId=l.fitid;m.origem='banco';}else m.impId=l.id;m.bancoDesc=String(l.desc||'').slice(0,120);lig++;}return;}
    if(l.adota&&IMP.banco){const m=S.tx.find(t=>t.id===l.adota);if(m&&!m.pluggyId&&!S.tx.some(t=>t.pluggyId===l.fitid)){m.pluggyId=l.fitid;m.origem='banco';}return;}
    if(!l.on||S.tx.some(t=>t.id===l.id))return;
    const t={id:sid(l.id),tipo:l.tipo,valor:Math.abs(c2(l.valor)),categoria:l.cat,descricao:String(l.desc||'').slice(0,120),data:l.data,importado:true};
    if(l.data0&&l.data0!==l.data&&ISO_RE.test(l.data0))t.dataCompra=l.data0; // v10.95: parcela do banco no ciclo dela; a data da compra fica guardada
    if(IMP.banco){t.pluggyId=l.fitid;t.origem='banco';}
    if(IMP.silent&&!l.propria&&!l.transf)t.rev=1;
    if(l.propria){Object.assign(t,{tipo:'transf',de:l.de,para:l.para,categoria:'Transferência',cartao:'',conta:'',forma:''});}
    else if(l.transf){Object.assign(t,{de:d,para:l.para,cartao:alvo,conta:'',forma:''});}
    else if(ehCartao){t.forma='cartao';t.cartao=alvo;}else{t.forma='pix';t.conta=alvo;}
    if(l.empSug&&l.empOk&&!l.propria&&!l.transf&&!ehCartao&&empPorId(l.empSug)){const dir=l.valor>0?'in':'out';
      t.empOrig={tipo:t.tipo,categoria:t.categoria,conta:alvo};Object.assign(t,{tipo:'transf',emp:l.empSug,empDir:dir,categoria:'Empréstimo',de:dir==='out'?d:'',para:dir==='in'?d:'',conta:'',forma:'',cartao:''});delete t.rev;}
    else if(!l.transf&&!l.propria&&l.cat!==l.cat0){const k=chaveRegra(l.desc);if(k){if(!S.cfg.regras)S.cfg.regras={};S.cfg.regras[l.tipo[0]+':'+k]=l.cat;}}
    if(l.trab&&t.tipo==='receita'&&ISO_RE.test(l.trab))t.trab=l.trab; // v10.84: dia trabalhado vindo da planilha
    S.tx.push(t);n++;});
  if(IMP.banco){if(!S.cfg.pluggyMap)S.cfg.pluggyMap={};S.cfg.pluggyMap[IMP.pluggyConta]=d;
    if(!ehCartao)saldoDoBanco(alvo,IMP.saldo);
    /* o que ficou desmarcado não volta a aparecer nas próximas buscas */
    const fora=IMP.linhas.filter(l=>!l.on&&!S.tx.some(t=>t.pluggyId===l.fitid)).map(l=>l.fitid);
    S.cfg.pluggyIgn=(S.cfg.pluggyIgn||[]).concat(fora).slice(-3000);}
  const eraBanco=IMP.banco,mudo=IMP.silent;
  IMP=null;geraRecorrentes();salvar();if(!mudo)closeModal();render();
  if(mudo){REV_NOVOS+=n;if(!IMP_FILA.length&&REV_NOVOS){toast(REV_NOVOS+(REV_NOVOS>1?' lançamentos novos':' lançamento novo')+' do banco. Confira em Revisar.');REV_NOVOS=0;}}
  else toast(n+' lançamentos importados'+(lig?' · '+lig+(lig>1?' empréstimos ligados':' empréstimo ligado')+' ao banco':'')+(rcb?' · '+rcb+(rcb>1?' receitas previstas marcadas como recebidas':' receita prevista marcada como recebida'):''));
  if(eraBanco&&IMP_FILA.length)setTimeout(proxImportBanco,350);else if(eraBanco)fimFilaBanco();
}

/* ---------- v10.96: verificar parcelas ----------
   até a v10.94, quando o banco mandava a parcela 2+ com a data da COMPRA, ela caía num ciclo antigo ou era descartada
   como duplicata da parcela 1 (e o id ia para pluggyIgn, então nunca mais voltava). a v10.95 corrigiu as importações novas;
   isto recupera as antigas: roda sozinho uma vez na abertura (marca cfg.parcVerif) e pelo botão "verificar parcelas".
   fontes: (1) o banco ao vivo pelo pluggy-sync com a janela máxima do servidor (365 dias), com os ids reais da Pluggy;
   (2) a cópia que o webhook guarda no servidor (pluggy_tx, só leitura); (3) as parcelas que ficaram no app
   (k/n, valor e descrição): as que faltam são geradas até a fatura aberta.
   só mexe numa compra quando há prova de que o banco usou a data da compra: duas parcelas diferentes dela com a mesma data.
   chave de cada parcela: cartão + descrição sem "parc k/n" + total de parcelas + valor + data da compra + número; e o id da Pluggy.
   nunca vai antes da 1ª fatura com lançamentos do banco no cartão nem depois da fatura aberta. desfazer tira tudo. */
let PRC_BUSY=false,PRC=null;
function prcNum(t){const p=parcelaDesc(t.bancoDesc||t.descricao);if(p)return p;
  if(t.parcela>0&&t.parcelas>1)return {k:t.parcela,n:t.parcelas};
  const m=String(t.descricao||'').match(/\((\d{1,2})\/(\d{1,2})\)\s*$/);return m&&+m[2]>1&&+m[1]>=1&&+m[1]<=+m[2]?{k:+m[1],n:+m[2]}:null;}
function prcChave(cid,desc,n,vc,dc){return cid+'|'+parcelaBase(desc)+'|'+n+'|'+vc+'|'+dc;}
function prcDescK(desc,k){return String(desc||'').replace(/(parc(?:ela)?\.?\s*)(\d{1,2})(\s*(?:\/|de)\s*\d{1,2})/i,(m,a,b,c)=>a+String(k).padStart(b.length,'0')+c);}
/* linhas do banco (fonte 1 e 2) por cartão do app. devolve {linhas:[{fitid,data,valor,desc,cat,cartao}],fontes:[],ok} */
async function prcFontes(){
  const out={linhas:[],fontes:[],ok:true};
  if(!USER||!PLUGGY_ON()||!navigator.onLine)return out;
  const mapa=S.cfg.pluggyMap||{},vistos=new Set();
  const cartaoDe=acc=>{const m=mapa[acc];return typeof m==='string'&&m[0]==='c'&&S.cartoes.some(c=>c.id===m.slice(2))?m.slice(2):'';};
  const add=(acc,t)=>{const cid=cartaoDe(acc);if(!cid||!t||!t.id||!ISO_RE.test(String(t.data).slice(0,10)))return;const fitid='plg-'+t.id;if(vistos.has(fitid))return;vistos.add(fitid);
    out.linhas.push({fitid,data:String(t.data).slice(0,10),valor:+t.valor||0,desc:String(t.desc||'').slice(0,120),cat:t.cat||'',cartao:cid});};
  let falhas=0;
  try{const r=await pluggy({acao:'sincronizar',dias:365});(r.contas||[]).forEach(c=>{if(c.tipo==='CREDIT'&&mapa[c.id]!=='x')(c.tx||[]).forEach(t=>add(c.id,t));});out.fontes.push('banco');}catch(e){falhas++;}
  try{
    for(let de=0;de<20000;de+=1000){
      const {data,error}=await sb.from('pluggy_tx').select('id,account_id,data,removed').order('id',{ascending:true}).range(de,de+999);
      if(error)throw error;(data||[]).forEach(r=>{if(!r.removed)add(r.account_id,r.data);});if(!data||data.length<1000)break;}
    out.fontes.push('servidor');
  }catch(e){falhas++;}
  out.ok=falhas<2;return out;
}
/* o que falta (puro: só lê S e as linhas). {add:[tx], mov:[{id,de,para}], compras:[...], n, x, total} */
function prcDetecta(linhas){
  linhas=linhas||[];const hj=hojeISO(),add=[],mov=[],compras={};
  const pids=new Set();S.tx.forEach(t=>{if(t.pluggyId)pids.add(t.pluggyId);if(t.par&&t.par.pluggyId)pids.add(t.par.pluggyId);});
  S.cartoes.forEach(c=>{
    const doC=S.tx.filter(t=>t.cartao===c.id&&t.tipo==='despesa');
    const banco=doC.filter(t=>t.pluggyId||t.parcGer);
    if(!banco.length)return;
    const semParc=banco.filter(t=>t.pluggyId&&!parcelaDesc(t.descricao)).map(t=>t.data).sort();
    const ini=semParc[0]||banco.map(t=>t.data).sort()[0],iniF=fechamentoDe(c,ini).fecha,atuF=fechamentoDe(c,hj).fecha;
    /* compras: cada parcela conhecida (app + banco) agrupada pela data da compra */
    const G={},grupo=(desc,p,vc,dc)=>{const ch=prcChave(c.id,desc,p.n,vc,dc);return G[ch]||(G[ch]={ch,desc,n:p.n,vc,dc,ks:new Set(),tx:[],ln:[]});};
    banco.forEach(t=>{const p=parcelaDesc(t.descricao);if(!p)return;const g=grupo(t.descricao,p,cents(t.valor),t.dataCompra||t.data);g.ks.add(p.k);g.tx.push({t,k:p.k});});
    linhas.forEach(l=>{if(l.cartao!==c.id||!(l.valor<0))return;const p=parcelaDesc(l.desc);if(!p)return;const g=grupo(l.desc,p,cents(Math.abs(l.valor)),l.data);g.ks.add(p.k);g.ln.push({l,k:p.k});});
    /* já existe no app algo com esse número de parcela, esse valor, nessa fatura (de qualquer origem, inclusive manual) */
    const jaTem=(k,n,vc,data)=>{const f=fechamentoDe(c,data).fecha;return doC.some(t=>{const p=prcNum(t);return p&&p.k===k&&p.n===n&&cents(t.valor)===vc&&fechamentoDe(c,t.data).fecha===f;})||add.some(t=>t.cartao===c.id&&t._k===k&&t._n===n&&cents(t.valor)===vc&&fechamentoDe(c,t.data).fecha===f);};
    const naFaixa=d=>{const f=fechamentoDe(c,d).fecha;return f>=iniF&&f<=atuF;};
    Object.values(G).forEach(g=>{
      if(g.ks.size<2)return; // sem prova de que o banco usou a data da compra: não mexe
      const cat=(g.tx[0]&&g.tx[0].t.categoria)||'';const cp={ch:g.ch,cartao:c.id,desc:g.desc,n:g.n,vc:g.vc,dc:g.dc,novas:[],movidas:[]};
      const tem=new Map();g.tx.forEach(x=>{if(!tem.has(x.k))tem.set(x.k,x.t);});
      /* parcela no app na fatura da compra (ciclo antigo): vai para a fatura dela */
      g.tx.forEach(({t,k})=>{if(k<2||t.dataCompra||t.parcGer||tem.get(k)!==t)return;const nd=dataParcela(c,t.data,k-1);
        if(fechamentoDe(c,nd).fecha===fechamentoDe(c,t.data).fecha||fechamentoDe(c,nd).fecha>atuF)return;
        if(doC.some(o=>o!==t&&(()=>{const p=prcNum(o);return p&&p.k===k&&p.n===g.n&&cents(o.valor)===g.vc&&fechamentoDe(c,o.data).fecha===fechamentoDe(c,nd).fecha;})()))return;
        mov.push({id:t.id,de:t.data,para:nd,ch:g.ch});cp.movidas.push({k,data:nd,valor:t.valor});});
      /* parcela que o banco tem e o app não (descartada como duplicata ou fora da janela) */
      g.ln.forEach(({l,k})=>{if(pids.has(l.fitid)||tem.has(k))return;const nd=k>=2?dataParcela(c,l.data,k-1):l.data;
        if(!naFaixa(nd)||jaTem(k,g.n,g.vc,nd))return;
        const t={id:sid(l.fitid),tipo:'despesa',valor:Math.abs(c2(l.valor)),categoria:cat||catDoBanco({desc:l.desc,valor:l.valor,catBanco:l.cat}),descricao:String(l.desc||'').slice(0,120),data:nd,
          importado:true,forma:'cartao',cartao:c.id,pluggyId:l.fitid,origem:'banco',_k:k,_n:g.n,_ch:g.ch};
        if(nd!==l.data)t.dataCompra=l.data;
        tem.set(k,t);add.push(t);cp.novas.push({k,data:nd,valor:t.valor,fonte:'banco'});});
      /* fonte 3: gera pelos metadados as que nem o banco trouxe, até a fatura aberta */
      for(let k=1;k<=g.n;k++){if(tem.has(k))continue;const nd=dataParcela(c,g.dc,k-1);if(!naFaixa(nd)||jaTem(k,g.n,g.vc,nd))continue;
        const mod=(g.tx[0]&&g.tx[0].t.descricao)||(g.ln[0]&&g.ln[0].l.desc)||g.desc;
        const h=hashObj(g.ch).replace(/[^0-9]/g,'').slice(-9);
        const t={id:'prc-'+h+'-'+k,tipo:'despesa',valor:g.vc/100,categoria:cat||catDoBanco({desc:mod,valor:-g.vc/100,catBanco:''}),descricao:prcDescK(mod,k).slice(0,120),data:nd,
          importado:true,forma:'cartao',cartao:c.id,parcGer:1,_k:k,_n:g.n,_ch:g.ch};
        if(nd!==g.dc)t.dataCompra=g.dc;
        if(S.tx.some(x=>x.id===t.id)||add.some(x=>x.id===t.id))continue;
        tem.set(k,t);add.push(t);cp.novas.push({k,data:nd,valor:t.valor,fonte:'app'});}
      if(cp.novas.length||cp.movidas.length)compras[g.ch]=cp;});
  });
  const L=Object.values(compras);
  return {add,mov,compras:L,n:add.length,x:L.filter(cp=>cp.novas.length).length,total:add.reduce((a,t)=>a+cents(t.valor),0)/100};
}
function prcNomeCompra(cp){const s=String(cp.desc||'').replace(/[-–·|]?\s*parc(?:ela)?\.?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}/i,' ').replace(/\s+/g,' ').trim();return s||'Compra parcelada';}
function prcListaK(ks){ks=ks.slice().sort((a,b)=>a-b);return ks.length===1?String(ks[0]):ks.slice(0,-1).join(', ')+' e '+ks[ks.length-1];}
function prcResumo(R){const sel=R.compras.filter(cp=>!R.fora.has(cp.ch)),n=sel.reduce((a,cp)=>a+cp.novas.length,0),x=sel.filter(cp=>cp.novas.length).length,m=sel.reduce((a,cp)=>a+cp.movidas.length,0);
  const tot=sel.reduce((a,cp)=>a+cp.novas.reduce((b,p)=>b+cents(p.valor),0),0)/100;return {n,x,m,tot,sel};}
function prcTexto(r){
  const pl=(q,s,p)=>q+' '+(q===1?s:p);
  let t=r.n?'Encontrei '+pl(r.n,'parcela faltando','parcelas faltando')+' em '+pl(r.x,'compra','compras')+', total '+brl(r.tot)+'.':'';
  if(r.m)t+=(t?' ':'')+(r.m===1?'1 parcela está na fatura errada e vai para a certa.':r.m+' parcelas estão na fatura errada e vão para a certa.');
  return t;}
/* prévia: lista por compra (dá para desmarcar uma compra), total e confirmar */
function prcPrevia(R){
  PRC=R;R.fora=R.fora||new Set();const box=$('#modal');$('#toast').classList.remove('on');clearTimeout(toastT);const r=prcResumo(R);
  const cart=id=>S.cartoes.find(c=>c.id===id);
  const mesFat=(c,d)=>c?nomeMesMin(fechamentoDe(c,d).vence.slice(0,7)):'';
  box.innerHTML=`<div class="sheet prcSheet" role="dialog" aria-modal="true" aria-label="Verificar parcelas"><div class="sh-head"><h3>Verificar parcelas</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <p class="prcTop" id="prcTop">${esc(prcTexto(r))}</p>
    <p class="small prcNota">Parcelas que o banco mandou com a data da compra e o app deixou de fora antes da atualização. Cada uma entra na fatura em que foi cobrada.</p>
    <div class="prcLista">${R.compras.map((cp,i)=>{const c=cart(cp.cartao);const ks=cp.novas.map(p=>p.k),km=cp.movidas.map(p=>p.k);
      const fats=[...new Set(cp.novas.concat(cp.movidas).sort((a,b)=>a.data<b.data?-1:1).map(p=>mesFat(c,p.data)))].join(', ');
      return `<label class="prcIt${R.fora.has(cp.ch)?' off':''}"><input type="checkbox" data-pc="${i}" ${R.fora.has(cp.ch)?'':'checked'} aria-label="incluir ${esc(prcNomeCompra(cp))}">
      <span class="prcTx"><b>${esc(prcNomeCompra(cp))}</b><small>${ks.length?(ks.length>1?'parcelas ':'parcela ')+prcListaK(ks)+' de '+cp.n:''}${km.length?(ks.length?' · '+(km.length>1?'as ':'a ')+prcListaK(km):(km.length>1?'parcelas ':'parcela ')+prcListaK(km)+' de '+cp.n)+(km.length>1?' mudam de fatura':' muda de fatura'):''}${c?' · '+esc(ccNome(c)):''}</small><small>${fats?'fatura'+(fats.indexOf(',')>0?'s':'')+' de '+esc(fats):''}</small></span>
      <b class="nw prcV">${ks.length?brl(cp.novas.reduce((a,p)=>a+cents(p.valor),0)/100):'—'}</b></label>`;}).join('')}</div>
    <div class="cfBtns"><button class="btn2" type="button" data-prc="nao">Agora não</button><button class="btn" type="button" id="prcOk" data-prc="ok" ${r.n||r.m?'':'disabled'}>${prcBtnTxt(r)}</button></div>
  </div>`;
  box.classList.add('on');
  box.querySelectorAll('input[data-pc]').forEach(ck=>ck.onchange=()=>{const cp=R.compras[+ck.dataset.pc];if(ck.checked)R.fora.delete(cp.ch);else R.fora.add(cp.ch);ck.closest('.prcIt').classList.toggle('off',!ck.checked);
    const r2=prcResumo(R);$('#prcTop').textContent=prcTexto(r2)||'Nenhuma compra marcada.';const ok=$('#prcOk');ok.textContent=prcBtnTxt(r2);ok.disabled=!(r2.n||r2.m);});
  box.querySelector('[data-prc="nao"]').onclick=()=>{PRC=null;closeModal();};
  $('#prcOk').onclick=()=>{const R0=PRC;PRC=null;closeModal();if(R0)prcAplica(R0);};
}
function prcBtnTxt(r){return r.n?'Adicionar '+r.n+(r.n>1?' parcelas':' parcela'):r.m?'Mover '+r.m+(r.m>1?' parcelas':' parcela'):'Adicionar';}
/* aplica o que está marcado. guarda o lote em cfg.parcUlt para o desfazer */
function prcAplica(R){
  const fora=R.fora||new Set(),ok=new Set(R.compras.filter(cp=>!fora.has(cp.ch)).map(cp=>cp.ch));
  const lote='pr'+Date.now().toString(36),ids=[],movs=[];
  R.add.forEach(t=>{if(!ok.has(t._ch))return;if(S.tx.some(x=>x.id===t.id||(t.pluggyId&&x.pluggyId===t.pluggyId)))return;
    const n=Object.assign({},t,{parcRec:lote});delete n._k;delete n._n;delete n._ch;S.tx.push(n);ids.push(n.id);});
  R.mov.forEach(m=>{const t=S.tx.find(x=>x.id===m.id);if(!t||t.data!==m.de||t.dataCompra||!ok.has(m.ch))return;
    movs.push([t.id,t.data,0]);t.dataCompra=t.data;t.data=m.para;t.parcMov=lote;});
  if(!ids.length&&!movs.length){toast('Nada para adicionar.');return 0;}
  S.cfg.parcUlt={lote,em:hojeISO(),add:ids,mov:movs};
  S.cfg.parcVerif=Object.assign({},S.cfg.parcVerif||{},{em:hojeISO(),n:ids.length,m:movs.length});
  geraRecorrentes();salvar();render();
  const msg=(ids.length?ids.length+(ids.length>1?' parcelas adicionadas':' parcela adicionada'):'')+(ids.length&&movs.length?' · ':'')+(movs.length?movs.length+(movs.length>1?' movidas':' movida')+' para a fatura certa':'');
  prcToastDesfazer(msg);
  return ids.length+movs.length;
}
function prcToastDesfazer(m){const t=$('#toast');t.className='';t.innerHTML='<span>'+esc(m)+'</span><button type="button" class="tDesf">desfazer</button>';t.classList.add('on');
  t.querySelector('.tDesf').onclick=()=>{t.classList.remove('on');clearTimeout(alDesT);prcDesfaz();};clearTimeout(toastT);clearTimeout(alDesT);alDesT=setTimeout(()=>t.classList.remove('on'),8000);}
/* desfaz a última recuperação: tira as parcelas adicionadas e devolve as movidas para a data de antes */
function prcDesfaz(){
  const U=S.cfg.parcUlt;if(!U||!U.lote)return 0;
  const ids=new Set(U.add||[]);const antes=S.tx.length;
  S.tx=S.tx.filter(t=>!(t.parcRec===U.lote&&ids.has(t.id)));
  let mv=0;(U.mov||[]).forEach(([id,de,tinha])=>{const t=S.tx.find(x=>x.id===id);if(!t||t.parcMov!==U.lote)return;t.data=de;if(!tinha)delete t.dataCompra;delete t.parcMov;mv++;});
  const n=antes-S.tx.length;delete S.cfg.parcUlt;
  geraRecorrentes();salvar();render();toast('Recuperação desfeita'+(n?' · '+n+(n>1?' parcelas removidas':' parcela removida'):'')+(mv?' · '+mv+(mv>1?' voltaram':' voltou')+' para onde estava':''));
  return n+mv;
}
/* auto: uma vez na abertura, depois de baixar os dados. botão: sempre */
async function prcVerifica(o={}){
  if(PRC_BUSY)return null;PRC_BUSY=true;
  try{
    if(!o.auto)toast('Procurando parcelas que ficaram de fora…');
    const F=o.linhas?{linhas:o.linhas,fontes:['teste'],ok:true}:await prcFontes();
    if(o.auto&&!F.ok)return null; // offline/servidor fora: tenta de novo na próxima abertura
    const R=prcDetecta(F.linhas);R.fontes=F.fontes;
    if(!R.add.length&&!R.mov.length){
      S.cfg.parcVerif=Object.assign({},S.cfg.parcVerif||{},{em:hojeISO(),n:0});salvar();
      if(!o.auto){if(S.cfg.parcUlt&&S.cfg.parcUlt.lote)prcSemNada();else toast('Nenhuma parcela faltando.');}
      return R;}
    if(o.auto){ // espera a tela ficar livre (PIN, outra folha aberta, digitando)
      for(let i=0;i<40;i++){const ocupado=$('#modal').classList.contains('on')||$('#lock').classList.contains('on')||(document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));if(!ocupado)break;await new Promise(r=>setTimeout(r,3000));}
      if($('#modal').classList.contains('on')||$('#lock').classList.contains('on'))return R;}
    S.cfg.parcVerif=Object.assign({},S.cfg.parcVerif||{},{em:hojeISO(),achou:R.n,mov:R.mov.length});salvar();
    prcPrevia(R);return R;
  }catch(e){if(!o.auto)toast(e.message||'Não consegui verificar agora.',true);return null;}
  finally{PRC_BUSY=false;}
}
/* nada novo, mas existe uma recuperação anterior: oferece desfazer */
function prcSemNada(){const U=S.cfg.parcUlt;const n=(U.add||[]).length+(U.mov||[]).length;
  confirma({titulo:'Nenhuma parcela faltando',texto:'Está tudo nas faturas. A última recuperação ('+fmtData(U.em)+') mexeu em '+n+(n>1?' parcelas':' parcela')+'; dá para desfazer se algo não estava certo.',ok:'Fechar',alt:'Desfazer recuperação',altPerigo:true,altCb:prcDesfaz},()=>{});}
function prcAuto(){if(S.cfg.parcVerif||!USER)return;setTimeout(()=>{if(!S.cfg.parcVerif&&USER)prcVerifica({auto:true});},4000);}
function prcBotaoHTML(){return `<button type="button" class="card prcBtn" data-act="parc-verif"><span class="prcIc">${I('card')}</span><span class="prcBt"><b>Verificar parcelas</b><small>procura parcelas do banco que ficaram fora das faturas</small></span>${I('chevR')}</button>`;}

/* ---------- v10.56: caixa Revisar ----------
   lançamentos que vieram do banco sozinhos ficam marcados (t.rev). confirmar tira a marca; trocar a categoria
   ensina a regra (S.cfg.regras) e aplica aos parecidos que ainda estão na caixa. */
let REV_NOVOS=0;
function revPend(){return S.tx.filter(t=>t.rev&&t.status!=='cancelado').sort((a,b)=>a.data<b.data?1:a.data>b.data?-1:0);}
function revisarHTML(){const n=revPend().length;if(!n)return '';
  return `<button type="button" class="card revCard" data-act="rev-abre"><span class="revIc">${I('inbox')}</span><span class="revTx"><b>Revisar ${n} lançamento${n>1?'s':''} do banco</b><small>confira as categorias em poucos toques</small></span>${I('chevR')}</button>`;}
function abreRevisar(){
  const L=revPend(),box=$('#modal');
  if(!L.length){closeModal();toast('Tudo revisado.');return;}
  const catOpts=(t)=>(t.tipo==='receita'?CATS_RECEITA.concat(S.cats.filter(x=>!CATS_RECEITA.includes(x))):S.cats).map(x=>`<option ${x===t.categoria?'selected':''}>${esc(x)}</option>`).join('');
  box.innerHTML=`<div class="sheet revSheet" role="dialog" aria-modal="true" aria-label="Revisar"><div class="sh-head"><h3>Revisar</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <p class="small">${L.length} lançamento${L.length>1?'s':''} que chegaram do banco. Troque a categoria se precisar e confirme. O app aprende com cada troca.</p>
    <div class="lista">${L.slice(0,150).map(t=>{const ct=t.cartao&&S.cartoes.find(c=>c.id===t.cartao),bc=!ct&&t.conta&&S.bancos.find(b=>b.id===t.conta);
      return `<div class="tx revRow" data-rid="${esc(t.id)}"><span class="ic ${t.tipo}" style="color:${corCat(t.categoria)}">${I(catIcon(t.categoria))}</span>
      <div class="txt"><b>${esc(t.descricao||t.categoria)}</b><small>${fmtDataCurta(t.data)}${ct?' · '+esc(ct.nome):bc?' · '+esc(bc.nome):''}</small>
      <select data-revcat="${esc(t.id)}" aria-label="categoria de ${esc(t.descricao||'')}">${catOpts(t)}</select></div>
      <div class="revR"><div class="val ${t.tipo==='receita'?'pos':'neg'}">${t.tipo==='receita'?'+':'−'} ${brl(t.valor)}</div>
      <div class="revBt"><button class="btn2 sm" data-act="rev-del" data-id="${esc(t.id)}" aria-label="descartar">${I('trash')}</button><button class="btn2 sm revOk" data-act="rev-ok" data-id="${esc(t.id)}" aria-label="confirmar">${I('check')}</button></div></div>${revEmpHTML(t)}</div>`;}).join('')}</div>
    <button class="btn full" data-act="rev-todos">confirmar ${L.length>150?'os 150 primeiros':L.length>1?'todos os '+L.length:'este'}</button>
  </div>`;
  box.classList.add('on');
  box.querySelectorAll('select[data-revcat]').forEach(sl=>sl.onchange=()=>revCat(sl.dataset.revcat,sl.value));
}
/* v10.79: Pix do banco com o nome de quem te deve: oferece virar a devolução (ou o empréstimo, na saída) */
function revEmpHTML(t){if(t.emp||t.empJuros||t.cartao||!(t.tipo==='receita'||t.tipo==='despesa'))return '';const dir=t.tipo==='receita'?'in':'out';
  if(dir==='in'&&(S.cfg.empIgn||[]).includes(t.id))return '';
  const e=empCasa(t.descricao,t.valor,t.data,dir);if(!e)return '';
  return `<div class="revEmp">${I('handCoins')}<span>${dir==='in'?'É devolução do empréstimo de '+esc(primeiroNome(e.pessoa))+'?':'É empréstimo para '+esc(primeiroNome(e.pessoa))+'?'}</span><button class="btn2 sm" data-act="${dir==='in'?'emp-sug-ok':'emp-sug-out'}" data-id="${esc(t.id)}~${e.id}">sim</button></div>`;}
function revCat(id,cat){
  const t=S.tx.find(x=>x.id===id);if(!t||!cat||t.categoria===cat)return;
  t.categoria=cat;delete t.rev;let parecidos=0;
  const k=chaveRegra(t.descricao||'');
  if(k&&k.length>=3&&(t.tipo==='despesa'||t.tipo==='receita')){
    if(!S.cfg.regras)S.cfg.regras={};S.cfg.regras[t.tipo[0]+':'+k]=cat;
    S.tx.forEach(x=>{if(x!==t&&x.rev&&x.tipo===t.tipo&&chaveRegra(x.descricao||'')===k&&x.categoria!==cat){x.categoria=cat;delete x.rev;parecidos++;}});
  }
  salvar();render();abreRevisar();
  toast(parecidos?'Categoria salva e aplicada a mais '+parecidos+' parecido'+(parecidos>1?'s':''):'Categoria salva. Próximos parecidos já vêm assim.');
}


/* ---------- v10.62: empréstimos a receber ----------
   uma ficha por pessoa. o dinheiro anda por lançamentos transf com t.emp (saída: empDir 'out', de = conta; volta: 'in', para = conta),
   então emprestar não conta como gasto e receber de volta não conta como receita, mas o saldo das contas mexe certo.
   o que está em aberto entra no patrimônio como "a receber". */
/* v10.78: "perdao" baixa o que falta sem mexer em conta nenhuma (vira despesa só se a pessoa escolher) */
function empDelta(t){return t.empDir==='perdao'||t.empAnt?0:t.empDir==='in'?cents(t.valor):-cents(t.valor);}
function empPerdao(t){return !!(t&&t.emp&&t.empDir==='perdao');}
function empTot(id){let saiu=0,voltou=0,perd=0;S.tx.forEach(t=>{if(t.emp!==id||!efetivo(t))return;if(t.empDir==='in')voltou+=cents(t.valor);else if(t.empDir==='perdao')perd+=cents(t.valor);else saiu+=cents(t.valor);});
  return {saiu:saiu/100,voltou:voltou/100,perdoado:perd/100,aberto:Math.max(0,saiu-voltou-perd)/100,ult:S.tx.filter(t=>t.emp===id).map(t=>t.data).sort().pop()||''};}
function empAbertoTotal(){return (S.emprestimos||[]).reduce((a,e)=>a+cents(empTot(e.id).aberto),0)/100;}
function empPorId(id){return (S.emprestimos||[]).find(e=>e.id===id);}
function empNome(id){const e=empPorId(id);return e?e.pessoa:'alguém';}
function empRotulo(t){const n=empNome(t.emp),ld=t.empDir==='in'?t.para:t.empDir==='perdao'?'':t.de;return (t.empDir==='in'?n+' devolveu':t.empDir==='perdao'?'perdoado · '+n+(t.tipo==='despesa'?' · conta como despesa':''):'emprestado a '+n)+(t.empAnt?' · antes do app':ld?' · '+nomeLado(ld):'');}
function primeiroNome(n){return String(n||'').trim().split(/\s+/)[0]||'';}
function diasAte(d){if(!d)return null;const a=new Date(hojeISO()+'T12:00'),b=new Date(d+'T12:00');return Math.round((b-a)/864e5);}
function empPrazo(e,ab){if(!(ab>0))return ['ok',empTot(e.id).perdoado>0?'encerrado':'quitado'];const pt=e.modo==='partes';if(!e.prev)return ['mut',pt?'sem prazo':'sem data pra voltar'];const k=diasAte(e.prev);
  return k<0?['over','atrasado '+(-k)+' dia'+(-k===1?'':'s')]:k===0?['warn',pt?'prazo é hoje':'volta hoje']:k<=7?['warn',(pt?'prazo em ':'volta em ')+k+' dia'+(k===1?'':'s')]:['mut',(pt?'quitar até ':'volta em ')+fmtDataCurta(e.prev)];}
function empAvatar(n){const c=['#f59e0b','#22d3ee','#a78bfa','#f472b6','#34d399','#60a5fa'][[...String(n)].reduce((a,ch)=>a+ch.charCodeAt(0),0)%6];return `<span class="empAv" style="--c:${c}">${esc((primeiroNome(n)[0]||'?').toUpperCase())}</span>`;}
function contasOpts(sel){const A=bancosAtivos(sel);return A.length?A.map(b=>({v:'b:'+b.id,t:b.nome})):[{v:'',t:'sem conta (dinheiro)'}];}
function empAchaOuCria(nome){nome=String(nome||'').trim().slice(0,60);const k=norm(nome);let e=(S.emprestimos||[]).find(x=>norm(x.pessoa)===k);
  if(!e){e={id:uid(),pessoa:nome,tel:'',prev:'',obs:'',criadoEm:hojeISO()};(S.emprestimos=S.emprestimos||[]).push(e);}return e;}
/* v10.121: empréstimo atrasado ganha um atalho para lembrar a pessoa (abre a mensagem pronta com WhatsApp) */
function empCobraHTML(){
  const L=(S.emprestimos||[]).map(e=>({e,t:empTot(e.id)})).filter(x=>x.t.aberto>0&&x.e.prev&&diasAte(x.e.prev)<0).sort((a,b)=>a.e.prev<b.e.prev?-1:1);
  if(!L.length)return '';const e=L[0].e;
  return `<button type="button" class="empCobra" data-act="emp-cobrar" data-id="${esc(e.id)}">${I('chat')}<span>Lembrar ${esc(primeiroNome(e.pessoa))} pelo WhatsApp</span>${I('chevR')}</button>`;
}
/* v10.119: resumo do mês e empréstimos lado a lado quando os dois aparecem (sugestões de empréstimo vêm depois) */
function blocosInicioHTML(){
  const rc=resumoCardHTML(true),ec=empCardHTML(true),k=ec.indexOf('<button type="button" class="card revCard empCard"');
  const sug=k<0?ec:ec.slice(0,k),card=k<0?'':ec.slice(k);
  const cob=card?empCobraHTML():'';
  if(rc&&card)return `<div class="gvDuo">${rc}${card}</div>${cob}${revisarHTML()}${concHTML()}${sug}`;
  return resumoCardHTML()+revisarHTML()+concHTML()+empCardHTML()+cob;
}
function empCardHTML(duo){
  const L=(S.emprestimos||[]).map(e=>({e,t:empTot(e.id)})).filter(x=>x.t.aberto>0);
  const sug=empSugestoes()[0];
  let h='';
  const sp=empSuspeitos()[0];if(sp)h+=`<div class="card empSug empAntCard">${empSuspDica(sp,true)}</div>`;
  if(sug)h+=`<div class="card empSug"><div class="empSugTop">${empAvatar(sug.e.pessoa)}<div><b>${esc(primeiroNome(sug.e.pessoa))} te pagou?</b><small>entrou ${brl(sug.t.valor)} em ${fmtDataCurta(sug.t.data)} · ${esc(nomeTx(sug.t).n||sug.t.descricao||'')}</small></div></div><div class="empSugBt"><button class="btn2 sm" data-act="emp-sug-nao" data-id="${sug.t.id}">não é</button><button class="btn sm" data-act="emp-sug-ok" data-id="${sug.t.id}~${sug.e.id}">é devolução</button></div></div>`;
  if(!L.length)return h;
  const tot=L.reduce((a,x)=>a+cents(x.t.aberto),0)/100,atr=L.filter(x=>x.e.prev&&diasAte(x.e.prev)<0);
  // v10.119: valor em linha própria (não quebra o título) e, com uma pessoa só, "atrasado" sem repetir o nome
  const atrTx=!atr.length?'':L.length===1?'atrasado':atr.length===1?esc(primeiroNome(atr[0].e.pessoa))+' atrasado':atr.length+' atrasados';
  return h+`<button type="button" class="card revCard empCard" data-act="emp-lista"><span class="revIc">${I('handCoins')}</span><span class="revTx"><b>${duo?'Empréstimos':'A receber de empréstimos'}</b><span class="empVal">${brl(tot)}</span><small>${duo?'a receber · ':''}${L.length===1?esc(L[0].e.pessoa):L.length+' pessoas'}${atrTx?` · <em class="empAtr">${atrTx}</em>`:''}</small></span>${I('chevR')}</button>`;
}
/* receita recente com o nome de quem te deve e valor até o que falta = provável devolução */
function empSugestoes(){
  const ign=new Set(S.cfg.empIgn||[]),lim=isoDe(new Date(Date.now()-45*864e5)),out=[];
  const P=(S.emprestimos||[]).map(e=>({e,ab:empTot(e.id).aberto,k:norm(primeiroNome(e.pessoa))})).filter(x=>x.ab>0&&x.k.length>=3);
  if(!P.length)return out;
  S.tx.forEach(t=>{if(t.tipo!=='receita'||!efetivo(t)||t.emp||t.empJuros||ign.has(t.id)||!t.data||t.data<lim)return;
    const e=empCasa(t.descricao,t.valor,t.data,'in');if(e)out.push({t,e});}); // v10.79: nome inteiro conta mais, data depois do empréstimo
  return out.sort((a,b)=>b.t.data.localeCompare(a.t.data));
}
/* v10.78: forma de devolver. "avista" = um pagamento só (com data prevista opcional); "partes" = vai pagando o quanto puder até quitar.
   nos dois casos qualquer devolução parcial é aceita e o que falta é sempre saiu − voltou − perdoado. */
const EMP_MODO={avista:'À vista',partes:'Em partes'};
function empModo(e){return e&&e.modo==='partes'?'partes':'avista';}
function empResumo(t){return `Recebi ${brl(t.voltou)} de ${brl(t.saiu)}${t.perdoado>0?` · perdoei ${brl(t.perdoado)}`:''}, falta ${brl(t.aberto)}`;}
function empBarHTML(t){const pg=t.saiu>0?Math.min(100,t.voltou/t.saiu*100):0,pd=t.saiu>0?Math.min(100-pg,t.perdoado/t.saiu*100):0;
  return `<div class="empBar2" role="img" aria-label="${OCULTO?'progresso oculto':esc(empResumo(t))}"><i class="pg" style="width:${pg.toFixed(1)}%"></i><i class="pd" style="width:${pd.toFixed(1)}%"></i></div>`;}
/* entradas esperadas de empréstimo (data combinada daqui até "ate"): entram na previsão se a pessoa não desligou */
function empPrevistos(ate){
  if(S.cfg.empPrev===false)return [];const hj=hojeISO(),out=[];
  (S.emprestimos||[]).forEach(e=>{if(!e.prev||e.prev<hj||e.prev>ate)return;const t=empTot(e.id);if(t.aberto>0)out.push({e,data:e.prev,valor:t.aberto});});
  return out;
}
function empAvisos(AD){
  const out=[];
  (S.emprestimos||[]).forEach(e=>{const t=empTot(e.id);if(!(t.aberto>0)||!e.prev)return;const k=diasAte(e.prev);if(k>AD)return;
    out.push({id:'em|'+e.id+'|'+e.prev+'|'+(k<0?'a':k===0?'h':'p'),k:k<0?'venc':'aviso',h:`${I('handCoins')} <b>${esc(e.pessoa)}</b> ${k<0?'está atrasado há '+(-k)+(k===-1?' dia':' dias'):k===0?'combinou de devolver hoje':'combinou de devolver em '+k+(k===1?' dia':' dias')} · falta ${brl(t.aberto)} <button class="btn2 sm" data-act="emp-abre" data-id="${e.id}">ver</button>`});});
  return out;
}
function abreEmprestimos(){
  const box=$('#modal'),L=(S.emprestimos||[]).map(e=>({e,t:empTot(e.id)}));
  const ab=L.filter(x=>x.t.aberto>0).sort((a,b)=>(a.e.prev||'9')<(b.e.prev||'9')?-1:(a.e.prev||'9')>(b.e.prev||'9')?1:b.t.aberto-a.t.aberto),qt=L.filter(x=>!(x.t.aberto>0)&&x.t.saiu>0);
  const tot=ab.reduce((a,x)=>a+cents(x.t.aberto),0)/100,atr=ab.filter(x=>x.e.prev&&diasAte(x.e.prev)<0),totAtr=atr.reduce((a,x)=>a+cents(x.t.aberto),0)/100;
  const voltou=ab.reduce((a,x)=>a+cents(x.t.voltou),0)/100,saiu=ab.reduce((a,x)=>a+cents(x.t.saiu),0)/100;
  const card=({e,t})=>{const [k,l]=empPrazo(e,t.aberto);
    return `<div class="empP"><button type="button" class="empPTop" data-act="emp-abre" data-id="${e.id}" aria-label="abrir empréstimo de ${esc(e.pessoa)}">${empAvatar(e.pessoa)}<span class="empPN"><b>${esc(e.pessoa)}</b><small><span class="empModo">${EMP_MODO[empModo(e)]}</span><span class="badge ${k}">${l}</span></small></span><span class="empPV"><small>falta</small><b>${brl(t.aberto)}</b></span>${I('chevR','tapCh')}</button>
      ${empBarHTML(t)}<p class="empLinha">recebi ${brl(t.voltou)} de ${brl(t.saiu)}</p>
      <div class="empBt"><button class="btn2 sm" data-act="emp-cobrar" data-id="${e.id}">${I('mail')}cobrar</button><button class="btn sm" data-act="emp-recebi" data-id="${e.id}">${I('arrowDown')}registrar pagamento</button></div></div>`;};
  box.innerHTML=`<div class="sheet empSheet" role="dialog" aria-modal="true" aria-label="Empréstimos"><div class="sh-head"><h3>Empréstimos</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <div class="empHero"><span class="empHeroIc">${I('handCoins')}</span><small>a receber</small><b>${brl(tot)}</b><span>${ab.length?ab.length+' pessoa'+(ab.length>1?'s':'')+' · já voltou '+brl(voltou)+' de '+brl(saiu):'ninguém te deve agora'}</span>${atr.length?`<em class="empAtrH">${I('alert')}${atr.length===1?esc(primeiroNome(atr[0].e.pessoa))+' está atrasado':atr.length+' atrasados'} · ${brl(totAtr)}</em>`:''}</div>
    ${empSuspeitos().slice(0,3).map(x=>empSuspDica(x,false)).join('')}
    ${ab.map(card).join('')||'<p class="small empVazio">Quando emprestar dinheiro, registre aqui. Sai da conta mas não conta como gasto nem entra no orçamento. Você acompanha cada devolução até quitar.</p>'}
    <button class="btn full" data-act="emp-novo">${I('plus')} emprestei dinheiro</button>
    <label class="ckrow empPrevCk"><input type="checkbox" id="empPrevCk" ${S.cfg.empPrev===false?'':'checked'}><span>contar a data combinada como entrada prevista (previsão e planejamento)</span></label>
    ${qt.length?`<details class="empQt"><summary>quitados e perdoados (${qt.length})</summary>${qt.map(({e,t})=>`<button type="button" class="tx empQRow" data-act="emp-abre" data-id="${e.id}">${empAvatar(e.pessoa)}<div class="txt"><b>${esc(e.pessoa)}</b><small>${t.perdoado>0?'devolveu '+brl(t.voltou)+' · perdoado '+brl(t.perdoado):'devolveu '+brl(t.voltou)}</small></div>${I('chevR')}</button>`).join('')}</details>`:''}
    <p class="small" style="margin-top:12px">A transferência já veio do banco? Toque nela no extrato e escolha "Emprestei (vai voltar)" ou "Devolução de empréstimo".</p>
  </div>`;
  box.classList.add('on');
  const ck=$('#empPrevCk');if(ck)ck.addEventListener('change',()=>{S.cfg.empPrev=ck.checked;salvar();render();toast(ck.checked?'Entra na previsão':'Fora da previsão');});
}
function abreEmp(id){
  const e=empPorId(id);if(!e)return abreEmprestimos();
  const t=empTot(id),[k,l]=empPrazo(e,t.aberto),box=$('#modal');
  const H=S.tx.filter(x=>x.emp===id||x.empJuros===id).sort((a,b)=>b.data.localeCompare(a.data)||(a.empDir==='out'?1:-1));
  const dev=H.filter(x=>x.empDir==='in'&&efetivo(x));
  const jur=empJurosTot(id);
  const linha=x=>{if(x.empJuros)return `<div class="tx empH juros"><span class="ic receita">${I('plus')}</span><div class="txt"><b>juros/lucro</b><small>${fmtDataCurta(x.data)} · receita${x.conta?' · '+esc(nomeLado('b:'+x.conta)):''}</small></div><div class="val pos">+ ${brl(x.valor)}</div><button class="txMore" data-act="tx-menu" data-id="${x.id}" aria-label="ações">${I('more')}</button></div>`;
    const d=x.empDir,ic=d==='in'?'arrowDown':d==='perdao'?'heartHand':'arrowUp',lb=d==='in'?'devolveu':d==='perdao'?(x.tipo==='despesa'?'perdoei · virou despesa':'perdoei'):'emprestei',ld=d==='in'?x.para:d==='out'?x.de:'';
    return `<div class="tx empH ${d}"><span class="ic ${d==='in'?'receita':d==='perdao'?'despesa':'transf'}">${I(ic)}</span><div class="txt"><b>${lb}</b><small>${fmtDataCurta(x.data)}${x.empAnt?' · antes do app, não mexe no saldo':ld?' · '+esc(nomeLado(ld)):''}${x.pluggyId?' · do banco':''}</small></div><div class="val ${d==='in'?'pos':''}">${d==='in'?'+':'−'} ${brl(x.valor)}</div><button class="txMore" data-act="tx-menu" data-id="${x.id}" aria-label="ações">${I('more')}</button></div>`;};
  box.innerHTML=`<div class="sheet empSheet" role="dialog" aria-modal="true" aria-label="${esc(e.pessoa)}"><div class="sh-head"><h3>${esc(e.pessoa)}</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <div class="empHero">${empAvatar(e.pessoa)}<small>${t.aberto>0?'falta receber':t.perdoado>0?'encerrado':'quitado'}</small><b>${brl(t.aberto)}</b><span><span class="empModo">${EMP_MODO[empModo(e)]}</span> <span class="badge ${k}">${l}</span></span></div>
    <div class="empProg">${empBarHTML(t)}<p class="empProgT"><b>${esc(empResumo(t))}</b></p>
      <div class="empProgL"><span><i class="pg"></i>recebido ${brl(t.voltou)}</span>${t.perdoado>0?`<span><i class="pd"></i>perdoado ${brl(t.perdoado)}</span>`:''}<span><i class="ab"></i>falta ${brl(t.aberto)}</span>${jur>0?`<span class="empJurL"><i class="jr"></i>juros +${brl(jur)}</span>`:''}</div></div>
    ${e.obs?`<p class="small empObs">${esc(e.obs)}</p>`:''}
    ${empSuspeitos().filter(x=>x.e.id===id).slice(0,1).map(x=>empSuspDica(x,false)).join('')}
    ${t.aberto>0?`<div class="empBt" style="margin:10px 0 4px"><button class="btn2" data-act="emp-cobrar" data-id="${id}">${I('mail')}cobrar</button><button class="btn" data-act="emp-recebi" data-id="${id}">${I('arrowDown')}registrar pagamento</button></div>`:''}
    <h4 class="rsH">pagamentos recebidos ${dev.length?'('+dev.length+')':''}</h4>
    ${dev.length?dev.map(x=>{const j=S.tx.find(y=>y.jurosDe===x.id&&y.empJuros===id);return linha(x)+(j?linha(j):'');}).join(''):`<p class="small">${t.aberto>0?(empModo(e)==='partes'?'nenhuma parte devolvida ainda. cada pagamento que entrar baixa o que falta.':'ainda não devolveu. se pagar em partes, registre cada uma.'):'sem devoluções.'}</p>`}
    <h4 class="rsH">histórico completo</h4>
    ${H.map(linha).join('')||'<p class="small">sem lançamentos ainda.</p>'}
    <div class="row empRodape"><button class="btn2 sm" data-act="emp-novo" data-id="${id}">${I('plus')}emprestar mais</button><button class="btn2 sm" data-act="emp-edit" data-id="${id}">${I('edit')}editar</button>${empSaidasCorrigiveis(id).length?`<button class="btn2 sm" data-act="emp-ant" data-id="${id}">${I('clock')}${empSaidasCorrigiveis(id).every(x=>x.empAnt)?'saiu antes do app':'já tinha saído antes do app'}</button>`:''}${t.aberto>0?`<button class="btn2 sm" data-act="emp-perdoa" data-id="${id}">${I('heartHand')}perdoar o resto</button>`:''}<button class="btn2 sm danger" data-act="emp-del" data-id="${id}">${I('trash')}excluir</button><button class="btn2 sm" style="margin-left:auto" data-act="emp-lista">todos</button></div>
  </div>`;
  box.classList.add('on');
}
/* campo de escolha em pílulas (radio) */
function segHTML(c){return `<div class="segF" role="radiogroup" aria-label="${esc(c.label)}"><span class="segL">${esc(c.label)}</span><div class="segB">${c.options.map(o=>`<label class="segO"><input type="radio" name="${c.name}" value="${esc(o.v)}" ${String(o.v)===String(c.value)?'checked':''}><span><b>${esc(o.t)}</b>${o.d?`<small>${esc(o.d)}</small>`:''}</span></label>`).join('')}</div></div>`;}
function novoEmp(id,pre){
  const e=id?empPorId(id):null;pre=pre||{};
  const nomes=(S.emprestimos||[]).map(x=>x.pessoa);
  form(e?'Emprestar mais a '+e.pessoa:'Emprestei dinheiro',[
    e?{name:'pessoa',type:'hidden',value:e.pessoa}:{name:'pessoa',label:'Pra quem',value:pre.pessoa||'',required:true,placeholder:'nome da pessoa',list:nomes,maxlength:60},
    {name:'valor',label:'Valor (R$)',value:pre.valor?num(pre.valor):'',required:true,inputmode:'decimal',placeholder:'0,00'},
    {name:'antes',label:'Já tinha emprestado antes de usar o app',type:'checkbox',value:!!pre.antes},
    {name:'conta',label:'Saiu de',type:'select',value:pre.conta||'b:'+bancoPadrao(),options:contasOpts(pre.conta&&pre.conta.slice(2))},
    {name:'data',label:'Quando',type:'date',value:pre.data||hojeISO(),required:true},
    {name:'modo',label:'Como vai devolver',type:'seg',value:e?empModo(e):'avista',options:[{v:'avista',t:'À vista',d:'tudo de uma vez'},{v:'partes',t:'Em partes',d:'vai pagando até quitar'}]},
    {name:'prev',label:'Data prevista para devolver (opcional)',type:'date',value:e?e.prev:''},
    {name:'obs',label:'Observação (opcional)',value:e?e.obs:'',placeholder:'ex: pra consertar o carro',maxlength:140}
  ],v=>{
    const valor=parseBR(v.valor);if(!(valor>0))return 'Informe um valor maior que zero.';
    if(!String(v.pessoa||'').trim())return 'Diga pra quem você emprestou.';
    if(!DATA_OK.test(String(v.data)))return 'Informe a data.';
    const antes=!!v.antes;
    const p=empAchaOuCria(v.pessoa);p.modo=v.modo==='partes'?'partes':'avista';if(v.prev)p.prev=v.prev;if(v.obs)p.obs=String(v.obs).slice(0,140);
    /* v10.79: o mesmo Pix já veio do banco? vira o empréstimo (não conta duas vezes) */
    const bx=antes?null:txBancoIgual(v.conta,'despesa',valor,v.data);
    if(bx){aplicaEmp(bx,p.id,'out');toast('Usei a saída que já veio do banco · não conta duas vezes');setTimeout(()=>abreEmp(p.id),40);return;}
    S.tx.push(Object.assign({id:uid(),tipo:'transf',emp:p.id,empDir:'out',valor,data:v.data,de:antes?'':v.conta||'',para:'',categoria:'Empréstimo',descricao:'empréstimo para '+p.pessoa,cartao:'',conta:'',forma:''},antes?{empAnt:1}:{}));
    salvar();render();toast(antes?'Empréstimo antigo registrado · não mexe no saldo':'Empréstimo registrado · não conta como gasto');setTimeout(()=>abreEmp(p.id),40);
  });
  const mf=$('#mf');if(!mf)return;
  /* v10.79: empréstimo antigo: some o "Saiu de", a data pode ser antiga e nada sai das contas */
  const ckA=mf.querySelector('[name="antes"]'),lbC=mf.querySelector('[name="conta"]').closest('label'),lbD=mf.querySelector('[name="data"]').closest('label');
  ckA.closest('label').classList.add('empAntCk');ckA.closest('label').insertAdjacentHTML('afterend','<p class="empAntDica" id="empAntDica">Não tira dinheiro de nenhuma conta (ele já tinha saído antes). Continua em A receber, no patrimônio, na previsão e nos avisos.</p>');
  const pintaA=()=>{const on=ckA.checked;lbC.style.display=on?'none':'';$('#empAntDica').style.display=on?'':'none';if(lbD.firstChild)lbD.firstChild.textContent=on?'Quando emprestou (pode ser antiga)':'Quando';};
  ckA.addEventListener('change',pintaA);pintaA();
  const pv=mf.querySelector('[name="prev"]'),lb=pv&&pv.closest('label');
  const pinta=()=>{const m=(mf.querySelector('[name="modo"]:checked')||{}).value;if(lb&&lb.firstChild)lb.firstChild.textContent=m==='partes'?'Quitar até (opcional)':'Data prevista para devolver (opcional)';};
  mf.querySelectorAll('[name="modo"]').forEach(r=>r.addEventListener('change',pinta));pinta();
  const bt=mf.querySelector('button[type="submit"]');if(bt)bt.textContent='Registrar empréstimo';
}
/* registrar pagamento (devolução). v10.91: o valor recebido pode ser diferente do que falta.
   - igual: quita. menor: baixa parte e o resto continua em aberto (ou "perdoar o resto").
   - maior: o que faltava volta como devolução (transferência, não é renda) e só a diferença entra como receita
     na categoria "Juros de empréstimo" (t.empJuros = id do empréstimo, t.jurosDe = id da devolução). */
const EMP_JUROS_CAT='Juros de empréstimo';
function empJurosTot(id){return S.tx.filter(t=>t.empJuros===id&&efetivo(t)).reduce((a,t)=>a+cents(t.valor),0)/100;}
function empJurosTx(eid,valor,conta,data,de){if(!S.cats.includes(EMP_JUROS_CAT))S.cats.push(EMP_JUROS_CAT);
  const t={id:uid(),tipo:'receita',valor:c2(valor),categoria:EMP_JUROS_CAT,conta:conta||'',forma:conta?'pix':'dinheiro',status:'pago',data,descricao:'Juros de empréstimo · '+empNome(eid),cartao:'',empJuros:eid,jurosDe:de||''};S.tx.push(t);return t;}
/* divide a conta do recebido: principal (até o que falta), extra (lucro) e o que continua faltando */
function empDivide(aberto,recebido){const ab=cents(aberto),vc=cents(recebido);const pr=Math.min(ab,Math.max(0,vc));return {principal:pr/100,extra:Math.max(0,vc-ab)/100,falta:Math.max(0,ab-vc)/100};}
function recebiEmp(id,pre){
  pre=pre||{};
  const abertos=(S.emprestimos||[]).map(e=>({e,t:empTot(e.id)})).filter(x=>x.t.aberto>0);
  if(!id&&!abertos.length){toast('Ninguém está te devendo agora. Registre o empréstimo primeiro.',true);return;}
  if(!id&&abertos.length===1)id=abertos[0].e.id;
  let e=id?empPorId(id):null;if(id&&!e)return;
  const t0=e?empTot(e.id):abertos[0].t;
  const campos=[];
  if(!e)campos.push({name:'quem',label:'Quem pagou',type:'select',value:abertos[0].e.id,options:abertos.map(x=>({v:x.e.id,t:x.e.pessoa+' · falta '+brl(x.t.aberto)}))});
  campos.push({name:'valor',label:'Quanto você recebeu (R$)',value:num(pre.valor>0?pre.valor:t0.aberto),required:true,inputmode:'decimal'},
    {type:'html',name:'_dif',html:'<div class="empDif" id="empDif" aria-live="polite"></div>'},
    {name:'perdoa',label:'perdoar o resto (encerra sem cobrar o que falta)',type:'checkbox',value:false},
    {name:'conta',label:'Entrou na conta',type:'select',value:pre.conta||'b:'+bancoPadrao(),options:contasOpts(pre.conta&&pre.conta.slice(2)).concat([{v:'ant',t:'não mexer no saldo (recebi antes de usar o app)'}])},
    {name:'data',label:'Quando',type:'date',value:pre.data||hojeISO(),required:true});
  form(e?'Receber de '+primeiroNome(e.pessoa):'Recebi de volta',campos,v=>{
    const eid=e?e.id:v.quem,ee=empPorId(eid);if(!ee)return 'Escolha quem pagou.';
    const tt=empTot(eid),valor=parseBR(v.valor);if(!(valor>0))return 'Informe quanto você recebeu.';
    if(!DATA_OK.test(String(v.data)))return 'Informe a data.';
    const ant=v.conta==='ant',dv=empDivide(tt.aberto,valor);
    if(ant&&dv.extra>0)return 'O que passou do emprestado é lucro e precisa entrar numa conta. Escolha a conta.';
    const conta=!ant&&String(v.conta||'').indexOf('b:')===0?v.conta.slice(2):'';
    /* v10.79: a entrada já veio do banco? vira a devolução (não conta duas vezes); o extra vira juros sozinho */
    const bx=ant?null:txBancoIgual(v.conta,'receita',valor,v.data);
    let pid='';
    if(bx){aplicaEmpTx(bx,eid,'in');pid=bx.id;}
    else{
      if(dv.principal>0){const t={id:uid(),tipo:'transf',emp:eid,empDir:'in',valor:dv.principal,data:v.data,de:'',para:ant?'':v.conta||'',categoria:'Empréstimo',descricao:ee.pessoa+' devolveu',cartao:'',conta:'',forma:''};if(ant)t.empAnt=1;S.tx.push(t);pid=t.id;}
      if(dv.extra>0)empJurosTx(eid,dv.extra,conta,v.data,pid);
    }
    if(v.perdoa&&dv.falta>0)S.tx.push({id:uid(),tipo:'transf',emp:eid,empDir:'perdao',valor:dv.falta,data:v.data,de:'',para:'',categoria:'Empréstimo',descricao:'perdoei '+ee.pessoa,cartao:'',conta:'',forma:'',status:'pago'});
    salvar();render();const ab=empTot(eid).aberto;
    toast(dv.extra>0?primeiroNome(ee.pessoa)+' quitou · +'+brl(dv.extra)+' de juros':ab>0?'Pagamento registrado · falta '+brl(ab):v.perdoa&&dv.falta>0?'Recebido e o resto perdoado':primeiroNome(ee.pessoa)+' quitou tudo');
    setTimeout(()=>abreEmp(eid),40);
  });
  const mf=$('#mf');if(!mf)return;
  mf.closest('.sheet').classList.add('empRecSheet');
  mf.insertAdjacentHTML('afterbegin','<div class="empRecebi" id="empRecebiBox"></div>');
  const box=$('#empRecebiBox'),inV=mf.querySelector('[name="valor"]'),selQ=mf.querySelector('[name="quem"]'),dif=$('#empDif'),
    ckP=mf.querySelector('[name="perdoa"]'),lbP=ckP.closest('label'),bt=mf.querySelector('button[type="submit"]');
  inV.closest('label').classList.add('empValLbl');lbP.classList.add('empPerdCk');
  const pinta=()=>{const eid=e?e.id:selQ.value,tt=empTot(eid),ee=empPorId(eid);const nv=parseBR(inV.value)||0,dv=empDivide(tt.aberto,nv);
    box.innerHTML=`<div class="empRecTop">${empAvatar(ee.pessoa)}<div><small>${EMP_MODO[empModo(ee)]}${ee.prev?' · '+(empModo(ee)==='partes'?'quitar até ':'combinado para ')+fmtDataCurta(ee.prev):''}</small><b>${esc(primeiroNome(ee.pessoa))} te deve ${brl(tt.aberto)}</b></div></div>${empBarHTML(tt)}
      <div class="empRecNums"><span><small>emprestei</small><b>${brl(tt.saiu)}</b></span><span><small>já voltou</small><b>${brl(tt.voltou)}</b></span><span><small>falta</small><b>${brl(tt.aberto)}</b></span></div>`;
    let h='',k='';
    if(!(nv>0)){h='digite quanto você recebeu';k='mut';}
    else if(dv.extra>0){k='mais';h=`<em class="empDifL"><b>+${brl(dv.extra)}</b> de juros/lucro</em><small>${brl(dv.principal)} voltam como devolução (não é renda) e ${brl(dv.extra)} entram como receita em ${EMP_JUROS_CAT}</small>`;}
    else if(dv.falta>0){k=ckP.checked?'perd':'menos';h=ckP.checked?`<em class="empDifL"><b>${brl(dv.falta)}</b> perdoados</em><small>o empréstimo fica encerrado sem mexer no saldo</small>`:`<em class="empDifL">faltam <b>${brl(dv.falta)}</b></em><small>o resto continua em aberto para o próximo pagamento</small>`;}
    else{k='ok';h=`<em class="empDifL"><b>quitado</b></em><small>recebeu exatamente o que faltava</small>`;}
    dif.className='empDif '+k;dif.innerHTML=(k==='mais'?I('up'):k==='ok'?I('check'):k==='menos'?I('clock'):k==='perd'?I('heartHand'):'')+'<span>'+h+'</span>';
    lbP.style.display=dv.falta>0&&nv>0?'':'none';
    if(bt)bt.textContent=dv.extra>0?'Receber '+brl(nv):dv.falta>0&&nv>0?(ckP.checked?'Receber e perdoar o resto':'Registrar pagamento parcial'):'Registrar pagamento';};
  inV.addEventListener('input',pinta);ckP.addEventListener('change',pinta);
  if(selQ)selQ.addEventListener('change',()=>{const tt=empTot(selQ.value);inV.value=num(tt.aberto);pinta();});pinta();
}
/* perdoar o que falta: encerra a dívida sem mexer em conta; vira despesa só se a pessoa marcar */
function perdoaEmp(id){
  const e=empPorId(id);if(!e)return;const t=empTot(id);if(!(t.aberto>0))return;
  form('Perdoar '+primeiroNome(e.pessoa),[
    {name:'valor',label:'Valor perdoado (R$)',value:num(t.aberto),required:true,inputmode:'decimal'},
    {name:'data',label:'Quando',type:'date',value:hojeISO(),required:true},
    {name:'desp',label:'contar como despesa (aparece nos gastos e relatórios)',type:'checkbox',value:false},
    {name:'cat',label:'Categoria da despesa',type:'select',value:S.cats.includes('Presentes')?'Presentes':'Outros',options:S.cats.map(c=>({v:c,t:c}))}
  ],v=>{
    const valor=parseBR(v.valor);if(!(valor>0))return 'Informe um valor maior que zero.';
    if(cents(valor)>cents(empTot(id).aberto))return 'Passa do que falta ('+brl(empTot(id).aberto)+').';
    const d=!!v.desp;
    S.tx.push({id:uid(),tipo:d?'despesa':'transf',emp:id,empDir:'perdao',valor,data:v.data,de:'',para:'',categoria:d?(v.cat||'Outros'):'Empréstimo',descricao:'perdoei '+e.pessoa,cartao:'',conta:'',forma:'',status:'pago'});
    salvar();render();toast(d?'Perdoado · entrou como despesa':'Perdoado · não conta como gasto');setTimeout(()=>abreEmp(id),40);
  });
  const mf=$('#mf');if(!mf)return;
  mf.insertAdjacentHTML('afterbegin',`<p class="empNota">${esc(empResumo(t))}. Perdoar encerra a dívida sem mexer no saldo das contas (o dinheiro já tinha saído quando você emprestou).</p>`);
  const ck=mf.querySelector('[name="desp"]'),lc=mf.querySelector('[name="cat"]').closest('label');const pc=()=>{lc.style.display=ck.checked?'':'none';};ck.addEventListener('change',pc);pc();
  const bt=mf.querySelector('button[type="submit"]');if(bt)bt.textContent='Perdoar';
}
function editaEmp(id){
  const e=empPorId(id);if(!e)return;
  form('Editar',[
    {name:'pessoa',label:'Nome',value:e.pessoa,required:true},
    {name:'tel',label:'WhatsApp (opcional, pra cobrar direto)',value:e.tel,inputmode:'tel',placeholder:'61 99999-9999'},
    {name:'prev',label:'Combinou de devolver até',type:'date',value:e.prev},
    {name:'obs',label:'Observação',value:e.obs}
  ],v=>{if(!String(v.pessoa||'').trim())return 'Informe o nome.';e.pessoa=String(v.pessoa).trim().slice(0,60);e.tel=String(v.tel||'').replace(/\D/g,'').slice(0,13);e.prev=v.prev||'';e.obs=String(v.obs||'').slice(0,140);salvar();render();setTimeout(()=>abreEmp(id),40);});
}
function delEmp(id){
  const e=empPorId(id);if(!e)return;const n=S.tx.filter(t=>t.emp===id).length;
  confirma({titulo:'Excluir '+e.pessoa+'?',texto:n?`Os ${n} lançamento${n>1?'s':''} continuam no extrato, mas voltam a ser gasto e receita normais.`:'',ok:'excluir',perigo:true},()=>{
    S.tx.forEach(t=>{if(t.emp===id)desfazEmpTx(t);if(t.empJuros===id){delete t.empJuros;delete t.jurosDe;}});S.emprestimos=S.emprestimos.filter(x=>x.id!==id);salvar();render();toast('Excluído');});
}
function msgCobranca(e){const t=empTot(e.id),n=primeiroNome(e.pessoa);
  const q=S.tx.filter(x=>x.emp===e.id&&x.empDir==='out').map(x=>x.data).sort()[0];
  return `Oi ${n}! Tudo bem? Passando pra lembrar dos ${brl(t.aberto)} que te emprestei${q?' em '+fmtDataCurta(q):''}.${e.prev?(diasAte(e.prev)<0?` A gente tinha combinado até ${fmtDataCurta(e.prev)}.`:` Combinamos até ${fmtDataCurta(e.prev)}, tá?`):' Consegue me dizer quando dá pra devolver?'} Valeu!`;}
function cobrarEmp(id){
  const e=empPorId(id);if(!e)return;const m=msgCobranca(e),box=$('#modal');
  const wa='https://wa.me/'+(e.tel?(e.tel.length<=11?'55':'')+e.tel:'')+'?text='+encodeURIComponent(m);
  box.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="Cobrar"><div class="sh-head"><h3>Lembrar ${esc(primeiroNome(e.pessoa))}</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <textarea id="empMsg" class="empMsg" rows="5">${esc(m)}</textarea>
    <div class="empBt" style="margin-top:10px"><button class="btn2" id="empCopia">${I('copy')}copiar</button><a class="btn" id="empWa" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a></div>
    ${e.tel?'':`<p class="small" style="margin-top:8px">Sem número salvo, o WhatsApp pede pra escolher o contato. Salve o número em editar.</p>`}
  </div>`;
  box.classList.add('on');
  const ta=$('#empMsg'),a=$('#empWa');
  ta.addEventListener('input',()=>{a.href='https://wa.me/'+(e.tel?(e.tel.length<=11?'55':'')+e.tel:'')+'?text='+encodeURIComponent(ta.value);});
  $('#empCopia').addEventListener('click',()=>{(navigator.clipboard?navigator.clipboard.writeText(ta.value):Promise.reject()).then(()=>toast('Mensagem copiada'),()=>{ta.select();document.execCommand&&document.execCommand('copy');toast('Mensagem copiada');});});
}
/* transforma um lançamento que já existe (ex.: Pix que veio do banco) em empréstimo ou devolução */
function aplicaEmpTx(t,eid,dir){
  const c=t.conta||(t.tipo!=='transf'?contaDoLanc(t):'')||'';
  const ab=dir==='in'?cents(empTot(eid).aberto):0;
  t.empOrig={tipo:t.tipo,categoria:t.categoria,conta:t.conta||''};
  t.tipo='transf';t.emp=eid;t.empDir=dir;t.categoria='Empréstimo';
  if(dir==='out'){t.de=c?'b:'+c:'';t.para='';}else{t.para=c?'b:'+c:'';t.de='';}
  t.conta='';t.cartao='';delete t.rev;
  /* v10.91: entrou mais do que faltava: a devolução fica com o que faltava e o resto vira juros (receita) */
  if(dir==='in'&&ab>0&&cents(t.valor)>ab){const ex=(cents(t.valor)-ab)/100;t.empOrig.valor=t.valor;t.valor=ab/100;empJurosTx(eid,ex,c,t.data,t.id);}
}
function aplicaEmp(t,eid,dir){
  aplicaEmpTx(t,eid,dir);
  salvar();render();const ab=empTot(eid).aberto;toast(dir==='in'?(ab>0?'Devolução registrada · falta '+brl(ab):primeiroNome(empNome(eid))+' quitou tudo'):'Marcado como empréstimo');
}
function desfazEmpTx(t){const o=t.empOrig||{};const dir=t.empDir,lado=(t.empAnt?t.empAntDe:(dir==='in'?t.para:t.de))||'';
  if(o.valor>0){t.valor=o.valor;S.tx=S.tx.filter(x=>!(x.jurosDe===t.id&&x.empJuros));} // v10.91: volta o valor inteiro e tira os juros separados
  t.tipo=o.tipo||(dir==='in'?'receita':'despesa');t.categoria=o.categoria||'Outros';t.conta=o.conta||(lado.indexOf('b:')===0?lado.slice(2):'');t.de='';t.para='';delete t.emp;delete t.empDir;delete t.empOrig;delete t.empAnt;delete t.empAntDe;}
function desfazEmp(id){const t=S.tx.find(x=>x.id===id);if(!t||!t.emp)return;desfazEmpTx(t);salvar();render();toast(t.tipo==='receita'?'Voltou a ser receita':'Voltou a ser gasto');}
function converteEmp(id,dir){
  const t=S.tx.find(x=>x.id===id);if(!t)return;
  const E=(S.emprestimos||[]).map(e=>({e,ab:empTot(e.id).aberto}));
  const ops=(dir==='in'?E.filter(x=>x.ab>0):E).map(x=>({v:x.e.id,t:x.e.pessoa+(x.ab>0?' · deve '+brl(x.ab):'')}));
  if(dir==='in'&&!ops.length){toast('Ninguém está te devendo. Registre o empréstimo primeiro.',true);return;}
  const campos=[];
  if(ops.length)campos.push({name:'quem',label:dir==='in'?'Quem devolveu':'Pra quem',type:'select',value:ops[0].v,options:dir==='in'?ops:ops.concat([{v:'',t:'outra pessoa…'}])});
  if(dir==='out')campos.push({name:'nova',label:ops.length?'Nome (se for outra pessoa)':'Pra quem',value:'',placeholder:'nome da pessoa'},{name:'prev',label:'Combinou de devolver até (opcional)',type:'date',value:''});
  form(dir==='in'?'Devolução de '+brl(t.valor):'Emprestei '+brl(t.valor),campos,v=>{
    let eid=v.quem||'';
    if(dir==='out'&&(!eid||String(v.nova||'').trim())){if(!String(v.nova||'').trim())return 'Diga pra quem você emprestou.';eid=empAchaOuCria(v.nova).id;}
    if(!eid)return 'Escolha a pessoa.';
    if(dir==='out'&&v.prev){const e=empPorId(eid);if(e)e.prev=v.prev;}
    aplicaEmp(t,eid,dir);
  });
}

/* ---------- v10.78: detalhe da fatura (fechada ou ciclo aberto) ----------
   abreFatura(id do lançamento da fatura) ou abreFatura('fat|cartão|AAAA-MM') para um ciclo que ainda não fechou */
function abreFatura(ref){
  let ft=S.tx.find(x=>x.id===ref&&x.faturaKey)||S.tx.find(x=>x.faturaKey===ref);
  const key=ft?ft.faturaKey:String(ref||'');const pt=key.split('|'),c=S.cartoes.find(x=>x.id===pt[1]);if(!c||!/^\d{4}-\d{2}$/.test(pt[2]||''))return;
  const compras=S.tx.filter(t=>t.cartao===c.id&&!t.faturaKey&&(t.tipo==='despesa'||t.tipo==='transf')&&t.data&&efetivo(t)&&fechamentoDe(c,t.data).fecha.slice(0,7)===pt[2]).sort((a,b)=>b.data.localeCompare(a.data));
  const tot=compras.reduce((a,t)=>a+cents(t.valor),0)/100;
  const ex=compras[0]?fechamentoDe(c,compras[0].data):null;const fecha=ft?ft.data:ex?ex.fecha:'',vence=ft?venceFatura(ft):ex?ex.vence:'';
  const pg=ft?pagsFatura(ft):[];
  const box=$('#modal');
  box.innerHTML=`<div class="sheet fatSheet" role="dialog" aria-modal="true" aria-label="Fatura ${esc(c.nome)}"><div class="sh-head"><h3>Fatura ${esc(c.nome)}</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <div class="fatHero comCc">${cartaoMini(c)}<div class="fatHeroTx"><small>${ft?nomeMesL(pt[2]):'ciclo aberto'} · ${fecha?(ft?'fechou ':'fecha ')+fmtDataCurta(fecha):''}${vence?' · vence '+fmtDataCurta(vence):''}</small><b>${brl(ft?ft.valor:tot)}</b>${ft?faturaBadge(ft):'<span class="badge mut">ainda pode mudar</span>'}</div></div>
    ${ft&&pg.length?`<div class="fatPagos"><h4 class="rsH">pagamentos</h4>${pg.map(p=>`<div class="row fatPg"><span>${p.data?fmtDataCurta(p.data):'sem data'}${p.conta?' · '+esc((S.bancos.find(b=>b.id===p.conta)||{}).nome||'conta'):''}</span><b>${brl(p.valor)}</b></div>`).join('')}<div class="row fatPg"><span>falta pagar</span><b>${brl(restanteFatura(ft))}</b></div></div>`:''}
    ${ft&&restanteFatura(ft)>0?`<button class="btn full" data-act="pagar-fat" data-id="${ft.id}">${I('check')} pagar ${brl(restanteFatura(ft))}</button>`:''}
    <h4 class="rsH">compras (${compras.length}) · ${brl(tot)}</h4>
    ${compras.map(t=>`<div class="tx tap" data-act="tx-menu" data-id="${t.id}" role="button" tabindex="0"><span class="ic despesa" style="color:${corCat(t.categoria)}">${I(catIcon(t.categoria))}</span><div class="txt"><b>${esc(nomeTx(t).n||t.categoria)}</b><small>${fmtDataCurta(t.data)} · ${esc(t.categoria)}</small></div><div class="val">${brl(t.valor)}</div></div>`).join('')||'<p class="small">nenhuma compra neste ciclo.</p>'}
  </div>`;
  box.classList.add('on');
}
function nomeMesL(ym){const m=+String(ym).slice(5,7);return (MESES_LONGO[m-1]||'')+' de '+String(ym).slice(0,4);}
/* ---------- v10.78: o que compõe a previsão do fim do mês ---------- */
function abrePrevisao(){
  const p=previsaoMes(),box=$('#modal'),h=new Date(),fim=isoDe(new Date(h.getFullYear(),h.getMonth()+1,0)),hj=hojeISO();
  const prev=S.tx.filter(t=>t.status==='previsto'&&t.data<=fim&&(t.tipo==='receita'||(t.tipo==='despesa'&&!t.cartao))).sort((a,b)=>a.data.localeCompare(b.data));
  const fats=S.tx.filter(t=>t.faturaKey&&restanteFatura(t)>0&&venceFatura(t)<=fim);
  const ciclos=[];(S.cartoes||[]).forEach(c=>{const mp={};S.tx.forEach(t=>{if(t.cartao!==c.id||!(t.tipo==='despesa'||t.tipo==='transf')||!t.data||!efetivo(t))return;const f=fechamentoDe(c,t.data);if(f.fecha>hj&&f.vence>hj&&f.vence<=fim){const k='fat|'+c.id+'|'+f.fecha.slice(0,7);mp[k]=(mp[k]||0)+cents(t.valor);}});Object.entries(mp).forEach(([k,v])=>ciclos.push({k,c,v:v/100}));});
  const em=empPrevistos(fim);
  const row=(ic,cc,nome,sub,v,pos,act,id)=>`<div class="rmRow tap" data-act="${act}" data-id="${esc(id)}" role="button" tabindex="0"><span class="rmI" style="--cc:${cc}">${I(ic)}</span><div class="rmT"><b>${esc(nome)}</b><small>${sub}</small></div><span class="rmV nw ${pos?'pos':'neg'}">${pos?'+':'−'} ${brl(v)}</span></div>`;
  box.innerHTML=`<div class="sheet prevSheet" role="dialog" aria-modal="true" aria-label="Previsão do fim do mês"><div class="sh-head"><h3>Previsão do fim do mês</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <div class="prevConta"><div class="row"><span>saldo de hoje</span><b>${brl(p.hoje)}</b></div>${p.rec?`<div class="row"><span>a receber</span><b class="pos">+ ${brl(p.rec)}</b></div>`:''}${p.emp?`<div class="row"><span>empréstimos combinados</span><b class="pos">+ ${brl(p.emp)}</b></div>`:''}${p.des?`<div class="row"><span>a pagar</span><b class="neg">− ${brl(p.des)}</b></div>`:''}${p.cart?`<div class="row"><span>cartão</span><b class="neg">− ${brl(p.cart)}</b></div>`:''}<div class="row prevTot"><span>fim do mês</span><b class="${p.fim<0?'neg':'pos'}">${brl(p.fim)}</b></div></div>
    ${prev.length?`<h4 class="rsH">previstos</h4>${prev.map(t=>row(t.tipo==='receita'?'arrowUp':catIcon(t.categoria),t.tipo==='receita'?'#4ade80':corCat(t.categoria),nomeTx(t).n||t.descricao||t.categoria,(t.trab&&t.tipo==='receita'?'trabalhado '+fmtDataCurta(t.trab)+' · recebe ':'')+fmtDataCurta(t.data)+(t.data<hj?' · atrasado':''),t.valor,t.tipo==='receita','tx-menu',t.id)).join('')}`:''}
    ${trabDicaHTML(null,'prevTrab')}
    ${em.length?`<h4 class="rsH">empréstimos para receber</h4>${em.map(x=>row('handCoins','#22d3ee',x.e.pessoa,'combinado para '+fmtDataCurta(x.data),x.valor,true,'emp-abre',x.e.id)).join('')}`:''}
    ${fats.length||ciclos.length?`<h4 class="rsH">cartões</h4>${fats.map(t=>row('card','#60a5fa',t.descricao,'fatura · vence '+fmtDataCurta(venceFatura(t)),restanteFatura(t),false,'fat-abre',t.id)).join('')}${ciclos.map(x=>row('card','#60a5fa','compras '+x.c.nome,'fatura ainda aberta, vence este mês',x.v,false,'fat-abre',x.k)).join('')}`:''}
    <p class="hmNota">estimativa com o que já está lançado. toque num item para abrir.</p>
  </div>`;
  box.classList.add('on');
}
/* ---------- v10.80: "ainda não recebeu?" em lote ----------
   receitas previstas com data passada: a pessoa marca as que ainda não caíram e diz quando vão cair.
   a data lançada vira o dia trabalhado e a data passa a ser a do recebimento. nada muda sem ela confirmar. */
function abreTrabLote(pre){
  const L=receitasAtrasadas(),box=$('#modal');
  if(!L.length){toast('Nenhuma receita atrasada.');return;}
  const um=L.length===1;
  box.innerHTML=`<div class="sheet tlSheet" role="dialog" aria-modal="true" aria-label="Ainda não recebeu?"><div class="sh-head"><h3>Ainda não recebeu?</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <p class="small">Se você lançou no dia em que trabalhou, marque o que ainda não caiu e diga quando vai cair. A data de agora fica guardada como <b>dia trabalhado</b> e a previsão passa a contar no mês certo.</p>
    <form id="tlForm" novalidate>
    ${um?'':`<div class="row small tlTop"><span id="tlN"></span><span class="row" style="gap:6px"><button type="button" class="btn2 sm" data-tl="todos">marcar todos</button><button type="button" class="btn2 sm" data-tl="nenhum">nenhum</button></span></div>`}
    <div class="tlLista">${L.map(t=>{const w=t.trab||t.data,sg=sugereReceb(w,t.categoria,t.descricao,t.id),on=um||pre===t.id;
      return `<div class="tlRow${on?' on':''}" data-id="${t.id}"><label class="tlCk"><input type="checkbox" name="s_${t.id}" ${on?'checked':''}><span class="tlI" style="--cc:${corCat(t.categoria)}">${I(catIcon(t.categoria))}</span><span class="tlT"><b>${esc(nomeTx(t).n||t.descricao||t.categoria)}</b><small>trabalhado ${fmtDataCurta(w)} · ${brl(t.valor)}</small></span></label>
        <label class="tlD"><span>Recebo em</span><input type="date" name="d_${t.id}" value="${sg?sg.data:''}" min="${w}"><small>${sg?'sugerido: '+sugTxt(sg)+' ('+fmtDataCurta(sg.ref.data)+')':'sem recebimento anterior: informe a data'}</small></label></div>`;}).join('')}</div>
    <button class="btn full" type="submit" id="tlOk">Mover</button></form>
  </div>`;
  box.classList.add('on');
  const f=$('#tlForm'),cks=[...f.querySelectorAll('input[type=checkbox]')];
  const conta=()=>{const n=cks.filter(c=>c.checked).length;cks.forEach(c=>c.closest('.tlRow').classList.toggle('on',c.checked));const b=$('#tlOk');b.textContent=n?'Mover '+(n===1?'1 receita':n+' receitas'):'Marque o que ainda não recebeu';b.disabled=!n;const tn=$('#tlN');if(tn)tn.textContent=n+' de '+L.length+' marcadas';};
  cks.forEach(c=>c.addEventListener('change',conta));
  f.querySelectorAll('[data-tl]').forEach(b=>b.onclick=()=>{cks.forEach(c=>c.checked=b.dataset.tl==='todos');conta();});
  f.querySelectorAll('.tlD input').forEach(i=>i.addEventListener('input',()=>{const ck=f.querySelector('[name="s_'+i.name.slice(2)+'"]');if(ck&&!ck.checked){ck.checked=true;conta();}}));
  conta();
  f.onsubmit=e=>{e.preventDefault();
    const sel=L.filter(t=>{const c=f.querySelector('[name="s_'+t.id+'"]');return c&&c.checked;});
    if(!sel.length){toast('Marque pelo menos uma receita.',true);return;}
    f.querySelectorAll('.tlD.bad').forEach(x=>x.classList.remove('bad'));
    for(const t of sel){const inp=f.querySelector('[name="d_'+t.id+'"]'),d=inp.value,w=t.trab||t.data;
      if(!DATA_OK.test(d)||!dataOk(...d.split('-'))){inp.closest('.tlD').classList.add('bad');toast('Informe quando vai cair '+(nomeTx(t).n||t.categoria)+'.',true);return;}
      if(d<=w){inp.closest('.tlD').classList.add('bad');toast('A data em que cai precisa ser depois do dia trabalhado ('+fmtDataCurta(w)+').',true);return;}}
    sel.forEach(t=>{const d=f.querySelector('[name="d_'+t.id+'"]').value;if(!t.trab)t.trab=t.data;t.data=d;});
    salvar();closeModal();render();
    toast(sel.length===1?'Pronto: recebe em '+fmtDataCurta(sel[0].data)+', trabalhado '+fmtDataCurta(sel[0].trab):'Pronto: '+sel.length+' receitas com o dia trabalhado guardado');
  };
}
/* do "Novo lançamento" para o fluxo de empréstimo, levando valor, data e conta já digitados */
function empDoNovoTx(dir){
  const mf=$('#mf');const g=n=>{const el=mf&&mf.querySelector('[name="'+n+'"]');return el?el.value:'';};
  const valor=parseBR(g('valor'))||0,data=DATA_OK.test(g('data'))?g('data'):hojeISO(),forma=g('forma'),cb=g('conta');
  const conta=forma==='dinheiro'&&contaDinheiroId()?'b:'+contaDinheiroId():cb?'b:'+cb:'';
  closeModal();
  setTimeout(()=>{if(dir==='in')recebiEmp('',{valor,data,conta});else novoEmp('',{valor,data,conta});},30);
}
/* ---------- v10.79: empréstimo antigo (dinheiro que já tinha saído antes de usar o app) ----------
   a saída continua no empréstimo (o que falta, A receber, patrimônio, previsão e avisos), mas não desconta de conta nenhuma.
   marcar guarda a conta em empAntDe; desmarcar devolve a saída para ela. as devoluções não mudam. */
function empAntMarca(t){if(!t||!t.emp||t.empDir!=='out'||t.empAnt)return false;if(t.de)t.empAntDe=t.de;t.de='';t.empAnt=1;return true;}
function empAntDesfaz(t){if(!t||!t.empAnt)return false;const d=t.empAntDe&&S.bancos.some(b=>'b:'+b.id===t.empAntDe)?t.empAntDe:(bancoPadrao()?'b:'+bancoPadrao():'');
  if(t.empDir==='in')t.para=d;else t.de=d;delete t.empAnt;delete t.empAntDe;return true;}
/* saídas que dá para corrigir: lançadas à mão (as que vieram do banco aconteceram de verdade na conta) */
function empSaidasCorrigiveis(id){return S.tx.filter(t=>t.emp===id&&t.empDir==='out'&&!t.pluggyId&&!t.importado&&(t.empAnt||t.de)).sort((a,b)=>a.data<b.data?-1:1);}
/* dica: a saída deixou a conta negativa, ou é anterior a tudo que foi lançado naquela conta */
function empSuspeitos(){
  const out=[],ign=new Set(S.cfg.empAntIgn||[]);
  S.tx.forEach(t=>{if(!t.emp||t.empDir!=='out'||t.empAnt||t.pluggyId||t.importado||!efetivo(t)||ign.has(t.id)||!/^b:/.test(t.de||''))return;
    const e=empPorId(t.emp),b=S.bancos.find(x=>'b:'+x.id===t.de);if(!e||!b)return;
    if(b.saldoData&&t.data<b.saldoData)return; // anterior ao saldo informado: já não desconta nada
    const sb=saldoBanco(b);
    if(sb<0&&sb+t.valor>=-0.004){out.push({t,e,b,motivo:'neg'});return;}
    const k='b:'+b.id;let pri='';S.tx.forEach(x=>{if(x===t||x.emp||!x.data)return;if(x.conta===b.id||x.de===k||x.para===k||x.pagoConta===b.id){if(!pri||x.data<pri)pri=x.data;}});
    if(pri&&t.data<pri)out.push({t,e,b,motivo:'antes'});
  });
  return out;
}
function empSuspDica(x,compacto){const n=esc(primeiroNome(x.e.pessoa)),c=esc(x.b.nome);
  const txt=x.motivo==='neg'?`O empréstimo de ${brl(x.t.valor)} para ${n} deixou a conta ${c} no negativo.`:`O empréstimo para ${n} (${fmtDataCurta(x.t.data)}) é anterior a tudo que você lançou em ${c}.`;
  return `<div class="empAntTip" role="note">${I('info')}<div><p>${txt} Se esse dinheiro já tinha saído antes de você usar o app, corrija para não descontar da conta.</p><div class="empAntTipB">${compacto?`<button class="btn2 sm" data-act="emp-ant-ign" data-id="${x.t.id}">não é isso</button>`:''}<button class="btn2 sm" data-act="emp-ant" data-id="${x.e.id}">corrigir</button></div></div></div>`;}
function empAntForm(id){
  const e=empPorId(id);if(!e)return;const L=empSaidasCorrigiveis(id);
  if(!L.length){toast('Nenhuma saída lançada à mão para corrigir.',true);return;}
  const susp=new Set(empSuspeitos().map(x=>x.t.id));
  form('Saiu antes do app?',L.map(t=>({name:'s_'+t.id,type:'checkbox',value:!!t.empAnt||L.length===1||susp.has(t.id),
    label:`${brl(t.valor)} em ${fmtData(t.data)} · `+(t.empAnt?'já marcado como antes do app':'saiu de '+nomeLado(t.de))})),v=>{
    let marcou=0,desfez=0;const contas={};
    L.forEach(t=>{const on=!!v['s_'+t.id];if(on&&!t.empAnt){const c=t.de;if(empAntMarca(t)){marcou++;contas[c]=(contas[c]||0)+cents(t.valor);}}else if(!on&&t.empAnt){if(empAntDesfaz(t))desfez++;}});
    if(!marcou&&!desfez)return;
    salvar();render();
    const cs=Object.keys(contas).filter(Boolean);
    toast(marcou?(cs.length===1?brl(contas[cs[0]]/100)+' voltou para o saldo de '+nomeLado(cs[0]):'Corrigido · não desconta mais das contas'):'Voltou a descontar da conta');
    setTimeout(()=>abreEmp(id),40);
  });
  const mf=$('#mf');if(!mf)return;
  const t=empTot(id);
  mf.insertAdjacentHTML('afterbegin',`<p class="empNota">Marque o dinheiro que você emprestou <b>antes</b> de começar a usar o app. Ele deixa de descontar do saldo da conta, mas o empréstimo continua igual: falta ${brl(t.aberto)}. As devoluções registradas não mudam. Dá para desfazer depois, aqui mesmo.</p>`);
  const bt=mf.querySelector('button[type="submit"]');if(bt)bt.textContent='Salvar correção';
}
/* ---------- v10.79: empréstimo × lançamentos do banco ----------
   txBancoIgual: lançamento que veio do banco na mesma conta, mesmo valor, até 3 dias de diferença (para não lançar duas vezes).
   empCasa: pessoa do empréstimo cujo nome aparece na descrição do Pix. */
function difDias(a,b){return Math.abs(Math.round((new Date(a+'T12:00')-new Date(b+'T12:00'))/864e5));}
function txBancoIgual(contaSel,tipo,valor,data){
  const id=/^b:/.test(contaSel||'')?contaSel.slice(2):'';if(!id)return null;
  const L=S.tx.filter(t=>t.pluggyId&&!t.emp&&t.tipo===tipo&&t.conta===id&&efetivo(t)&&cents(t.valor)===cents(valor)&&t.data&&difDias(t.data,data)<=3);
  return L.sort((a,b)=>difDias(a.data,data)-difDias(b.data,data))[0]||null;
}
function empTokens(n){return norm(n).replace(/[^a-z0-9]+/g,' ').split(' ').filter(w=>w.length>=3&&!['das','dos','del'].includes(w));}
function empCasa(desc,valor,data,dir){
  const d=' '+norm(desc||'').replace(/[^a-z0-9]+/g,' ')+' ';let best=null;
  (S.emprestimos||[]).forEach(e=>{const tk=empTokens(e.pessoa);if(!tk.length||!d.includes(' '+tk[0]+' '))return;
    const t=empTot(e.id);
    if(dir==='in'){if(!(t.aberto>0)||cents(valor)>cents(t.aberto)+1)return;
      const q=S.tx.filter(x=>x.emp===e.id&&x.empDir==='out'&&efetivo(x)).map(x=>x.data).sort()[0]||'';if(q&&data&&data<q)return;}
    const sc=tk.filter(w=>d.includes(' '+w+' ')).length*1000+(dir==='in'?Math.min(999,Math.round(t.aberto)):0);
    if(!best||sc>best.sc)best={e,sc};});
  return best?best.e:null;
}
/* v10.80: receita prevista (manual) que corresponde a uma entrada do extrato: mesmo valor, conta igual (ou sem conta), até 3 dias da data de recebimento */
function prevReceitaIgual(l,d,usados){
  const id=d.slice(2),v=cents(l.valor);
  const L=S.tx.filter(t=>t.tipo==='receita'&&t.status==='previsto'&&!t.pluggyId&&!t.impId&&!t.emp&&!usados.has(t.id)&&(t.conta===id||!t.conta)&&cents(t.valor)===v&&t.data&&difDias(t.data,l.data)<=3);
  return L.sort((a,b)=>difDias(a.data,l.data)-difDias(b.data,l.data)||(a.conta===id?-1:1))[0]||null;
}
/* lançamento manual de empréstimo que corresponde a uma linha do extrato (mesma conta, valor, até 3 dias) */
function empManualIgual(l,d,usados){
  const sai=l.valor<0,v=cents(Math.abs(l.valor));
  const L=S.tx.filter(t=>t.emp&&!t.pluggyId&&!t.empAnt&&!usados.has(t.id)&&efetivo(t)&&cents(t.valor)===v&&(sai?t.empDir==='out'&&t.de===d:t.empDir==='in'&&t.para===d)&&t.data&&difDias(t.data,l.data)<=3);
  return L.sort((a,b)=>difDias(a.data,l.data)-difDias(b.data,l.data))[0]||null;
}
/* ---------- v10.58: conciliação de transferências ----------
   saída numa conta sua + entrada noutra conta sua, mesmo valor, até 2 dias de diferença = provável transferência.
   juntar transforma o par num só lançamento tipo transf (não conta como receita nem despesa). */
function ladoConc(t){
  if(t.emp||t.meta)return null;
  if(t.faturaKey||t.cartao||!efetivo(t)||!t.data)return null;
  if(t.tipo==='despesa'&&t.conta)return {s:'out',b:t.conta};
  if(t.tipo==='receita'&&t.conta)return {s:'in',b:t.conta};
  if(t.tipo==='transf'&&t.de&&!t.para&&t.de.indexOf('b:')===0)return {s:'out',b:t.de.slice(2)};
  if(t.tipo==='transf'&&t.para&&!t.de&&t.para.indexOf('b:')===0)return {s:'in',b:t.para.slice(2)};
  return null;
}
function paresConc(){
  const ign=new Set(S.cfg.concIgn||[]),dd=(a,b)=>Math.abs((new Date(a+'T12:00')-new Date(b+'T12:00'))/864e5);
  const outs=[],ins={};
  S.tx.forEach(t=>{const l=ladoConc(t);if(!l)return;const v=cents(t.valor);if(!v)return;
    if(l.s==='out')outs.push({t,b:l.b,v});else (ins[v]=ins[v]||[]).push({t,b:l.b});});
  const usados=new Set(),pares=[];
  outs.sort((a,b)=>a.t.data<b.t.data?1:-1).forEach(o=>{
    const c=(ins[o.v]||[]).filter(i=>!usados.has(i.t.id)&&i.b!==o.b&&dd(i.t.data,o.t.data)<=2&&!ign.has(o.t.id+'|'+i.t.id));
    if(!c.length)return;
    c.sort((x,y)=>dd(x.t.data,o.t.data)-dd(y.t.data,o.t.data));
    const i=c[0];usados.add(i.t.id);pares.push({o:o.t,i:i.t,de:o.b,para:i.b});
  });
  return pares.filter(p=>!usados.has(p.o.id));
}
let CONC_C=null;
function concCache(){const k=S.tx.length+'|'+(S.cfg.concIgn||[]).length+'|'+S.tx.reduce((a,t)=>a+(t.tipo==='transf'?1:0),0);if(!CONC_C||CONC_C.k!==k)CONC_C={k,p:paresConc()};return CONC_C.p;}
function juntaPar(p){
  const o=S.tx.find(x=>x.id===p.o.id),i=S.tx.find(x=>x.id===p.i.id);if(!o||!i)return false;
  Object.assign(o,{tipo:'transf',de:'b:'+p.de,para:'b:'+p.para,categoria:'Transferência',conta:'',forma:'',cartao:''});
  delete o.rev;o.par={id:i.id,pluggyId:i.pluggyId||'',desc:i.descricao||'',data:i.data};
  if(i.pluggyId)S.cfg.pluggyIgn=(S.cfg.pluggyIgn||[]).concat(i.pluggyId).slice(-3000);
  if(i.anexos&&i.anexos.length)o.anexos=(o.anexos||[]).concat(i.anexos);
  S.tx=S.tx.filter(x=>x!==i);return true;
}
function concHTML(){const n=concCache().length;if(!n)return '';
  return `<button type="button" class="card revCard concCard" data-act="conc-abre"><span class="revIc">${I('swap')}</span><span class="revTx"><b>${n} transferência${n>1?'s':''} entre suas contas</b><small>junte para não contar como receita e despesa</small></span>${I('chevR')}</button>`;}
function abreConc(){
  const P=concCache(),box=$('#modal');
  if(!P.length){closeModal();return;}
  const nb=id=>{const b=S.bancos.find(x=>x.id===id);return b?esc(b.nome):'conta';};
  box.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="Transferências"><div class="sh-head"><h3>Transferências entre contas</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <p class="small">Saiu de uma conta sua e entrou noutra, mesmo valor. Juntando, vira uma transferência e deixa de contar como gasto e como receita.</p>
    <div class="lista">${P.slice(0,100).map((p,k)=>`<div class="tx concRow"><span class="ic transf">${I('swap')}</span>
      <div class="txt"><b>${nb(p.de)} → ${nb(p.para)}</b><small>${fmtDataCurta(p.o.data)}${p.i.data!==p.o.data?' e '+fmtDataCurta(p.i.data):''} · ${esc(String(p.o.descricao||'').slice(0,40))}</small></div>
      <div class="revR"><div class="val">${brl(p.o.valor)}</div><div class="revBt"><button class="btn2 sm" data-act="conc-nao" data-id="${k}">não é</button><button class="btn2 sm revOk" data-act="conc-sim" data-id="${k}">juntar</button></div></div></div>`).join('')}</div>
    ${P.length>1?`<button class="btn full" data-act="conc-todos">juntar ${P.length>100?'as 100 primeiras':'todas as '+P.length}</button>`:''}
  </div>`;
  box.classList.add('on');
}

/* ---------- v10.60: resumo do mês ----------
   aparece na tela inicial do dia 1 ao 10 com o mês que fechou (some ao tocar em "ok"); sempre disponível no Relatório. */
function dadosResumo(ym){
  const ant=mesAdd(ym,-1),r=resumoMes(ym),ra=resumoMes(ant);
  const cats=despesasPorCat(ym),catsA={};despesasPorCat(ant).forEach(c=>catsA[c.l]=c.v);
  const top=cats.slice(0,4).map(c=>({l:c.l,v:c.v,a:catsA[c.l]||0,color:c.color}));
  let maior=null;S.tx.forEach(t=>{if(efetivo(t)&&t.tipo==='despesa'&&!t.faturaKey&&noPer(t.data,ym)&&(!maior||cents(t.valor)>cents(maior.valor)))maior=t;});
  const lim=limOrc(ym)||{},mp={};cats.forEach(c=>mp[c.l]=c.v);
  const estouros=Object.keys(lim).filter(k=>lim[k]>0&&(mp[k]||0)>lim[k]).map(k=>({l:k,v:mp[k],lim:lim[k]})).sort((a,b)=>(b.v-b.lim)-(a.v-a.lim));
  const subiu=cats.map(c=>({l:c.l,d:c.v-(catsA[c.l]||0)})).filter(x=>x.d>0).sort((a,b)=>b.d-a.d)[0]||null;
  const taxa=r.rec>0?Math.round(r.sal/r.rec*100):null;
  return {ym,ant,r,ra,top,maior,estouros,subiu,taxa,tem:!!(r.rec||r.des)};
}
function nomeMesL(ym){return MESES_LONGO[+ym.slice(5,7)-1]+(ym.slice(0,4)!==String(new Date().getFullYear())?' de '+ym.slice(0,4):'');}
function resumoCardHTML(duo){
  const h=new Date();if(h.getDate()>10)return '';
  const ym=mesOff(1);if((S.cfg.resumoVisto||'')>=ym)return '';
  const D=dadosResumo(ym);if(!D.tem)return '';
  // v10.120: no par lado a lado, mesma estrutura do card de empréstimos (título curto, valor grande, detalhe)
  // v10.121: com 0 ou 1 receita lançada no mês, a % da renda engana; avisa em vez de mostrar a porcentagem
  const nRec=S.tx.filter(t=>efetivo(t)&&t.tipo==='receita'&&noPer(t.data,ym)).length,pouca=nRec<=1;
  const det=pouca?'poucas receitas lançadas':(D.taxa!=null&&D.r.sal>0?D.taxa+'% da renda':'');
  if(duo)return `<button type="button" class="card revCard resCard" data-act="res-abre" data-id="${ym}" aria-label="seu resumo de ${MESES_LONGO[+ym.slice(5,7)-1]}"><span class="revIc">${I('report')}</span><span class="revTx"><b>${(m=>m[0].toUpperCase()+m.slice(1))(MESES_LONGO[+ym.slice(5,7)-1])}</b><span class="empVal${D.r.sal<0?' neg':''}">${brl(Math.abs(D.r.sal))}</span><small>${D.r.sal>=0?'sobrou':'faltou'}${det?' · '+det:''}</small></span>${I('chevR')}</button>`;
  return `<button type="button" class="card revCard resCard" data-act="res-abre" data-id="${ym}"><span class="revIc">${I('report')}</span><span class="revTx"><b>Seu resumo de ${MESES_LONGO[+ym.slice(5,7)-1]}</b><small>${D.r.sal>=0?'sobrou '+brl(D.r.sal):'faltou '+brl(-D.r.sal)}${det?' · '+det:''}</small></span>${I('chevR')}</button>`;
}
function abreResumo(ym){
  ym=ym||mesOff(1);const D=dadosResumo(ym),box=$('#modal');
  const dif=(v,a,inv)=>{if(!a)return '';const p=Math.round((v-a)/a*100);if(!p)return '<em class="rsD">igual</em>';const bom=inv?p<0:p>0;return `<em class="rsD ${bom?'pos':'neg'}">${p>0?'+':''}${p}%</em>`;};
  const mx=Math.max(1,...D.top.map(c=>c.v));
  const frases=[];
  if(D.r.sal>0&&D.ra.sal>0&&D.r.sal>D.ra.sal)frases.push(`Você guardou ${brl(D.r.sal-D.ra.sal)} a mais que em ${MESES_LONGO[+D.ant.slice(5,7)-1]}.`);
  else if(D.r.sal<0)frases.push(`As despesas passaram a renda em ${brl(-D.r.sal)}.`);
  else if(D.r.sal>0&&D.ra.sal>D.r.sal)frases.push(`Sobrou ${brl(D.ra.sal-D.r.sal)} a menos que em ${MESES_LONGO[+D.ant.slice(5,7)-1]}.`);
  if(D.subiu&&D.subiu.d>=50)frases.push(`${esc(D.subiu.l)} foi o que mais subiu: ${brl(D.subiu.d)} a mais.`);
  if(D.estouros.length)frases.push(`${D.estouros.length===1?'Um orçamento passou':D.estouros.length+' orçamentos passaram'} do limite: ${D.estouros.slice(0,3).map(e=>esc(e.l)).join(', ')}.`);
  else if(Object.keys(limOrc(ym)||{}).length)frases.push('Todos os orçamentos ficaram dentro do limite.');
  box.innerHTML=`<div class="sheet resSheet" role="dialog" aria-modal="true" aria-label="Resumo do mês"><div class="sh-head"><h3>Resumo de ${nomeMesL(ym)}</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <div class="rsHero ${D.r.sal<0?'neg':''}"><small>${D.r.sal>=0?'sobrou':'faltou'}</small><b>${brl(Math.abs(D.r.sal))}</b>${D.taxa!=null&&D.r.sal>0?`<span>${D.taxa}% do que entrou</span>`:''}</div>
    <div class="grid2 rsG"><div class="card mini"><small>ENTROU</small><b class="pos">${brl(D.r.rec)}</b>${dif(D.r.rec,D.ra.rec)}</div><div class="card mini"><small>SAIU</small><b class="neg">${brl(D.r.des)}</b>${dif(D.r.des,D.ra.des,true)}</div></div>
    ${frases.length?`<div class="rsFr">${frases.map(f=>`<p>${f}</p>`).join('')}</div>`:''}
    ${D.top.length?`<h4 class="rsH">onde mais gastou</h4>${D.top.map(c=>`<div class="rsCat"><div class="rsCt"><span><i class="dot" style="background:${c.color}"></i>${esc(c.l)}</span><b>${brl(c.v)}</b>${dif(c.v,c.a,true)}</div><div class="bar"><i style="width:${(c.v/mx*100).toFixed(1)}%;background:${c.color}"></i></div></div>`).join('')}`:''}
    ${D.maior?`<h4 class="rsH">maior gasto</h4><div class="tx"><span class="ic despesa" style="color:${corCat(D.maior.categoria)}">${I(catIcon(D.maior.categoria))}</span><div class="txt"><b>${esc(D.maior.descricao||D.maior.categoria)}</b><small>${fmtDataCurta(D.maior.data)} · ${esc(D.maior.categoria)}</small></div><div class="val neg">− ${brl(D.maior.valor)}</div></div>`:''}
    <p class="small" style="margin-top:12px">comparado com ${nomeMesL(D.ant)}. compras no cartão contam no mês em que a fatura é paga.</p>
    <div class="row" style="gap:8px;margin-top:10px"><button class="btn2" data-act="res-m" data-id="${mesAdd(ym,-1)}">‹ ${MESES_LONGO[+mesAdd(ym,-1).slice(5,7)-1]}</button>${ym<mesOff(1)?`<button class="btn2" data-act="res-m" data-id="${mesAdd(ym,1)}">${MESES_LONGO[+mesAdd(ym,1).slice(5,7)-1]} ›</button>`:''}<button class="btn" style="margin-left:auto" data-act="res-ok" data-id="${ym}">ok</button></div>
  </div>`;
  box.classList.add('on');
}
function closeModal(){const b=$('#modal');b.classList.remove('on');b.innerHTML='';b.style.zIndex='';if(focoAntes&&document.contains(focoAntes))try{focoAntes.focus();}catch(e){}focoAntes=null;if(RD_RENDER_PEND){RD_RENDER_PEND=false;if(rdNaTela())setTimeout(render,0);}}
/* v10.157: html.modalOn esconde o botão + sem depender de :has (iOS antigo) */
new MutationObserver(()=>{document.documentElement.classList.toggle('modalOn',$('#modal').classList.contains('on'));}).observe(document.getElementById('modal'),{attributes:true,attributeFilter:['class']});
new MutationObserver(()=>{const b=$('#modal'),sh=b.querySelector('.sheet');if(!sh||sh.hasAttribute('role'))return;if(!focoAntes)focoAntes=document.activeElement;sh.setAttribute('role','dialog');sh.setAttribute('aria-modal','true');const h=sh.querySelector('h3');if(h){h.id=h.id||'dlgT';sh.setAttribute('aria-labelledby',h.id);}}).observe(document.getElementById('modal'),{childList:true});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if($('#modal').classList.contains('on')){closeModal();return;}if($('#side').classList.contains('open'))toggleSide(false);}
  if(e.key==='Tab'&&$('#modal').classList.contains('on')){
    const f=[...$('#modal').querySelectorAll('button:not([disabled]),input:not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x=>x.offsetParent!==null);
    if(!f.length)return;const first=f[0],last=f[f.length-1];
    if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}
    else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}
  }
});

/* ---------- ações ---------- */
function nomeLado(k){if(!k)return 'fora do app';const id=k.slice(2);const x=k[0]==='c'?S.cartoes.find(c=>c.id===id):S.bancos.find(b=>b.id===id);return x?(k[0]==='c'?'cartão '+x.nome:x.nome):'(removido)';}
function bancoPadrao(){const A=bancosAtivos();const b=A.find(x=>x.principal&&x.tipo!=='Dinheiro')||A.find(x=>x.tipo!=='Dinheiro')||A[0];return b?b.id:'';}
function novaTransf(id){
  const t=id?S.tx.find(x=>x.id===id&&x.tipo==='transf'):null;
  if(!bancosAtivos().length){toast('Cadastre uma conta em Bancos primeiro.',true);return;}
  const de=[].concat(t&&!t.de?[{v:'',t:'fora do app (investimento)'}]:[],bancosAtivos(t&&t.de&&t.de.slice(2)).map(b=>({v:'b:'+b.id,t:'conta · '+b.nome})),cartoesAtivos(t&&t.de&&t.de[0]==='c'&&t.de.slice(2)).map(c=>({v:'c:'+c.id,t:'cartão · '+c.nome+' (limite convertido em saldo)'})));
  form(t?'Editar transferência':'Nova transferência',[
    {name:'de',label:'De',type:'select',value:t?t.de:'b:'+bancoPadrao(),options:de},
    {name:'para',label:'Para',type:'select',value:t?t.para:'b:'+((bancosAtivos().find(b=>'b:'+b.id!=='b:'+bancoPadrao())||{}).id||bancoPadrao()),options:bancosAtivos(t&&t.para&&t.para.slice(2)).map(b=>({v:'b:'+b.id,t:b.nome}))},
    {name:'valor',label:'Valor (R$)',value:t?num(t.valor):'',required:true,inputmode:'decimal',placeholder:'0,00'},
    {name:'descricao',label:'Descrição',value:t?t.descricao:'',placeholder:'ex: guardar na reserva'},
    {name:'data',label:'Data',type:'date',value:t?t.data:hojeISO(),required:true}
  ],v=>{
    const valor=parseBR(v.valor);
    if(!(valor>0))return 'Informe um valor maior que zero.';
    if(!v.data)return 'Informe a data.';
    if(v.de===v.para)return 'Escolha contas diferentes.';
    if(!v.de&&!(t&&!t.de))return 'Escolha a conta de origem.';
    const obj={tipo:'transf',valor,data:v.data,de:v.de,para:v.para,categoria:'Transferência',descricao:String(v.descricao||'').trim()||(v.de[0]==='c'?'limite convertido em saldo':'transferência'),cartao:v.de[0]==='c'?v.de.slice(2):'',conta:'',forma:''};
    if(t)Object.assign(t,obj);else S.tx.push(Object.assign({id:uid()},obj));
    geraRecorrentes();salvar();render();toast('Transferência salva');
  });
}
/* v10.43: lê foto/print/PDF de comprovante com IA (função ler-comprovante, Gemini) e abre o lançamento preenchido */
function imgParaJpeg(f,max){return new Promise((ok,er)=>{const u=URL.createObjectURL(f),im=new Image();im.onload=()=>{const k=Math.min(1,max/Math.max(im.width,im.height));const c=document.createElement('canvas');c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);ok(c.toDataURL('image/jpeg',0.85).split(',')[1]);};im.onerror=()=>{URL.revokeObjectURL(u);er(new Error('img'));};im.src=u;});}
function b64DeArquivo(f){return new Promise((ok,er)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=er;r.readAsDataURL(f);});}
function abreTxIA(o,arq,origem){
  const lista=o.tipo==='receita'?CATS_RECEITA:S.cats;
  let forma=o.forma,cartao='';
  if(forma==='cartao'){const CA=cartoesAtivos(),k=o.cartao&&CA.find(c=>c.nome===o.cartao);if(k)cartao=k.id;else if(CA.length===1)cartao=CA[0].id;else if(!CA.length)forma='pix';}
  if(o.tipo==='receita'&&forma!=='pix'&&forma!=='dinheiro')forma='pix';
  novoTx(null,o.tipo,{ia:o.confianca??0.5,tipo:o.tipo,valor:o.valor,data:o.data,descricao:o.descricao,categoria:lista.includes(o.categoria)?o.categoria:lista[lista.length-1],forma,cartao,conta:bancoPadrao(),status:'pago',parcSel:forma==='cartao'?o.parcelas:1,anexos:[],arq:arq||null,origem:origem==='recibo'?'recibo':'ia'});
}
/* v10.54: o limite de leituras é contado só no servidor (função ler-comprovante, de forma atômica); o app não conta mais */
const LIMITE_LEITURAS=40;
async function usoIA(){return {mes:hojeISO().slice(0,7),n:0};}
async function contaLeitura(){}
/* v10.106: chamadas à IA (ler-comprovante, assistente) tentam de novo quando o serviço está ocupado (429/502/503)
   ou a rede falhou: até 3 vezes, esperando ~1,5 s, 4 s e 8 s (±20% aleatório). nunca repete limite diário ("limite de"),
   erro de plano (402/upgrade), "muitas perguntas" nem 401. aoTentar(n) avisa a tela a cada nova tentativa.
   v10.107: o 503 "não foi possível conferir seu plano agora" é falha passageira do servidor e repete como 429/502;
   só o erro de plano de verdade (402 ou upgrade) não repete. */
let IA_ESP=[1500,4000,8000],IA_FN=null;
const IA_OCUPADA='A IA está ocupada, tentando de novo…';
function iaEspera(i){const b=IA_ESP[Math.min(i,IA_ESP.length-1)];return Math.round(b*(0.8+Math.random()*0.4));}
function iaNaoRepete(status,o,erro){return status===401||status===402||status===403||!!(o&&(o.upgrade||o.limite||o.erro==='LIMITE_PLANO'))||/limite de|muitas perguntas/i.test(String(erro||''));}
async function invokeIA(nome,body,aoTentar){
  for(let i=0;;i++){
    let o=null,status=0,rede=false;
    try{
      const r=await (IA_FN||((n,op)=>sb.functions.invoke(n,op)))(nome,{body});
      const error=r&&r.error;o=r&&r.data;
      if(!error&&o&&typeof o==='object'&&!o.erro)return {o,erro:'',status:200};
      if(error){
        const ctx=error.context;
        if(ctx&&typeof ctx.status==='number'){status=ctx.status;try{const j=await (ctx.clone?ctx.clone():ctx).json();if(j&&typeof j==='object')o=j;}catch(e){}}
        else rede=true; // FunctionsFetchError: sem resposta do servidor
      }else status=200;
    }catch(e){rede=true;}
    const erro=String(o&&o.erro||'');
    if(i>=IA_ESP.length||!(rede||status===429||status===502||status===503)||iaNaoRepete(status,o,erro))return {o,erro,status,rede};
    if(aoTentar)try{aoTentar(i+1);}catch(e){}
    await new Promise(ok=>setTimeout(ok,iaEspera(i)));
  }
}
async function chamaIA(body,aoTentar){
  const r=await invokeIA('ler-comprovante',Object.assign({categorias:[...new Set(S.cats.concat(CATS_RECEITA))],cartoes:S.cartoes.map(c=>c.nome),hoje:hojeISO()},body),aoTentar);
  if(trataLimitePlano(r.o,r.status,body&&body.texto?'ia_frase':'ia_comprovante'))throw erroPaywall(); // v10.161: cota do plano -> aviso do Pro, nunca toast de erro
  if(r.erro||!r.o||r.status!==200)throw new Error(r.erro||(r.rede?'sem conexão com a IA, tente de novo':'não consegui entender'));
  return limpaIA(r.o);
}
/* v10.45: a resposta da IA é tratada como dado não confiável: tipos, faixas e datas conferidos antes de abrir o formulário */
function limpaIA(o){
  o=o&&typeof o==='object'?o:{};
  const tipo=o.tipo==='receita'?'receita':'despesa';
  const valor=enc(typeof o.valor==='number'?o.valor:parseBR(String(o.valor==null?'':o.valor)));
  const data=DATA_OK.test(String(o.data))&&!isNaN(new Date(o.data+'T12:00:00'))?o.data:hojeISO();
  const forma=['dinheiro','pix','boleto','cartao'].includes(o.forma)?o.forma:'pix';
  const conf=Number(o.confianca);
  return {tipo,valor,data,forma,descricao:str(o.descricao,140).trim(),categoria:str(o.categoria,60),cartao:str(o.cartao,60),
    parcelas:Math.max(1,Math.min(24,parseInt(o.parcelas,10)||1)),confianca:isFinite(conf)?Math.max(0,Math.min(1,conf)):undefined};
}
/* lançar por frase: escreve ou dita (microfone do teclado do iPhone, ou reconhecimento de voz do navegador quando existe) */
const SR_API=window.SpeechRecognition||window.webkitSpeechRecognition;
function fraseIA(){
  if(!USER){toast('Entre na sua conta para usar a IA.',true);return;}
  const box=$('#modal');
  box.innerHTML=`<div class="sheet">
    <div class="sh-head"><h3>Falar ou escrever</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <p class="iaDica">Diga do seu jeito: valor, onde, quando e como pagou.</p>
    <div class="iaCampo"><textarea id="iaTxt" rows="3" maxlength="600" placeholder="ex: gastei 45 no iFood ontem no cartão"></textarea></div>
    ${SR_API?`<div class="iaVoz"><div class="iaPill"><span class="pIdle">${I('mic')}Segure para falar</span><span class="pRec"><button type="button" class="rCanc" aria-label="cancelar gravação">${I('trash')}</button><span class="rDot"></span><span class="rTempo">0:00</span><span class="rOnda">${'<i></i>'.repeat(18)}</span><span class="rDesl">${I('chevL')}deslize para cancelar</span></span></div><div class="iaLock" aria-hidden="true">${I('lock')}${I('chevU')}</div><button type="button" class="iaMic" aria-label="segure para falar">${I('mic')}${I('send')}</button></div>`:''}
    <div class="iaEx">${['almoço 32 reais hoje no pix','uber 18,50 ontem no cartão','recebi 1200 do freela sexta','comprei 10 MXRF11 a 10,15'].map(x=>`<button type="button" class="chipEx" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <button type="button" class="btn full" data-act="ia-frase-ok">${I('sparkle')} Preencher lançamento</button>
    <p class="iaDica sm">${SR_API?'':'Para ditar, toque no microfone do teclado. '}A frase é enviada para a IA do Google só para montar o lançamento.</p>
  </div>`;
  box.classList.add('on');
  const ta=$('#iaTxt');if(!(SR_API&&matchMedia('(pointer:coarse)').matches))setTimeout(()=>ta.focus(),60); // no celular abre sem teclado para o microfone ficar à vista
  if(SR_API)ligaMic();
  ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();enviaFraseIA();}});
  box.querySelectorAll('.chipEx').forEach(b=>b.onclick=()=>{ta.value=b.dataset.ex;ta.focus();});
}
/* v10.76: microfone estilo WhatsApp: segure para gravar, solte para enviar, deslize para o lado para cancelar,
   deslize para cima para travar (grava sem segurar). Toque rápido também trava. A fala vira texto ao vivo no campo. */
let REC=null,RS=null;
const REC_MAX=60;
function ligaMic(){
  const btn=document.querySelector('.iaMic');if(!btn)return;
  btn.addEventListener('pointerdown',micDown);
  btn.addEventListener('pointermove',micMove);
  btn.addEventListener('pointerup',micUp);
  btn.addEventListener('pointercancel',()=>{if(RS&&!RS.travado)fimRec(false);});
  btn.addEventListener('contextmenu',e=>e.preventDefault());
  const c=document.querySelector('.iaPill .rCanc');if(c)c.onclick=()=>cancelaRec();
}
function micUI(){
  const campo=document.querySelector('.iaCampo');if(!campo)return;
  campo.classList.toggle('gravando',!!RS);campo.classList.toggle('travado',!!(RS&&RS.travado));
  const voz=document.querySelector('.iaVoz');if(voz){voz.classList.toggle('gravando',!!RS);voz.classList.toggle('travado',!!(RS&&RS.travado));}
  const ta=$('#iaTxt');if(ta)ta.placeholder=RS?'ouvindo…':'ex: gastei 45 no iFood ontem no cartão';
  const btn=document.querySelector('.iaMic');if(btn)btn.setAttribute('aria-label',RS&&RS.travado?'enviar':'segure para falar');
  if(!RS||RS.travado){const d=document.querySelector('.iaPill .rDesl');if(d){d.style.transform='';d.style.opacity='';}
    const l=document.querySelector('.iaLock');if(l)l.style.transform='';const m=document.querySelector('.iaMic');if(m)m.style.transform='';}
}
function ondaRec(){if(!RS)return;const w=document.querySelectorAll('.iaPill .rOnda i');const ativo=Date.now()-(RS.fala||0)<700;
  w.forEach(i=>{const h=ativo?18+Math.random()*82:10+Math.random()*14;i.style.height=h+'%';});}
function tempoRec(){ondaRec();
  const el=document.querySelector('.iaPill .rTempo');if(!RS)return;
  if(!el||!el.isConnected){cancelaRec(true);return;} // folha fechada no meio da gravação
  const s=Math.floor((Date.now()-RS.t0)/1000);el.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
  if(s>=REC_MAX)fimRec(true);
}
function vibra(ms){try{navigator.vibrate&&navigator.vibrate(ms);}catch(e){}}
function micDown(e){
  e.preventDefault();
  if(RS&&RS.travado){fimRec(true);return;} // travado: o botão vira "enviar"
  if(RS)return;
  try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}
  const ta=$('#iaTxt');if(!ta)return;ta.blur();
  RS={x0:e.clientX,y0:e.clientY,t0:Date.now(),base:ta.value.trim(),fin:'',travado:false,fim:false,ouviu:false};
  RS.tm=setInterval(tempoRec,140);tempoRec();
  vibra(12);micUI();iniciaRec();
}
function micMove(e){
  if(!RS||RS.travado||RS.fim)return;
  const dx=Math.min(0,e.clientX-RS.x0),dy=Math.min(0,e.clientY-RS.y0);
  const d=document.querySelector('.iaPill .rDesl'),l=document.querySelector('.iaLock'),m=document.querySelector('.iaMic');
  if(d){d.style.transform=`translateX(${Math.max(dx,-120)}px)`;d.style.opacity=String(Math.max(.15,1+dx/130));}
  if(l)l.style.transform=`translateY(${Math.max(dy,-70)*.5}px)`;
  if(m)m.style.transform=`translate(${Math.max(dx,-120)*.35}px,${Math.max(dy,-70)*.35}px) scale(1.25)`;
  if(dx<-110){cancelaRec();return;}
  if(dy<-75){RS.travado=true;vibra(12);micUI();}
}
function micUp(e){
  if(!RS||RS.fim||RS.travado)return;
  if(Date.now()-RS.t0<400){RS.travado=true;micUI();return;} // toque rápido: grava sem segurar
  fimRec(true);
}
function textoRec(r){const ta=$('#iaTxt');if(!ta||!RS)return;const t=(r||'').trim();ta.value=(RS.base?RS.base+' ':'')+t;ta.scrollTop=ta.scrollHeight;}
function iniciaRec(){
  if(!RS)return;
  let rec;try{rec=new SR_API();}catch(e){cancelaRec(true);toast('Ditado indisponível, use o microfone do teclado.',true);return;}
  REC=rec;rec.lang='pt-BR';rec.interimResults=true;rec.continuous=true;
  const antes=RS.fin;
  rec.onresult=ev=>{if(!RS||REC!==rec)return;let f='',it='';for(const r of ev.results){if(r.isFinal)f+=r[0].transcript;else it+=r[0].transcript;}
    RS.fin=(antes?antes+' ':'')+f;RS.ouviu=true;RS.fala=Date.now();textoRec(RS.fin+(it?' '+it:''));};
  rec.onerror=ev=>{if(REC!==rec)return;if(ev.error==='not-allowed'||ev.error==='service-not-allowed'){cancelaRec(true);toast('Permita o microfone para o GranaViva nos ajustes do iPhone.',true);}};
  rec.onend=()=>{if(REC!==rec)return;REC=null;
    if(RS&&!RS.fim){try{iniciaRec();}catch(e){}return;} // o iPhone para sozinho depois de um silêncio: continua gravando
    if(RS&&RS.fim)concluiRec();};
  try{rec.start();}catch(e){}
}
function fimRec(enviar){
  if(!RS||RS.fim)return;RS.fim=true;RS.enviar=enviar;clearInterval(RS.tm);
  if(REC){try{REC.stop();}catch(e){}RS.esp=setTimeout(concluiRec,1500);}else concluiRec(); // espera o último trecho reconhecido
}
function concluiRec(){
  if(!RS)return;const st=RS;RS=null;clearTimeout(st.esp);clearInterval(st.tm);REC=null;micUI();
  const ta=$('#iaTxt');if(!ta||!ta.isConnected)return;
  if(!st.ouviu||ta.value.trim()===st.base){if(st.enviar)toast('Não ouvi nada. Segure o microfone e fale.',true);return;}
  if(st.enviar&&ta.value.trim().length>=3)enviaFraseIA();
}
function cancelaRec(quieto){
  if(!RS)return;const st=RS;RS=null;clearInterval(st.tm);clearTimeout(st.esp);
  const r=REC;REC=null;if(r){try{r.abort();}catch(e){}}
  const ta=$('#iaTxt');if(ta)ta.value=st.base;
  micUI();if(!quieto){vibra([10,40,10]);const c=document.querySelector('.iaVoz');if(c){c.classList.remove('lixo');void c.offsetWidth;c.classList.add('lixo');}}
}
function micIA(){} // compatibilidade: o microfone agora usa os eventos de segurar (ligaMic)
/* ---------- v10.159: Omnibox de lançamento ----------
   um campo só, no topo da Início (e o mesmo campo de "Falar ou escrever" do +): a frase decide para onde vai.
   "Comprei 10 MXRF11 a 10,15" (verbo comprei/vendi/aportei/investi + ticker da B3 + quantidade + preço) é lido aqui no
   aparelho, sem IA, e abre a compra/venda do ativo em Investimentos já preenchida para conferir antes de salvar.
   qualquer outra frase ("Uber 28 pix") segue o fluxo de sempre: IA (ler-comprovante) e o formulário de despesa/receita
   preenchido para conferir. nada é salvo sem a pessoa tocar em confirmar. */
let OMNI_TXT='';
const OMNI_VERBO=/^\s*(comprei|compra|comprar|comprando|aportei|aporte|aportar|investi|vendi|venda|vender|vendendo)\b\s*/i;
const OMNI_NUM='(\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?)';
function omniData(t){
  const n=norm(t),d=new Date();
  if(/\banteontem\b/.test(n)){d.setDate(d.getDate()-2);return isoDe(d);}
  if(/\bontem\b/.test(n)){d.setDate(d.getDate()-1);return isoDe(d);}
  const m=n.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if(m){let y=m[3]?+m[3]:d.getFullYear();if(y<100)y+=2000;const iso=y+'-'+pad(+m[2])+'-'+pad(+m[1]);
    if(DATA_OK.test(iso)&&!isNaN(new Date(iso+'T12:00:00'))&&new Date(iso+'T12:00:00').getDate()===+m[1]&&iso<=hojeISO())return iso;}
  return hojeISO();
}
/* devolve {tipo:'compra'|'venda',ticker,qtd,preco,total,data} ou null quando a frase não é de investimento */
function omniIntencaoInv(txt){
  const s=String(txt||'').replace(/\s+/g,' ').trim();
  const mv=s.match(OMNI_VERBO);if(!mv)return null;
  /* ticker da B3: 4 letras + final de ações (3 a 8), units/FIIs/ETFs (11) ou BDRs (31 a 35, 39); "F" do fracionário é ignorado */
  const tk=s.match(/(?:^|[\s,.;:(])([A-Za-z]{4}(?:3[1-59]|11|[3-8]))F?(?=$|[\s,.;:)])/);if(!tk)return null;
  const ticker=tk[1].toUpperCase();
  const venda=/^vend/i.test(mv[1]);
  const ti=s.indexOf(tk[1],tk.index);if(ti<mv[0].length)return null;
  let resto=s.slice(mv[0].length,ti)+' # '+s.slice(ti+tk[1].length).replace(/^F(?=$|[\s,.;:)])/,'');
  resto=resto.replace(/\b(anteontem|ontem|hoje)\b/gi,' ').replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,' ');
  let preco=0,qtd=0,total=0;
  /* preço por cota: "a 10,15", "por R$ 10,15", "@10.15", "cada 10,15", "preço 10,15", "pm 10,15" */
  const mp=resto.match(new RegExp('(?:\\ba\\b|\\bpor\\b|@|\\bcada\\b|\\bpre[cç]o(?:\\s+m[eé]dio)?(?:\\s+de)?|\\bpm\\b|\\bcotad[oa]\\s+a)\\s*(?:r\\$\\s*)?'+OMNI_NUM+'(?!\\d)(?![.,]\\d)(?!\\s*(?:cotas?|a[cç][oõ]es|a[cç][aã]o|unidades?))','i'));
  if(mp){preco=parseBR(mp[1]);resto=resto.replace(mp[0],' ');}
  /* valor total: "R$ 1000 em MXRF11", "1000 reais", "total de 101,50" */
  const mt=resto.match(new RegExp('(?:\\btotal(?:\\s+de)?\\s*(?:r\\$\\s*)?'+OMNI_NUM+')|(?:r\\$\\s*'+OMNI_NUM+')|(?:'+OMNI_NUM+'\\s*(?:reais|conto|pila)\\b)','i'));
  /* quantidade: número com "cotas/ações/unidades", senão o primeiro número que sobrar */
  const mq=resto.match(new RegExp(OMNI_NUM+'\\s*(?:cotas?|a[cç][oõ]es|a[cç][aã]o|unidades?|pap[eé]is|x)\\b','i'));
  if(mq){qtd=parseBR(mq[1]);resto=resto.replace(mq[0],' ');}
  const vT=mt?parseBR(mt[1]||mt[2]||mt[3]):0;if(mt)resto=resto.replace(mt[0],' ');
  const nums=(resto.match(new RegExp(OMNI_NUM,'g'))||[]).map(parseBR).filter(v=>v>0);
  if(!qtd&&nums.length){qtd=nums.shift();}
  /* "10 MXRF11 R$ 10,15": com quantidade, o valor em reais é o preço por cota; sem quantidade (ou com "total"), é o total */
  if(vT>0){if(!preco&&qtd>0&&!/total/i.test(mt[0]))preco=vT;else total=vT;}
  if(!preco&&nums.length){preco=nums.shift();}
  /* "aportei 1000 em MXRF11": número solto antes do ticker, com "em", sem preço, é valor e não quantidade */
  if(!preco&&!total&&qtd>0&&/^(aport|invest)/i.test(mv[1])&&/\bem\s*#/i.test(resto.replace(/\d[\d.,]*/g,''))){total=qtd;qtd=0;}
  return {tipo:venda?'venda':'compra',ticker,qtd:qtd>0?qtd:0,preco:preco>0?c2(preco):0,total:total>0?c2(total):0,data:omniData(s)};
}
function omniTipoAtivo(t){const b=B3_LIST.find(x=>x.t===t);return b&&b.tipo&&['fii','acao','etf','bdr'].includes(b.tipo)?b.tipo:rdAdivinha(t);}
/* true quando a frase era de investimento (e já abriu a confirmação ou avisou) */
function omniInv(texto){
  const iv=omniIntencaoInv(texto);if(!iv)return false;
  if(!pode('investimentos')){abrePlanos('investimentos');return true;}
  omniInvConfirma(iv);return true;
}
function omniInvResumo(iv,f,tipo){
  const tot=iv.qtd>0&&iv.preco>0?c2(iv.qtd*iv.preco):0;
  const q=iv.qtd>0?num(iv.qtd).replace(/,00$/,''):'';
  return `<div class="omniPrev">${assetIco(iv.ticker,tipo)}<div><small>${iv.tipo==='venda'?'venda':'compra'} entendida · confira e salve</small><b>${q?q+' ':''}${esc(iv.ticker)}${iv.preco>0?' a '+brl(iv.preco):''}${tot?' = '+brl(tot):''}</b>${f?'':'<em>ativo novo na carteira</em>'}${iv.precoCot?'<em>preço da última cotação</em>':''}</div></div>`;
}
function omniInvConfirma(iv){
  const f=(S.fiis||[]).find(x=>x.ticker===iv.ticker&&!['cripto','rf'].includes(tipoOf(x)));
  if(iv.tipo==='venda'&&!(f&&f.cotas>0)){toast('Não achei '+iv.ticker+' na sua carteira para vender.',true);return;}
  if(!iv.preco&&f&&f.preco>0){iv.preco=c2(f.preco);iv.precoCot=true;}
  if(!iv.qtd&&iv.total>0&&iv.preco>0)iv.qtd=Math.floor(iv.total/iv.preco);
  if(TAB!=='fii')go('fii');if(FMODO==='radar')rdModoSet('carteira');
  const tipo=f?tipoOf(f):omniTipoAtivo(iv.ticker);
  if(f){
    opForm(f.id,iv.tipo,true);
    const mf=$('#mf');if(!mf)return;
    const set=(n,v)=>{const el=mf.querySelector('[name="'+n+'"]');if(el&&v)el.value=v;};
    if(iv.qtd>0)set('qtd',num(iv.qtd).replace(/,00$/,''));if(iv.preco>0)set('preco',num(iv.preco));set('data',iv.data);
    mf.insertAdjacentHTML('afterbegin',omniInvResumo(iv,f,tipo));
    const bt=mf.querySelector('button[type="submit"]');if(bt)bt.textContent=iv.tipo==='venda'?'Confirmar venda':'Confirmar compra';
    return;
  }
  /* ativo que ainda não está na carteira: cria o ativo com a compra no histórico (preço médio e cotas vêm das operações) */
  if(!cabeNoPlano('carteira',(S.fiis||[]).length))return; // v10.161
  const b=B3_LIST.find(x=>x.t===iv.ticker);
  form('Compra · '+iv.ticker,[
    {type:'html',html:omniInvResumo(iv,null,tipo)},
    {name:'tipo',label:'Tipo de ativo',type:'select',value:tipo,options:TIPOS.filter(x=>['fii','acao','etf','bdr'].includes(x.k)).map(x=>({v:x.k,t:x.l}))},
    {name:'qtd',label:'Cotas',value:iv.qtd>0?num(iv.qtd).replace(/,00$/,''):'',required:true,inputmode:'decimal',placeholder:'0'},
    {name:'preco',label:'Preço por cota (R$)',value:iv.preco>0?num(iv.preco):'',required:true,inputmode:'decimal',placeholder:'0,00'},
    {name:'taxas',label:'Taxas e corretagem (R$)',inputmode:'decimal',placeholder:'0,00'},
    {name:'data',label:'Data',type:'date',value:iv.data,required:true},
    contaCampo('compra')
  ],v=>{
    if(!DATA_OK.test(String(v.data)))return 'Informe a data.';
    if(v.data>hojeISO())return 'A data não pode ser no futuro.';
    const tp=['fii','acao','etf','bdr'].includes(v.tipo)?v.tipo:tipo;
    const op={id:uid(),tipo:'compra',data:v.data,qtd:parseBR(v.qtd),preco:parseBR(v.preco),taxas:c2(parseBR(v.taxas)||0),valor:0,custo:0};
    if(!(op.qtd>0))return 'Informe a quantidade.';
    if(tp!=='etf'&&Math.round(op.qtd)!==op.qtd)return 'Cotas devem ser um número inteiro.';
    if(!(op.preco>0))return 'Informe o preço.';
    if(op.taxas<0)return 'Taxas não podem ser negativas.';
    if(v.conta&&S.bancos.some(x=>x.id===v.conta))op.conta=v.conta;
    if((S.fiis||[]).some(x=>x.ticker===iv.ticker&&!['cripto','rf'].includes(tipoOf(x))))return iv.ticker+' já está na carteira. Feche e lance de novo.';
    const nf={id:uid(),tipo:tp,ticker:iv.ticker,nome:b?b.n:'',cotas:0,preco:op.preco,dpc:0,diaPag:0,pago:0,cotEm:'',cotFonte:'manual',ops:[op]};
    aplicaOps(nf);
    if(!S.fiis)S.fiis=[];S.fiis.push(nf);
    salvar();render();toast('Compra de '+iv.ticker+' registrada');
    localStorage.removeItem('gv-cot-ts');setTimeout(()=>atualizaCotacoes(true),50);
  });
  const mf=$('#mf');if(mf){const bt=mf.querySelector('button[type="submit"]');if(bt)bt.textContent='Confirmar compra';}
}
function omniHTML(){
  if(MVP_MODE)return smartBarHTML();
  return `<form class="omni" id="omniF" role="search" aria-label="lançar numa frase" autocomplete="off" novalidate>
    <span class="omniIc" aria-hidden="true">${I('sparkle')}</span>
    <input id="omniTxt" type="text" enterkeyhint="send" maxlength="600" value="${esc(OMNI_TXT)}" placeholder="Uber 28 pix · Comprei 10 MXRF11 a 10,15" aria-label="o que você gastou, recebeu ou investiu">
    <button type="submit" class="omniGo" aria-label="lançar">${I('arrowUp')}</button>
  </form>`;
}
async function omniEnvia(){
  const inp=$('#omniTxt'),fm=$('#omniF');if(!inp||(fm&&fm.classList.contains('busy')))return;
  const texto=inp.value.trim();
  if(texto.length<3){toast('Escreva o que você gastou, recebeu ou investiu.',true);inp.focus();return;}
  if(omniInv(texto)){OMNI_TXT='';const i2=$('#omniTxt');if(i2)i2.value='';return;}
  if(!USER){toast('Entre na sua conta para lançar despesas por frase.',true);return;}
  if(!pode('leitura_ia')){abrePlanos('leitura_ia');return;}
  if(fm){fm.classList.add('busy');inp.readOnly=true;}
  try{
    const o=await chamaIA({texto},()=>toast(IA_OCUPADA));
    if(!(o.valor>0)){toast('Não achei um valor, diga quanto foi.',true);return;}
    OMNI_TXT='';const i2=$('#omniTxt');if(i2)i2.value='';
    abreTxIA(o);
  }catch(e){toastErroIA(e,'não consegui entender');}
  finally{const f2=$('#omniF'),i3=$('#omniTxt');if(f2)f2.classList.remove('busy');if(i3)i3.readOnly=false;}
}
document.addEventListener('submit',e=>{if(e.target&&e.target.id==='omniF'){e.preventDefault();omniEnvia();}});
document.addEventListener('input',e=>{if(e.target&&e.target.id==='omniTxt')OMNI_TXT=e.target.value;});
async function enviaFraseIA(){
  const ta=$('#iaTxt'),btn=document.querySelector('[data-act="ia-frase-ok"]');if(!ta)return;
  const texto=ta.value.trim();
  if(texto.length<3){toast('Escreva o que você gastou ou recebeu.',true);ta.focus();return;}
  if(omniIntencaoInv(texto)){if(RS)cancelaRec(true);omniInv(texto);return;} // v10.159: compra/venda de ativo vai para Investimentos (sem IA)
  if(RS){const st=RS;RS=null;clearInterval(st.tm);clearTimeout(st.esp);const r=REC;REC=null;if(r){try{r.abort();}catch(e){}}micUI();} // mantém o que já foi transcrito
  if(btn){btn.disabled=true;btn.innerHTML=I('sparkle')+' Entendendo…';}
  try{
    const o=await chamaIA({texto},()=>{if(btn&&btn.isConnected)btn.innerHTML=I('sparkle')+' '+esc(IA_OCUPADA);});
    if(!(o.valor>0)){toast('Não achei um valor, diga quanto foi.',true);return;}
    abreTxIA(o);
  }catch(e){toastErroIA(e,'não consegui entender');}
  finally{if(btn&&btn.isConnected){btn.disabled=false;btn.innerHTML=I('sparkle')+' Preencher lançamento';}}
}
function lerComprovanteIA(){
  if(!USER){toast('Entre na sua conta para usar a IA.',true);return;}
  const inp=document.createElement('input');inp.type='file';inp.accept='image/*,application/pdf';
  inp.onchange=async()=>{
    const f=inp.files&&inp.files[0];if(!f)return;
    const pdf=f.type==='application/pdf';
    if(pdf&&f.size>4.5e6){toast('PDF grande demais (máx. 4,5 MB).',true);return;}
    const btn=document.querySelector('.iaBtn[data-act="ia-ler"]');if(!btn)toast('Lendo o comprovante…');if(btn){btn.disabled=true;btn.innerHTML=I('receipt')+'Lendo…';}
    const solta=()=>{if(btn&&btn.isConnected){btn.disabled=false;btn.innerHTML=I('receipt')+'Ler comprovante';}};
    try{
      const uso=await usoIA();
      if(uso.n>=LIMITE_LEITURAS){toast('Você chegou ao limite de '+LIMITE_LEITURAS+' leituras de comprovante neste mês. Lançar por frase continua liberado.',true);return;}
      let imagem,mime;
      if(pdf){imagem=await b64DeArquivo(f);mime='application/pdf';}
      else{try{imagem=await imgParaJpeg(f,1600);mime='image/jpeg';}catch(e){imagem=await b64DeArquivo(f);mime=f.type||'image/jpeg';}}
      const o=await chamaIA({imagem,mime},()=>{if(btn&&btn.isConnected)btn.innerHTML=I('receipt')+'Tentando de novo…';toast(IA_OCUPADA);});
      if(!(o.valor>0)){toast('Não achei um valor nessa imagem.',true);return;}
      await contaLeitura(uso);
      abreTxIA(o,ANX_TIPOS.includes(f.type)||pdf?f:null,'recibo'); // a foto/PDF vira comprovante do lançamento quando ele for salvo
    }catch(e){toastErroIA(e,'não consegui ler o comprovante');}
    finally{solta();}
  };
  inp.click();
}
function novoTx(id,tipoPre,base){
  const t=id?S.tx.find(x=>x.id===id):null;
  const P=t||base||null; // base: cópia de outro lançamento (duplicar)
  let SP=null; // v10.81: partes da divisão entre categorias (null = categoria única)
  form(t?'Editar lançamento':base?(base.ia?'Confira o lançamento':'Duplicar lançamento'):'Novo lançamento',[
    {name:'tipo',label:'Tipo',type:'select',value:P?P.tipo:(tipoPre||'despesa'),options:[{v:'despesa',t:'Despesa'},{v:'receita',t:'Receita'}]},
    {name:'valor',label:'Valor (R$), total da compra se parcelada',value:P?num(P.valor):'',required:true,inputmode:'decimal',placeholder:'0,00'},
    {name:'categoria',label:'Categoria',type:'select',value:P?P.categoria:S.cats[0],options:S.cats.map(c=>({v:c,t:c}))},
    {name:'forma',label:'Forma de pagamento',type:'select',value:P?(P.forma||(P.cartao?'cartao':'dinheiro')):((tipoPre||'despesa')==='receita'?'dinheiro':((S.cfg&&S.cfg.ultLanc||{}).forma||'pix')),options:[{v:'dinheiro',t:'dinheiro'},{v:'pix',t:'pix'},{v:'boleto',t:'boleto'},{v:'cartao',t:'cartão'}]},
    {name:'pagoCom',label:'Boleto pago com',type:'select',value:P?(P.pagoCom||(P.cartao?'cartao':(P.conta&&P.forma==='boleto'?'conta':'dinheiro'))):'dinheiro',options:[{v:'dinheiro',t:'dinheiro físico'},{v:'cartao',t:'cartão'},{v:'conta',t:'conta bancária'}]},
    {name:'cartao',label:'Qual cartão',type:'select',value:P&&P.cartao?P.cartao:(!P&&cartoesAtivos().some(c=>c.id===(S.cfg&&S.cfg.ultLanc||{}).cartao)?(S.cfg&&S.cfg.ultLanc||{}).cartao:''),options:[{v:'',t:cartoesAtivos().length?'escolha o cartão':'nenhum cartão cadastrado'}].concat(cartoesAtivos(P&&P.cartao).map(c=>({v:c.id,t:c.nome+(c.banco?' · '+c.banco:'')})))},
    {name:'conta',label:'Conta bancária',type:'select',value:P&&P.conta?P.conta:(!P&&S.bancos.some(b=>b.id===(S.cfg&&S.cfg.ultLanc||{}).conta)?(S.cfg&&S.cfg.ultLanc||{}).conta:((S.bancos.find(b=>b.principal)||{}).id||'')),options:[{v:'',t:S.bancos.length?'escolha a conta':'nenhuma conta cadastrada'}].concat(bancosAtivos(P&&P.conta).map(b=>({v:b.id,t:b.nome+(b.tipo?' · '+b.tipo:'')})))},
    {name:'parcelas',label:'Parcelas',type:'select',value:String(!t&&P&&P.parcSel||1),options:Array.from({length:24},(_,i)=>({v:i+1,t:i===0?'à vista':(i+1)+'x'}))},
    {name:'descricao',label:'Descrição',value:P?String(P.descricao||'').replace(/ \(\d+\/\d+\)$/,''):'',placeholder:'ex: mercado do mês'},
    {name:'sub',label:'Subcategoria (opcional)',value:P?(P.sub||''):'',placeholder:'ex: mercado, farmácia',list:subsDe(),maxlength:60},
    {name:'tags',label:'Tags (opcional, separe por vírgula)',value:P?(P.tags||[]).join(', '):'',placeholder:'ex: viagem, trabalho',list:todasTags(),maxlength:200},
    {name:'trab',label:'Dia trabalhado (opcional)',type:'date',value:P&&P.trab&&P.tipo==='receita'?P.trab:''},
    {name:'data',label:'Data',type:'date',value:P?P.data:hojeISO(),required:true},
    {name:'status',label:'Situação',type:'select',value:P?(P.status||'pago'):'pago',options:[{v:'pago',t:'pago / recebido'},{v:'previsto',t:'previsto (ainda vai acontecer)'}].concat(t?[{v:'cancelado',t:'cancelado (não conta em nada)'}]:[])},
    {name:'obs',label:'Observação (opcional)',type:'textarea',value:P?(P.obs||''):'',placeholder:'detalhes, número do pedido…',maxlength:300},
    ...(t&&(t.multa||t.juros||t.desconto)?[ // v10.129: escondido por enquanto; só aparece ao editar um lançamento que já tem multa, juros ou desconto
    {name:'multa',label:'Multa incluída no valor (R$, opcional)',value:t&&t.multa?num(t.multa):'',inputmode:'decimal',placeholder:'0,00'},
    {name:'juros',label:'Juros incluídos no valor (R$, opcional)',value:t&&t.juros?num(t.juros):'',inputmode:'decimal',placeholder:'0,00'},
    {name:'desconto',label:'Desconto obtido (R$, opcional)',value:t&&t.desconto?num(t.desconto):'',inputmode:'decimal',placeholder:'0,00'}]:[]),
  ].concat(t?[]:[{name:'fixa',label:'repete todo mês (vira conta fixa)',type:'checkbox',value:false}]),v=>{
    const valor=parseBR(v.valor);
    if(!String(v.valor).trim())return 'Informe o valor';
    if(!(valor>0))return 'Informe um valor maior que zero.';
    const trabOk=v.tipo==='receita'&&v.trab?(DATA_OK.test(v.trab)&&dataOk(...v.trab.split('-'))?v.trab:null):'';
    if(trabOk===null)return 'Dia trabalhado inválido.';
    if(!v.data)return trabOk?'Informe quando o dinheiro vai cair (Recebo em).':'Informe a data.';
    if(trabOk&&v.data<trabOk)return 'O dia em que recebe não pode ser antes do dia trabalhado.';
    if(!t&&(parseInt(v.parcelas,10)||1)>1&&cents(valor)<(parseInt(v.parcelas,10)||1))return 'Valor pequeno demais para essas parcelas.';
    if(v.fixa&&!t&&(parseInt(v.parcelas,10)||1)>1)return 'Compra parcelada não repete todo mês.';
    /* v10.81: divisão entre categorias (só despesa). confere antes de qualquer gravação */
    let spL=null;
    if(SP&&v.tipo==='despesa'){const r=confereSplit(SP,valor);if(typeof r==='string')return r;spL=r;v.categoria=maiorParte(spL);}
    if(!spL){ /* aprende: a pessoa trocou a categoria sugerida, então lembra para a próxima */
      const d0=String(v.descricao||'').trim(),k=d0&&chaveRegra(d0);
      if(k&&k.length>=3&&(v.tipo==='despesa'||v.tipo==='receita')){const sg=sugestaoCat(d0,v.tipo);if(!sg||sg.c!==v.categoria){if(!S.cfg.regras)S.cfg.regras={};S.cfg.regras[v.tipo[0]+':'+k]=v.categoria;}
        /* e aplica nos outros lançamentos iguais, para não precisar corrigir um por um */
        let nI=0;if(t&&t.categoria!==v.categoria)S.tx.forEach(x=>{if(x===t||x.faturaKey||x.tipo!==v.tipo||x.categoria===v.categoria||!x.descricao)return;if(chaveRegra(x.descricao)===k){x.categoria=v.categoria;x.sub='';nI++;}});
        if(nI)setTimeout(()=>toast('Aprendi: mais '+nI+' lançamento'+(nI>1?'s':'')+' de '+d0.split('|').pop().trim().slice(0,30)+' foram para '+v.categoria),900);}
    }
    const isDesp=v.tipo==='despesa';
    const forma=v.forma||(isDesp?'pix':'dinheiro');
    const bol=isDesp&&forma==='boleto';
    const pagoCom=bol?(v.pagoCom||'dinheiro'):'';
    if(bol&&pagoCom==='cartao'&&!v.cartao)return 'Escolha o cartão que pagou o boleto.';
    if(bol&&pagoCom==='conta'&&!v.conta)return 'Escolha a conta que pagou o boleto.';
    const usaCartao=(isDesp&&forma==='cartao')||(bol&&pagoCom==='cartao');
    const usaConta=(forma==='pix')||(bol&&pagoCom==='conta');
    const vM=isDesp?enc(parseBR(v.multa||'')):0,vJ=isDesp?enc(parseBR(v.juros||'')):0,vD=isDesp?enc(parseBR(v.desconto||'')):0;
    if(cents(vM)+cents(vJ)>cents(valor))return 'Multa + juros não podem passar do valor pago.';
    if((vM||vJ||vD)&&!t&&(parseInt(v.parcelas,10)||1)>1)return 'Juros e multa só em lançamento à vista.';
    const obj={multa:vM,juros:vJ,desconto:vD,tipo:v.tipo,valor,categoria:v.categoria,descricao:String(v.descricao).trim(),sub:String(v.sub||'').trim().slice(0,60),tags:limpaTags(v.tags),obs:String(v.obs||'').trim().slice(0,300),data:v.data,cartao:usaCartao?(v.cartao||''):'',forma,conta:usaConta?(v.conta||''):'',pagoCom};
    // compra no cartão é reconhecida na fatura: não fica "prevista" (só pode ser cancelada, ex. estorno)
    let st=['pago','previsto','cancelado'].includes(v.status)?v.status:'pago';
    if(usaCartao&&st==='previsto')st='pago';
    obj.status=st;obj.fxAuto=undefined;
    if(!t)obj.origem=base&&base.ia?(base.origem==='recibo'?'recibo':'ia'):'manual'; // v10.160: origem do lançamento (selo no extrato)
    const np=Math.max(1,Math.min(24,parseInt(v.parcelas,10)||1));
    if(spL&&v.fixa&&!t)return 'Conta fixa não pode ser dividida entre categorias. Desmarque "repete todo mês" ou não divida.';
    let novoId='';
    if(t){
      if(t.parcelas>1)obj.descricao=(obj.descricao||t.categoria)+' ('+t.parcela+'/'+t.parcelas+')';
      Object.assign(t,obj);
      if(trabOk)t.trab=trabOk;else delete t.trab;
      if(spL)t.split=spL;else delete t.split;
    }else if(np>1&&usaCartao&&obj.cartao){
      /* parcelado: n lançamentos, um por fatura a partir da data da compra; centavos que sobram ficam na 1ª parcela */
      const tot=cents(valor),base=Math.floor(tot/np),sobra=tot-base*np,grupo=uid();
      if(spL&&[base+sobra,base].some(c=>!rateiaSplit(spL,c)))return 'Valor pequeno demais para dividir em '+np+' parcelas com essas categorias.';
      const cc=S.cartoes.find(c=>c.id===obj.cartao);
      for(let k=0;k<np;k++){
        const dt=cc?dataParcela(cc,v.data,k):addMeses(v.data,k);
        if(!k)novoId=grupo+'-1';
        const vc=base+(k===0?sobra:0),sp=spL?rateiaSplit(spL,vc):null; // v10.81: cada parcela dividida na mesma proporção, centavos exatos
        S.tx.push(Object.assign({},obj,{id:grupo+'-'+(k+1),valor:vc/100,data:dt,descricao:(obj.descricao||obj.categoria)+' ('+(k+1)+'/'+np+')',grupo,parcela:k+1,parcelas:np},sp?{split:sp,categoria:maiorParte(sp)}:{}));
      }
    }else{novoId=uid();S.tx.push(Object.assign({id:novoId},obj,trabOk?{trab:trabOk}:{},spL?{split:spL}:{}));}
    if(v.fixa&&!t){
      /* v10.51: a fixa nasce só depois de tudo validado e guarda como foi paga (cartão entra na fatura, pix sai da conta certa) */
      if(!S.fixas)S.fixas=[];
      const dia=parseInt(v.data.slice(8,10),10)||1,fxId=uid();
      /* v10.157: a primeira ocorrência é a data escolhida (inicio), nada antes. antes só criadoEm=hoje: salário com data 10/12
         lançado em 10/11 virava fixa "todo dia 10" e já entrava em novembro. nome = descrição, senão a categoria */
      S.fixas.push({id:fxId,nome:obj.descricao||String(v.categoria||'').trim()||'Conta fixa',valor,dia,tipo:v.tipo==='receita'?'receita':'despesa',freq:'mensal',auto:true,categoria:v.categoria,inicio:v.data,criadoEm:v.data<hojeISO()?v.data:hojeISO(),forma,conta:obj.conta,cartao:obj.cartao,pagoCom});
      if(!S.gerados)S.gerados={};S.gerados['fx|'+fxId+'|'+v.data.slice(0,7)]=1;
    }
    if(!t&&isDesp){if(!S.cfg)S.cfg={};S.cfg.ultLanc={forma,cartao:obj.cartao||'',conta:obj.conta||''};} // v10.152: lembra como pagou da última vez
    geraRecorrentes();salvar();render();toast(!t&&np>1&&usaCartao?np+' parcelas lançadas':'Lançamento salvo');
    if(!t&&novoId&&base&&base.arq)anexar(novoId,base.arq).then(e=>{if(e)toast(e,true);else render();}).catch(()=>{});
  });
  const mf=$('#mf');
  if(!t&&!base&&USER)mf.insertAdjacentHTML('afterbegin',`<div class="iaBtns"><button type="button" class="btn2 iaBtn" data-act="ia-frase">${I('sparkle')}Falar ou escrever</button><button type="button" class="btn2 iaBtn" data-act="ia-ler">${I('receipt')}Ler comprovante</button></div>`);
  if(base&&base.ia)mf.insertAdjacentHTML('afterbegin',`<p class="iaNota">${I('sparkle')}Preenchido pela IA${base.ia<0.6?', confira bem o valor':''}. Revise antes de salvar.</p>`);
  const selT=mf.querySelector('select[name="tipo"]'),selC=mf.querySelector('select[name="categoria"]');
  const listaDo=tp=>tp==='receita'?CATS_RECEITA:S.cats;
  const mkOpts=(list,sel)=>list.map(c=>`<option value="${esc(c)}" ${c===sel?'selected':''}>${esc(c)}</option>`).join('');
  const l0=listaDo(selT.value);
  const atual=P&&P.tipo===selT.value?P.categoria:'';
  selC.innerHTML=mkOpts(atual&&!l0.includes(atual)?[atual].concat(l0):l0,atual||l0[0]);
  const selK=mf.querySelector('select[name="cartao"]'),wK=selK.closest('label');
  const selF=mf.querySelector('select[name="forma"]'),wF=selF.closest('label');
  const selB=mf.querySelector('select[name="conta"]'),wB=selB.closest('label');
  const pintaK=()=>{const rec=selT.value==='receita';const ops=rec?[['dinheiro','dinheiro'],['pix','pix']]:[['dinheiro','dinheiro'],['pix','pix'],['boleto','boleto'],['cartao','cartão']];const cur=ops.some(o=>o[0]===selF.value)?selF.value:'dinheiro';selF.innerHTML=ops.map(o=>`<option value="${o[0]}" ${o[0]===cur?'selected':''}>${o[1]}</option>`).join('');selF.value=cur;wF.style.display='';const bol=selF.value==='boleto';const pc=mf.querySelector('select[name="pagoCom"]');if(pc){pc.closest('label').style.display=(!rec&&bol)?'':'none';}const pcv=pc?pc.value:'dinheiro';wK.style.display=(!rec&&(selF.value==='cartao'||(bol&&pcv==='cartao')))?'':'none';wB.style.display=(selF.value==='pix'||(!rec&&bol&&pcv==='conta'))?'':'none';const wPa=mf.querySelector('select[name="parcelas"]').closest('label');wPa.style.display=(!t&&!rec&&selF.value==='cartao')?'':'none';};
  const pintaE=()=>{['multa','juros','desconto'].forEach(n=>{const e=mf.querySelector('[name="'+n+'"]');if(e)e.closest('label').style.display=selT.value==='receita'?'none':'';});};
  pintaE();
  selT.onchange=()=>{const l=listaDo(selT.value);selC.innerHTML=mkOpts(l,l[0]);pintaK();pintaE();sugere();};
  /* v10.14: categoria sugerida pela descrição (até a pessoa escolher uma) */
  const inDesc=mf.querySelector('input[name="descricao"]');let catMexeu=!!t;
  const dica=document.createElement('div');dica.className='catDica';dica.hidden=true;inDesc.closest('label').appendChild(dica);
  selC.addEventListener('change',()=>{catMexeu=true;dica.hidden=true;});
  let catSug=false;
  const sugere=()=>{const sg=sugestaoCat(inDesc.value,selT.value);
    if(catMexeu){dica.hidden=true;return;}
    if(!sg){dica.hidden=true;if(catSug){const l=listaDo(selT.value);selC.value=l[0];catSug=false;}return;}
    catSug=true;
    selC.value=sg.c;dica.hidden=false;dica.innerHTML=`${I('star')}<span>categoria sugerida: <b>${esc(sg.c)}</b>${sg.por==='hist'?' · pelo seu histórico':sg.por==='regra'?' · você já usou essa':''}</span>`;};
  inDesc.addEventListener('input',sugere);
  mf._sugCat=()=>{const sg=sugestaoCat(inDesc.value,selT.value);return sg&&sg.c;};
  const selP=mf.querySelector('select[name="pagoCom"]'),wP=selP.closest('label');
  selP.onchange=pintaK;
  selF.onchange=pintaK;
  /* v10.95: compra no cartão com data depois do fechamento: diz para qual fatura vai */
  {const inD=mf.querySelector('[name="data"]'),fd=document.createElement('p');fd.className='fatDica';fd.hidden=true;wK.appendChild(fd);
   const pf=()=>{const c=S.cartoes.find(x=>x.id===selK.value),d=inD&&inD.value;
     if(!c||!d||!ISO_RE.test(d)||selT.value==='receita'||wK.style.display==='none'){fd.hidden=true;return;}
     const f=fechamentoDe(c,d),f0=fechamentoDe(c,hojeISO());if(f.fecha<=f0.fecha){fd.hidden=true;return;}
     fd.hidden=false;fd.innerHTML=`${I('card')}<span>vai para a fatura de <b>${MESES_LONGO[+f.vence.slice(5,7)-1]}</b> · fecha ${ccDM(f.fecha)}, vence ${ccDM(f.vence)}</span>`;};
   [selK,selF,selT,selP].forEach(e=>e&&e.addEventListener('change',()=>setTimeout(pf,0)));if(inD){inD.addEventListener('input',pf);inD.addEventListener('change',pf);}
   mf._fatDica=pf;setTimeout(pf,0);}
  pintaK();
  /* v10.81: o cartão escolhido aparece como o cartão de verdade (miniatura); o select continua por trás */
  {const KS=cartoesAtivos(P&&P.cartao);if(KS.length){
    const pk=document.createElement('div');pk.className='ccPick';pk.setAttribute('role','radiogroup');pk.setAttribute('aria-label','qual cartão');
    pk.innerHTML=KS.map(c=>`<button type="button" class="ccPickB" role="radio" aria-checked="false" data-k="${c.id}" aria-label="${esc(c.nome+(c.final?' final '+c.final:''))}">${cartaoMini(c)}<span class="ccPickN">${esc(c.nome)}</span></button>`).join('');
    selK.classList.add('ccPickSel');selK.setAttribute('tabindex','-1');selK.setAttribute('aria-hidden','true');wK.appendChild(pk);
    const marca=()=>pk.querySelectorAll('.ccPickB').forEach(b=>{const on=b.dataset.k===selK.value;b.setAttribute('aria-checked',on?'true':'false');b.tabIndex=on||(!selK.value&&b===pk.firstElementChild)?0:-1;});
    pk.addEventListener('click',e=>{const b=e.target.closest('.ccPickB');if(!b)return;e.preventDefault();selK.value=b.dataset.k;selK.dispatchEvent(new Event('change',{bubbles:true}));marca();});
    pk.addEventListener('keydown',e=>{if(!/^Arrow(Left|Right|Up|Down)$/.test(e.key))return;const L=[...pk.querySelectorAll('.ccPickB')];let i=L.indexOf(document.activeElement);if(i<0)return;e.preventDefault();i=(i+(/Right|Down/.test(e.key)?1:-1)+L.length)%L.length;L[i].focus();L[i].click();});
    selK.addEventListener('change',marca);marca();}}
  /* situação: data futura sugere "previsto" (até a pessoa escolher); no cartão não se aplica */
  const selS=mf.querySelector('select[name="status"]'),wS=selS.closest('label'),inD=mf.querySelector('input[name="data"]');let stMexeu=!!t;
  selS.addEventListener('change',()=>{stMexeu=true;});
  const pintaS=()=>{const cart=selF.value==='cartao'||(selF.value==='boleto'&&selP.value==='cartao');wS.style.display=cart&&!(t&&t.status==='cancelado')?'none':'';
    if(!stMexeu&&inD.value)selS.value=inD.value>hojeISO()&&!cart?'previsto':'pago';};
  inD.addEventListener('change',pintaS);inD.addEventListener('input',pintaS);selF.addEventListener('change',pintaS);selP.addEventListener('change',pintaS);pintaS();
  /* v10.81: dividir o lançamento entre categorias (ex.: compra do mercado com limpeza e farmácia) */
  {const wC=selC.closest('label'),inV=mf.querySelector('input[name="valor"]');
   const spB=document.createElement('div');spB.className='spBox';wC.insertAdjacentElement('afterend',spB);
   SP=temSplit(P)&&P.tipo==='despesa'&&!P.faturaKey?P.split.map(p=>({cat:p.cat,v:p.v})):null;
   const totC=()=>cents(parseBR(inV.value));
   const somaSp=()=>SP.reduce((a,p)=>a+cents(p.v),0);
   const opts=sel=>{const l=S.cats.includes(sel)||!sel?S.cats:[sel].concat(S.cats);return l.map(c=>`<option value="${esc(c)}" ${c===sel?'selected':''}>${esc(c)}</option>`).join('');};
   const estado=()=>{const el=spB.querySelector('.spSt');if(!el)return;const d=totC()-somaSp();
     el.className='spSt'+(d===0&&totC()>0?' ok':' bad');
     el.innerHTML=d===0&&totC()>0?I('check')+'<span>fechou o total</span>':`<span>${d>0?'faltam':'passaram'} <b>${FMT_BRL.format(Math.abs(d)/100)}</b></span>${SP.length?`<button type="button" class="spAjusta" data-sp="ajusta">ajustar ${esc(SP[0].cat)}</button>`:''}`;};
   /* v10.155: no formulário novo (v10.148) o seletor de categoria mora na linha "Categoria" (.rdRC); dividido, ela some também */
   const mostraC=on=>{wC.style.display=on?'':'none';const r=selC.closest('.rdRC');if(r&&r!==wC)r.style.display=on?'':'none';};
   const pinta=()=>{const desp=selT.value==='despesa';
     if(!desp){spB.hidden=true;mostraC(true);return;}
     spB.hidden=false;
     if(!SP){mostraC(true);spB.innerHTML=`<button type="button" class="spLink" data-sp="abre">${I('split')}<span>dividir entre categorias</span></button>`;return;}
     mostraC(false);
     spB.innerHTML=`<div class="spHd"><b>${I('split')}Dividido entre categorias</b><button type="button" class="spX" data-sp="fecha">não dividir</button></div>
       ${SP.map((p,i)=>`<div class="spRow"><select data-spc="${i}" aria-label="categoria da parte ${i+1}">${opts(p.cat)}</select><input data-spv="${i}" inputmode="decimal" placeholder="0,00" aria-label="valor da parte ${i+1}" value="${p.v>0?num(p.v):''}"><button type="button" class="spDel" data-sp="del" data-i="${i}" aria-label="remover parte ${i+1}"${SP.length<=2?' disabled':''}>${I('close')}</button></div>`).join('')}
       <div class="spFoot">${SP.length<SPLIT_MAX?`<button type="button" class="spAdd" data-sp="add">${I('plus')}parte</button>`:'<small>máximo de '+SPLIT_MAX+' partes</small>'}<div class="spSt"></div></div>`;
     estado();};
   spB.addEventListener('click',e=>{const b=e.target.closest('[data-sp]');if(!b)return;e.preventDefault();const k=b.dataset.sp;
     if(k==='abre'){const tot=totC();const c0=selC.value||S.cats[0];const c1=S.cats.find(c=>c!==c0)||'Outros';SP=[{cat:c0,v:tot/100},{cat:c1,v:0}];pinta();const i=spB.querySelector('[data-spv="1"]');if(i)i.focus();return;}
     if(k==='fecha'){const m=SP&&SP.length?maiorParte(SP.filter(p=>cents(p.v)>0).length?SP.filter(p=>cents(p.v)>0):SP):selC.value;SP=null;if(m){if(![...selC.options].some(o=>o.value===m))selC.insertAdjacentHTML('afterbegin',`<option value="${esc(m)}">${esc(m)}</option>`);selC.value=m;}pinta();return;}
     if(k==='add'){if(SP.length>=SPLIT_MAX)return;const usadas=new Set(SP.map(p=>p.cat));const d=Math.max(0,totC()-somaSp());SP.push({cat:S.cats.find(c=>!usadas.has(c))||'Outros',v:d/100});pinta();const i=spB.querySelector('[data-spv="'+(SP.length-1)+'"]');if(i)i.focus();return;}
     if(k==='del'){if(SP.length<=2)return;SP.splice(+b.dataset.i,1);pinta();return;}
     if(k==='ajusta'){const outros=SP.slice(1).reduce((a,p)=>a+cents(p.v),0),r=totC()-outros;if(r<=0){toast('As outras partes já passam do total. Diminua uma delas.',true);return;}SP[0].v=r/100;pinta();}
   });
   spB.addEventListener('input',e=>{const i=e.target.dataset.spv;if(i==null)return;SP[+i].v=c2(parseBR(e.target.value));estado();});
   spB.addEventListener('change',e=>{const i=e.target.dataset.spc;if(i==null)return;SP[+i].cat=e.target.value;estado();});
   inV.addEventListener('input',()=>{if(SP)estado();});
   const oc=selT.onchange;selT.onchange=()=>{oc();pinta();};
   pinta();}
  /* v10.80: dia trabalhado. aparece sozinho em Horas extras, Salário, Freelance...; nas outras receitas, por um atalho.
     o campo de data vira "Recebo em" (receita prevista/futura). informando só o dia trabalhado, sugere o "Recebo em" pelo padrão anterior. */
  {const inT=mf.querySelector('input[name="trab"]'),wT=inT.closest('label'),lD=inD.closest('label'),lDtxt=lD.firstChild;
   wT.classList.add('trabCampo');
   const tDica=document.createElement('div');tDica.className='catDica trabSug';tDica.hidden=true;wT.appendChild(tDica);
   const tLink=document.createElement('button');tLink.type='button';tLink.className='trabLink';tLink.innerHTML=I('calendar')+'<span>trabalhou num dia e recebe em outro? informar dia trabalhado</span>';wT.insertAdjacentElement('beforebegin',tLink);
   let abriu=!!(P&&P.trab),dMexeu=false,auto=false;
   inD.addEventListener('input',()=>{dMexeu=true;auto=false;});
   const pintaT=()=>{const rec=selT.value==='receita',mostra=rec&&(abriu||trabCat(selC.value)||!!inT.value);
     wT.style.display=mostra?'':'none';tLink.style.display=rec&&!mostra?'':'none';if(!rec)tDica.hidden=true;
     const fut=selS.value==='previsto'||(inD.value&&inD.value>hojeISO());
     lDtxt.nodeValue=rec&&fut?'Recebo em':rec&&inT.value?'Recebi em':'Data';
     if(rec&&mostra&&!inT.value&&tDica.hidden){tDica.hidden=false;tDica.innerHTML=`${I('clock')}<span>lance no dia em que trabalhou: eu sugiro quando o dinheiro cai</span>`;}};
   const sugT=()=>{if(selT.value!=='receita')return;const w=inT.value;
     if(!w){if(auto){inD.value=t?t.data:hojeISO();auto=false;pintaS();}tDica.hidden=false;tDica.innerHTML=`${I('clock')}<span>lance no dia em que trabalhou: eu sugiro quando o dinheiro cai</span>`;pintaT();return;}
     const pode=!dMexeu&&(!t||!inD.value||inD.value<=w||auto);
     const sg=sugereReceb(w,selC.value,inDesc.value,t&&t.id);
     if(pode){if(sg){inD.value=sg.data;auto=true;}else{inD.value='';auto=true;}pintaS();}
     tDica.hidden=false;
     tDica.innerHTML=sg?`${I('star')}<span>${pode?'Recebo em sugerido':'sugestão'}: <b>${fmtDataCurta(sg.data)}</b> · ${sugTxt(sg)} de ${esc(selC.value)} (${fmtDataCurta(sg.ref.data)})</span>`:`${I('calendar')}<span>${pode||!inD.value?'sem recebimento anterior de '+esc(selC.value)+' para comparar: informe em Data quando vai cair':'confira em Data quando vai cair'}</span>`;
     pintaT();};
   tLink.onclick=()=>{abriu=true;pintaT();try{inT.focus();}catch(e){}};
   inT.addEventListener('change',sugT);inT.addEventListener('input',sugT);
   selC.addEventListener('change',()=>{if(inT.value&&auto)sugT();pintaT();});
   selT.addEventListener('change',pintaT);selS.addEventListener('change',pintaT);inD.addEventListener('change',pintaT);inD.addEventListener('input',pintaT);selF.addEventListener('change',pintaT);
   if(P&&P.trab&&P.tipo==='receita'){tDica.hidden=true;}
   pintaT();
   mf._sugTrab=sugT;}
  /* v10.78: atalho para empréstimo no lançamento novo (sai/entra na conta, mas não é gasto nem receita) */
  if(!t){
    selT.closest('label').insertAdjacentHTML('afterend','<div class="empAt" id="empAt"></div>');
    const ea=$('#empAt');
    const pe=()=>{const r=selT.value==='receita',temAb=(S.emprestimos||[]).some(e=>empTot(e.id).aberto>0);
      const bE=`<button type="button" class="empAtC" data-act="tx-emp-novo">${I('arrowUp')}Emprestei</button>`,bV=`<button type="button" class="empAtC" data-act="tx-emp-volta"${temAb?'':' disabled'}>${I('arrowDown')}Recebi de volta</button>`;
      ea.innerHTML=`<span class="empAtL">${I('handCoins')}<span>${r?'Dinheiro de empréstimo?':'Emprestou pra alguém?'}<small>não conta como ${r?'receita':'gasto'} nem entra no orçamento</small></span></span><div class="empAtB">${r?bV+bE:bE+bV}</div>`;};
    pe();selT.addEventListener('change',pe);
  }
  /* v10.128: Roda (05/11/2026). v10.146/147: o Matheus pediu quadro em vez do círculo, no estilo da folha Adicionar: cartão do valor e categorias em pílulas 2 colunas; o resto do formulário fica atrás do + */
  if(!t)rodaInit(mf,selT,selC,selF,listaDo,!base&&USER);
}
function rodaUso(tipo,lista){const n={};(S.tx||[]).forEach(x=>{if(x.tipo===tipo&&!x.faturaKey&&x.categoria)n[x.categoria]=(n[x.categoria]||0)+1;});return lista.slice().sort((a,b)=>(n[b]||0)-(n[a]||0)||lista.indexOf(a)-lista.indexOf(b));}
function rodaInit(mf,selT,selC,selF,listaDo,ia){
  /* v10.148: formulário no padrão dos apps de mercado (Mobills/Organizze/YNAB): valor grande no topo, sugestões, campos em linhas e "mais opções" recolhido */
  const inV=mf.querySelector('input[name="valor"]'),inD=mf.querySelector('[name="data"]'),sub=mf.querySelector('button[type="submit"]');
  const lDs=mf.querySelector('input[name="descricao"]').closest('label'),inDs=lDs.querySelector('input'),lV=inV.closest('label');
  const ch=`<svg class="i rdCh" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>`;
  const R=document.createElement('div');R.className='roda';
  R.innerHTML=`<div class="rdTop"><div class="seg rdSeg" role="radiogroup" aria-label="tipo"><button type="button" role="radio" data-t="despesa">Despesa</button><button type="button" role="radio" data-t="receita">Receita</button></div><span class="sp"></span>${ia?`<button type="button" class="rdIc" data-act="ia-frase" aria-label="falar ou escrever">${I('mic')}</button><button type="button" class="rdIc" data-act="ia-ler" aria-label="ler comprovante">${I('receipt')}</button>`:''}</div>
   <div class="rdCen"><small class="rdCat">Valor</small><label class="rdVal"><span>R$</span></label></div>
   <div class="rdOpts" role="radiogroup" aria-label="categorias mais usadas"></div>
   <p class="rdSec">Detalhes</p>
   <div class="rdGrp">
    <label class="rdRow rdRC"><span class="rdK">Categoria</span><span class="rdV"><span class="rdIcC"></span><span class="rdSl"></span></span>${ch}</label>
    <label class="rdRow rdRF"><span class="rdK">Pago com</span><span class="rdV"><span class="rdIcC rdIcF">${I('wallet')}</span><span class="rdSl"></span></span>${ch}</label>
    <div class="rdRow rdRD"><span class="rdK">Data</span><span class="rdV rdDc"><button type="button" data-d="0">Hoje</button><button type="button" data-d="1">Ontem</button><button type="button" data-d="x">Outra</button><span class="rdDt"></span></span></div>
    <label class="rdRow rdRS"><span class="rdK">Descrição</span><span class="rdV rdDsV"></span></label>
   </div>
   <div class="rdGrp"><button type="button" class="rdRow rdMaisB" aria-expanded="false"><span class="rdK rdKm">Mais opções</span><span class="rdMs">parcelas, repetir, tags</span>${ch}</button></div>`;
  const iaB=mf.querySelector('.iaBtns');if(iaB&&ia)iaB.remove();
  const nota=mf.querySelector('.iaNota');
  const mais=document.createElement('div');mais.className='rdMais';mais.hidden=true;
  [...mf.children].forEach(el=>{if(el===sub||el===nota||el.type==='hidden')return;mais.appendChild(el);});
  mf.insertBefore(R,mf.firstChild);if(nota)mf.insertBefore(nota,R);
  inV.placeholder='0,00';R.querySelector('.rdVal').appendChild(inV);lV.remove();
  const lT=selT.closest('label');if(lT)lT.style.display='none';
  /* os campos de verdade vão para dentro das linhas (o iPhone abre o seletor nativo) */
  const wC=selC.closest('label'),wF=selF.closest('label');
  R.querySelector('.rdRC .rdSl').appendChild(selC);R.querySelector('.rdRF .rdSl').appendChild(selF);
  [wC,wF].forEach(w=>{if(w&&!w.querySelector('input,select,textarea'))w.classList.add('rdGone');});
  inDs.placeholder='opcional';R.querySelector('.rdDsV').appendChild(inDs);lDs.classList.add('rdGone');
  const wD=inD&&inD.closest('label');if(inD){R.querySelector('.rdDt').appendChild(inD);if(wD)wD.classList.add('rdGone');}
  R.appendChild(mais);
  const bot=document.createElement('div');bot.className='rdBot';mf.appendChild(bot);bot.appendChild(sub);sub.classList.add('full');
  const bM=R.querySelector('.rdMaisB');
  const abreMais=on=>{mais.hidden=!on;bM.setAttribute('aria-expanded',on?'true':'false');bM.classList.toggle('on',on);};
  bM.onclick=()=>abreMais(mais.hidden);
  const opts=R.querySelector('.rdOpts'),icC=R.querySelector('.rdRC .rdIcC'),dc=R.querySelector('.rdDc');
  const ontem=()=>{const d=new Date(hojeISO()+'T12:00:00');d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);};
  const kD=R.querySelector('.rdRD .rdK');
  const pintaD=()=>{if(!inD)return;if(wD&&wD.firstChild&&wD.firstChild.nodeType===3)kD.textContent=wD.firstChild.nodeValue.trim()||'Data';const v=inD.value,h=hojeISO(),o=ontem(),k=v===h?'0':v===o?'1':'x';
    dc.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.d===k));dc.classList.toggle('outra',k==='x');};
  dc.onclick=e=>{const b=e.target.closest('button');if(!b||!inD)return;
    if(b.dataset.d==='x'){dc.classList.add('outra');dc.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));try{inD.showPicker?inD.showPicker():inD.focus();}catch(_){inD.focus();}return;}
    inD.value=b.dataset.d==='0'?hojeISO():ontem();inD.dispatchEvent(new Event('change',{bubbles:true}));pintaD();};
  const pinta=()=>{
    R.querySelectorAll('.rdSeg button').forEach(b=>{const on=b.dataset.t===selT.value;b.classList.toggle('on',on);b.setAttribute('aria-checked',on?'true':'false');});
    R.classList.toggle('rec',selT.value==='receita');
    const lista=rodaUso(selT.value,listaDo(selT.value)),cur=selC.value;
    opts.innerHTML=lista.slice(0,6).map(c=>{const on=c===cur;return `<button type="button" class="rdOpt${on?' on':''}" role="radio" aria-checked="${on}" data-c="${esc(c)}" style="--c:${corCat(c)}"><span class="rdOi">${I(catIcon(c))}</span><span>${esc(c)}</span></button>`;}).join('');
    icC.innerHTML=I(cur?catIcon(cur):'tag');icC.style.setProperty('--c',cur?corCat(cur):'#94a3b8');pintaD();};
  R.querySelector('.rdSeg').onclick=e=>{const b=e.target.closest('button');if(!b||b.dataset.t===selT.value)return;selT.value=b.dataset.t;selT.dispatchEvent(new Event('change',{bubbles:true}));};
  opts.onclick=e=>{const b=e.target.closest('.rdOpt');if(!b)return;selC.value=b.dataset.c;selC.dispatchEvent(new Event('change',{bubbles:true}));};
  R.querySelector('.rdCen').onclick=e=>{if(e.target!==inV)inV.focus();};
  [selT,selC].forEach(el=>el.addEventListener('change',()=>setTimeout(pinta,0)));
  if(inD){inD.addEventListener('change',pintaD);inD.addEventListener('input',pintaD);}
  inDs.addEventListener('input',()=>setTimeout(pinta,0));
  sub.addEventListener('click',()=>setTimeout(()=>{if(mais.querySelector('label.bad'))abreMais(true);},0));
  /* v10.150: "mais opções" no mesmo padrão de linhas agrupadas */
  let g=null;
  [...mais.children].forEach(el=>{
    const row=el.tagName==='LABEL'&&!el.classList.contains('rdGone')&&!el.classList.contains('ckrow')&&el.querySelector('input,select,textarea');
    if(!row){g=null;return;}
    const tn=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim());
    const txt=tn.map(n=>n.textContent).join(' ').trim();tn.forEach(n=>n.remove());
    const k=document.createElement('span');k.className='rdK';k.textContent=txt.replace(/\s*\(opcional[^)]*\)/i,'').replace(/\s*\(R\$\)/,'').replace(/^Conta bancária$/i,'Conta');
    const ctl=el.querySelector('input,select,textarea');
    if(/opcional/i.test(txt)&&ctl&&ctl.tagName==='INPUT')ctl.placeholder='opcional';
    el.prepend(k);el.classList.add('rdRow','rdLr');if(ctl&&ctl.tagName==='TEXTAREA')el.classList.add('rdTa');
    if(!g){g=document.createElement('div');g.className='rdGrp';mais.insertBefore(g,el);}
    g.appendChild(el);
  });
  /* v10.152: cartão, conta e "boleto pago com" logo abaixo de "Pago com" (aparecem conforme a forma) */
  {let ref=R.querySelector('.rdRF');['pagoCom','cartao','conta'].forEach(n=>{const e=mf.querySelector('[name="'+n+'"]'),l=e&&e.closest('label.rdLr');if(l){ref.after(l);ref=l;}});
   mais.querySelectorAll('.rdGrp').forEach(x=>{if(!x.children.length)x.remove();});}
  pinta();
  if(!inV.value)try{inV.focus({preventScroll:true});}catch(e){}
}
function inDsPh(l){const i=l.querySelector('input');if(i)i.placeholder='descrição (opcional)';const tn=[...l.childNodes].find(n=>n.nodeType===3&&n.textContent.trim());if(tn)tn.textContent='';}
function pagarFatura(id){
  const t=S.tx.find(x=>x.id===id&&x.faturaKey);if(!t)return;
  const resta=restanteFatura(t)||t.valor;
  form('Pagar '+t.descricao,[
    {name:'valor',label:'Valor pago (R$)',value:num(resta),required:true,inputmode:'decimal'},
    {name:'conta',label:'Pago com a conta',type:'select',value:(S.bancos.find(b=>b.principal)||{}).id||'',options:[{v:'',t:S.bancos.length?'não descontar de nenhuma conta':'nenhuma conta cadastrada'}].concat(bancosAtivos().map(b=>({v:b.id,t:b.nome})))},
    {name:'data',label:'Data do pagamento',type:'date',value:hojeISO(),required:true}
  ],v=>{
    const val=parseBR(v.valor);
    if(!(val>0))return 'Informe o valor pago.';
    if(!DATA_OK.test(String(v.data)))return 'Informe a data.';
    if(String(v.data)>hojeISO())return 'A data do pagamento não pode ser no futuro.';
    if(cents(val)>cents(resta)+1)return 'O valor passa do que falta pagar ('+brl(resta)+').';
    if(!Array.isArray(t.pagamentos))t.pagamentos=[];
    t.pagamentos.push({valor:c2(val),data:v.data,conta:v.conta||''});fechaPagamentos(t);
    salvar();render();toast(restanteFatura(t)>0?'Pagamento parcial registrado':'Fatura paga');
  });
}
/* v10.157: "Pagar"/"Recebi" do Início. confirma como pagou (forma, conta ou cartão), data e valor.
   fatura usa o pagamento de fatura que já existe; conta prevista vira paga no próprio lançamento; ocorrência de conta fixa
   ainda sem lançamento ganha o lançamento da ocorrência (txDaOcorrencia, mesma chave da geração automática) já pago. */
function pagarConta(ref){
  ref=String(ref||'');
  if(ref.indexOf('fat:')===0)return pagarFatura(ref.slice(4));
  let t=null,f=null,o=null;
  if(ref.indexOf('tx:')===0){t=S.tx.find(x=>x.id===ref.slice(3));if(!t)return;}
  else if(ref.indexOf('fx:')===0){const p=ref.slice(3).split(':');f=(S.fixas||[]).find(x=>x.id===p[0]);if(!f||!ISO_RE.test(p[1]||''))return;
    o=ocorrenciasFixa(f,p[1],p[1])[0];if(!o)return;t=S.tx.find(x=>x.fixaKey===o.key)||null;}
  else return;
  const base=t||txDaOcorrencia(f,o),rec=base.tipo==='receita',ult=(!rec&&S.cfg&&S.cfg.ultLanc)||{};
  const princ=(S.bancos.find(b=>b.principal)||{}).id||'';
  const formas=rec?[['pix','Pix, transferência ou depósito'],['dinheiro','Dinheiro']]:[['pix','Pix ou débito na conta'],['dinheiro','Dinheiro'],['boleto','Boleto'],['cartao','Cartão de crédito']];
  const f0=formas.some(x=>x[0]===base.forma)?base.forma:(formas.some(x=>x[0]===ult.forma)?ult.forma:'pix');
  const cartoes=(S.cartoes||[]).filter(c=>!c.arq);
  const nome=String(base.descricao||base.categoria||'conta').replace(/\s*\(fixa\)\s*$/i,'');
  form((rec?'Recebi ':'Pagar ')+nome,[
    {name:'valor',label:rec?'Valor recebido (R$)':'Valor pago (R$)',value:num(base.valor),required:true,inputmode:'decimal'},
    {name:'forma',label:rec?'Como recebeu':'Como pagou',type:'select',value:f0,options:formas.map(x=>({v:x[0],t:x[1]}))},
    {name:'conta',label:rec?'Entrou na conta':'Saiu da conta',type:'select',value:base.conta||ult.conta||princ,options:[{v:'',t:S.bancos.length?'não mexer em nenhuma conta':'nenhuma conta cadastrada'}].concat(bancosAtivos().map(b=>({v:b.id,t:b.nome})))},
    {name:'cartao',label:'Cartão',type:'select',value:base.cartao||ult.cartao||(cartoes[0]||{}).id||'',options:cartoes.length?cartoes.map(c=>({v:c.id,t:c.nome})):[{v:'',t:'nenhum cartão cadastrado'}]},
    {name:'data',label:rec?'Data do recebimento':'Data do pagamento',type:'date',value:hojeISO(),required:true}
  ],v=>{
    const val=parseBR(v.valor),fm=formas.some(x=>x[0]===v.forma)?v.forma:'pix',dt=String(v.data||'');
    if(!(val>0))return 'Informe o valor.';
    if(!ISO_RE.test(dt))return 'Informe a data.';
    if(dt>hojeISO())return rec?'A data do recebimento não pode ser no futuro.':'A data do pagamento não pode ser no futuro.';
    if(fm==='cartao'&&!v.cartao)return 'Escolha o cartão.';
    let x=t;
    if(!x){x=S.tx.find(y=>y.fixaKey===o.key);if(!x){x=txDaOcorrencia(f,o);S.tx.push(x);if(!S.gerados)S.gerados={};S.gerados[o.key]=1;}}
    Object.assign(x,{valor:c2(val),data:dt,status:'pago',forma:fm,conta:(fm==='pix'||fm==='boleto')?(v.conta||''):'',cartao:fm==='cartao'?v.cartao:'',pagoCom:fm==='boleto'?'conta':'',pagoManual:1});
    delete x.fxAuto;
    if(!rec&&S.cfg)S.cfg.ultLanc={forma:fm,cartao:x.cartao||'',conta:x.conta||''};
    salvar();render();toast(rec?'Recebimento registrado':'Pagamento registrado');
  });
  const mf=$('#mf'),q=n=>mf.querySelector('[name="'+n+'"]');
  const pinta=()=>{const fm=q('forma').value;q('conta').closest('label').style.display=(fm==='pix'||fm==='boleto')?'':'none';q('cartao').closest('label').style.display=fm==='cartao'?'':'none';};
  q('forma').addEventListener('change',pinta);pinta();
}
function desfazPagamento(id){
  const t=S.tx.find(x=>x.id===id&&x.faturaKey);if(!t)return;
  const pg=pagsFatura(t),u=pg[pg.length-1];if(!u)return;
  confirma({titulo:'Desfazer pagamento?',texto:pg.length>1?'O último pagamento ('+brl(u.valor)+(u.data?' em '+fmtData(u.data):'')+') é desfeito e o valor volta para a conta.':'A fatura volta a ficar em aberto e o valor volta para a conta.',ok:'Desfazer'},()=>{t.pagamentos=pg.slice(0,-1);fechaPagamentos(t);salvar();render();toast('Pagamento desfeito');});
}
const FAT_ST={paga:['paga','ok'],parcial:['pago em parte','warn'],vencida:['vencida','over'],aberta:['a pagar','warn']};
function pagoAMais(t){if(!t.faturaKey)return 0;const pg=pagsFatura(t),p=pg.length?pg.reduce((a,x)=>a+cents(x.valor),0):cents(t.pagoValor);return Math.max(0,(p-cents(t.valor))/100);}
function faturaBadge(t){const st=statusFatura(t),[l,k]=FAT_ST[st],pm=pagoAMais(t);return `<span class="badge ${k}">${l}${st==='parcial'?' · falta '+brl(restanteFatura(t)):''}${pm>0?' · pago a mais '+brl(pm):''}</span>`;}
function defOrc(c,sug){
  const m=OMES||mesAtual(),lim=limOrc(m);
  form('Limite de '+c+' · '+nomeMes(m),[
    {name:'valor',label:'Limite (R$). deixe 0 pra remover',value:lim[c]?num(lim[c]):sug?num(sug):'',inputmode:'decimal',placeholder:'0,00'}
  ],v=>{
    const n=parseBR(v.valor);
    if(n<0)return 'Valor inválido.';
    setLimOrc(m,c,n);
    salvar();render();toast('Limite salvo para '+nomeMes(m)+' em diante');
  });
}
function assetIco(t,tipo){
  if(tipo==='cripto'||CRIPTO_LIST.some(x=>x.t===t))return '<span class="ic fii coinic">'+cryptoIco(t)+'</span>';
  return '<span class="tkb tk-'+esc(tipo||'fii')+'">'+esc(String(t).slice(0,4))+'</span>';
}
/* v10.29: renda fixa atrelada ao CDI (ex: Caixinha Nubank 100% CDI).
   Fonte: Banco Central, série SGS 12 (CDI diário, % ao dia). O saldo base digitado rende
   (1 + CDI do dia × %CDI) em cada dia útil publicado depois da data base. Recalcula ao abrir o app. */
const CDI_KEY='gv-cdi';let CDI={st:'',ult:'',taxa:0};
function cdiCache(){try{return JSON.parse(localStorage.getItem(CDI_KEY)||'null')||{s:{},em:''};}catch(e){return {s:{},em:''};}}
/* feriados nacionais (sem CDI): 2025-2027 */
const FER_BR=new Set(['2025-01-01','2025-03-03','2025-03-04','2025-04-18','2025-04-21','2025-05-01','2025-06-19','2025-09-07','2025-10-12','2025-11-02','2025-11-15','2025-11-20','2025-12-25','2026-01-01','2026-02-16','2026-02-17','2026-04-03','2026-04-21','2026-05-01','2026-06-04','2026-09-07','2026-10-12','2026-11-02','2026-11-15','2026-11-20','2026-12-25','2027-01-01','2027-02-08','2027-02-09','2027-03-26','2027-04-21','2027-05-01','2027-05-27','2027-09-07','2027-10-12','2027-11-02','2027-11-15','2027-11-20','2027-12-25']);
function diaUtil(iso){const d=new Date(iso+'T12:00:00').getDay();return d!==0&&d!==6&&!FER_BR.has(iso);}
/* dias úteis já passados que o Banco Central ainda não publicou (estimados com a última taxa) */
function cdiPendentes(ult){if(!ult)return [];const out=[],hj=hojeISO(),d=new Date(ult+'T12:00:00');for(let i=0;i<10;i++){d.setDate(d.getDate()+1);const x=d.toISOString().slice(0,10);if(x>=hj)break;if(diaUtil(x))out.push(x);}return out;}
function cdiAnual(d){return (Math.pow(1+d/100,252)-1)*100;}
function migraCaixinhas(){ // pedido do Matheus (28/10/2026): Caixinha Nubank rende 100% do CDI, sem vencimento
  if(S.cfg.migCdi1)return false;let n=0;
  S.fiis.forEach(f=>{if(tipoOf(f)==='rf'&&!f.idx&&/caixinha/i.test((f.nome||'')+' '+(f.ticker||''))){
    f.idx='cdi';f.pctCdi=100;f.semVenc=true;f.venc='';f.cdiBase={v:c2(f.preco*f.cotas),d:hojeISO()};f.cotas=1;f.manual=true;f.manualEm=hojeISO();n++;}});
  if(n)S.cfg.migCdi1=1;return n>0;
}
/* ===== v10.68: renda fixa de verdade =====
   Cada produto tem a sua regra (pesquisado em 30/10/2026):
   - CDB, RDB, LC, caixinhas e contas que rendem: rendem só em dia útil (base 252), IR regressivo
     22,5% até 180 dias, 20% até 360, 17,5% até 720 e 15% depois; IOF regressivo nos primeiros 30 dias; FGC até R$ 250 mil.
   - LCI, LCA, CRI, CRA e debênture incentivada: isentos de IR para pessoa física (a MP 1.303 caducou em 08/10/2025).
     LCI e LCA sem índice de preços têm prazo mínimo de 6 meses (Res. CMN 5.215/2025).
   - Tesouro Selic, Prefixado e IPCA+: IR regressivo, taxa B3 de 0,20% ao ano (no Tesouro Selic, só acima de R$ 10 mil por CPF).
     Antes do vencimento o preço de mercado varia; aqui o valor é o da curva do título.
   - Poupança: rende uma vez por mês, no aniversário do depósito (dias 29, 30 e 31 viram dia 1º). Com a Selic acima de 8,5%
     são 0,5% ao mês + TR; abaixo disso, 70% da Selic + TR. Isenta de IR e IOF.
   Fontes das taxas: Banco Central, SGS 12 (CDI), 11 (Selic diária), 433 (IPCA), 226 (TR) e 432 (meta Selic).
   Cada aporte rende e paga IR pela própria data, como no banco. Resgate sai dos aportes mais antigos primeiro. */
const RF_PROD={
  caixinha:{l:'Caixinha ou conta que rende',c:'Caixinha',ir:1,g:'fgc',idx:['cdi','cdimais'],liq:'diaria'},
  cdb:{l:'CDB / RDB',c:'CDB',ir:1,g:'fgc',idx:['cdi','cdimais','pre','ipca']},
  lci:{l:'LCI',c:'LCI',ir:0,g:'fgc',idx:['cdi','cdimais','pre','ipca'],car:1},
  lca:{l:'LCA',c:'LCA',ir:0,g:'fgc',idx:['cdi','cdimais','pre','ipca'],car:1},
  tsel:{l:'Tesouro Selic / Tesouro Reserva',c:'Tesouro Selic',ir:1,g:'tn',idx:['selic'],cust:1,isen:10000},
  tpre:{l:'Tesouro Prefixado',c:'Tesouro Pré',ir:1,g:'tn',idx:['pre'],cust:1,mm:1},
  tipca:{l:'Tesouro IPCA+',c:'Tesouro IPCA+',ir:1,g:'tn',idx:['ipca'],cust:1,mm:1},
  poup:{l:'Poupança',c:'Poupança',ir:0,iof:0,g:'fgc',idx:['poup'],liq:'diaria'},
  lc:{l:'LC (letra de câmbio)',c:'LC',ir:1,g:'fgc',idx:['cdi','cdimais','pre','ipca']},
  deb:{l:'Debênture',c:'Debênture',ir:1,g:'',idx:['cdimais','cdi','pre','ipca']},
  debinc:{l:'Debênture incentivada',c:'Deb. incentivada',ir:0,g:'',idx:['ipca','cdimais','cdi','pre']},
  cri:{l:'CRI',c:'CRI',ir:0,g:'',idx:['ipca','cdi','cdimais','pre']},
  cra:{l:'CRA',c:'CRA',ir:0,g:'',idx:['ipca','cdi','cdimais','pre']},
  outro:{l:'Outro',c:'Renda fixa',ir:1,g:'',idx:['cdi','cdimais','pre','ipca','selic','fixo']}
};
const RF_IDX={
  cdi:{l:'% do CDI',tl:'Quanto do CDI (%)',ph:'100',def:'100'},
  cdimais:{l:'CDI + taxa',tl:'Taxa acima do CDI (% ao ano)',ph:'1,5',def:''},
  pre:{l:'Prefixado',tl:'Taxa (% ao ano)',ph:'13,5',def:''},
  ipca:{l:'IPCA + taxa',tl:'Taxa acima da inflação (% ao ano)',ph:'7,2',def:''},
  selic:{l:'Selic',tl:'Taxa acima da Selic (% ao ano)',ph:'0',def:'0'},
  poup:{l:'Regra da poupança',tl:'',def:''},
  fixo:{l:'Eu atualizo o saldo',tl:'',def:''}
};
const RF_DICA={
  caixinha:'Rende só em dia útil, de segunda a sexta e fora dos feriados. Tem IR pela tabela regressiva e IOF se resgatar em menos de 30 dias.',
  cdb:'Rende só em dia útil. IR pela tabela regressiva (22,5% até 180 dias, 15% depois de 2 anos) e IOF nos primeiros 30 dias.',
  lci:'Isenta de IR. Só rende em dia útil e normalmente só pode ser resgatada no vencimento (mínimo de 6 meses).',
  lca:'Isenta de IR. Só rende em dia útil e normalmente só pode ser resgatada no vencimento (mínimo de 6 meses).',
  tsel:'Rende todo dia útil pela Selic, com resgate a qualquer momento. IR regressivo e taxa da B3 de 0,20% ao ano só sobre o que passar de R$ 10 mil.',
  tpre:'Taxa travada até o vencimento. Se vender antes, o preço de mercado pode ser maior ou menor que o valor mostrado aqui.',
  tipca:'Rende a inflação mais a taxa. Se vender antes do vencimento, o preço de mercado pode variar bastante.',
  poup:'Rende uma vez por mês, no dia do aniversário do depósito. Hoje paga 0,5% ao mês + TR. Isenta de IR.',
  lc:'Rende só em dia útil, IR regressivo e cobertura do FGC.',
  deb:'Sem FGC: o risco é da empresa. IR pela tabela regressiva.',
  debinc:'Isenta de IR, mas sem FGC: o risco é da empresa.',
  cri:'Isento de IR, mas sem FGC.',cra:'Isento de IR, mas sem FGC.',
  outro:'Escolha como ele rende. Se não souber, use "Eu atualizo o saldo".'
};
const IR_RF=d=>d<=180?22.5:d<=360?20:d<=720?17.5:15;
const IOF_T=[96,93,90,86,83,80,76,73,70,66,63,60,56,53,50,46,43,40,36,33,30,26,23,20,16,13,10,6,3,0];
function rfProdOf(f){
  if(f.prod&&RF_PROD[f.prod])return f.prod;
  const n=((f.nome||'')+' '+(f.ticker||'')).toLowerCase();
  return /caixinha|cofrinho|porquinho|conta remunerada/.test(n)?'caixinha':/\blci\b/.test(n)?'lci':/\blca\b/.test(n)?'lca':/tesouro\s*(selic|reserva)/.test(n)?'tsel':/tesouro\s*(pre|pré)/.test(n)?'tpre':/tesouro\s*ipca/.test(n)?'tipca':/poupan/.test(n)?'poup':/\bcdb\b|\brdb\b/.test(n)?'cdb':/\bcri\b/.test(n)?'cri':/\bcra\b/.test(n)?'cra':/deb[eê]nture/.test(n)?'deb':'outro';
}
function rfIdxOf(f){return f.idx||'fixo';}
/* v10.98: código interno da renda fixa (12 letras, exigência do sanea) feito de palavras inteiras: "Caixinha Nubank" -> "CAIXINHA",
   não "CAIXINHANUBA". A tela usa nomeAtivo(f) (o nome); o código só identifica. */
function rfCodigo(nome){const w=norm(nome).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);let c='';
  for(const x of w){if((c+x).length>12)break;c+=x;}return c||(w[0]||'').slice(0,12)||'RF';}
function rfTaxaOf(f){return f.idx==='cdi'?(+f.pctCdi||100):(+f.taxa||0);}
function rfRotulo(f){const i=rfIdxOf(f),t=rfTaxaOf(f),n=x=>num(x).replace(/,00$/,'').replace(/(,\d)0$/,'$1');
  return i==='cdi'?n(t)+'% do CDI':i==='cdimais'?'CDI + '+n(t)+'% a.a.':i==='pre'?n(t)+'% a.a.':i==='ipca'?'IPCA + '+n(t)+'% a.a.':i==='selic'?(t?'Selic + '+n(t)+'%':'100% da Selic'):i==='poup'?'poupança':'saldo atualizado por você';}
/* aportes: [{v: valor que está rendendo desde d, d: data, p: quanto disso é dinheiro seu (base do IR), ir: data para contar o prazo do IR}] */
function rfAportes(f){
  if(Array.isArray(f.ap)&&f.ap.length)return f.ap;
  if(f.cdiBase&&f.cdiBase.d){const p=f.pago>0?Math.min(+f.pago,+f.cdiBase.v||0):(+f.cdiBase.v||0);return [{v:+f.cdiBase.v||0,d:f.cdiBase.d,p,ir:f.aplicEm&&f.aplicEm<f.cdiBase.d?f.aplicEm:f.cdiBase.d}];}
  return [];
}
const diasEntre=(a,b)=>Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5);
const isoMais=(iso,n)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
function duMes(ym){let n=0;const d=new Date(ym+'-01T12:00:00'),m=d.getMonth();while(d.getMonth()===m){const x=d.toISOString().slice(0,10);if(diaUtil(x))n++;d.setDate(d.getDate()+1);}return n||21;}
/* aniversário k da poupança a partir do dia d0 */
function poupAnivK(d0,k){const [y,m,dd]=d0.split('-').map(Number);const base=dd>28?new Date(y,m,1,12):new Date(y,m-1,dd,12);const dt=new Date(base.getFullYear(),base.getMonth()+k,base.getDate(),12);return dt.toISOString().slice(0,10);}
function poupTaxaMes(c,ini){
  const meta=+c.meta||13.75,tr=(()=>{const ks=Object.keys(c.tr||{}).filter(k=>k<=ini).sort();return ks.length?c.tr[ks[ks.length-1]]:(Object.values(c.tr||{}).pop()||0);})();
  const base=meta>8.5?0.5:(Math.pow(1+meta*0.7/100,1/12)-1)*100;return (base+(+tr||0))/100;
}
/* quanto um valor v aplicado em d0 vale em 'ate' (exclusivo). est = usou taxa estimada em algum dia */
function rfCresce(v,d0,idx,taxa,ate,c){
  ate=ate||hojeISO();c=c||cdiCache();if(!(v>0)||!d0||d0>=ate||idx==='fixo')return {v:+v||0,est:false};
  let est=false;
  if(idx==='cdi'||idx==='cdimais'||idx==='selic'){
    const S0=idx==='selic'?(c.sel||{}):c.s,dias=Object.keys(S0).sort(),ult=dias[dias.length-1]||'',tx=ult?S0[ult]:0;
    const k=idx==='cdi'?taxa/100:1,sp=idx==='cdi'?1:Math.pow(1+taxa/100,1/252);
    dias.forEach(d=>{if(d>=d0&&d<ate)v*=(1+S0[d]/100*k)*sp;});
    if(tx){let d=ult&&ult>=d0?isoMais(ult,1):d0;let n=0;while(d<ate&&n<400){if(diaUtil(d)&&(!ult||d>ult)){v*=(1+tx/100*k)*sp;est=true;}d=isoMais(d,1);n++;}}
    else est=true;
  }else if(idx==='pre'){
    const f1=Math.pow(1+taxa/100,1/252);let d=d0,n=0;while(d<ate&&n<20000){if(diaUtil(d))v*=f1;d=isoMais(d,1);n++;}
  }else if(idx==='ipca'){
    const I=c.ipca||{},ks=Object.keys(I).sort(),ultI=ks.length?I[ks[ks.length-1]]:0.4,f1=Math.pow(1+taxa/100,1/252),dm={};
    let d=d0,n=0;while(d<ate&&n<20000){if(diaUtil(d)){const ym=d.slice(0,7);if(!dm[ym])dm[ym]=duMes(ym);let im=I[ym];if(im==null){im=ultI;est=true;}v*=Math.pow(1+im/100,1/dm[ym])*f1;}d=isoMais(d,1);n++;}
  }else if(idx==='poup'){
    for(let k=1;k<600;k++){const an=poupAnivK(d0,k);if(an>ate)break;v*=1+poupTaxaMes(c,poupAnivK(d0,k-1));}
  }
  return {v,est};
}
/* posição de hoje: bruto, imposto, IOF, taxa B3 e líquido, somando aporte por aporte */
function rfPosicao(f,c){
  c=c||cdiCache();const P=RF_PROD[rfProdOf(f)]||RF_PROD.outro,idx=rfIdxOf(f),tx=rfTaxaOf(f),hj=hojeISO(),A=rfAportes(f);
  if(idx==='fixo'||!A.length||f.pluggyInv&&!f.manual){
    const posi=f.preco*f.cotas,ganho=Math.max(0,posi-(f.pago||0));
    if(!f.aplicEm||!f.pago)return {bruto:c2(posi),liq:null,ir:0,iof:0,cust:0,aliq:null,est:false,itens:[]};
    const dias=Math.max(1,diasEntre(f.aplicEm,hj)),iof=P.iof!==0&&dias<30?ganho*IOF_T[dias-1]/100:0,ir=P.ir?(ganho-iof)*IR_RF(dias)/100:0;
    return {bruto:c2(posi),liq:c2(posi-iof-ir),ir:c2(ir),iof:c2(iof),cust:0,aliq:P.ir?IR_RF(dias):0,est:false,dias,itens:[]};
  }
  let bruto=0,ir=0,iof=0,cust=0,est=false,minDias=1e9;const itens=[];
  A.forEach(a=>{const r=rfCresce(a.v,a.d,idx,tx,hj,c);est=est||r.est;const g=Math.max(0,r.v-(a.p!=null?a.p:a.v));
    const dias=Math.max(0,diasEntre(a.ir||a.d,hj)),di=Math.max(1,dias);minDias=Math.min(minDias,dias);
    const io=P.iof!==0&&di<30?g*IOF_T[di-1]/100:0,i=P.ir?(g-io)*IR_RF(di)/100:0,cu=P.cust?r.v*0.002*diasEntre(a.d,hj)/365:0;
    bruto+=r.v;ir+=i;iof+=io;cust+=cu;itens.push({v:r.v,g,dias,a});});
  if(P.isen&&cust>0){const tot=S.fiis.filter(x=>tipoOf(x)==='rf'&&rfProdOf(x)==='tsel').reduce((s,x)=>s+x.preco*x.cotas,0)||bruto;cust*=Math.max(0,tot-P.isen)/Math.max(tot,1);}
  return {bruto:c2(bruto),ir:c2(ir),iof:c2(iof),cust:c2(cust),liq:c2(bruto-ir-iof-cust),aliq:P.ir?IR_RF(Math.max(1,minDias)):0,est,dias:minDias,itens};
}
/* taxa ao ano equivalente, para projetar o mês e o vencimento */
function rfAnual(f,c){c=c||cdiCache();const idx=rfIdxOf(f),tx=rfTaxaOf(f);
  const ult=o=>{const k=Object.keys(o||{}).sort().pop();return k?o[k]:0;};
  if(idx==='cdi')return (Math.pow(1+ult(c.s)/100*tx/100,252)-1)*100;
  if(idx==='cdimais')return ((Math.pow(1+ult(c.s)/100,252))*(1+tx/100)-1)*100;
  if(idx==='selic')return ((Math.pow(1+ult(c.sel||{})/100,252))*(1+tx/100)-1)*100;
  if(idx==='pre')return tx;
  if(idx==='ipca'){const I=c.ipca||{},ks=Object.keys(I).sort().slice(-12);const a12=ks.length?ks.reduce((p,k)=>p*(1+I[k]/100),1)-1:0.045;return ((1+a12)*(1+tx/100)-1)*100;}
  if(idx==='poup')return (Math.pow(1+poupTaxaMes(c,hojeISO()),12)-1)*100;
  return 0;
}
function rfProxDiaUtil(iso){let d=isoMais(iso,1),n=0;while(!diaUtil(d)&&n<15){d=isoMais(d,1);n++;}return d;}
const DSEM=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
function rfStatusHoje(f){
  const idx=rfIdxOf(f),hj=hojeISO();if(idx==='fixo')return '';
  if(idx==='poup'){const A=rfAportes(f);if(!A.length)return '';let prox='';A.forEach(a=>{for(let k=1;k<600;k++){const x=poupAnivK(a.d,k);if(x>=hj){if(!prox||x<prox)prox=x;break;}}});
    return prox===hj?'rende hoje (aniversário)':prox?'próximo rendimento em '+fmtData(prox).slice(0,5):'';}
  if(diaUtil(hj))return 'rende hoje';
  const dw=new Date(hj+'T12:00:00').getDay(),p=rfProxDiaUtil(hj),pw=new Date(p+'T12:00:00').getDay();
  return (dw===0||dw===6?'hoje é '+DSEM[dw]:'hoje é feriado')+', não rende. Volta '+(diasEntre(hj,p)<=6?(pw===1?'na segunda':'na '+DSEM[pw]):'em '+fmtData(p).slice(0,5));
}
function rfRecalc(c){
  c=c||cdiCache();let mud=false;
  S.fiis.forEach(f=>{
    if(tipoOf(f)!=='rf')return;
    if(f.idx==='cdi'&&f.cdiBase&&!f.ap){f.ap=rfAportes(f);mud=true;}
    if(!f.prod){f.prod=rfProdOf(f);mud=true;}
    if(rfIdxOf(f)==='fixo'||!Array.isArray(f.ap)||!f.ap.length||(f.pluggyInv&&!f.manual))return;
    const P=rfPosicao(f,c);
    if(f.cotas!==1){f.cotas=1;mud=true;}
    if(P.bruto!==f.preco){f.preco=P.bruto;mud=true;}
    const pg=c2(f.ap.reduce((s,a)=>s+(a.p!=null?a.p:a.v),0));if(pg!==f.pago){f.pago=pg;mud=true;}
    f.cdiEst=P.est?'1':'';
  });
  const dias=Object.keys(c.s||{}).sort();if(dias.length){CDI.ult=dias[dias.length-1];CDI.taxa=c.s[CDI.ult];}
  return mud;
}
function aplicaCDI(){
  if(S.fiis&&S.fiis.length&&migraCaixinhas())salvar();
  return rfRecalc();
}
async function bcbSerie(cod,ini,fim){
  const br=x=>pad(x.getDate())+'/'+pad(x.getMonth()+1)+'/'+x.getFullYear();
  const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),10000);
  try{const r=await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.'+cod+'/dados?formato=json&dataInicial='+br(ini)+'&dataFinal='+br(fim||new Date()),{signal:ctl.signal});
    if(!r.ok)throw new Error('http '+r.status);const j=await r.json();
    return j.map(x=>{const [d,m,y]=String(x.data).split('/');return [y+'-'+m+'-'+d,parseFloat(x.valor)];}).filter(x=>x[0].length===10&&isFinite(x[1]));}
  finally{clearTimeout(to);}
}
async function atualizaCDI(forca){
  if(S.fiis&&S.fiis.length&&migraCaixinhas()){salvar();if(TAB==='fii')render();}
  const rfs=S.fiis.filter(f=>tipoOf(f)==='rf'&&rfIdxOf(f)!=='fixo'&&!(f.pluggyInv&&!f.manual)&&rfAportes(f).length),mCdi=(S.metas||[]).some(m=>m.cdi),mIpca=(S.metas||[]).some(m=>m.ipca&&m.alvoEm);
  if(!rfs.length&&!mCdi&&!mIpca)return;
  const usa=new Set(rfs.map(rfIdxOf));if(mCdi)usa.add('cdi');if(mIpca)usa.add('ipca');
  /* v10.87: a caixinha da meta rende desde a base e cada aporte; o alvo com IPCA corrige desde alvoEm */
  const mDt={cdi:(S.metas||[]).filter(m=>m.cdi).flatMap(m=>[m.baseEm].concat((m.aportes||[]).map(a=>a.d))).filter(Boolean),ipca:(S.metas||[]).filter(m=>m.ipca&&m.alvoEm).map(m=>m.alvoEm+'-01')};
  const c=cdiCache();c.sel=c.sel||{};c.ipca=c.ipca||{};c.tr=c.tr||{};c.emX=c.emX||{};const hj=hojeISO();
  const iniDe=ks=>{const ds=rfs.filter(f=>ks.includes(rfIdxOf(f))).flatMap(f=>rfAportes(f).map(a=>a.d)).concat(ks.includes('cdi')?mDt.cdi:[],ks.includes('ipca')?mDt.ipca:[]).sort();return ds[0]||isoDe(new Date(Date.now()-12*864e5));};
  const ultS=Object.keys(c.s).sort().pop()||'';
  let ok=true;const pede=[];
  if(usa.has('cdi')||usa.has('cdimais')){const ini=iniDe(['cdi','cdimais']);
    if(forca||c.em!==hj||!Object.keys(c.s).some(d=>d<=ini)||(cdiPendentes(ultS).length>0&&Date.now()-(c.t||0)>3600e3))pede.push(['s',12,ini]);}
  if(usa.has('selic')){const ini=iniDe(['selic']);if(forca||c.emX.sel!==hj||!Object.keys(c.sel).some(d=>d<=ini))pede.push(['sel',11,ini]);}
  if(usa.has('ipca')){const ini=iniDe(['ipca']).slice(0,7)+'-01';if(forca||c.emX.ipca!==hj||!Object.keys(c.ipca).some(d=>d<=ini.slice(0,7)))pede.push(['ipca',433,isoMais(ini,-400)]);}
  if(usa.has('poup')){if(forca||c.emX.tr!==hj)pede.push(['tr',226,iniDe(['poup'])],['meta',432,isoMais(hj,-60)]);}
  if(pede.length&&navigator.onLine){
    await Promise.all(pede.map(async([k,cod,ini])=>{
      try{const di=new Date(ini+'T12:00:00');di.setDate(di.getDate()-7);const L=await bcbSerie(cod,di);
        if(k==='s'){L.forEach(([d,v])=>{if(v>=0&&v<1)c.s[d]=v;});c.em=hj;c.t=Date.now();}
        else if(k==='sel'){L.forEach(([d,v])=>{if(v>=0&&v<1)c.sel[d]=v;});c.emX.sel=hj;}
        else if(k==='ipca'){L.forEach(([d,v])=>{if(v>-5&&v<10)c.ipca[d.slice(0,7)]=v;});c.emX.ipca=hj;}
        else if(k==='tr'){L.forEach(([d,v])=>{if(v>=0&&v<3)c.tr[d]=v;});c.emX.tr=hj;}
        else if(k==='meta'){const u=L[L.length-1];if(u&&u[1]>0)c.meta=u[1];}
      }catch(e){ok=false;}
    }));
    const lim=new Date();lim.setFullYear(lim.getFullYear()-6);const li=lim.toISOString().slice(0,10);
    const mins=rfs.flatMap(f=>rfAportes(f).map(a=>a.d)).sort()[0]||hj;
    ['s','sel','tr'].forEach(k=>Object.keys(c[k]||{}).forEach(d=>{if(d<li&&d<mins)delete c[k][d];}));
    try{localStorage.setItem(CDI_KEY,JSON.stringify(c));}catch(e){}
    CDI.st=ok?'ok':'erro';if(!ok&&TAB==='fii')setTimeout(render,0);
  }
  const ant=CDI.ult;
  if(rfRecalc(c)){salvar();if(TAB==='fii'||TAB==='dash'||TAB==='pat'||TAB==='inicio')render();}
  else if(TAB==='fii'&&(forca||pede.length||ant!==CDI.ult))render();
}
/* formulário */
function rfForm(f){
  if(!f&&!cabeNoPlano('carteira',(S.fiis||[]).length))return; // v10.161
  const prod0=f?rfProdOf(f):'caixinha',idx0=f?rfIdxOf(f):RF_PROD[prod0].idx[0],A=f?rfAportes(f):[],um=A.length<=1;
  const tx0=f?(idx0==='cdi'?f.pctCdi:f.taxa):'';
  const v0=f?(A.length===1?A[0].p!=null?A[0].p:A[0].v:0):0,d0=f&&A.length===1?(A[0].ir||A[0].d):'';
  form(f?'Editar renda fixa':'Nova renda fixa',[
    {name:'prod',label:'Tipo de investimento',type:'select',value:prod0,options:Object.entries(RF_PROD).map(([k,p])=>({v:k,t:p.l}))},
    {name:'nome',label:'Nome (ex: Caixinha Viagem, CDB Inter)',value:f?f.nome:'',required:true},
    {name:'idx',label:'Como rende',type:'select',value:idx0,options:Object.entries(RF_IDX).map(([k,x])=>({v:k,t:x.l}))},
    {name:'taxa',label:RF_IDX[idx0].tl||'Taxa',value:tx0!==''&&tx0!=null?num(tx0).replace(/,00$/,''):RF_IDX[idx0].def,inputmode:'decimal',placeholder:RF_IDX[idx0].ph||''},
    {name:'aplic',label:'Valor aplicado (R$)',value:um&&v0?num(v0):'',inputmode:'decimal',placeholder:'0,00'},
    {name:'data',label:'Data da aplicação',type:'date',value:d0||hojeISO(),max:hojeISO()},
    {name:'saldo',label:'Saldo de hoje (R$)',value:f&&idx0==='fixo'?num(f.preco*f.cotas):'',inputmode:'decimal',placeholder:'0,00'},
    {name:'pago',label:'Quanto você aplicou no total (R$, opcional)',value:f&&idx0==='fixo'&&f.pago?num(f.pago):'',inputmode:'decimal',placeholder:'0,00'},
    {name:'liq',label:'Resgate',type:'select',value:f?(f.venc&&!f.semVenc?'venc':'diaria'):(RF_PROD[prod0].liq||'diaria'),options:[{v:'diaria',t:'a qualquer momento (liquidez diária)'},{v:'venc',t:'só no vencimento'}]},
    {name:'venc',label:'Vencimento',type:'date',value:f&&f.venc||''}
  ],v=>{
    const P=RF_PROD[v.prod]||RF_PROD.outro,idx=P.idx.includes(v.idx)?v.idx:P.idx[0],nome=String(v.nome||'').trim(),tx=parseBR(v.taxa),apl=parseBR(v.aplic),hj=hojeISO();
    if(!nome)return 'Informe o nome.';
    if(idx==='cdi'&&!(tx>0&&tx<=300))return 'Informe quanto do CDI rende (ex: 100).';
    if(['cdimais','pre','ipca'].includes(idx)&&!(tx>-5&&tx<100))return 'Informe a taxa ao ano.';
    if(idx==='selic'&&!(tx>-5&&tx<20)&&String(v.taxa).trim())return 'Informe a taxa acima da Selic (geralmente 0).';
    const venc=v.liq==='venc'||P.mm||P.car?(ISO_RE.test(v.venc)?v.venc:''):'';
    if(v.liq==='venc'&&!venc)return 'Informe a data de vencimento.';
    const obj={tipo:'rf',prod:v.prod,nome:nome.slice(0,80),ticker:rfCodigo(nome),dpc:0,diaPag:0,
      idx:idx==='fixo'?'':idx,pctCdi:idx==='cdi'?tx:0,taxa:idx==='cdi'?0:(isFinite(tx)?tx:0),semVenc:!venc,venc,cdiBase:null};
    if(idx==='fixo'){
      const sd=parseBR(v.saldo);if(!(sd>=0))return 'Informe o saldo de hoje.';
      const pg=parseBR(v.pago);Object.assign(obj,{cotas:1,preco:c2(sd),pago:pg>0?c2(pg):0,ap:[],aplicEm:ISO_RE.test(v.data)?v.data:''});
    }else if(um||!f){
      if(!(apl>0))return 'Informe o valor aplicado.';
      if(!ISO_RE.test(v.data)||v.data>hj)return 'Informe a data da aplicação (hoje ou antes).';
      obj.ap=[{v:c2(apl),d:v.data,p:c2(apl),ir:v.data}];obj.aplicEm=v.data;obj.cotas=1;obj.pago=c2(apl);
      obj.preco=c2(rfCresce(apl,v.data,idx,tx).v);
    }
    if(f){Object.assign(f,obj);f.manual=true;f.manualEm=hj;}else S.fiis.push(Object.assign({id:uid(),ops:[],realizado:0,proventos:0},obj));
    rfRecalc();salvar();render();toast(idx==='fixo'?'Renda fixa salva':'Salvo. Rende '+rfRotulo(obj)+'.');
    if(idx!=='fixo')atualizaCDI(true);
  });
  const box=$('#modal'),Q=n=>box.querySelector('[name="'+n+'"]'),L=n=>Q(n)&&Q(n).closest('label');
  const dica=document.createElement('p');dica.className='rfDica';L('prod').after(dica);
  if(f&&!um){const p=document.createElement('p');p.className='rfDica';p.textContent='Este investimento tem '+A.length+' aportes. Para mudar valores, use aportar ou resgatar no cartão.';L('data').after(p);}
  const sync=ev=>{
    const prod=Q('prod').value,P=RF_PROD[prod]||RF_PROD.outro,sel=Q('idx');
    [...sel.options].forEach(o=>{o.hidden=!P.idx.includes(o.value);o.disabled=!P.idx.includes(o.value);});
    if(!P.idx.includes(sel.value))sel.value=P.idx[0];
    const idx=sel.value,X=RF_IDX[idx],tl=L('taxa');
    tl.style.display=X.tl?'':'none';if(X.tl){tl.firstChild.nodeValue=X.tl;Q('taxa').placeholder=X.ph||'';if(ev&&ev.target===sel||ev&&ev.target===Q('prod'))Q('taxa').value=X.def||'';}
    L('idx').style.display=P.idx.length>1?'':'none';
    const fixo=idx==='fixo';
    L('aplic').style.display=fixo||!um?'none':'';L('data').style.display=fixo||!um?'none':'';L('data').firstChild.nodeValue=fixo?'Data da aplicação':'Data da aplicação';
    L('saldo').style.display=fixo?'':'none';L('pago').style.display=fixo?'':'none';
    const lq=Q('liq');if(ev&&ev.target===Q('prod')&&P.liq)lq.value=P.liq;if(ev&&ev.target===Q('prod')&&(P.car||P.mm))lq.value='venc';
    L('liq').style.display=P.liq?'none':'';L('venc').style.display=lq.value==='venc'||P.mm?'':'none';
    dica.textContent=RF_DICA[prod]||'';
  };
  ['prod','idx','liq'].forEach(n=>Q(n).addEventListener('change',sync));sync();
}
/* v10.105: aporte e resgate da renda fixa escolhem a conta. Vira transferência (não é gasto nem renda), como compra/venda de cotas.
   Se o banco (Pluggy) já trouxe a mesma movimentação em até 3 dias, ela é reaproveitada em vez de duplicar. */
function rfContaCampo(f,res){
  const ats=bancosAtivos();if(!ats.length)return {name:'conta',type:'hidden',value:''};
  const pr=f.rfConta!=null&&(f.rfConta===''||ats.some(b=>b.id===f.rfConta))?f.rfConta:((S.bancos.find(b=>b.principal)||ats[0]||{}).id||'');
  return {name:'conta',label:res?'Para onde foi o dinheiro':'De onde saiu o dinheiro',type:'select',value:pr,
    options:[{v:'',t:res?'não lançar em nenhuma conta':'não descontar de nenhuma conta'}].concat(ats.map(b=>({v:b.id,t:b.nome})))};
}
function rfLancaConta(f,n,d,conta,res){
  if(!S.cats.includes('Investimentos'))S.cats.push('Investimentos');
  const desc=(res?'Resgate ':'Aporte ')+(f.nome||'renda fixa');
  const ig=S.tx.filter(t=>t.pluggyId&&!t.meta&&!t.emp&&!t.faturaKey&&!t.invRf&&efetivo(t)&&cents(t.valor)===cents(n)&&t.data&&difDias(t.data,d)<=3&&
    (res?((t.tipo==='receita'&&t.conta===conta)||(t.tipo==='transf'&&t.para==='b:'+conta&&!t.de)):((t.tipo==='despesa'&&t.conta===conta)||(t.tipo==='transf'&&t.de==='b:'+conta&&!t.para))))
    .sort((a,b)=>difDias(a.data,d)-difDias(b.data,d))[0];
  if(ig){delete ig.rev;Object.assign(ig,res?{tipo:'transf',de:'',para:'b:'+conta}:{tipo:'transf',de:'b:'+conta,para:''},{categoria:'Investimentos',conta:'',forma:'',cartao:'',invRf:f.id});return ig.id;}
  const t={id:uid(),tipo:'transf',valor:n,categoria:'Investimentos',de:res?'':'b:'+conta,para:res?'b:'+conta:'',forma:'',conta:'',cartao:'',data:d,descricao:desc,invRf:f.id};
  S.tx.push(t);return t.id;
}
function rfMovForm(id,tipo){
  const f=S.fiis.find(x=>x.id===id);if(!f)return;const P=rfPosicao(f),res=tipo==='res';
  form(res?'Resgatar de '+f.nome:'Aportar em '+f.nome,[
    {name:'valor',label:res?'Valor do resgate (R$)':'Valor do aporte (R$)',required:true,inputmode:'decimal',placeholder:'0,00'},
    {name:'data',label:'Data',type:'date',value:hojeISO(),max:hojeISO()},
    rfContaCampo(f,res)
  ],v=>{
    const val=parseBR(v.valor),d=ISO_RE.test(v.data)&&v.data<=hojeISO()?v.data:hojeISO();
    if(!(val>0))return 'Informe o valor.';
    const conta=v.conta&&S.bancos.some(b=>b.id===v.conta)?v.conta:'';
    f.ap=rfAportes(f).map(a=>Object.assign({},a));
    if(!res){f.ap.push({v:c2(val),d,p:c2(val),ir:d});}
    else{
      if(val>P.bruto+0.005)return 'O resgate passa do saldo bruto ('+brl(P.bruto)+').';
      let falta=val;const idx=rfIdxOf(f),tx=rfTaxaOf(f);f.ap.sort((a,b)=>(a.ir||a.d)<(b.ir||b.d)?-1:1);
      f.ap.forEach(a=>{if(falta<=0)return;const g=rfCresce(a.v,a.d,idx,tx,d).v;if(g<=0)return;const tira=Math.min(falta,g),fr=1-tira/g;a.v=c2(a.v*fr);a.p=c2((a.p!=null?a.p:a.v)*fr);falta-=tira;});
      f.ap=f.ap.filter(a=>a.v>0.004);
    }
    f.rfConta=conta;if(conta)rfLancaConta(f,c2(val),d,conta,res);
    f.manual=true;f.manualEm=hojeISO();rfRecalc();salvar();render();toast((res?'Resgate registrado':'Aporte registrado')+(conta?(res?' e somado em ':' e descontado de ')+((S.bancos.find(b=>b.id===conta)||{}).nome||'conta'):''));
  });
  if(res&&P.liq!=null){const p=document.createElement('p');p.className='rfDica';p.textContent='Saldo bruto '+brl(P.bruto)+'. Se resgatar tudo hoje, cai na conta cerca de '+brl(P.liq)+(P.ir?' (IR '+brl(P.ir)+')':'')+(P.iof?' (IOF '+brl(P.iof)+')':'')+'.';$('#modal [name="valor"]').closest('label').after(p);}
}
/* cartão da renda fixa na carteira */
function rfCardInfo(f,posi){
  const P=RF_PROD[rfProdOf(f)]||RF_PROD.outro,idx=rfIdxOf(f),X=rfPosicao(f),meta=[];let info='';
  if(f.pago>0)meta.push(['aplicado',brl(f.pago)]);
  meta.push(['rende',rfRotulo(f)]);
  if(idx!=='fixo'&&rfAportes(f).length&&!(f.pluggyInv&&!f.manual)){
    const an=rfAnual(f),mes=posi*(Math.pow(1+an/100,1/12)-1);
    if(mes>0)meta.push(['por mês','≈ '+brl(mes*(1-(P.ir?(X.aliq||15)/100:0)))+(P.ir?' líq.':'')]);
    if(X.liq!=null&&X.liq<posi-0.004)meta.push(['se resgatar hoje',brl(X.liq)]);
    if(f.venc&&!f.semVenc){const dv=diasEntre(hojeISO(),f.venc);if(dv>0){
      const fim=rfAportes(f).reduce((s,a)=>s+rfCresce(a.v,a.d,idx,rfTaxaOf(f),hojeISO()).v,0)*Math.pow(1+an/100,dv/365);
      const g=fim-f.pago,irv=P.ir?Math.max(0,g)*IR_RF(diasEntre(rfAportes(f)[0].ir||rfAportes(f)[0].d,f.venc))/100:0;
      meta.push(['no vencimento','≈ '+brl(fim-irv)+(P.ir?' líq.':'')]);}}
  }
  meta.push(['resgate',f.venc&&!f.semVenc?(diasEntre(hojeISO(),f.venc)<=0?'venceu '+fmtData(f.venc):'vence '+fmtData(f.venc)):'diário']);
  const chips=[];
  const st=rfStatusHoje(f);if(st)chips.push(['dia',st,/não rende/.test(st)?'off':'on']);
  chips.push(['ir',P.ir?(X.aliq?'IR '+num(X.aliq).replace(/,00$/,'').replace(/(,\d)0$/,'$1')+'%'+(X.dias!=null&&X.aliq>15?' até '+fmtData(isoMais(hojeISO(),({22.5:180,20:360,17.5:720})[X.aliq]-X.dias+1)).slice(0,5):''):'IR regressivo'):'isento de IR','']);
  if(P.cust)chips.push(['b3',P.isen?'taxa B3 só acima de R$ 10 mil':'taxa B3 0,20% a.a.','']);
  chips.push(['g',P.g==='fgc'?'FGC até R$ 250 mil':P.g==='tn'?'garantia do Tesouro':'sem FGC',P.g?'':'warn']);
  if(idx==='fixo')info=(f.manual?'saldo atualizado por você':f.bancoData?'saldo do banco em '+fmtData(f.bancoData):'valor digitado manualmente')+' · edite para o app calcular o rendimento';
  else if(f.pluggyInv&&!f.manual)info=f.bancoData?'saldo do banco em '+fmtData(f.bancoData):'saldo do banco';
  else{const c=cdiCache(),k=Object.keys(idx==='selic'?(c.sel||{}):c.s||{}).sort().pop();
    info=(['cdi','cdimais'].includes(idx)&&CDI.taxa?'CDI '+num(cdiAnual(CDI.taxa))+'% a.a.':idx==='selic'&&k?'Selic '+num(cdiAnual(c.sel[k]))+'% a.a.':idx==='poup'?'poupança: '+num(poupTaxaMes(c,hojeISO())*100)+'% ao mês':idx==='ipca'?'inflação dos últimos 12 meses no cálculo':'taxa travada')+(X.est?' · últimos dias estimados até o Banco Central publicar':'')+(CDI.st==='erro'?' · sem conexão com o Banco Central':'')+(P.mm?' · valor na curva, o preço de mercado varia':'');}
  return {meta,info,chips,tag:P.c};
}

function fiiForm(id,tipoPre){
  const f=id?S.fiis.find(x=>x.id===id):null;
  if(!f&&!cabeNoPlano('carteira',(S.fiis||[]).length))return; // v10.161: Grátis até 5 ativos na carteira
  if((f&&tipoOf(f)==='rf')||(!f&&tipoPre==='rf'))return rfForm(f);
  form(f?'Editar ativo':'Novo ativo',[
    {name:'tipo',label:'Tipo de ativo',type:'select',value:f?tipoOf(f):(tipoPre||'fii'),options:TIPOS.slice(1).map(x=>({v:x.k,t:x.l}))},
    {name:'ticker',label:'Ticker (ex: HGLG11)',value:f?f.ticker:'',required:true,placeholder:'HGLG11'},
    {name:'pago',label:'Valor total investido (R$)',value:f&&f.pago?num(f.pago):'',inputmode:'decimal',placeholder:'0,00'},
    {name:'cotas',label:'Quantidade',value:f?num(f.cotas):'',required:true,inputmode:'decimal',placeholder:'0'},
    {name:'preco',label:'Preço por cota (R$)',value:f?num(f.preco):'',inputmode:'decimal',placeholder:'0,00'},
    {name:'dpc',label:'Dividendo por cota (R$)',value:f?num(f.dpc):'',inputmode:'decimal',placeholder:'0,00'},
    {name:'diaPag',label:'Dia do pagamento no mês (1 a 31)',type:'number',min:1,max:31,value:f&&f.diaPag?f.diaPag:''}
  ],v=>{
    const ticker=String(v.ticker).trim().toUpperCase();
    if(!ticker)return 'Informe o ticker.';
    const tp=v.tipo||'fii';
    const cotas=parseBR(v.cotas),preco=parseBR(v.preco),dpc=parseBR(v.dpc),diaPag=parseInt(v.diaPag,10)||0;
    if(cotas<0||preco<0||dpc<0)return 'Valores não podem ser negativos.';
    if(tp==='cripto'){
      const cg=CRIPTO_LIST.find(x=>x.t===ticker);
      if(!cg)return 'Escolha uma cripto da lista.';
      const pago=parseBR(v.pago);
      if(!(cotas>0))return 'Informe a quantidade.';
      if(!(pago>0))return 'Informe o valor pago.';
      const pr=cgCache().p[cg.id]||preco;
      if(!(pr>0))return 'Sem cotação agora: digite o preço atual.';
      const temOps=f&&f.ops&&f.ops.length;
      const obj={tipo:'cripto',ticker,nome:cg.n,cgId:cg.id,cotas:temOps?f.cotas:cotas,pago:temOps?f.pago:pago,preco:pr,dpc:0,diaPag:0};
      if(f)Object.assign(f,obj);else S.fiis.push(Object.assign({id:uid()},obj));
    }else{
      if(diaPag&&(diaPag<1||diaPag>31))return 'Dia de pagamento entre 1 e 31.';
      const b=B3_LIST.find(x=>x.t===ticker);
      const pago=parseBR(v.pago);if(pago<0)return 'Valor investido não pode ser negativo.';
      if(!(cotas>0))return 'Informe a quantidade.';
      const temOps=f&&f.ops&&f.ops.length;
      const obj={tipo:tp,ticker,nome:b?b.n:(f&&f.nome)||'',cotas:temOps?f.cotas:cotas,preco,dpc,diaPag,pago:temOps?f.pago:pago,cotEm:(f&&f.preco===preco)?f.cotEm:'',cotFonte:(f&&f.preco===preco)?f.cotFonte:'manual'};
      if(f)Object.assign(f,obj);else S.fiis.push(Object.assign({id:uid()},obj));
      /* v10.70: ação/FII/ETF/BDR salvo já busca a cotação da B3 na hora (o preço digitado vale só se a cotação falhar) */
      if(tp!=='cripto'&&tp!=='rf'){localStorage.removeItem('gv-cot-ts');setTimeout(()=>atualizaCotacoes(true),50);}
    }
    salvar();render();toast('Ativo salvo');
  });
  const mf=$('#mf'),selT=mf.querySelector('select[name="tipo"]'),inpT=mf.querySelector('input[name="ticker"]');
  const lab=n=>mf.querySelector('[name="'+n+'"]').closest('label');
  if(f&&f.ops&&f.ops.length){['cotas','pago'].forEach(n=>{const i=mf.querySelector('[name="'+n+'"]');i.readOnly=true;i.title='calculado pelo histórico de operações';lab(n).insertAdjacentHTML('beforeend','<small class="cotInfo">calculado pelo histórico</small>');});}
  const lPreco=lab('preco'),lDpc=lab('dpc'),lDia=lab('diaPag'),lPago=lab('pago'),lTick=lab('ticker'),lCot=lab('cotas');
  const nomeEl=document.createElement('small');nomeEl.className='acNome';
  const box=document.createElement('div');box.className='acList';
  const calcEl=document.createElement('div');calcEl.className='card mini';calcEl.style.margin='0 0 12px';
  inpT.closest('label').after(box);box.after(nomeEl);nomeEl.after(calcEl);
  let precoOff=false;
  const base=()=>selT.value==='cripto'?CRIPTO_LIST:B3_LIST.filter(x=>x.tipo===selT.value);
  const achaItem=t=>base().find(x=>x.t===String(t).trim().toUpperCase());
  const lista=()=>{
    const q=inpT.value.trim().toUpperCase();
    const hits=q?base().filter(x=>x.t.includes(q)||x.n.toUpperCase().includes(q)).slice(0,8):[];
    box.innerHTML=hits.map(x=>'<button type="button" class="acItem" data-t="'+x.t+'"><span class="acL">'+assetIco(x.t,x.tipo)+'<b>'+x.t+'</b></span><small>'+esc(x.n)+'</small></button>').join('');
  };
  const ajusta=()=>{
    const cri=selT.value==='cripto';
    lPago.style.display='';
    lPago.firstChild.textContent=cri?'Valor pago (R$)':'Valor total investido (R$), opcional, para ver lucro e preço médio';
    lDpc.style.display=cri?'none':'';
    lDia.style.display=cri?'none':'';
    lPreco.style.display=cri?(precoOff?'':'none'):'';
    lPreco.firstChild.textContent=cri?'Preço atual (R$), só se a cotação não carregar':'Preço por cota (R$), atualiza sozinho pela B3';
    inpT.placeholder=cri?'BTC':'HGLG11';
    lTick.firstChild.textContent=cri?'Cripto (ex: BTC)':'Ticker (ex: HGLG11)';
    lCot.firstChild.textContent=cri?'Quantidade de moedas':'Quantidade';
    calc();
  };
  /* v10.70: ao digitar o ticker de um ativo da B3, já preenche o preço com a cotação de agora */
  let cotSeq=0;
  const buscaCot=async()=>{
    const tk=String(inpT.value||'').toUpperCase().trim();
    if(selT.value==='cripto'||selT.value==='rf'||!/^[A-Z0-9]{4,7}$/.test(tk)||!sb)return;
    const seq=++cotSeq,inpP=mf.querySelector('[name="preco"]');
    try{const {data:o}=await sb.functions.invoke('cotacoes',{body:{tickers:[tk]}});
      if(seq!==cotSeq||!o||!o.q||!o.q[tk])return;const q=o.q[tk];
      if(inpP&&q.p>0){inpP.value=num(Math.round(q.p*100)/100);let ci=lPreco.querySelector('.cotInfo');if(!ci){ci=document.createElement('small');ci.className='cotInfo';lPreco.appendChild(ci);}ci.textContent='cotação de '+fmtHora(q.t||new Date().toISOString())+(q.nome?' · '+q.nome:'');}
    }catch(e){}
  };
  inpT.addEventListener('change',buscaCot);inpT.addEventListener('blur',buscaCot);
  const calc=()=>{
    if(selT.value!=='cripto'){calcEl.style.display='none';return;}
    calcEl.style.display='';
    const cg=achaItem(inpT.value);
    const q=parseBR(mf.querySelector('[name="cotas"]').value),pago=parseBR(mf.querySelector('[name="pago"]').value);
    let pr=cg?(cgCache().p[cg.id]||0):0;
    if(!(pr>0))pr=parseBR(mf.querySelector('[name="preco"]').value);
    if(!cg||!(q>0)||!(pago>0)||!(pr>0)){calcEl.innerHTML='<small>preencha cripto, quantidade e valor pago para ver o lucro/prejuízo</small>';return;}
    const atual=q*pr,pl=atual-pago,plp=pago?pl/pago*100:0;
    calcEl.innerHTML='<small>custo '+brl(pago)+' · valor atual '+brl(atual)+' (cota R$ '+num(pr)+')</small><b class="'+(pl>=0?'pos':'neg')+'">'+(pl>=0?'+':'')+brl(pl)+' ('+num(plp)+'%)</b>';
  };
  mf.addEventListener('input',calc);
  /* quantidade automática = valor pago / cotação atual (respeita edição manual) */
  const cotInp=mf.querySelector('[name="cotas"]'),pagoInp=mf.querySelector('[name="pago"]');
  let cotManual=!!(f&&f.cotas);
  cotInp.addEventListener('input',()=>{cotManual=cotInp.value.trim()!=='';});
  const cotaAtual=()=>{const cg=achaItem(inpT.value);return cg?(cgCache().p[cg.id]||0):0;};
  const autoCotas=()=>{
    if(selT.value!=='cripto'||cotManual)return;
    const pr=cotaAtual(),pago=parseBR(pagoInp.value);
    if(!(pr>0)||!(pago>0))return;
    cotInp.value=(pago/pr).toLocaleString('pt-BR',{maximumFractionDigits:8});
  };
  pagoInp.addEventListener('input',autoCotas);
  const pick=async it=>{
    inpT.value=it.t;box.innerHTML='';
    nomeEl.textContent=it.n;calc();
    if(selT.value==='cripto'){
      const p=await cgPrecos([it.id],false);
      precoOff=!(p[it.id]>0);
      if(!precoOff)nomeEl.textContent=it.n+' · cotação atual R$ '+num(p[it.id]);
      calc();
    }else{
      try{
        const r=await fetch('https://brapi.dev/api/quote/'+it.t);
        const j=await r.json();
        const pr=j.results&&j.results[0]&&j.results[0].regularMarketPrice;
        const pe=mf.querySelector('[name="preco"]');
        if(pr>0&&!parseBR(pe.value))pe.value=num(pr);
      }catch(e){}
    }
    ajusta();
  };
  box.addEventListener('click',e=>{const b=e.target.closest('.acItem');if(!b)return;const it=achaItem(b.dataset.t);if(it)pick(it);});
  inpT.addEventListener('input',lista);
  inpT.addEventListener('change',()=>{const it=achaItem(inpT.value);if(it&&(selT.value!=='cripto'||!(cgCache().p[it.id]>0)))pick(it);});
  selT.addEventListener('change',()=>{if(selT.value==='rf'&&!f){closeModal();setTimeout(()=>rfForm(null),30);}});
  selT.addEventListener('change',()=>{precoOff=false;inpT.value='';nomeEl.textContent='';box.innerHTML='';ajusta();});
  if(f)nomeEl.textContent=f.nome||'';
  ajusta();
  if(selT.value==='cripto'&&!f)cgPrecos(CRIPTO_LIST.map(x=>x.id),false).then(()=>calc());
}

/* ---------- v10.59: metas que rendem pelo CDI ----------
   taxa mensal = (1 + CDI ao ano × %)^(1/12) − 1, com o CDI mais recente do Banco Central. */
function cdiAnoAtual(){if(!CDI.taxa){const c=cdiCache(),d=Object.keys(c.s).sort().pop();if(d){CDI.ult=d;CDI.taxa=c.s[d];}}return CDI.taxa?cdiAnual(CDI.taxa):0;}
function taxaMesMeta(m){if(!m.cdi)return 0;const a=cdiAnoAtual();if(!a)return 0;return Math.pow(1+a/100*((m.pctCdi||100)/100),1/12)-1;}
/* quanto guardar por mês para ir de 'at' a 'alvo' em n meses rendendo r ao mês (aporte no fim do mês) */
function pmtMeta(at,alvo,n,r){if(n<=0)return Math.max(0,alvo-at);if(!r)return Math.max(0,(alvo-at)/n);const g=Math.pow(1+r,n);return Math.max(0,(alvo-at*g)*r/(g-1));}
/* em quantos meses chega guardando 'pm' por mês */
function mesesMeta(at,alvo,pm,r){if(at>=alvo)return 0;if(!r)return pm>0?Math.ceil((alvo-at)/pm-1e-9):Infinity;
  if(pm<=0&&at<=0)return Infinity;const n=Math.log((alvo*r+pm)/(at*r+pm))/Math.log(1+r);return isFinite(n)&&n>0?Math.ceil(n-1e-9):Infinity;}
/* ===== v10.87: metas como cofre =====
   Uma meta junta dinheiro de várias fontes:
   - caixinha da meta (m.atual, com m.cdi/m.pctCdi): o que já existia. m.atual continua sendo o principal guardado,
     então aparelhos antigos e metas antigas mostram exatamente o mesmo valor;
   - ativos de Investimentos (m.ativos: {fid,pct,desde,reinv}): a meta "é dona" de pct% do valor de mercado do ativo.
     A soma do mesmo ativo entre todas as metas nunca passa de 100%;
   - ativos a comprar (m.planos: {id,tipo,nome,valor}): planejados, ainda sem posição (não somam no saldo).
   Saldo = caixinha (+ rendimento do CDI das partes com data) + Σ(valor de mercado × pct) + proventos reinvestidos.
   Alvo: valor fixo, fixo corrigido pelo IPCA (SGS 433) ou um veículo da tabela FIPE (m.fipe, guarda o último valor).
   Aporte ("guardei"): vira histórico (m.aportes) e, quando sai de uma conta, um lançamento tipo transf (t.meta) que
   tira o dinheiro do saldo livre sem virar despesa nem orçamento. Um Pix do banco igual (Pluggy) é ligado, não duplicado. */
const MT_VOL={BTC:.55,ETH:.7,SOL:.9,XRP:.85,BNB:.65,ADA:.85,DOGE:1,LINK:.9,USDT:.03,USDC:.03}; // volatilidade anual de referência (aprox. histórica)
const MT_COR={caixa:'#22c55e',rf:'#0ea5e9',fii:'#a78bfa',acao:'#f59e0b',cripto:'#f97316',plano:'#94a3b8'};
const MT_GL={caixa:'caixinha',rf:'renda fixa',fii:'FII',acao:'ações',cripto:'cripto',plano:'a comprar'};
/* v10.98: nome legível. Na renda fixa o ticker é um código interno de até 12 letras (sanea), gerado do nome:
   "Caixinha Nubank" virava "CAIXINHANUBA" e a folha Fontes mostrava o código. Agora a renda fixa mostra o nome;
   sem nome (ou nome todo junto em maiúsculas, como vem de banco), separa as palavras conhecidas e completa o banco. */
const NM_SIGLA=/^(CDB|RDB|LCI|LCA|LC|CRI|CRA|CDI|IPCA|SELIC|XP|BTG|BB|C6|FII|ETF|BDR|IR|IOF|FGC)$/;
const NM_BANCOS=['Nubank','Inter','Itaú','Bradesco','Santander','Caixa','PicPay','PagBank','Mercado Pago','C6 Bank','BTG Pactual','XP','Neon','Sicredi','Sicoob','Banco do Brasil','Next','Original','Sofisa','Daycoval','Agibank','Rico','Genial','Will Bank','Banrisul','Safra','Stone','Cora','Digio','BMG','BV'];
const NM_PROD=['Caixinha','Caixinhas','Cofrinho','Porquinho','Tesouro','Poupança','Reserva','Turbo','Selic','Prefixado','IPCA','Renda Fixa','Conta','Rendimento','Investimento','Emergência','Viagem','CDB','RDB','LCI','LCA','CRI','CRA'];
function nmTitulo(s){return String(s).toLowerCase().split(/(\s+)/).map((w,i)=>{if(!w.trim())return w;const u=w.toUpperCase();if(NM_SIGLA.test(u.replace(/[^A-Z0-9]/g,'')))return u;if(i>0&&/^(de|da|do|das|dos|e|para)$/.test(w))return w;return w.charAt(0).toUpperCase()+w.slice(1);}).join('');}
function nmDescola(t){
  const sem=x=>norm(x).toUpperCase().replace(/[^A-Z0-9]/g,'');let r=sem(t);const out=[];
  const W=NM_PROD.concat(NM_BANCOS).map(x=>[x,sem(x)]).sort((a,b)=>b[1].length-a[1].length);
  for(let g=0;r&&g<8;g++){
    const p=W.find(([x,k])=>k.length>=2&&r.startsWith(k));if(p){out.push(p[0]);r=r.slice(p[1].length);continue;}
    const b=r.length>=3&&NM_BANCOS.find(x=>sem(x).startsWith(r));if(b){out.push(b);r='';break;}
    out.push(nmTitulo(r));r='';}
  return out.join(' ');}
function nomeAtivo(f){if(!f)return 'ativo';
  if(tipoOf(f)==='rf'){let n=String(f.nome||'').trim();
    if(!n)n=nmDescola(f.ticker||'');
    else if(!/\s/.test(n)&&n.length>6&&n===n.toUpperCase())n=nmDescola(n);
    else if(n===n.toUpperCase()&&/[A-Z]{3}/.test(n))n=nmTitulo(n);
    return n||'Renda fixa';}
  return f.ticker||f.nome||'ativo';}
function ativoBanco(f){if(tipoOf(f)!=='rf')return null;try{return bancoDoCartao({banco:'',nome:nomeAtivo(f)+' '+String(f.nome||'')});}catch(e){return null;}}
function rfTaxaTxt(f){const n=x=>String(c2(+x||0)).replace('.',',');try{const i=rfIdxOf(f);
  if(i==='cdi')return n(f.pctCdi||100)+'% do CDI';if(i==='cdimais')return 'CDI + '+n(f.taxa)+'% a.a.';if(i==='pre')return n(f.taxa)+'% a.a.';
  if(i==='ipca')return 'IPCA + '+n(f.taxa)+'%';if(i==='selic')return 'Selic'+(+f.taxa?' + '+n(f.taxa)+'%':'');if(i==='poup')return 'poupança';}catch(e){}return '';}
function mtGrupo(f){const t=typeof f==='string'?f:tipoOf(f);return t==='rf'?'rf':t==='cripto'?'cripto':t==='fii'?'fii':'acao';}
function mtProFontes(){return pode('investimentos');}
function mtAtivos(m){return (m.ativos||[]).map(a=>({a,f:S.fiis.find(x=>x.id===a.fid)})).filter(x=>x.f&&x.a.pct>0);}
/* quanto do ativo já está em metas (opcional: sem contar uma meta) */
function mtAlocado(fid,exceto){return (S.metas||[]).reduce((s,m)=>m.id===exceto?s:s+(m.ativos||[]).filter(a=>a.fid===fid).reduce((q,a)=>q+(+a.pct||0),0),0);}
function mtValorAtivo(f){return (+f.cotas||0)*(+f.preco||0);}
function mtCusto(f){const v=mtValorAtivo(f);return f.pago>0?+f.pago:v;}
function mtProventos(f,desde){return (f.ops||[]).filter(o=>o.tipo==='provento'&&o.data&&(!desde||o.data>=desde)).reduce((s,o)=>s+(+o.valor||0),0);}
/* caixinha: principal (m.atual) e o rendimento do CDI das partes com data (base desde m.baseEm, cada aporte desde o seu dia).
   meta antiga sem baseEm e sem aportes: rendimento 0, igual a antes. */
function mtCaixa(m){
  const pri=Math.max(0,+m.atual||0);if(!m.cdi||!pri)return {pri,rend:0,base:pri,partes:[]};
  const ap=(m.aportes||[]).slice(Math.max(0,m.baseN|0)).filter(a=>a.fonte==='manual'&&a.v>0&&a.d);
  const soma=ap.reduce((s,a)=>s+a.v,0),base=Math.max(0,pri-soma),pc=+m.pctCdi||100,hj=hojeISO();
  const partes=[];if(base>0)partes.push({v:base,d:m.baseEm||''});ap.forEach(a=>partes.push({v:a.v,d:a.d}));
  let rend=0;partes.forEach(p=>{if(!p.d||p.d>=hj)return;const r=rfCresce(p.v,p.d,'cdi',pc,hj);rend+=Math.max(0,r.v-p.v);});
  return {pri,rend:c2(rend),base,partes};
}
function mtSaldoD(m){
  const cx=mtCaixa(m);let ativos=0,custo=0,rfG=0,varG=0,prov=0,cripto=0;
  mtAtivos(m).forEach(({a,f})=>{const k=a.pct/100,v=mtValorAtivo(f)*k,c=mtCusto(f)*k,g=mtGrupo(f);
    ativos+=v;custo+=c;if(g==='rf')rfG+=v-c;else varG+=v-c;if(g==='cripto')cripto+=v;
    if(a.reinv&&(g==='fii'||g==='acao'))prov+=mtProventos(f,a.desde)*k;});
  const total=c2(cx.pri+cx.rend+ativos+prov);
  return {total,caixa:c2(cx.pri+cx.rend),cx,ativos:c2(ativos),voce:c2(cx.pri+custo),cdi:c2(cx.rend+rfG),prov:c2(prov),varia:c2(varG),cripto:c2(cripto)};
}
function saldoMeta(m){return mtSaldoD(m).total;}
/* alvo: FIPE (último valor salvo), fixo corrigido pelo IPCA (meses publicados desde alvoEm) ou fixo */
function mtIpcaFator(desde){const I=(cdiCache().ipca)||{};let f=1;Object.keys(I).sort().forEach(k=>{if(k>=desde)f*=1+I[k]/100;});return f;}
function alvoMeta(m){
  if(m.fipe&&m.fipe.v>0)return +m.fipe.v;
  if(m.ipca&&m.alvoBase>0&&m.alvoEm)return c2(m.alvoBase*mtIpcaFator(m.alvoEm));
  return +m.alvo||0;
}
/* tem algo do modelo novo? (meta antiga continua no cálculo antigo, idêntico) */
function mtNova(m){return !!((m.ativos&&m.ativos.length)||(m.planos&&m.planos.length)||m.fipe||m.ipca||(m.aportes&&m.aportes.length)||m.baseEm);}
/* dinheiro que saiu das contas para metas (lançamentos t.meta) e ainda está lá, com o rendimento proporcional */
function mtReservado(){
  let s=0;(S.metas||[]).forEach(m=>{const tx=S.tx.filter(t=>t.meta===m.id&&t.tipo==='transf'&&efetivo(t));if(!tx.length)return;
    const v=tx.reduce((a,t)=>a+cents(t.valor),0)/100,cx=mtCaixa(m),fr=cx.pri>0?Math.min(1,v/cx.pri):0;s+=Math.min(v,cx.pri)+cx.rend*fr;});
  return c2(s);
}
/* sequência de meses cumpridos (Σ aportes no mês ≥ aporte do mês, ou algum aporte quando não há valor definido) */
function mtStreak(m){
  const ap=(m.aportes||[]).filter(a=>a.v>0&&a.d);if(!ap.length)return {n:0,mesOk:false};
  const por={};ap.forEach(a=>{const k=a.d.slice(0,7);por[k]=(por[k]||0)+cents(a.v);});
  const ok=k=>(por[k]||0)>0&&(!(m.aporteMes>0)||por[k]>=cents(m.aporteMes));
  const ini=Object.keys(por).sort()[0];let k=mesAtual(),n=0;const mesOk=ok(k);if(!mesOk)k=mesAdd(k,-1);
  while(k>=ini&&ok(k)){n++;k=mesAdd(k,-1);}
  return {n,mesOk};
}
/* dia sugerido: o da maior receita fixa (salário), senão 5 */
function mtDiaSugerido(){const r=(S.fixas||[]).filter(f=>f.tipo==='receita'&&f.freq==='mensal').sort((a,b)=>b.valor-a.valor)[0];return r?r.dia:5;}
/* ---------- previsão ----------
   mês a mês, aporte no fim do mês. Componentes:
   caixinha: CDI × % (IR regressivo sobre o ganho de cada parte pela idade); renda fixa: taxa anual do produto (IR se o produto tem);
   FII/ações: preço parado, proventos pelo DY médio (dpc/preço) reinvestidos quando "reinv" (isentos); cripto: 0% esperado,
   com faixa de ±1 desvio pela volatilidade anual. Linha "só aportes" = saldo de hoje + aportes. */
function mtTaxaRF(f){const a=rfIdxOf(f)==='fixo'?0:rfAnual(f);const t=a>0?a:cdiAnoAtual();return t>0?Math.pow(1+t/100,1/12)-1:0;}
function mtComp(m){
  const cx=mtCaixa(m),hj=hojeISO(),C=[];
  const rC=taxaMesMeta(m);
  if(cx.pri>0||!mtAtivos(m).length){
    if(cx.partes.length&&m.cdi)cx.partes.forEach((p,i)=>{const rd=p.d&&p.d<hj?rfCresce(p.v,p.d,'cdi',+m.pctCdi||100,hj).v:p.v;C.push({id:'manual',v:rd,pri:p.v,r:rC,ir:true,d0:p.d?Math.max(0,diasEntre(p.d,hj)):0,g:'caixa'});});
    else C.push({id:'manual',v:cx.pri,pri:cx.pri,r:rC,ir:!!m.cdi,d0:0,g:'caixa'});
  }
  mtAtivos(m).forEach(({a,f})=>{const k=a.pct/100,g=mtGrupo(f),v=mtValorAtivo(f)*k,P=RF_PROD[rfProdOf(f)]||{};
    if(g==='rf')C.push({id:f.id,v,pri:mtCusto(f)*k,r:mtTaxaRF(f),ir:!!P.ir,d0:f.aplicEm?Math.max(0,diasEntre(f.aplicEm,hj)):0,g});
    else if(g==='cripto')C.push({id:f.id,v,pri:v,r:0,ir:false,d0:0,g,vol:MT_VOL[String(f.ticker||'').toUpperCase()]||.85});
    else{const y=f.preco>0&&f.dpc>0?f.dpc/f.preco:0;C.push({id:f.id,v,pri:v,r:a.reinv?y:0,ir:false,d0:0,g});}
  });
  return C;
}
function mtIR(c,vk,dias){if(!c.ir)return vk;const g=vk-c.pri;return g>0?vk-g*IR_RF(dias)/100:vk;}
function mtProj(m,extra,N){
  const C=mtComp(m),P=Math.max(0,(+m.aporteMes||0)+(+extra||0)),alvo=alvoMeta(m);
  const dest=C.find(c=>c.id===(m.apDest||'manual'))||C.find(c=>c.id==='manual')||{r:taxaMesMeta(m),ir:!!m.cdi};
  const SD0=mtSaldoD(m),S0=SD0.total,provHoje=SD0.prov;N=N||600;
  const L1=[S0],L2=[S0],lo=[S0],hi=[S0];let k0=S0>=alvo&&alvo>0?0:-1;
  for(let k=1;k<=N;k++){
    let t=0,cU=0,cD=0;
    C.forEach(c=>{const vk=c.v*Math.pow(1+c.r,k);t+=mtIR(c,vk,c.d0+Math.round(k*30.4375));
      if(c.vol){const s=c.vol*Math.sqrt(k/12);cU+=c.v*(Math.exp(s)-1);cD+=c.v*(1-Math.exp(-s));}});
    for(let j=1;j<=k;j++){const vk=P*Math.pow(1+(dest.r||0),k-j);t+=dest.ir?mtIR({ir:1,pri:P},vk,Math.round((k-j)*30.4375)):vk;}
    t+=provHoje; // proventos reinvestidos já recebidos: entram parados
    L1.push(S0+P*k);L2.push(t);lo.push(t-cD);hi.push(t+cU);
    if(k0<0&&alvo>0&&t>=alvo-0.005)k0=k;
    if(k0>=0&&k>=Math.max(k0+2,12)&&!(m.prazo&&k<mesesAte(m.prazo)+1))break;
  }
  return {L1,L2,lo,hi,k:k0,P,alvo,S0};
}
/* quando chega (mês YYYY-MM) ou '' */
function mtChega(m,extra){const p=mtProj(m,extra);return p.k>=0?mesAdd(mesAtual(),p.k):'';}
function mtMesTxt(ym){return ym?MESES[+ym.slice(5,7)-1]+'/'+ym.slice(0,4):'';}
/* cripto acima do limite com o prazo (ou a chegada prevista) a menos de 12 meses */
function mtRisco(m){
  const D=mtSaldoD(m);if(!(D.total>0)||!(D.cripto>0))return null;
  const lim=(m.cripMax>0?m.cripMax:20),pc=D.cripto/D.total*100;if(pc<=lim+0.05)return null;
  const ch=m.prazo||mtChega(m),n=ch?mesesAte(ch):99;
  return {pc,lim,n,mover:c2(D.cripto-D.total*lim/100),perto:n<=12};
}
/* ---------- FIPE (parallelum v2, v1 como reserva) ---------- */
const FIPE_V2='https://fipe.parallelum.com.br/api/v2/',FIPE_V1='https://parallelum.com.br/fipe/api/v1/';
const FIPE_TP={cars:['Carro','carros'],motorcycles:['Moto','motos'],trucks:['Caminhão','caminhoes']};
const FIPE_MEM={};
async function fipeJson(url){const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),9000);
  try{const r=await fetch(url,{signal:ctl.signal});if(!r.ok)throw new Error('http '+r.status);const j=await r.json();if(j&&j.error)throw new Error(String(j.error));return j;}finally{clearTimeout(to);}}
/* lista de marcas, modelos ou anos: [{c,n}] */
async function fipeLista(tp,marca,modelo){
  const k=[tp,marca||'',modelo||''].join('|');if(FIPE_MEM[k])return FIPE_MEM[k];
  const v1=FIPE_TP[tp][1],nr=L=>(Array.isArray(L)?L:[]).map(x=>({c:String(x.code!=null?x.code:x.codigo).replace(/[^\w.-]/g,'').slice(0,20),n:String(x.name!=null?x.name:x.nome).slice(0,90)})).filter(x=>x.c&&x.n);
  let L;
  try{L=await fipeJson(FIPE_V2+tp+'/brands'+(marca?'/'+marca+'/models'+(modelo?'/'+modelo+'/years':''):''));}
  catch(e){const j=await fipeJson(FIPE_V1+v1+'/marcas'+(marca?'/'+marca+'/modelos'+(modelo?'/'+modelo+'/anos':''):''));L=marca&&!modelo?j.modelos:j;}
  return FIPE_MEM[k]=nr(L);
}
async function fipePreco(fp){
  let j,v,ref,cod;
  try{j=await fipeJson(FIPE_V2+fp.tp+'/brands/'+fp.b.c+'/models/'+fp.mo.c+'/years/'+fp.a.c);v=numExt(j.price);ref=j.referenceMonth;cod=j.codeFipe;}
  catch(e){j=await fipeJson(FIPE_V1+FIPE_TP[fp.tp][1]+'/marcas/'+fp.b.c+'/modelos/'+fp.mo.c+'/anos/'+fp.a.c);v=numExt(j.Valor);ref=j.MesReferencia;cod=j.CodigoFipe;}
  if(!(v>0))throw new Error('sem preço');
  return {v:c2(v),ref:String(ref||'').slice(0,30),cod:String(cod||'').replace(/[^\d-]/g,'').slice(0,12)};
}
/* atualiza o valor das metas FIPE no máximo uma vez por dia; falhou = continua com o último valor salvo */
let FIPE_RODANDO=false;
async function fipeAtualiza(forca){
  if(FIPE_RODANDO||!navigator.onLine)return false;const hj=hojeISO(),L=(S.metas||[]).filter(m=>m.fipe&&m.fipe.b&&(forca||m.fipe.chk!==hj));
  if(!L.length)return false;FIPE_RODANDO=true;let mud=false;
  try{for(const m of L){try{const r=await fipePreco(m.fipe);const f=m.fipe;
      if(r.v!==f.v){f.hist=(f.hist||[]).concat([[hj,r.v]]).slice(-24);}
      f.v=r.v;f.ref=r.ref;if(r.cod)f.cod=r.cod;f.chk=hj;f.erro='';m.alvo=r.v;mud=true;}
    catch(e){m.fipe.chk=hj;m.fipe.erro='1';mud=true;}}}
  finally{FIPE_RODANDO=false;}
  if(mud){salvar();if(TAB==='metas')render();}
  return mud;
}
function fipeVar(m){const f=m.fipe;if(!f||!(f.v0>0)||!(f.v>0))return null;const d=c2(f.v-f.v0);return Math.abs(d)<0.5?null:{d,desde:f.em0};}
/* ---------- tela ---------- */
function mtFontesChips(m,max){
  const out=[];const cx=mtCaixa(m);
  if(cx.pri>0||m.cdi||!(m.ativos||[]).length)out.push({g:'caixa',t:m.cdi?'caixinha '+String(m.pctCdi||100).replace('.',',')+'% CDI':'caixinha'});
  mtAtivos(m).forEach(({a,f})=>out.push({g:mtGrupo(f),t:(f.ticker||f.nome||'ativo').slice(0,14)+' '+String(c2(a.pct)).replace('.',',')+'%'}));
  (m.planos||[]).forEach(p=>out.push({g:'plano',t:'a comprar · '+(p.nome||'ativo').slice(0,18)}));
  const L=max&&out.length>max?out.slice(0,max).concat([{g:'mais',t:'+'+(out.length-max)}]):out;
  return `<div class="mtFt" aria-label="fontes da meta">${L.map(x=>`<span class="mtF ${x.g}" style="--fc:${MT_COR[x.g]||'#64748b'}"><i></i>${esc(x.t)}</span>`).join('')}</div>`;
}
function viewMetas(){
  const R=ritmoMensal(); // v10.89: o mesmo número do Planejamento
  if((S.metas||[]).some(m=>m.fipe&&m.fipe.chk!==hojeISO()))setTimeout(()=>fipeAtualiza().catch(()=>{}),0);
  const SD={};S.metas.forEach(m=>{SD[m.id]=saldoMeta(m);});
  const at=m=>SD[m.id],alvoDe=m=>alvoMeta(m);
  /* metas com prazo reservam o que precisam por mês; o resto do ritmo se divide entre as sem prazo */
  const abertas=S.metas.filter(m=>at(m)<alvoDe(m));
  const reserva=abertas.filter(m=>m.prazo&&mesesAte(m.prazo)>0).reduce((a,m)=>a+pmtMeta(at(m),alvoDe(m),mesesAte(m.prazo),taxaMesMeta(m)),0);
  const semPrazo=abertas.filter(m=>!m.prazo).length;
  const livre=R?Math.max(0,R.media-reserva):0;
  const porMeta=semPrazo?livre/semPrazo:0;
  const cards=S.metas.map((m,i)=>{
    const sA=at(m),alvo=alvoDe(m),nova=mtNova(m);
    const pct=alvo?Math.min(100,sA/alvo*100):0,falta=Math.max(0,alvo-sA);
    const ic=metaIcone(m.nome),pal=META_COR[i%META_COR.length];
    const R2=26,C2=2*Math.PI*R2,off=C2*(1-pct/100);
    let chips=[],st='',nota='';
    if(falta<=0){st='<span class="mtSt ok">'+I('star')+'<span>meta&nbsp;batida</span></span>';}
    else if(m.prazo){const n=mesesAte(m.prazo);
      if(n<=0){st='<span class="mtSt late">'+I('alert')+'<span>prazo&nbsp;vencido</span></span>';chips=[['faltam',brlK(falta)],['prazo',mesCurto(m.prazo)]];}
      else{const r=taxaMesMeta(m),pm=pmtMeta(sA,alvo,n,r),ok=m.aporteMes?m.aporteMes>=pm-0.005:(R&&R.media>=reserva);
        if(r){const jur=Math.max(0,alvo-sA-pm*n);nota=`rendendo ${String(m.pctCdi||100).replace('.',',')}% do CDI (${cdiAnoAtual().toFixed(2).replace('.',',')}% ao ano), os juros cobrem ${brl(jur)} da meta.`;}
        else if(m.cdi)nota='buscando a taxa do CDI para incluir os juros.';st=R?`<span class="mtSt ${ok?'ok':'warn'}">${I(ok?'flag':'alert')}<span>${ok?'no&nbsp;ritmo':'acima&nbsp;do&nbsp;ritmo'}</span></span>`:'';
        chips=[['faltam',brlK(falta)],['guardar/mês',pm>=1000?brlK(pm):brl(pm)],['prazo',mesCurto(m.prazo),n+(n>1?' meses':' mês')]]; // v10.87: valor longo não corta mais (R$ 3.727,…)
        if(m.aporteMes&&!ok)nota=`guardando ${brl(m.aporteMes)}/mês não chega no prazo. `+(nota||'');
        else if(!m.aporteMes&&R&&!ok)nota=`seu ritmo hoje é ${brl(Math.max(0,R.media))}/mês para todas as metas. `+(nota||'');}
    }else if(nova&&(m.aporteMes>0||mtAtivos(m).length)){const ch=mtChega(m);
      chips=[['faltam',brlK(falta)],['guardar/mês',brlK(m.aporteMes||0)]];if(ch)chips.push(['previsão',mtMesTxt(ch),'em '+(()=>{const n=mesesAte(ch)-1;return n>=24?Math.round(n/12)+' anos':Math.max(1,n)+(n>1?' meses':' mês');})()]);
    }else if(m.aporteMes>0||porMeta>0||taxaMesMeta(m)&&sA>0){const pmM=m.aporteMes>0?m.aporteMes:porMeta,r=taxaMesMeta(m),n=mesesMeta(sA,alvo,pmM,r);
      if(!isFinite(n)||n>600)chips=[['faltam',brlK(falta)],[m.aporteMes?'guardar/mês':'ritmo/mês',brlK(pmM)]];
      else{const dt=mesAdd(mesOff(0),n);
      chips=[['faltam',brlK(falta)],[m.aporteMes?'guardar/mês':'ritmo/mês',brlK(pmM)],['previsão',mesCurto(dt),'em '+(n>=24?Math.round(n/12)+' anos':n+(n>1?' meses':' mês'))]];}
      const nSem=r&&isFinite(n)?mesesMeta(sA,alvo,pmM,0):0;
      nota=m.aporteMes?'':semPrazo>1?`ritmo = sua sobra média dividida entre ${semPrazo} metas sem prazo.`:reserva>0?'ritmo = o que sobra depois das metas com prazo.':'ritmo = sua sobra média por mês.';
      if(r&&isFinite(n)&&isFinite(nSem)&&nSem>n)nota=(nota?nota+' ':'')+`com ${String(m.pctCdi||100).replace('.',',')}% do CDI chega ${nSem-n} ${nSem-n>1?'meses':'mês'} antes.`;
      else if(m.cdi&&!r)nota=(nota?nota+' ':'')+'buscando a taxa do CDI para incluir os juros.';
    }else chips=[['faltam',brlK(falta)]];
    const rk=nova?mtRisco(m):null,sq=nova?mtStreak(m):{n:0},fv=fipeVar(m);
    if(rk&&rk.perto)nota=`${Math.round(rk.pc)}% em cripto e faltam ${rk.n} ${rk.n>1?'meses':'mês'}. Abra a meta para ver a sugestão.`+(nota?' '+nota:'');
    else if(fv)nota=`${m.fipe.mo?'o '+(metaIcone(m.nome)==='carro'?'carro':'veículo'):'o alvo'} ${fv.d>0?'subiu':'caiu'} ${brl(Math.abs(fv.d))} desde ${fmtDataCurta(fv.desde)}.`+(nota?' '+nota:'');
    return `<div class="card meta mtx hov${nova?' mtNovo':''}" style="--m1:${pal[0]};--m2:${pal[1]}">
      <div class="mtHd tap" data-act="meta-abre" data-id="${m.id}" role="button" tabindex="0" aria-label="abrir meta ${esc(m.nome)}">
        <span class="mtIc">${I(ic)}</span>
        <div class="mtNm"><b>${esc(m.nome)}</b><small>${m.prazo?'até '+mesCurto(m.prazo):'sem prazo'}${m.cdi&&!nova?' · '+String(m.pctCdi||100).replace('.',',')+'% do CDI':''}${m.fipe?' · FIPE':m.ipca?' · corrigido pelo IPCA':''}${sq.n>1?' · '+sq.n+' meses seguidos':''}</small></div>
        <div class="mtRing"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${R2}" class="rb"/><circle cx="32" cy="32" r="${R2}" class="rf mtRf" style="stroke-dasharray:${C2.toFixed(1)};stroke-dashoffset:${off.toFixed(1)};--c:${C2.toFixed(1)}"/></svg><span>${pct>0&&pct<1?'<1':Math.round(pct)}%</span></div>
      </div>
      <div class="mtVal"><b class="nw">${brl(sA)}</b><span>de ${brl(alvo)}</span>${st}</div>
      <div class="bar mtBar"><i data-w="${pct}"></i></div>
      ${nova?mtFontesChips(m,4):''}
      ${chips.length?`<div class="mtChips">${chips.map(([k,v,e])=>`<span><small>${k}</small><b class="nw fit">${v}</b>${e?`<em>${e}</em>`:''}</span>`).join('')}</div>`:''}
      ${nota?`<p class="mtNota${rk&&rk.perto?' warn':''}">${I(rk&&rk.perto?'alert':'gauge')}${nota}</p>`:''}
      <div class="mtActs">
        <button class="btn mtAp" data-act="aporte" data-id="${m.id}">${I('plus')}guardei</button>
        <button class="mtB" data-act="meta-abre" data-id="${m.id}" aria-label="ver detalhes da meta">${I('chart')}</button>
        <button class="mtB" data-act="edit-meta" data-id="${m.id}" aria-label="editar meta">${I('edit')}</button>
        <button class="mtB del" data-act="del-meta" data-id="${m.id}" aria-label="excluir meta">${I('trash')}</button>
      </div>
    </div>`;
  }).join('');
  const tAlvo=S.metas.reduce((a,m)=>a+alvoDe(m),0),tAt=S.metas.reduce((a,m)=>a+at(m),0);
  const ritmo=R?`<div class="card mtRitmo"><div class="hmH"><h4>seu ritmo de economia</h4>${I('piggy')}</div>
    <div class="mtRV ${R.media<0?'neg':''} nw">${brl(R.media)}<small>/mês</small></div>
    <p class="hmNota">média do que sobrou nos últimos ${R.n} ${R.n>1?'meses':'mês'} (receitas menos despesas pagas). em ${mesCurto(R.mesUlt)} sobrou ${brl(R.ult)}. é o mesmo número do Planejamento.</p>
    ${R.media<=0?'<p class="mtPlano warn">'+I('alert')+'<span>suas despesas estão comendo toda a renda. cortar um pouco libera espaço para as metas.</span></p>':''}</div>`:'';
  return `
  <div class="head"><h2>Metas</h2><button class="btn" data-act="nova-meta">+ meta</button></div>
  ${metaCotasHTML()}
  ${ritmo}
  ${S.metas.length?`<div class="card mtSum"><div><small>guardado</small><b class="pos nw fit">${brl(tAt)}</b></div><div><small>alvo somado</small><b class="nw fit">${brl(tAlvo)}</b></div><div><small>metas</small><b>${S.metas.length}</b></div><div class="mtSumBar"><div class="bar"><i data-w="${tAlvo?Math.min(100,tAt/tAlvo*100):0}"></i></div><small>${tAlvo?String(Math.round(tAt/tAlvo*1000)/10).replace('.',','):0}% do total</small></div></div>`:''}
  ${S.metas.length?cards:vazioHTML('flag','Nenhuma meta ainda','Comece por uma reserva de emergência. Escolha um prazo e o app calcula quanto guardar por mês.','<button class="btn sm" data-act="nova-meta">+ meta</button>')}`;
}
/* v10.95: a antiga "meta de cotas" de Investimentos (S.metaFii) virou cfg.metaCotas. diferente de 100 (o padrão), a aba Metas
   oferece transformá-la numa meta comum: alvo = cotas × preço médio dos FIIs, fontes = os FIIs com o % que ainda está livre */
function metaCotasDados(){
  const mc=S.cfg&&S.cfg.metaCotas;if(!mc||mc.fim||!(mc.n>0))return null;
  const F=(S.fiis||[]).filter(f=>tipoOf(f)==='fii'&&f.cotas>0);
  const q=F.reduce((a,f)=>a+(+f.cotas||0),0),custo=F.reduce((a,f)=>a+cents(f.pago>0?f.pago:f.cotas*f.preco),0)/100;
  const pm=q>0?custo/q:0;
  const fontes=F.map(f=>({f,livre:Math.max(0,c2(100-mtAlocado(f.id)))})).filter(x=>x.livre>0);
  return {n:mc.n,pm,alvo:c2(mc.n*pm),fontes,q};
}
function metaCotasHTML(){
  const D=metaCotasDados();if(!D)return '';
  const nT=num(D.n).replace(/,00$/,'');
  const det=D.pm>0?`<div class="mcCalc"><span><small>cotas</small><b>${nT}</b></span><i>×</i><span><small>preço médio</small><b class="nw">${brl(D.pm)}</b></span><i>=</i><span><small>alvo</small><b class="nw">${brl(D.alvo)}</b></span></div>
    <p class="mcFt">${D.fontes.length?'fontes: '+D.fontes.map(x=>`<b>${esc(x.f.ticker)}</b> ${String(x.livre).replace('.',',')}%`).join(' · '):'seus FIIs já estão 100% em outras metas: a meta começa sem fonte.'}</p>`
    :'<p class="mcFt">cadastre seus FIIs em Investimentos para calcular o alvo pelo preço médio.</p>';
  return `<div class="card mcCard"><div class="mcHd"><span class="mcIc">${I('flag')}</span><div><h4>Sua meta de cotas agora é uma meta</h4><p>A meta de juntar <b>${nT} cotas</b> saiu de Investimentos. Dá para acompanhar como uma meta comum, com os FIIs como fonte.</p></div></div>
    ${det}
    <div class="mcBt">${D.pm>0?'<button class="btn" data-act="mc-criar">criar a meta</button>':''}<button class="btn2" data-act="mc-dispensar">dispensar</button></div></div>`;
}
function metaCotasCria(){
  const D=metaCotasDados();if(!D||!(D.pm>0))return;
  const hj=hojeISO(),nT=num(D.n).replace(/,00$/,'');
  const m={id:uid(),nome:'Meta de '+nT+' cotas',alvo:D.alvo,atual:0,aporteMes:0,cdi:false,pctCdi:0,prazo:'',criadoEm:hj,
    ativos:D.fontes.map(x=>({fid:x.f.id,pct:x.livre,desde:hj,reinv:false}))};
  Object.assign(m,saneaMetaExtra(m));
  S.metas.push(m);S.cfg.metaCotas.fim='criada';S.cfg.metaCotas.meta=m.id;
  salvar();render();toast('Meta criada: '+m.nome);
}
/* gráfico da previsão (SVG, sem biblioteca): faixa da cripto, só aportes (tracejada), com rendimento e o alvo */
function mtGraficoSVG(p,prazoK){
  const n=Math.min(p.L2.length-1,Math.max(12,p.k>=0?p.k+2:Math.min(p.L2.length-1,120)));
  const W=340,H=170,pl=6,pr=6,pt=10,pb=22;
  const vals=[].concat(p.hi.slice(0,n+1),p.L1.slice(0,n+1),[p.alvo]);const mx=Math.max(1,...vals)*1.06,mn=0;
  const X=i=>pl+(W-pl-pr)*i/Math.max(1,n),Y=v=>pt+(H-pt-pb)*(1-(v-mn)/(mx-mn));
  const ln=A=>A.slice(0,n+1).map((v,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(v).toFixed(1)).join('');
  const temBanda=p.hi.some((v,i)=>i<=n&&v-p.lo[i]>0.5);
  const banda=temBanda?'M'+p.hi.slice(0,n+1).map((v,i)=>X(i).toFixed(1)+' '+Y(v).toFixed(1)).join('L')+'L'+p.lo.slice(0,n+1).map((v,i)=>[i,v]).reverse().map(([i,v])=>X(i).toFixed(1)+' '+Y(v).toFixed(1)).join('L')+'Z':'';
  const ticks=[0,Math.round(n/2),n].map(i=>`<text x="${X(i).toFixed(1)}" y="${H-6}" text-anchor="${i===0?'start':i===n?'end':'middle'}">${mtMesTxt(mesAdd(mesAtual(),i))}</text>`).join('');
  const kx=p.k>=0&&p.k<=n?`<line class="gK" x1="${X(p.k).toFixed(1)}" x2="${X(p.k).toFixed(1)}" y1="${pt}" y2="${H-pb}"/><circle class="gKp" cx="${X(p.k).toFixed(1)}" cy="${Y(p.L2[p.k]).toFixed(1)}" r="4"/>`:'';
  const pz=prazoK>0&&prazoK<=n?`<line class="gP" x1="${X(prazoK).toFixed(1)}" x2="${X(prazoK).toFixed(1)}" y1="${pt}" y2="${H-pb}"/>`:'';
  return `<svg class="mtG" viewBox="0 0 ${W} ${H}" role="img" aria-label="previsão da meta: ${p.k>=0?'chega em '+mtMesTxt(mesAdd(mesAtual(),p.k)):'não chega no horizonte do gráfico'}">
    ${banda?`<path class="gB" d="${banda}"/>`:''}
    <line class="gA" x1="${pl}" x2="${W-pr}" y1="${Y(p.alvo).toFixed(1)}" y2="${Y(p.alvo).toFixed(1)}"/>
    ${pz}<path class="g1" d="${ln(p.L1)}"/><path class="g2" d="${ln(p.L2)}"/>${kx}${ticks}</svg>`;
}
function abreMeta(id){
  const m=S.metas.find(x=>x.id===id);if(!m)return;
  const D=mtSaldoD(m),alvo=alvoMeta(m),pct=alvo?Math.min(100,D.total/alvo*100):0,box=$('#modal');
  const p=mtProj(m,0),pk=m.prazo?mesesAte(m.prazo)-1:0,ch=p.k>=0?mesAdd(mesAtual(),p.k):'';
  const rk=mtRisco(m),sq=mtStreak(m),fv=fipeVar(m),pro=mtProFontes();
  const R2=44,C2=2*Math.PI*R2,off=C2*(1-pct/100),i=S.metas.indexOf(m),pal=META_COR[i%META_COR.length];
  const dec=[['voce','de você',D.voce,'#22c55e'],['cdi','rendimento (CDI/renda fixa)',D.cdi,'#0ea5e9'],['prov','proventos',D.prov,'#a78bfa'],['varia','variação dos ativos',D.varia,D.varia<0?'#f87171':'#f59e0b']].filter(x=>Math.abs(x[2])>=0.005||x[0]==='voce');
  const pos=dec.reduce((s,x)=>s+Math.max(0,x[2]),0)||1;
  const fonteL=[];
  if(D.cx.pri>0||m.cdi||!(m.ativos||[]).length)fonteL.push(`<div class="mtFr"><span class="mtFi" style="--fc:${MT_COR.caixa}">${I('piggy')}</span><div class="mtFt2"><b>Caixinha da meta</b><small>${m.cdi?String(m.pctCdi||100).replace('.',',')+'% do CDI'+(D.cx.rend>0?' · rendeu '+brl(D.cx.rend):''):'sem rendimento'}</small></div><b class="nw">${brl(D.caixa)}</b></div>`);
  mtAtivos(m).forEach(({a,f})=>{const g=mtGrupo(f),v=mtValorAtivo(f)*a.pct/100;
    fonteL.push(`<div class="mtFr"><span class="mtFi" style="--fc:${MT_COR[g]}">${I(g==='rf'?'bank':'chart')}</span><div class="mtFt2"><b>${esc(nomeAtivo(f))}</b><small>${String(c2(a.pct)).replace('.',',')}% de ${brl(mtValorAtivo(f))} · ${MT_GL[g]}${f.pluggyInv?' · do banco':''}${a.reinv&&(g==='fii'||g==='acao')?' · proventos reinvestem':''}</small></div><b class="nw">${brl(v)}</b></div>`);});
  (m.planos||[]).forEach(pl=>fonteL.push(`<div class="mtFr plano"><span class="mtFi" style="--fc:${MT_COR.plano}">${I('clock')}</span><div class="mtFt2"><b>${esc(mtPlanoNome(pl)||'ativo')}</b><small>a comprar · ${(MT_PK_T.find(k=>k[0]===pl.tipo)||['',MT_GL[mtGrupo(pl.tipo)]])[1]}${pl.valor>0?' · pretende '+brl(pl.valor):''}</small></div><b class="nw mut">—</b></div>`));
  const hist=(m.aportes||[]).slice().reverse().slice(0,24);
  const ap=hist.map(a=>{const f=a.fonte!=='manual'&&S.fiis.find(x=>x.id===a.fonte),b=a.conta&&S.bancos.find(x=>x.id===a.conta);
    return `<div class="mtAh"><div><b>${fmtDataCurta(a.d)}</b><small>${f?'em '+esc(f.ticker||f.nome):'caixinha'}${b?' · saiu de '+esc(b.nome):''}</small></div><b class="nw pos">+ ${brl(a.v)}</b><button class="mtB sm" data-act="meta-ap-del" data-id="${m.id}|${a.id}" aria-label="desfazer aporte de ${fmtDataCurta(a.d)}">${I('trash')}</button></div>`;}).join('');
  const simMax=Math.max(500,Math.round((m.aporteMes||0)/50)*50);
  box.innerHTML=`<div class="sheet mtSheet" role="dialog" aria-modal="true" aria-label="${esc(m.nome)}" style="--m1:${pal[0]};--m2:${pal[1]}"><div class="sh-head"><h3>${esc(m.nome)}</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <div class="mtHero">
      <div class="mtRingL"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${R2}" class="rb"/><circle cx="50" cy="50" r="${R2}" class="rf mtRf" style="stroke-dasharray:${C2.toFixed(1)};stroke-dashoffset:${off.toFixed(1)};--c:${C2.toFixed(1)}"/></svg><span class="mtRingI">${I(metaIcone(m.nome))}<b>${pct>0&&pct<1?'<1':Math.round(pct)}%</b></span></div>
      <div class="mtHv"><small>guardado</small><b class="nw">${brl(D.total)}</b><span>de ${brl(alvo)}${m.fipe?' · FIPE':m.ipca?' · com IPCA':''}</span>
        ${ch?`<em class="mtCh">${I('flag')}chega em ${mtMesTxt(ch)}</em>`:p.P>0||D.total>0?'<em class="mtCh off">sem data com o ritmo atual</em>':''}</div>
    </div>
    ${m.fipe?`<p class="mtFipe">${I('carro')}<span><b>${esc(m.fipe.mo&&m.fipe.mo.n||'')}</b> ${esc(m.fipe.a&&m.fipe.a.n||'')}${m.fipe.cod?' · FIPE '+esc(m.fipe.cod):''}<br><small>${m.fipe.ref?'referência '+esc(m.fipe.ref):''}${m.fipe.erro?' · sem conexão com a FIPE, usando o último valor salvo':''}${fv?' · '+(fv.d>0?'subiu ':'caiu ')+brl(Math.abs(fv.d))+' desde '+fmtDataCurta(fv.desde):''}</small></span></p>`:''}
    ${rk&&rk.perto?`<div class="mtRisk">${I('alert')}<span><b>${Math.round(rk.pc)}% da meta está em cripto</b> (limite ${rk.lim}%) e faltam ${rk.n} ${rk.n>1?'meses':'mês'}. Uma queda agora atrasa a meta. Sugestão: migrar cerca de ${brl(rk.mover)} para algo que rende pelo CDI.</span></div>`:rk?`<p class="mtNota">${I('gauge')}${Math.round(rk.pc)}% em cripto, acima do seu limite de ${rk.lim}%. Com o prazo longe, o risco é menor.</p>`:''}
    <div class="mtBt"><button class="btn" data-act="aporte" data-id="${m.id}">${I('plus')}guardei</button><button class="btn2" data-act="meta-fontes" data-id="${m.id}">${I('link')}fontes</button></div>
    <h4 class="rsH">previsão</h4>
    <div class="mtGw" id="mtGw">${mtGraficoSVG(p,pk)}</div>
    <div class="mtLeg"><span><i class="l2"></i>com rendimento</span><span><i class="l1"></i>só aportes</span>${p.hi.some((v,j)=>v-p.lo[j]>0.5)?'<span><i class="lb"></i>faixa da cripto</span>':''}<span><i class="la"></i>alvo</span></div>
    <div class="mtSim"><label for="mtSimR"><span>simular a mais por mês</span><b id="mtSimV">+ ${OCULTO?'R$ •••':brl(0)}</b></label><input type="range" id="mtSimR" min="0" max="${simMax}" step="50" value="0" aria-describedby="mtSimT"><p id="mtSimT" class="small">${p.P>0?'guardando '+brl(p.P)+'/mês':'sem aporte mensal definido'}${ch?' chega em '+mtMesTxt(ch):''}.</p></div>
    <p class="small mtPrem">Caixinha pelo CDI de hoje, já sem o IR regressivo; FIIs e ações com o preço parado e os proventos pelo DY médio (isentos); cripto com 0% esperado e a faixa de um desvio da volatilidade. Estimativa, não garantia.</p>
    <h4 class="rsH">de onde veio</h4>
    <div class="mtDec" role="img" aria-label="decomposição do saldo: ${dec.map(x=>x[1]+' '+brl(x[2])).join(', ')}">${dec.filter(x=>x[2]>0).map(x=>`<i style="width:${(x[2]/pos*100).toFixed(2)}%;background:${x[3]}"></i>`).join('')}</div>
    <div class="mtDecL">${dec.map(x=>`<span><i style="background:${x[3]}"></i>${x[1]}<b class="nw">${x[2]<0?'− ':''}${brl(Math.abs(x[2]))}</b></span>`).join('')}</div>
    <h4 class="rsH">fontes</h4>
    <div class="mtFl">${fonteL.join('')||'<p class="small">nenhuma fonte ainda.</p>'}</div>
    ${!pro&&!(m.ativos||[]).length?`<p class="small mtLock">${I('lock')}Ligar FIIs, cripto e renda fixa à meta faz parte do Pro.</p>`:''}
    <h4 class="rsH">aportes${sq.n?` <span class="mtStk">${I('lu_flame')}${sq.n} ${sq.n>1?'meses seguidos':'mês'}</span>`:''}</h4>
    <p class="small">${m.aporteMes>0?'combinado: '+brl(m.aporteMes)+' por mês'+(m.diaAporte?', todo dia '+m.diaAporte:'')+'. '+(sq.mesOk?'este mês já foi.':'este mês ainda não.'):'defina um valor por mês em editar para acompanhar a sequência.'}</p>
    ${ap||'<p class="small">nenhum aporte registrado ainda. toque em guardei quando separar o dinheiro.</p>'}
    <div class="mtRod"><button class="mtRodB" data-act="edit-meta" data-id="${m.id}">${I('edit')}<span>editar meta</span></button><button class="mtRodB del" data-act="del-meta" data-id="${m.id}">${I('trash')}<span>excluir</span></button></div>
  </div>`;
  box.classList.add('on');
  const r=$('#mtSimR');if(r)r.oninput=()=>{const x=+r.value||0,q=mtProj(m,x),c=q.k>=0?mesAdd(mesAtual(),q.k):'';
    $('#mtSimV').textContent='+ '+(OCULTO?'R$ •••':brl(x));
    $('#mtSimT').textContent=x?(c?'+'+brl(x)+'/mês: chega em '+mtMesTxt(c)+(ch&&c<ch?', '+(mesesAte(ch)-mesesAte(c))+' '+((mesesAte(ch)-mesesAte(c))>1?'meses':'mês')+' antes':''):'+'+brl(x)+'/mês: ainda não chega no horizonte'):(p.P>0?'guardando '+brl(p.P)+'/mês':'sem aporte mensal definido')+(ch?' chega em '+mtMesTxt(ch):'')+'.';
    $('#mtGw').innerHTML=mtGraficoSVG(q,pk);};
}
/* ---------- formulário da meta ---------- */
function metaForm(id){
  const m=id?S.metas.find(x=>x.id===id):null,pro=mtProFontes()||!!(m&&m.cdi);
  const fp=m&&m.fipe?m.fipe:null;
  form(m?'Editar meta':'Nova meta',[
    {name:'nome',label:'Nome da meta',value:m?m.nome:'',required:true,placeholder:'ex: reserva de emergência'},
    {name:'alvoTipo',label:'Alvo',type:'seg',value:fp?'fipe':'fixo',options:[{v:'fixo',t:'Valor fixo',d:'eu digito'},{v:'fipe',t:'Tabela FIPE',d:'carro, moto'}]},
    {name:'alvo',label:'Valor alvo (R$)',value:m?num(m.ipca&&m.alvoBase>0?m.alvoBase:m.alvo):'',required:!fp,inputmode:'decimal',placeholder:'0,00'},
    {name:'ipca',label:'Corrigir o alvo pela inflação (IPCA)',type:'checkbox',value:m?!!m.ipca:false},
    {name:'fipe',type:'hidden',value:fp?JSON.stringify({tp:fp.tp,b:fp.b,mo:fp.mo,a:fp.a,v:fp.v,ref:fp.ref,cod:fp.cod}):''},
    {name:'fipeBox',type:'html',html:`<div class="mtFipeF" id="mtFipeF"${fp?'':' hidden'}>
      <label>Tipo<select id="fpTp">${Object.keys(FIPE_TP).map(k=>`<option value="${k}" ${fp&&fp.tp===k?'selected':''}>${FIPE_TP[k][0]}</option>`).join('')}</select></label>
      <label>Marca<select id="fpB" disabled><option>${fp?esc(fp.b.n):'carregando…'}</option></select></label>
      <label>Modelo<input id="fpMf" placeholder="filtrar modelo" autocomplete="off" disabled><select id="fpMo" disabled><option>${fp?esc(fp.mo.n):'escolha a marca'}</option></select></label>
      <label>Ano<select id="fpA" disabled><option>${fp?esc(fp.a.n):'escolha o modelo'}</option></select></label>
      <p class="small" id="fpV">${fp?'valor salvo: '+brl(fp.v)+(fp.ref?' ('+esc(fp.ref)+')':''):'escolha o veículo para buscar o preço.'}</p></div>`},
    {name:'atual',label:'Já guardado na caixinha da meta (R$)',value:m?num(m.atual):'0,00',inputmode:'decimal'},
    {name:'prazo',label:'Quero chegar até (opcional)',type:'month',value:m&&m.prazo||''},
    {name:'aporteMes',label:'Quanto pretendo guardar por mês (opcional)',value:m&&m.aporteMes?num(m.aporteMes):'',inputmode:'decimal',placeholder:'em branco = uso sua sobra média'},
    {name:'diaAporte',label:'Dia de guardar (lembrete no app)',type:'select',value:m&&m.diaAporte?m.diaAporte:(m?'':mtDiaSugerido()),options:[{v:'',t:'sem lembrete'}].concat(Array.from({length:28},(_,k)=>({v:k+1,t:'dia '+(k+1)+(k+1===mtDiaSugerido()&&(S.fixas||[]).some(f=>f.tipo==='receita')?' (dia do salário)':'')})))},
    pro?{name:'cdi',label:'O dinheiro desta meta rende pelo CDI',type:'checkbox',value:m?!!m.cdi:false}:{name:'cdi',type:'hidden',value:''},
    pro?{name:'pctCdi',label:'Quantos % do CDI (ex: 100)',value:m&&m.pctCdi?String(m.pctCdi).replace('.',','):'100',inputmode:'decimal'}:{name:'pctCdi',type:'hidden',value:'100'},
    {name:'cripMax',label:'Limite de cripto nesta meta (%)',value:String(m&&m.cripMax>0?m.cripMax:20),inputmode:'numeric'}
  ],v=>{
    const nome=String(v.nome).trim(),atual=parseBR(v.atual);let alvo=parseBR(v.alvo);
    if(!nome)return 'Dê um nome à meta.';
    let fipe=null;
    if(v.alvoTipo==='fipe'){try{fipe=JSON.parse(v.fipe||'null');}catch(e){fipe=null;}
      if(!fipe||!(fipe.v>0)||!fipe.b||!fipe.mo||!fipe.a)return 'Escolha o veículo na tabela FIPE (marca, modelo e ano).';alvo=c2(fipe.v);}
    if(!(alvo>0))return 'Informe o valor alvo.';
    if(!(atual>=0))return 'Valor guardado inválido.';
    const prazo=/^\d{4}-\d{2}$/.test(String(v.prazo||''))?String(v.prazo):'';
    const ap=String(v.aporteMes||'').trim()?parseBR(v.aporteMes):0;
    if(!(ap>=0))return 'Valor por mês inválido.';
    const cdi=!!v.cdi,pc=String(v.pctCdi||'').trim()?parseBR(v.pctCdi):100;
    if(cdi&&!(pc>0&&pc<=300))return 'Informe o % do CDI entre 1 e 300.';
    const cm=String(v.cripMax||'').trim()?parseBR(v.cripMax):20;if(!(cm>=0&&cm<=100))return 'Limite de cripto entre 0 e 100%.';
    const dia=parseInt(v.diaAporte,10)||0;
    const obj={nome,alvo,atual:c2(atual),prazo,aporteMes:c2(ap),cdi,pctCdi:cdi?c2(pc):0};
    const alvoMudou=!m||c2(m.ipca&&m.alvoBase>0?m.alvoBase:m.alvo)!==c2(alvo);
    const extras={};
    if(dia||(m&&m.diaAporte))extras.diaAporte=dia;
    if(cm!==20||(m&&m.cripMax))extras.cripMax=c2(cm);
    if(v.ipca&&!fipe){extras.ipca=true;extras.alvoBase=c2(alvo);extras.alvoEm=alvoMudou||!(m&&m.alvoEm)?mesAtual():m.alvoEm;}else if(m&&m.ipca){extras.ipca=false;extras.alvoBase=0;extras.alvoEm='';}
    if(fipe){const hj=hojeISO(),mesmo=m&&m.fipe&&m.fipe.a&&m.fipe.mo&&m.fipe.a.c===fipe.a.c&&m.fipe.mo.c===fipe.mo.c&&m.fipe.b.c===fipe.b.c;
      extras.fipe=mesmo?Object.assign({},m.fipe):{tp:FIPE_TP[fipe.tp]?fipe.tp:'cars',b:fipe.b,mo:fipe.mo,a:fipe.a,v:c2(fipe.v),ref:String(fipe.ref||'').slice(0,30),cod:String(fipe.cod||'').slice(0,12),chk:hj,em:hj,v0:c2(fipe.v),em0:hj,hist:[[hj,c2(fipe.v)]]};}
    else if(m&&m.fipe)extras.fipe=null;
    /* "já guardado" mudou: a base da caixinha passa a render a partir de hoje (aportes anteriores entram na base) */
    if(!m||c2(m.atual)!==c2(atual)){if(atual>0){extras.baseEm=hojeISO();extras.baseN=m?(m.aportes||[]).length:0;}else{extras.baseEm='';extras.baseN=m?(m.aportes||[]).length:0;}}
    const novo=Object.assign(obj,extras);
    if(novo.fipe===null)delete novo.fipe;
    if(m){Object.assign(m,novo);if(extras.fipe===null)delete m.fipe;}
    else S.metas.push(Object.assign({id:uid(),criadoEm:hojeISO()},novo));
    salvar();render();toast('Meta salva');if(cdi||extras.ipca)atualizaCDI();
  });
  /* liga o seletor da FIPE */
  const mf=$('#mf'),box=$('#mtFipeF');if(!mf||!box)return;
  const alvoL=mf.querySelector('[name="alvo"]').closest('label'),ipcaL=mf.querySelector('[name="ipca"]').closest('label');
  const segs=mf.querySelectorAll('[name="alvoTipo"]');
  const tB=$('#fpTp'),sB=$('#fpB'),sMo=$('#fpMo'),fMo=$('#fpMf'),sA=$('#fpA'),out=$('#fpV'),J=mf.querySelector('[name="fipe"]');
  let MODS=[],carregou=false;
  const opt=(L,ph)=>`<option value="">${ph}</option>`+L.map(x=>`<option value="${esc(x.c)}">${esc(x.n)}</option>`).join('');
  const falha=()=>{out.textContent=J.value?'sem conexão com a FIPE agora. o último valor salvo continua valendo.':'não consegui falar com a tabela FIPE agora. tente de novo em instantes ou use um valor fixo.';};
  const marcas=async()=>{sB.disabled=true;sB.innerHTML='<option>carregando…</option>';try{const L=await fipeLista(tB.value);sB.innerHTML=opt(L,'escolha a marca');sB.disabled=false;}catch(e){sB.innerHTML='<option>indisponível</option>';falha();}};
  const pintaMods=()=>{const q=norm(fMo.value);sMo.innerHTML=opt(MODS.filter(x=>!q||norm(x.n).includes(q)).slice(0,400),MODS.length?'escolha o modelo':'—');};
  tB.onchange=()=>{J.value='';sMo.disabled=sA.disabled=fMo.disabled=true;marcas();};
  sB.onchange=async()=>{J.value='';sA.disabled=true;sA.innerHTML='<option>escolha o modelo</option>';if(!sB.value)return;sMo.disabled=true;sMo.innerHTML='<option>carregando…</option>';
    try{MODS=await fipeLista(tB.value,sB.value);fMo.disabled=false;fMo.value='';pintaMods();sMo.disabled=false;}catch(e){sMo.innerHTML='<option>indisponível</option>';falha();}};
  fMo.oninput=pintaMods;
  sMo.onchange=async()=>{J.value='';if(!sMo.value)return;sA.disabled=true;sA.innerHTML='<option>carregando…</option>';
    try{const L=await fipeLista(tB.value,sB.value,sMo.value);sA.innerHTML=opt(L,'escolha o ano');sA.disabled=false;}catch(e){sA.innerHTML='<option>indisponível</option>';falha();}};
  sA.onchange=async()=>{J.value='';if(!sA.value)return;out.textContent='buscando o preço…';
    const fp={tp:tB.value,b:{c:sB.value,n:sB.selectedOptions[0].textContent},mo:{c:sMo.value,n:sMo.selectedOptions[0].textContent},a:{c:sA.value,n:sA.selectedOptions[0].textContent}};
    try{const r=await fipePreco(fp);Object.assign(fp,r);J.value=JSON.stringify(fp);out.innerHTML='<b>'+brl(r.v)+'</b> na tabela FIPE'+(r.ref?' ('+esc(r.ref)+')':'');}catch(e){falha();}};
  const modo=()=>{const fi=[...segs].some(s=>s.checked&&s.value==='fipe');box.hidden=!fi;alvoL.hidden=fi;ipcaL.hidden=fi;
    if(fi&&!carregou){carregou=true;marcas();}};
  segs.forEach(s=>s.addEventListener('change',modo));modo();
}
/* ---------- fontes da meta (ativos e a comprar) ---------- */
/* v10.98: linha da fonte em duas partes (nome em até 2 linhas + valor/taxa embaixo; abaixo, chips 25/50/75/100% e
   stepper de 5 em 5 com o campo) e "a comprar" com seletor por tipo: moedas com ícone, cor e cotação, sugestões de
   FII/ação/ETF, produtos de renda fixa, busca e "usar o que digitei". O % continua no input [data-pct] (salvar igual). */
const MT_PK_T=[['fii','FII','#a78bfa'],['acao','Ação','#f59e0b'],['etf','ETF','#22d3ee'],['rf','Renda fixa','#0ea5e9'],['cripto','Cripto','#f97316']];
const MT_PK_PH={fii:'Buscar FII: HGLG11, MXRF11…',acao:'Buscar ação: PETR4, ITUB4…',etf:'Buscar ETF: BOVA11, IVVB11…',rf:'Nome: CDB Inter, Tesouro Selic…',cripto:'Buscar moeda: bitcoin, SOL, PEPE…'};
const MT_PK_RF=[['Caixinha','liquidez diária'],['CDB','rende % do CDI'],['LCI','isenta de IR'],['LCA','isenta de IR'],['Tesouro Selic','reserva de emergência'],['Tesouro IPCA+','protege da inflação'],['Tesouro Prefixado','taxa travada'],['Poupança','rende pouco']];
function mtPkPreco(t,tipo){
  if(tipo==='cripto'){const x=CRIPTO_LIST.find(c=>c.t===t),p=x&&cgCache().p[x.id];if(p>0)return p;}
  const f=(S.fiis||[]).find(f=>f.ticker===t&&(tipo==='cripto'?tipoOf(f)==='cripto':tipoOf(f)!=='cripto')&&f.preco>0);return f?f.preco:0;}
function mtPkLista(tipo){
  if(tipo==='cripto')return CRIPTO_LIST.map(x=>({t:x.t,n:x.n,cor:CRYPTO_COR[x.t]||'#64748b'}));
  if(tipo==='rf')return MT_PK_RF.map(([t,n])=>({t,n,cor:'#0ea5e9'}));
  const L=B3_LIST.filter(x=>x.tipo===tipo).map(x=>({t:x.t,n:x.n,cor:(MT_PK_T.find(k=>k[0]===tipo)||[])[2]}));
  (S.fiis||[]).filter(f=>tipoOf(f)===tipo&&f.ticker&&!L.some(x=>x.t===f.ticker)).forEach(f=>L.unshift({t:f.ticker,n:f.nome||'',cor:L[0]?L[0].cor:'#94a3b8'}));
  return L;}
function mtPkIco(t,tipo){
  if(tipo==='cripto')return '<span class="mtPkI coin">'+cryptoIco(t,true)+'</span>';
  if(tipo==='rf')return '<span class="mtPkI rf">'+I('bank')+'</span>';
  return '<span class="mtPkI">'+assetIco(t,tipo==='etf'?'etf':tipo)+'</span>';}
function mtPkPrecoTxt(p){if(!(p>0))return '';if(OCULTO)return 'R$ •••';return p>=100000?brlK(p):brl(p);}
function mtPlanoNome(p){const x=p.tipo==='cripto'&&CRIPTO_LIST.find(c=>c.t===String(p.nome).toUpperCase());return x?x.t+' · '+x.n:p.nome;}
function mtPlanoRow(p,del){const tl=(MT_PK_T.find(k=>k[0]===p.tipo)||['','ativo'])[1];
  return `<div class="mtSrc plano">${p.tipo==='cripto'||p.tipo==='rf'||B3_LIST.some(x=>x.t===p.nome)?mtPkIco(String(p.nome).toUpperCase()===p.nome||p.tipo==='cripto'?String(p.nome).toUpperCase():p.nome,p.tipo):`<span class="mtFi" style="--fc:${MT_COR.plano}">${I('clock')}</span>`}<div class="mtSrcT"><b class="mtSrcN">${esc(mtPlanoNome(p))}</b><small>a comprar · ${tl}${p.valor>0?' · pretende '+brl(p.valor):''}</small></div>${del?`<button type="button" class="mtB sm del" data-pldel="${esc(p.id)}" aria-label="remover ${esc(p.nome)}">${I('trash')}</button>`:''}</div>`;}
function metaFontes(id){
  const m=S.metas.find(x=>x.id===id);if(!m)return;
  if(!mtProFontes()&&!(m.ativos||[]).length){abrePlanos('investimentos');return;}
  const box=$('#modal');
  const pc=x=>String(c2(x)).replace('.',',');
  const lin=f=>{const a=(m.ativos||[]).find(x=>x.fid===f.id),out=mtAlocado(f.id,m.id),livre=c2(Math.max(0,100-out)),g=mtGrupo(f),nm=nomeAtivo(f),val=mtValorAtivo(f);
    const bk=ativoBanco(f),tx=g==='rf'?rfTaxaTxt(f):'',v0=a?c2(a.pct):0;
    const ic=bk?bancoLogoHTML(bancoLogo(bk.d),bk.n,'mtFi mtFiBk'):g==='cripto'?'<span class="mtFi mtFiCoin">'+cryptoIco(f.ticker,true)+'</span>':`<span class="mtFi" style="--fc:${MT_COR[g]}">${I(g==='rf'?'bank':'chart')}</span>`;
    const ch=[25,50,75,100].filter(p=>p<=livre+1e-9);if(livre>0&&livre<100&&!ch.includes(livre))ch.push(livre);
    return `<div class="mtSrc mtSrc2" data-fid="${esc(f.id)}" data-val="${val}" data-livre="${livre}">
      <div class="mtSrcTop">${ic}<div class="mtSrcT"><b class="mtSrcN">${esc(nm)}</b>
        <span class="mtSrcV"><b class="nw">${brl(val)}</b>${tx?`<em class="mtTx">${esc(tx)}</em>`:''}</span>
        <small>${MT_GL[g]}${bk&&!norm(nm).includes(norm((NOME_CURTO[bk.n]||bk.n).split(' ')[0]))?' · '+esc(NOME_CURTO[bk.n]||bk.n):''}${f.pluggyInv?' · do banco':''}${out>0?' · '+pc(out)+'% em outras metas':''}</small></div></div>
      <div class="mtPctC" role="group" aria-label="quanto de ${esc(nm)} vai para esta meta">
        <div class="mtChips">${ch.length?ch.map(p=>`<button type="button" class="mtChip${v0===p?' on':''}" data-pq="${p}" aria-pressed="${v0===p}">${p===livre&&livre<100&&![25,50,75].includes(p)?'livre ':''}${pc(p)}%</button>`).join(''):'<span class="mtSemLivre">100% já está em outras metas</span>'}</div>
        <div class="mtStep"><button type="button" class="mtStB" data-ps="-5" aria-label="menos 5%">−</button><label class="mtPct"><input type="number" inputmode="decimal" min="0" max="${livre}" step="1" value="${a?v0:''}" placeholder="0" data-pct="${esc(f.id)}" aria-label="% de ${esc(nm)} para a meta (até ${pc(livre)}%)"><span>%</span></label><button type="button" class="mtStB" data-ps="5" aria-label="mais 5%">+</button></div>
      </div>
      <small class="mtPctR" aria-live="polite"></small>
      ${(g==='fii'||g==='acao')?`<label class="ckrow sm"><input type="checkbox" data-reinv="${esc(f.id)}" ${a&&a.reinv?'checked':''}><span>proventos reinvestem na meta</span></label>`:''}
    </div>`;};
  const L=S.fiis.slice().sort((a,b)=>mtValorAtivo(b)-mtValorAtivo(a));
  box.innerHTML=`<div class="sheet mtSheet" role="dialog" aria-modal="true" aria-label="Fontes da meta"><div class="sh-head"><h3>Fontes · ${esc(m.nome)}</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <p class="small">Escolha quanto de cada investimento pertence a esta meta. O saldo da meta usa o valor de mercado de hoje. Um ativo pode ser dividido entre metas até 100%.</p>
    <div class="mtSrcL">${L.length?L.map(lin).join(''):'<p class="small">Você ainda não tem investimentos cadastrados. Adicione em Investimentos ou planeje abaixo um ativo a comprar.</p>'}</div>
    <h4 class="rsH">a comprar</h4>
    <div id="mtPl">${(m.planos||[]).map(p=>mtPlanoRow(p,true)).join('')}</div>
    <div class="mtPk" id="mtPk">
      <input type="hidden" id="mtPlT" value="fii">
      <div class="mtPkTs" role="radiogroup" aria-label="tipo do ativo a comprar">${MT_PK_T.map(([k,l,c],i)=>`<button type="button" role="radio" class="mtPkT${i?'':' on'}" data-pkt="${k}" aria-checked="${!i}" style="--cc:${c}">${l}</button>`).join('')}</div>
      <label class="mtPkBusca"><span class="mtPkLupa" aria-hidden="true">${I('search')}</span><input id="mtPlN" maxlength="30" autocomplete="off" autocapitalize="characters" placeholder="${MT_PK_PH.fii}" aria-label="nome ou código do ativo a comprar"></label>
      <div class="mtPkS" id="mtPkS" role="listbox" aria-label="sugestões"></div>
      <div class="mtPkRod"><input id="mtPlV" inputmode="decimal" placeholder="Valor em R$ (opcional)" aria-label="valor que pretende investir"><button type="button" class="btn2 sm" id="mtPlAdd" aria-label="adicionar à lista a comprar">${I('plus')}<span>adicionar</span></button></div>
    </div>
    <button class="btn full" id="mtSrcOk">Salvar fontes</button></div>`;
  box.classList.add('on');
  const planos=(m.planos||[]).slice();
  /* % por chip, stepper ou digitando: limita ao livre e mostra quanto vai para a meta */
  const pinta=row=>{const inp=row.querySelector('[data-pct]'),v=String(inp.value).trim()?parseBR(String(inp.value)):0,val=+row.dataset.val||0,r=row.querySelector('.mtPctR');
    row.querySelectorAll('[data-pq]').forEach(b=>{const on=Math.abs(+b.dataset.pq-v)<1e-9;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
    row.classList.toggle('sel',v>0);if(r)r.innerHTML=v>0?'<b class="nw">'+brl(val*Math.min(v,100)/100)+'</b> deste ativo para a meta':'';};
  const poe=(row,v)=>{const lv=+row.dataset.livre||0;v=Math.max(0,Math.min(lv,Math.round(v*100)/100));const inp=row.querySelector('[data-pct]');inp.value=v?String(v).replace('.',','):'';if(inp.type==='number')inp.value=v?String(v):'';pinta(row);};
  box.querySelectorAll('.mtSrc2').forEach(row=>{pinta(row);
    row.addEventListener('click',e=>{const q=e.target.closest('[data-pq]'),st=e.target.closest('[data-ps]');if(!q&&!st)return;e.preventDefault();
      const inp=row.querySelector('[data-pct]'),cur=String(inp.value).trim()?parseBR(String(inp.value)):0;
      if(q){const v=+q.dataset.pq;poe(row,Math.abs(cur-v)<1e-9?0:v);}else{const d=+st.dataset.ps;poe(row,d>0?Math.floor((cur+1e-9)/5)*5+5:Math.ceil((cur-1e-9)/5)*5-5);}vibra(6);});
    row.querySelector('[data-pct]').addEventListener('input',()=>pinta(row));});
  box.querySelectorAll('[data-pldel]').forEach(b=>b.onclick=()=>{const i=planos.findIndex(p=>p.id===b.dataset.pldel);if(i>=0)planos.splice(i,1);b.closest('.mtSrc').remove();});
  /* seletor do "a comprar" */
  const inT=$('#mtPlT'),inN=$('#mtPlN'),sug=$('#mtPkS');let esc1='';
  const desenha=()=>{const t=inT.value,q=norm(inN.value),Q=inN.value.trim().toUpperCase();let L=mtPkLista(t);
    if(q)L=L.filter(x=>norm(x.t).includes(q)||norm(x.n).includes(q));
    const lim=q?12:(t==='cripto'?10:8),vis=L.slice(0,lim);
    let h=vis.map(x=>{const p=t==='rf'?0:mtPkPreco(x.t,t),tem=t!=='rf'&&(S.fiis||[]).some(f=>f.ticker===x.t&&f.cotas>0&&(t==='cripto')===(tipoOf(f)==='cripto'));const on=esc1===x.t;
      return `<button type="button" class="mtPkC${on?' on':''}" role="option" aria-selected="${on}" data-pk="${esc(x.t)}" style="--cc:${x.cor||'#94a3b8'}">${mtPkIco(x.t,t)}<span class="mtPkTx"><b>${esc(x.t)}</b><small>${esc(x.n)}</small>${p>0?`<em class="mtPkP nw">${mtPkPrecoTxt(p)}</em>`:''}</span>${tem?'<i class="mtPkH" title="você já tem na carteira" aria-label="na carteira"></i>':''}${on?'<i class="mtPkOk" aria-hidden="true">'+I('check')+'</i>':''}</button>`;}).join('');
    if(Q&&!L.some(x=>x.t.toUpperCase()===Q))h+=`<button type="button" class="mtPkC livre${esc1===Q?' on':''}" role="option" aria-selected="${esc1===Q}" data-pk="${esc(t==='rf'?inN.value.trim().slice(0,30):Q.replace(/[^A-Z0-9.]/g,'').slice(0,12))}" style="--cc:#94a3b8"><span class="mtPkI livre">${I('plus')}</span><span class="mtPkTx"><b>usar “${esc(inN.value.trim().slice(0,30))}”</b><small>${t==='cripto'?'outra moeda':t==='rf'?'nome que você digitou':'outro código'}</small></span></button>`;
    if(!h)h='<p class="mtPkV">Nada encontrado.</p>';
    else if(h.includes('class="mtPkH"'))h+='<p class="mtPkV mtPkLeg"><i class="mtPkHl" aria-hidden="true"></i>já está na sua carteira</p>';
    sug.innerHTML=h;
    if(t!=='rf'&&!q&&L.length>lim)sug.insertAdjacentHTML('beforeend',`<p class="mtPkV">digite para buscar entre ${L.length} ${t==='cripto'?'moedas':'opções'}</p>`);};
  box.querySelectorAll('[data-pkt]').forEach(b=>b.onclick=()=>{inT.value=b.dataset.pkt;box.querySelectorAll('[data-pkt]').forEach(x=>{const on=x===b;x.classList.toggle('on',on);x.setAttribute('aria-checked',String(on));});
    inN.placeholder=MT_PK_PH[inT.value];inN.setAttribute('autocapitalize',inT.value==='rf'?'sentences':'characters');esc1='';inN.value='';desenha();btA();
    if(inT.value==='cripto')cgPrecos(CRIPTO_LIST.map(x=>x.id),false).then(()=>{if(inT.value==='cripto'&&document.body.contains(sug))desenha();}).catch(()=>{});});
  inN.addEventListener('input',()=>{esc1='';desenha();btA();});
  /* escolher um cartão não mexe na busca (a grade continua à vista); o botão diz o que vai entrar */
  const btA=()=>{const b=$('#mtPlAdd');if(b)b.querySelector('span').textContent=esc1?'adicionar '+(inT.value==='rf'?esc1:esc1.slice(0,8)):'adicionar';};
  sug.addEventListener('click',e=>{const c=e.target.closest('[data-pk]');if(!c)return;esc1=esc1===c.dataset.pk?'':c.dataset.pk;desenha();btA();});
  desenha();
  $('#mtPlAdd').onclick=()=>{const t=inT.value;let n=(esc1||inN.value).trim().slice(0,30);if(!n){toast('Escolha ou digite o ativo a comprar.',true);return;}
    if(t!=='rf')n=n.toUpperCase().replace(/[^A-Z0-9.]/g,'').slice(0,12)||n;
    const v=$('#mtPlV').value.trim()?parseBR($('#mtPlV').value):0,p={id:uid(),tipo:t,nome:n,valor:v>0?c2(v):0};planos.push(p);
    $('#mtPl').insertAdjacentHTML('beforeend',mtPlanoRow(p,false));
    inN.value='';$('#mtPlV').value='';esc1='';desenha();btA();toast((mtPlanoNome(p))+' na lista a comprar');};
  $('#mtSrcOk').onclick=()=>{
    const novos=[],hj=hojeISO();let erro='';
    box.querySelectorAll('[data-pct]').forEach(inp=>{const fid=inp.dataset.pct,v=String(inp.value).trim()?parseBR(String(inp.value)):0;if(!v)return;
      const f=S.fiis.find(x=>x.id===fid),livre=Math.max(0,100-mtAlocado(fid,m.id));
      if(!(v>0&&v<=100)){erro='Use um % entre 0 e 100.';return;}
      if(v>livre+1e-9){erro=(f?nomeAtivo(f):'ativo')+': só '+String(c2(livre)).replace('.',',')+'% estão livres (o resto já está em outras metas).';return;}
      const ant=(m.ativos||[]).find(a=>a.fid===fid),ri=box.querySelector('[data-reinv="'+fid+'"]');
      novos.push({fid,pct:c2(v),desde:ant&&ant.desde||hj,reinv:!!(ri&&ri.checked)});});
    if(erro){toast(erro,true);return;}
    m.ativos=novos;m.planos=planos;
    if(m.apDest&&m.apDest!=='manual'&&!novos.some(a=>a.fid===m.apDest))m.apDest='manual';
    salvar();toast('Fontes salvas');abreMeta(m.id);render();
  };
}
/* ---------- guardei: registra o aporte ---------- */
let MT_VOLTA=null; // aberto a partir da folha da meta: volta para ela depois de salvar
function aporte(id){
  const m=S.metas.find(x=>x.id===id);if(!m)return;
  const fontes=[{v:'manual',t:'Caixinha da meta'}].concat(mtAtivos(m).map(({f})=>({v:f.id,t:'Comprei mais '+(f.ticker||f.nome||'do ativo')})));
  const contas=[{v:'',t:'Não saiu de uma conta (só registrar)'}].concat(bancosAtivos().map(b=>({v:b.id,t:'Saiu de '+b.nome})));
  const sq=mtStreak(m);
  form('Guardei para '+m.nome,[
    {name:'valor',label:'Valor do aporte (R$)',value:m.aporteMes>0?num(m.aporteMes):'',required:true,inputmode:'decimal',placeholder:'0,00'},
    {name:'data',label:'Quando',type:'date',value:hojeISO(),required:true},
    fontes.length>1?{name:'fonte',label:'Para onde foi',type:'select',value:m.apFonte&&fontes.some(f=>f.v===m.apFonte)?m.apFonte:'manual',options:fontes}:{name:'fonte',type:'hidden',value:'manual'},
    contas.length>1?{name:'conta',label:'De onde saiu',type:'select',value:m.apConta&&contas.some(c=>c.v===m.apConta)?m.apConta:'',options:contas}:{name:'conta',type:'hidden',value:''}
  ],v=>{
    const n=c2(parseBR(v.valor));
    if(!(n>0))return 'Informe um valor maior que zero.';
    const d=DATA_OK.test(String(v.data||''))?String(v.data).slice(0,10):hojeISO();
    const fonte=v.fonte&&v.fonte!=='manual'&&mtAtivos(m).some(x=>x.f.id===v.fonte)?v.fonte:'manual';
    const conta=v.conta&&S.bancos.some(b=>b.id===v.conta)?v.conta:'';
    const a={id:uid(),d,v:n,fonte,conta:conta||'',tx:''};
    if(fonte==='manual'){m.atual=c2((+m.atual||0)+n);
      if(conta){a.tx=mtLancaAporte(m,n,d,conta);}}
    m.aportes=(m.aportes||[]).concat([a]).slice(-600);m.apConta=conta;m.apFonte=fonte;
    salvar();render();if(MT_VOLTA===m.id)setTimeout(()=>{if(!$('#modal').classList.contains('on'))abreMeta(m.id);},0);
    const s2=mtStreak(m);
    toast(fonte!=='manual'?'Aporte registrado. Lance a compra em Investimentos se ainda não lançou.':s2.n>sq.n&&s2.n>1?'Guardado. '+s2.n+' meses seguidos':'Aporte registrado');
  });
}
/* sai da conta como transferência para a meta. Se o banco (Pluggy) já trouxe a saída igual, ela vira o aporte (não duplica). */
function mtLancaAporte(m,n,d,conta){
  const ig=S.tx.filter(t=>t.pluggyId&&!t.meta&&!t.emp&&!t.faturaKey&&efetivo(t)&&cents(t.valor)===cents(n)&&t.data&&difDias(t.data,d)<=3&&
    ((t.tipo==='despesa'&&t.conta===conta)||(t.tipo==='transf'&&t.de==='b:'+conta&&!t.para))).sort((a,b)=>difDias(a.data,d)-difDias(b.data,d))[0];
  if(ig){ig.metaOrig={tipo:ig.tipo,categoria:ig.categoria,conta:ig.conta||'',forma:ig.forma||''};
    Object.assign(ig,{tipo:'transf',de:'b:'+conta,para:'',meta:m.id,categoria:'Meta',conta:'',forma:'',cartao:''});delete ig.rev;return ig.id;}
  const t={id:uid(),tipo:'transf',valor:n,data:d,de:'b:'+conta,para:'',meta:m.id,categoria:'Meta',descricao:'Guardei para '+m.nome,status:'pago'};
  S.tx.push(t);return t.id;
}
/* desfaz um aporte: tira da caixinha e remove (ou devolve ao original do banco) o lançamento */
function mtApDel(m,apId){
  const L=m.aportes||[],i=L.findIndex(a=>a.id===apId);if(i<0)return false;const a=L[i];
  if(a.fonte==='manual')m.atual=c2(Math.max(0,(+m.atual||0)-a.v));
  if(a.tx){const t=S.tx.find(x=>x.id===a.tx);if(t){if(t.pluggyId&&t.metaOrig){const o=t.metaOrig;Object.assign(t,{tipo:o.tipo,categoria:o.categoria,conta:o.conta,forma:o.forma});if(o.tipo!=='transf'){t.de='';t.para='';}delete t.meta;delete t.metaOrig;}else S.tx=S.tx.filter(x=>x.id!==t.id);}}
  L.splice(i,1);if((m.baseN|0)>i)m.baseN=(m.baseN|0)-1;return true;
}
/* lançamento de meta excluído em Lançamentos: o aporte sai do histórico e da caixinha */
function mtTxSaiu(t){const m=(S.metas||[]).find(x=>x.id===t.meta);if(!m)return;const a=(m.aportes||[]).find(x=>x.tx===t.id);if(!a)return;
  const i=m.aportes.indexOf(a);if(a.fonte==='manual')m.atual=c2(Math.max(0,(+m.atual||0)-a.v));m.aportes.splice(i,1);if((m.baseN|0)>i)m.baseN=(m.baseN|0)-1;}
/* extrato/Pluggy: saída igual a um aporte lançado à mão (mesma conta, valor, até 3 dias) liga em vez de duplicar */
function metaManualIgual(l,d,usados){
  if(!(l.valor<0))return null;const v=cents(Math.abs(l.valor));
  const L=S.tx.filter(t=>t.meta&&t.tipo==='transf'&&!t.pluggyId&&!t.impId&&!usados.has(t.id)&&efetivo(t)&&t.de===d&&cents(t.valor)===v&&t.data&&difDias(t.data,l.data)<=3);
  return L.sort((a,b)=>difDias(a.data,l.data)-difDias(b.data,l.data))[0]||null;
}
/* lembrete do dia de guardar (alerta no sino; notificação do aparelho se já autorizada) */
function mtAvisos(){
  const out=[],hj=new Date(),dia=hj.getDate(),ym=mesAtual();
  if(!pode('metas'))return out; // v10.89: metas eram do Plus (v10.161: liberadas no Grátis); sem o recurso o lembrete não aparece (antes aparecia com a aba bloqueada)
  (S.metas||[]).forEach(m=>{if(!(m.aporteMes>0)||!(m.diaAporte>0))return;const alvo=alvoMeta(m);if(saldoMeta(m)>=alvo&&alvo>0)return;
    const dd=Math.min(m.diaAporte,new Date(hj.getFullYear(),hj.getMonth()+1,0).getDate());if(dia<dd)return;
    const feito=(m.aportes||[]).filter(a=>a.d&&a.d.slice(0,7)===ym).reduce((s,a)=>s+cents(a.v),0);if(feito>=cents(m.aporteMes))return;
    out.push({id:'mt|'+m.id+'|'+ym,k:'aviso',m,h:`${I('piggy')} dia de guardar para <b>${esc(m.nome)}</b> · ${brl(Math.max(0,m.aporteMes-feito/100))}${dia>dd?' (era dia '+dd+')':''}`});});
  return out;
}
let MT_NOTIF_T=null;
function mtLembra(){
  if(!S||!S.cfg||!notifOn('metas'))return;const L=mtAvisos();if(!L.length)return;const hj=hojeISO(),av=Object.assign({},S.cfg.mtAv||{});
  const novos=L.filter(a=>av[a.m.id]!==hj);if(!novos.length)return;
  novos.forEach(a=>{av[a.m.id]=hj;});S.cfg.mtAv=av;
  clearTimeout(MT_NOTIF_T);MT_NOTIF_T=setTimeout(()=>{const a=novos[0],txt='Dia de guardar '+(OCULTO?'':brl(a.m.aporteMes)+' ')+'para '+a.m.nome;toast(txt);
    try{if('Notification' in window&&Notification.permission==='granted'&&navigator.serviceWorker)navigator.serviceWorker.getRegistration().then(async r=>{if(!r)return;
      /* v10.97: aparelho inscrito no push já recebe o lembrete da alertas-push: não mostra uma segunda notificação */
      const sub=r.pushManager&&await r.pushManager.getSubscription().catch(()=>null);if(sub)return;
      r.showNotification('GranaViva',{body:S.cfg.pushDiscreto!==false?'Hoje é dia de guardar para uma meta.':txt,tag:'gv-meta-'+a.m.id,icon:'icons/icon-192.png'});}).catch(()=>{});}catch(e){}
    try{atualizaSino();}catch(e){}},3200);
  try{gravaLocal();}catch(e){}
}
/* sanea: campos novos da meta, vindos de backup, nuvem ou arquivo editado */
function saneaMetaExtra(m,ids){
  const o={};const arr=a=>Array.isArray(a)?a.filter(x=>x&&typeof x==='object'):[];
  const ISO=x=>{const t=String(x||'');return DATA_OK.test(t)&&dataOk(t.slice(0,4),t.slice(5,7),t.slice(8,10))?t.slice(0,10):'';};
  const idv=x=>{const t=String(x==null?'':x);return t&&ID_OK.test(t)?t:'';}; // id inválido vira vazio (não um id novo que não aponta para nada)
  const vistos=new Set();
  o.ativos=arr(m.ativos).slice(0,60).map(a=>({fid:idv(a.fid),pct:Math.min(100,Math.max(0,c2(a.pct))),desde:ISO(a.desde),reinv:!!a.reinv})).filter(a=>a.fid&&a.pct>0&&!vistos.has(a.fid)&&vistos.add(a.fid));
  o.planos=arr(m.planos).slice(0,30).map(p=>({id:sid(p.id),tipo:['fii','acao','etf','rf','cripto'].includes(p.tipo)?p.tipo:'fii',nome:str(p.nome,30).trim()||'ativo',valor:Math.max(0,c2(p.valor))}));
  o.aportes=arr(m.aportes).slice(-600).map(a=>({id:sid(a.id),d:ISO(a.d),v:Math.max(0,c2(a.v)),fonte:a.fonte&&a.fonte!=='manual'?idv(a.fonte)||'manual':'manual',conta:idv(a.conta),tx:idv(a.tx)})).filter(a=>a.d&&a.v>0);
  {const d=parseInt(m.diaAporte,10);o.diaAporte=d>=1&&d<=28?d:0;}
  o.cripMax=Math.max(0,Math.min(100,c2(m.cripMax)));
  o.ipca=!!m.ipca;o.alvoBase=Math.max(0,c2(m.alvoBase));o.alvoEm=ymOk(m.alvoEm);if(!o.ipca||!o.alvoEm||!(o.alvoBase>0)){o.ipca=false;o.alvoBase=0;o.alvoEm='';}
  o.baseEm=ISO(m.baseEm);o.baseN=Math.max(0,Math.min(o.aportes.length,parseInt(m.baseN,10)||0));
  o.apDest=m.apDest&&m.apDest!=='manual'?idv(m.apDest)||'manual':'manual';o.apConta=idv(m.apConta);o.apFonte=m.apFonte&&m.apFonte!=='manual'?idv(m.apFonte)||'manual':'manual';
  o.criadoEm=ISO(m.criadoEm);
  const F=m.fipe;
  if(F&&typeof F==='object'&&F.b&&F.mo&&F.a){const cn=x=>({c:str(x&&x.c,20).replace(/[^\w.-]/g,''),n:str(x&&x.n,90)});
    const fp={tp:FIPE_TP[F.tp]?F.tp:'cars',b:cn(F.b),mo:cn(F.mo),a:cn(F.a),v:Math.max(0,c2(F.v)),ref:str(F.ref,30),cod:str(F.cod,12).replace(/[^\d-]/g,''),chk:ISO(F.chk),em:ISO(F.em),v0:Math.max(0,c2(F.v0)),em0:ISO(F.em0),erro:F.erro?'1':'',
      hist:arr(Array.isArray(F.hist)?F.hist.filter(Array.isArray).map(h=>({d:h[0],v:h[1]})):[]).slice(-24).map(h=>[ISO(h.d),Math.max(0,c2(h.v))]).filter(h=>h[0]&&h[1]>0)};
    if(fp.b.c&&fp.mo.c&&fp.a.c&&fp.v>0)o.fipe=fp;}
  /* limpa o que é vazio para a meta antiga continuar igual */
  ['ativos','planos','aportes'].forEach(k=>{if(!o[k].length)delete o[k];});
  ['diaAporte','cripMax','alvoBase','baseN'].forEach(k=>{if(!o[k])delete o[k];});
  ['alvoEm','baseEm','apConta','criadoEm'].forEach(k=>{if(!o[k])delete o[k];});
  if(!o.ipca)delete o.ipca;if(o.apDest==='manual')delete o.apDest;if(o.apFonte==='manual')delete o.apFonte;
  return o;
}
/* soma das alocações de um mesmo ativo entre metas: corta o excesso (na ordem das metas) para nunca passar de 100% */
function saneaAlocacoes(metas){
  const usado={};metas.forEach(m=>{if(!m.ativos)return;m.ativos=m.ativos.map(a=>{const u=usado[a.fid]||0,p=Math.max(0,Math.min(a.pct,c2(100-u)));usado[a.fid]=u+p;return Object.assign({},a,{pct:p});}).filter(a=>a.pct>0);if(!m.ativos.length)delete m.ativos;});
  return metas;
}

function catForm(id){
  const edit=id||null;
  const cur=edit||'';
  let icoSel=edit?catIcon(edit):CAT_ICON_PICK[0][1];
  let corSel=edit?(catCor(edit)||''):'';
  form(edit?'Editar categoria':'Nova categoria',[{name:'nome',label:'Nome',required:true,value:edit||'',placeholder:'ex: Viagem'}],v=>{
    const n=String(v.nome).trim();
    if(!n)return 'Informe o nome.';
    if(!edit&&S.cats.some(c=>c.toLowerCase()===n.toLowerCase()))return 'Essa categoria já existe.';
    if(edit&&n.toLowerCase()!==edit.toLowerCase()&&S.cats.some(c=>c.toLowerCase()===n.toLowerCase()))return 'Essa categoria já existe.';
    if(edit){
      const i=S.cats.indexOf(edit);if(i>=0)S.cats[i]=n;
      S.tx.forEach(t=>{if(t.categoria===edit)t.categoria=n;});
      if(S.orc[edit]!=null){S.orc[n]=S.orc[edit];delete S.orc[edit];}
      Object.values(S.orcMes||{}).forEach(mp=>{if(mp[edit]!=null){mp[n]=mp[edit];delete mp[edit];}});
      if(S.catIcons[edit]){S.catIcons[n]=S.catIcons[edit];delete S.catIcons[edit];}
      if(S.catCores[edit]){S.catCores[n]=S.catCores[edit];delete S.catCores[edit];}
      if(S.fixas)S.fixas.forEach(f=>{if(f.categoria===edit)f.categoria=n;});
    }else S.cats.push(n);
    S.catIcons[n]=icoSel;
    if(corSel)S.catCores[n]=corSel;else delete S.catCores[n];
    salvar();render();toast(edit?'Categoria atualizada':'Categoria criada');
  });
  if(edit){const mf=$('#mf');if(mf){const k=S.tx.filter(t=>t.categoria===edit).length;mf.insertAdjacentHTML('beforeend',`<button type="button" class="btn2 full perigo" style="margin-top:8px" data-act="del-cat" data-id="${esc(edit)}">${I('trash')} Remover categoria${k?` <small style="opacity:.7">(${k} lançamento${k>1?'s':''} mantêm o nome)</small>`:''}</button>`);}}
  // inject picker into the just-created form
  const mf=$('#mf');
  const box=document.createElement('div');
  box.innerHTML=`<h4 style="margin-top:6px">Ícone</h4><div class="icoPick" id="icoPick">${CAT_ICON_PICK.map(([k,ic,lab])=>`<button type="button" data-ic="${ic}" class="${ic===icoSel?'on':''}" title="${lab}" aria-label="${lab}">${I(ic)}</button>`).join('')}</div>
    <h4>Cor (opcional)</h4><div class="colPick" id="colPick"><button type="button" data-col="" class="${!corSel?'on':''}" title="automática" style="background:var(--card2);border:1px dashed var(--mut)"></button>${CAT_COR_PICK.map(c=>`<button type="button" data-col="${c}" class="${c===corSel?'on':''}" title="${c}" style="background:${c}"></button>`).join('')}</div>`;
  mf.insertBefore(box,mf.querySelector('button[type="submit"]'));
  box.querySelectorAll('#icoPick button').forEach(b=>b.onclick=()=>{icoSel=b.dataset.ic;box.querySelectorAll('#icoPick button').forEach(x=>x.classList.toggle('on',x===b));});
  box.querySelectorAll('#colPick button').forEach(b=>b.onclick=()=>{corSel=b.dataset.col;box.querySelectorAll('#colPick button').forEach(x=>x.classList.toggle('on',x===b));});
}
function exportar(){
  const pacote=Object.assign({app:'grana-viva',versao:1,exportadoEm:new Date().toISOString()},S);
  const blob=new Blob([JSON.stringify(pacote,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download='grana-viva-backup-'+hojeISO()+'.json';
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},500);
  toast('Backup exportado');
}
function limpar(){
  confirma({titulo:'Apagar todos os dados?',texto:'Lançamentos, fundos, metas, cartões, contas e categorias serão apagados. Exporte um backup antes se quiser guardar. Para confirmar, digite APAGAR.',ok:'Apagar tudo',perigo:true,digitar:'APAGAR'},()=>{
    S=Object.assign(vazio(),{cfg:S.cfg});APAGA_LIBERADO=true;
    salvar();applyCfg();render();toast('Dados apagados');
  });
}

/* ---------- confirmação própria (substitui window.confirm) ---------- */
/* v10.106: folha "Erros recentes" */
function errTextoCopia(){const L=errLista();let ua='';try{ua=(navigator.userAgent||'').replace(/\s+/g,' ').slice(0,160);}catch(e){}
  return 'GranaViva v'+(typeof GV_BUILD==='string'?GV_BUILD:'?')+' · '+ua+'\n'+(L.length?L.map(x=>x.em+' · v'+(x.v||'?')+(x.aba?' · '+x.aba:'')+' · '+x.t+(x.n>1?' ×'+x.n:'')+'\n  '+x.m+(x.p&&x.p.length?'\n  em '+x.p.join(' < '):'')).join('\n'):'nenhum erro registrado');}
function abreErros(){
  const L=errLista().slice().reverse(),box=$('#modal');
  const nome=t=>t==='promessa'?'falha assíncrona':t==='armazenamento'?'armazenamento':t==='aviso'?'aviso':'erro';
  box.innerHTML=`<div class="sheet erSheet" role="dialog" aria-modal="true" aria-label="Erros recentes"><div class="sh-head"><h3>Erros recentes</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <p class="hmNota">Ficam só neste aparelho (até ${ERR_MAX}). Não guardam valores, nomes, e-mails nem descrições. Copie e envie ao suporte se algo não funcionar.</p>
    ${L.length?`<div class="erLista">${L.map(x=>`<div class="erItem"><div class="erTop"><b>${esc(nome(x.t))}</b><small>${esc(fmtHora(x.em))} · v${esc(x.v||'?')}${x.aba?' · '+esc(x.aba):''}${x.n>1?' · ×'+esc(String(x.n)):''}</small></div><code>${esc(x.m)}</code>${x.p&&x.p.length?`<small class="erP">${esc(x.p.join(' < '))}</small>`:''}</div>`).join('')}</div>`:`<div class="alVazio">${I('check')}<b>Nenhum erro</b><p>Se algo der errado, o registro aparece aqui.</p></div>`}
    <div class="cfBtns">${L.length?'<button class="btn2" type="button" data-act="erros-limpar">Limpar</button>':''}<button class="btn" type="button" data-act="erros-copiar">${I('copy')} Copiar</button></div></div>`;
  box.classList.add('on');
}
function copiaTexto(t){return (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(t):Promise.reject()).catch(()=>{const ta=document.createElement('textarea');ta.value=t;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:-1000px;opacity:0';document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand('copy');}catch(e){}ta.remove();if(!ok)throw new Error('copiar');});}
function confirma(o,cb){
  const box=$('#modal');
  box.innerHTML=`<div class="sheet cfSheet">
    <div class="sh-head"><h3>${esc(o.titulo)}</h3></div>
    <p class="cfTxt">${esc(o.texto||'')}</p>
    ${o.digitar?`<label class="fld"><input id="cfIn" autocomplete="off" placeholder="${esc(o.digitar)}"></label><p class="cfHint">digite ${esc(o.digitar)} para confirmar</p>`:''}
    <div class="cfBtns${o.alt?' tres':''}">${o.alt?`<button class="btn2${o.altPerigo?' danger':''}" type="button" id="cfAlt" data-cf="alt">${esc(o.alt)}</button>`:''}${o.semNao?'':'<button class="btn2" type="button" data-cf="no">Cancelar</button>'}<button class="btn${o.perigo?' perigo':''}" type="button" id="cfOk" data-cf="ok"${o.digitar?' disabled':''}>${esc(o.ok||'Confirmar')}</button></div>
  </div>`;
  box.classList.add('on');
  const inp=$('#cfIn'),ok=$('#cfOk');
  if(inp){inp.addEventListener('input',()=>{ok.disabled=inp.value.trim()!==o.digitar;});setTimeout(()=>inp.focus(),60);}
  box.querySelector('.cfBtns').addEventListener('click',e=>{
    const b=e.target.closest('[data-cf]');if(!b)return;
    if(b.dataset.cf==='alt'){closeModal();if(o.altCb)o.altCb();return;}
    if(b.dataset.cf!=='ok'){closeModal();return;}
    if(inp&&inp.value.trim()!==o.digitar)return;
    closeModal();cb();
  });
}
function txMenu(id){
  const t=S.tx.find(x=>x.id===id);if(!t)return;
  const ops=[];
  if(t.faturaKey)ops.push(['fat-abre','card','Ver compras e pagamentos']);
  if(t.emp)ops.push(['emp-abre-tx','handCoins','Ver empréstimo de '+primeiroNome(empNome(t.emp))]);
  if(!t.faturaKey)ops.push(['edit-tx','edit','Editar']);
  if(t.tipo==='receita'&&statusTx(t)==='atrasado')ops.push(['trab-lote','calendar','Ainda não recebi: informar quando cai']);
  if(!t.faturaKey)ops.push(['anexos','clip','Comprovantes'+(t.anexos&&t.anexos.length?' ('+t.anexos.length+')':'')]);
  if(!t.faturaKey&&t.tipo!=='transf')ops.push(['dup-tx','copy','Duplicar']);
  if(t.origem==='banco'&&t.conta&&(t.tipo==='despesa'||t.tipo==='receita'))ops.push(['tx-propria','swap','Foi pra outra conta minha']);
  if(t.tipo==='despesa'&&!t.emp&&!t.cartao&&!t.faturaKey&&!temSplit(t)&&efetivo(t))ops.push(['tx-emp','handCoins','Emprestei (vai voltar)']);
  if(t.tipo==='receita'&&efetivo(t))ops.push(['tx-empv','handCoins','Devolução de empréstimo']);
  if(t.emp&&t.empDir==='out'&&!t.pluggyId&&!t.importado)ops.push(t.empAnt?['emp-desant-tx','undo','Descontar da conta de novo']:['emp-ant-tx','clock','Saiu antes do app (não mexer no saldo)']);
  if(t.emp&&t.empDir!=='perdao')ops.push(['tx-desemp','close','Não foi empréstimo']);
  ops.push(['del-tx','trash','Excluir',1]);
  const box=$('#modal');
  box.innerHTML=`<div class="sheet txSheet"><div class="txsHead"><span class="ic" style="color:${corCat(t.categoria)}">${I(catIcon(t.categoria))}</span><div><b>${esc(nomeTx(t).n||t.categoria)}</b>${nomeTx(t).n!==t.descricao&&t.descricao?`<small class="txOrig">${esc(t.descricao)}</small>`:''}<small>${temSplit(t)?'dividido em '+t.split.length+' categorias':esc(t.categoria)}${t.sub?' › '+esc(t.sub):''} · ${t.trab&&t.tipo==='receita'?'trabalhado '+fmtData(t.trab)+' · '+(t.status==='previsto'?'recebe ':'recebeu ')+fmtData(t.data):fmtData(t.data)}</small></div><strong class="${t.tipo==='receita'?'pos':t.tipo==='transf'?'':'neg'}">${brl(t.valor)}</strong></div>
    ${temSplit(t)?`<div class="spDet">${t.split.map(p=>`<div class="spDetR"><span class="spDetI" style="color:${corCat(p.cat)}">${I(catIcon(p.cat))}</span><span>${esc(p.cat)}</span><b>${brl(p.v)}</b></div>`).join('')}</div>`:''}
    ${ops.map(([a,ic,l,d])=>`<button class="txsOp${d?' perigo':''}" data-tm="${a}">${I(ic)}<span>${esc(l)}</span></button>`).join('')}
    <button class="btn2 full" data-tm="">Fechar</button></div>`;
  box.classList.add('on');
  box.querySelector('.txSheet').addEventListener('click',e=>{const b=e.target.closest('[data-tm]');if(!b)return;e.stopPropagation();const a=b.dataset.tm;closeModal();if(a)setTimeout(()=>ACT[a](id),30);});
}
/* ---------- v10.81: assistente financeiro (perguntas sobre os próprios dados) ----------
   os números saem de funções fixas sobre S (as mesmas das telas). para a IA vão só a pergunta e esses totais prontos;
   ela apenas redige. a resposta é conferida no servidor (nenhuma quantia fora dos fatos) e o assistente não altera nada. */
const AS_SINON=[[/comida|mercado|supermercado|restaurante|ifood|lanche|almoco|janta|padaria/,'Alimentação'],[/uber|99|gasolina|combustivel|onibus|metro|transporte|carro/,'Transporte'],[/aluguel|condominio|luz|energia|agua|internet|moradia|casa/,'Moradia'],[/farmacia|remedio|medico|saude|plano de saude|dentista/,'Saúde'],[/escola|faculdade|curso|educacao/,'Educação'],[/lazer|cinema|show|viagem|passeio/,'Lazer']];
const FB=v=>FMT_BRL.format(Number(v)||0);
const mesRot=m=>MESES[+m.slice(5,7)-1]+'/'+m.slice(0,4);
function asPeriodo(q){
  const hj=hojeISO(),ma=hj.slice(0,7),ano=(q.match(/\b(20\d\d)\b/)||[])[1];
  let ult=q.match(/ultimos?\s+(\d{1,2})\s+mes/);if(ult){const n=Math.max(1,Math.min(24,+ult[1]));const ms=[];for(let k=n-1;k>=0;k--)ms.push(mesAdd(ma,-k));return {ms,rot:'nos últimos '+n+' meses ('+mesRot(ms[0])+' a '+mesRot(ma)+')'};}
  if(/mes passado|mes anterior|ultimo mes/.test(q)){const m=mesAdd(ma,-1);return {ms:[m],rot:'em '+mesNome(m)};}
  const mi=MESES_LONGO.findIndex(x=>new RegExp('\\b'+norm(x)+'\\b').test(q));
  if(mi>=0){let y=ano||hj.slice(0,4);let m=y+'-'+pad(mi+1);if(!ano&&m>ma)m=(+y-1)+'-'+pad(mi+1);return {ms:[m],rot:'em '+mesNome(m)};}
  if(ano||/\bno ano\b|neste ano|este ano|esse ano|do ano\b|\banual/.test(q)){const y=ano||hj.slice(0,4);const ms=[];const fim=y===hj.slice(0,4)?ma:y+'-12';for(let k=1;k<=12;k++){const m=y+'-'+pad(k);if(m<=fim)ms.push(m);}return {ms,rot:y===hj.slice(0,4)?'em '+y+' (até '+mesRot(ma)+')':'em '+y,ano:y};}
  return {ms:[ma],rot:'em '+mesNome(ma)+' (mês atual, até hoje)',padrao:true};
}
function asCategoria(q){
  const cats=S.cats.slice().sort((a,b)=>b.length-a.length);
  for(const c of cats){const n=norm(c);if(n.length>=3&&q.includes(n))return c;const w=n.split(/\s+/)[0];if(w.length>=5&&q.includes(w))return c;}
  for(const [re,c] of AS_SINON)if(re.test(q)&&S.cats.includes(c))return c;
  return null;
}
/* despesas por competência (compra no cartão pela data da compra; fatura fora, para não contar duas vezes), com as partes dos divididos */
function asCatsMes(ms){const mp={};ms.forEach(m=>txDoPer(m).forEach(t=>{if(t.tipo!=='despesa'||!efetivo(t)||t.faturaKey||!t.data.startsWith(m))return;partesTx(t).forEach(p=>{mp[p.cat]=(mp[p.cat]||0)+p.c;});}));return mp;}
function fatosAssistente(pergunta){
  const q=norm(pergunta),P=asPeriodo(q),hj=hojeISO();
  const F={hoje:fmtData(hj),periodo:P.rot};
  const prim=S.tx.reduce((a,t)=>!a||t.data<a?t.data:a,'');
  F.dados_desde=prim?fmtData(prim):'sem_dados (nenhum lançamento registrado)';
  F.regra='Só lançamentos pagos contam. Despesas por categoria contam compras no cartão pela data da compra e um lançamento dividido entra com a parte de cada categoria.';
  const somaMs=(tipo,cat)=>P.ms.reduce((a,m)=>a+cents(somaMes(m,tipo,cat,true)),0)/100;
  const quer=re=>re.test(q);
  let algum=false;
  const cat=asCategoria(q);
  if(cat&&!quer(/orcamento|limite/)){algum=true;
    const tot=somaMs('despesa',cat),n=P.ms.reduce((a,m)=>a+txDoPer(m).filter(t=>t.tipo==='despesa'&&efetivo(t)&&!t.faturaKey&&t.data.startsWith(m)&&temCat(t,cat)).length,0);
    const ma=hj.slice(0,7),ult={};for(let k=5;k>=0;k--){const m=mesAdd(ma,-k);ult[mesRot(m)]=FB(somaMes(m,'despesa',cat,true));}
    F.categoria={nome:cat,total_no_periodo:FB(tot),lancamentos_no_periodo:n,ultimos_6_meses:ult};
    if(!n&&!tot)F.categoria.observacao='sem_dados nessa categoria no período';}
  if(quer(/maior|mais gast|onde (eu )?(mais )?gast|categorias?|top|principal/)&&!quer(/meta|parcela/)){algum=true;
    const mp=asCatsMes(P.ms),L=Object.keys(mp).sort((a,b)=>mp[b]-mp[a]).slice(0,5);
    F.maiores_categorias=L.length?L.map((c,i)=>({posicao:i+1,categoria:c,total:FB(mp[c]/100)})):'sem_dados no período';
    if(quer(/maior (gasto|compra|despesa)|compra mais cara/)){const T=[];P.ms.forEach(m=>txDoPer(m).forEach(t=>{if(t.tipo==='despesa'&&efetivo(t)&&!t.faturaKey&&t.data.startsWith(m))T.push(t);}));T.sort((a,b)=>b.valor-a.valor);
      F.maiores_lancamentos=T.slice(0,3).map(t=>({descricao:(nomeTx(t).n||t.categoria).slice(0,40),valor:FB(t.valor),data:fmtData(t.data)}));}}
  if(quer(/parcela|parcelad|prestac|vou pagar no cartao|faturas? futura/)){algum=true;
    const fut=S.tx.filter(t=>t.cartao&&t.parcelas>1&&t.tipo==='despesa'&&t.status!=='cancelado'&&t.data>hj);
    const pm={},gr={};fut.forEach(t=>{const m=t.data.slice(0,7);pm[m]=(pm[m]||0)+cents(t.valor);const g=t.grupo||t.id;(gr[g]||(gr[g]={d:String(t.descricao||'').replace(/ \(\d+\/\d+\)$/,''),n:0,c:0})).n++;gr[g].c+=cents(t.valor);});
    const tot=fut.reduce((a,t)=>a+cents(t.valor),0);
    F.parcelas_futuras=fut.length?{total_a_pagar:FB(tot/100),parcelas_restantes:fut.length,compras_parceladas:Object.keys(gr).length,
      por_mes:Object.fromEntries(Object.keys(pm).sort().slice(0,6).map(m=>[mesRot(m),FB(pm[m]/100)])),
      maiores_compras:Object.values(gr).sort((a,b)=>b.c-a.c).slice(0,5).map(g=>({compra:g.d.slice(0,40),parcelas_restantes:g.n,falta_pagar:FB(g.c/100)}))}:'sem_dados (nenhuma parcela de cartão a vencer depois de hoje)';}
  if(quer(/meta|objetivo|guardar|juntar|falta para|quanto falta/)){algum=true;
    F.metas=S.metas.length?S.metas.slice(0,8).map(m=>{const D=mtSaldoD(m),al=alvoMeta(m),falta=Math.max(0,cents(al)-cents(D.total))/100,o={meta:m.nome,alvo:FB(al),guardado:FB(D.total),falta:FB(falta)};
      /* v10.87: fontes da meta */
      if(mtNova(m)){o.fontes=[].concat(D.caixa>0||m.cdi?[{fonte:'caixinha'+(m.cdi?' '+(m.pctCdi||100)+'% do CDI':''),valor:FB(D.caixa)}]:[],mtAtivos(m).map(({a,f})=>({fonte:(f.ticker||f.nome||'ativo')+' ('+MT_GL[mtGrupo(f)]+')',percentual_da_posicao:a.pct,valor:FB(mtValorAtivo(f)*a.pct/100)})),(m.planos||[]).map(p=>({fonte:p.nome+' (a comprar)'})));
        o.de_onde_veio={voce:FB(D.voce),rendimento:FB(D.cdi),proventos:FB(D.prov),variacao_dos_ativos:FB(D.varia)};if(m.aporteMes>0)o.aporte_mensal=FB(m.aporteMes);const ch=mtChega(m);if(ch)o.previsao_de_chegada=mesRot(ch);if(m.fipe)o.alvo_tabela_fipe=(m.fipe.mo&&m.fipe.mo.n||'')+' '+(m.fipe.a&&m.fipe.a.n||'');const rk=mtRisco(m);if(rk)o.cripto_acima_do_limite=Math.round(rk.pc)+'% (limite '+rk.lim+'%)';}
      if(m.prazo){o.prazo=mesRot(m.prazo);const n=mesesAte(m.prazo);if(falta>0&&n>0)o.guardar_por_mes_ate_o_prazo=FB(c2(pmtMeta(D.total,al,n,taxaMesMeta(m))));if(n<=0&&falta>0)o.situacao='prazo vencido';}
      if(falta<=0)o.situacao='meta atingida';return o;}):'sem_dados (nenhuma meta cadastrada)';}
  if(quer(/provento|dividendo|rendimento|jcp|juros sobre capital/)){algum=true;
    const y=P.ano||hj.slice(0,4),pa={};let tot=0;
    S.fiis.forEach(f=>(f.ops||[]).forEach(o=>{if(o.tipo==='provento'&&o.data&&o.data.slice(0,4)===y){const c=cents(o.valor);tot+=c;pa[f.ticker||f.nome||'ativo']=(pa[f.ticker||f.nome||'ativo']||0)+c;}}));
    F.proventos={ano:y,total_recebido:FB(tot/100),por_ativo:Object.fromEntries(Object.keys(pa).sort((a,b)=>pa[b]-pa[a]).slice(0,10).map(k=>[k,FB(pa[k]/100)]))};
    if(!tot)F.proventos.observacao='sem_dados (nenhum provento registrado na carteira em '+y+')';}
  if(quer(/orcamento|limite|estour/)){algum=true;const m=P.ms[P.ms.length-1],LO=limOrc(m);
    const L=S.cats.filter(c=>LO[c]>0&&(!cat||c===cat)).map(c=>{const g=somaMes(m,'despesa',c,true);return {categoria:c,limite:FB(LO[c]),gasto:FB(g),uso:Math.round(g/LO[c]*100)+'%',situacao:g>LO[c]?'estourou':g>=LO[c]*0.8?'perto do limite':'dentro do limite'};});
    F.orcamentos={mes:mesRot(m),itens:L.length?L:'sem_dados (nenhum orçamento definido)'};}
  if(quer(/receita|ganhei|recebi|salario|renda|entrou/)){algum=true;
    const mp={};P.ms.forEach(m=>txDoPer(m).forEach(t=>{if(t.tipo==='receita'&&efetivo(t)&&t.data.startsWith(m))mp[t.categoria]=(mp[t.categoria]||0)+cents(t.valor);}));
    F.receitas={total_no_periodo:FB(somaMs('receita')),por_categoria:Object.fromEntries(Object.keys(mp).sort((a,b)=>mp[b]-mp[a]).slice(0,6).map(k=>[k,FB(mp[k]/100)]))};}
  if(quer(/saldo|tenho na conta|dinheiro na conta|quanto tenho/)){algum=true;
    F.saldo={total_hoje:FB(saldoTotal()),contas:Object.fromEntries(S.bancos.filter(b=>!b.arq).slice(0,8).map(b=>[b.nome,FB(saldoBanco(b))]))};}
  if(!algum||quer(/gastei|gasto|despesa|sobrou|economizei|resumo/)){
    const r=somaMs('receita'),d=somaMs('despesa');
    F.resumo_do_periodo={receitas:FB(r),despesas:FB(d),sobra:FB((cents(r)-cents(d))/100)};
    if(!algum){const mp=asCatsMes(P.ms),L=Object.keys(mp).sort((a,b)=>mp[b]-mp[a]).slice(0,3);F.maiores_categorias=L.map(c=>({categoria:c,total:FB(mp[c]/100)}));}}
  return F;
}
/* resposta montada só com os fatos, sem IA (offline, limite, erro ou resposta reprovada na conferência) */
function respostaLocal(F){
  const L=[];
  if(F.categoria)L.push(F.categoria.nome+' '+F.periodo+': '+F.categoria.total_no_periodo+' em '+F.categoria.lancamentos_no_periodo+' lançamento'+(F.categoria.lancamentos_no_periodo===1?'':'s')+'.');
  if(Array.isArray(F.maiores_categorias)&&F.maiores_categorias.length)L.push('Maiores categorias '+F.periodo+': '+F.maiores_categorias.map(x=>x.categoria+' '+x.total).join(', ')+'.');
  else if(typeof F.maiores_categorias==='string')L.push('Não há despesas pagas '+F.periodo+'.');
  if(F.maiores_lancamentos&&F.maiores_lancamentos.length)L.push('Maior gasto: '+F.maiores_lancamentos[0].descricao+', '+F.maiores_lancamentos[0].valor+' em '+F.maiores_lancamentos[0].data+'.');
  if(F.parcelas_futuras)L.push(typeof F.parcelas_futuras==='string'?'Não há parcelas de cartão a vencer.':'Parcelas a vencer: '+F.parcelas_futuras.total_a_pagar+' em '+F.parcelas_futuras.parcelas_restantes+' parcelas de '+F.parcelas_futuras.compras_parceladas+' compra'+(F.parcelas_futuras.compras_parceladas===1?'':'s')+'.');
  if(F.metas)L.push(typeof F.metas==='string'?'Você ainda não tem metas cadastradas.':F.metas.map(m=>m.meta+': falta '+m.falta+' de '+m.alvo+(m.guardar_por_mes_ate_o_prazo?' (guardar '+m.guardar_por_mes_ate_o_prazo+'/mês até '+m.prazo+')':'')).join('; ')+'.');
  if(F.proventos)L.push('Proventos em '+F.proventos.ano+': '+F.proventos.total_recebido+'.');
  if(F.orcamentos)L.push(typeof F.orcamentos.itens==='string'?'Nenhum orçamento definido para '+F.orcamentos.mes+'.':'Orçamentos de '+F.orcamentos.mes+': '+F.orcamentos.itens.map(o=>o.categoria+' '+o.gasto+' de '+o.limite).join(', ')+'.');
  if(F.receitas)L.push('Receitas '+F.periodo+': '+F.receitas.total_no_periodo+'.');
  if(F.saldo)L.push('Saldo total hoje: '+F.saldo.total_hoje+'.');
  if(F.resumo_do_periodo)L.push(F.periodo.charAt(0).toUpperCase()+F.periodo.slice(1)+': entrou '+F.resumo_do_periodo.receitas+', saiu '+F.resumo_do_periodo.despesas+'.');
  if(/^sem_dados/.test(F.dados_desde))return 'Ainda não há lançamentos no app para responder. Registre seus gastos e receitas e pergunte de novo.';
  return L.join(' ')||'Não encontrei dados para responder isso.';
}
let AS_HIST=[],AS_OCUP=false;
const AS_EX=['Quanto gastei com alimentação este mês?','Qual foi minha maior categoria no mês passado?','Quanto tenho de parcelas futuras?','Quanto falta para minhas metas?','Quanto recebi de proventos no ano?'];
function abreAssistente(){
  const box=$('#modal');
  box.innerHTML=`<div class="sheet asSheet" role="dialog" aria-label="Assistente">
    <div class="sh-head"><h3>${I('chat')} Assistente</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <div class="asMsgs" id="asMsgs" aria-live="polite">${AS_HIST.length?AS_HIST.map(asBolhas).join(''):`<p class="asIntro">Pergunte sobre o seu dinheiro. Eu calculo com os seus lançamentos e respondo; não altero nada no app.</p><div class="asEx">${AS_EX.map(x=>`<button type="button" class="chipEx" data-asq="${esc(x)}">${esc(x)}</button>`).join('')}</div>`}</div>
    <form class="asForm" id="asForm"><input id="asIn" maxlength="300" autocomplete="off" placeholder="ex: quanto gastei com mercado em outubro?" aria-label="sua pergunta"><button class="btn" type="submit" aria-label="perguntar">${I('send')}</button></form>
    <p class="asNota">${USER?'A pergunta e só os totais calculados vão para a IA do Google. Números conferidos com os seus dados. Não é recomendação de investimento.':'Sem login, respondo só com os números deste aparelho, sem IA.'}</p>
  </div>`;
  box.classList.add('on');
  const msgs=$('#asMsgs');msgs.scrollTop=msgs.scrollHeight;
  msgs.addEventListener('click',e=>{const b=e.target.closest('[data-asq]');if(b)perguntaAssistente(b.dataset.asq);});
  $('#asForm').onsubmit=e=>{e.preventDefault();const i=$('#asIn');const q=i.value.trim();if(q.length<3){toast('Escreva a pergunta.',true);return;}i.value='';perguntaAssistente(q);};
  setTimeout(()=>{const i=$('#asIn');if(i&&matchMedia('(min-width:900px)').matches)i.focus();},60);
}
function asBolhas(h){return `<div class="asQ">${esc(h.p)}</div><div class="asR${h.local?' local':''}${h.carregando?' carregando':''}">${h.carregando?'<span class="asDots"><i></i><i></i><i></i></span>'+(h.status?`<small class="asSt">${esc(h.status)}</small>`:''):esc(h.r)}${!h.carregando&&h.nota?`<small>${esc(h.nota)}</small>`:''}</div>`;}
function asPinta(){const m=$('#asMsgs');if(!m)return;m.innerHTML=AS_HIST.map(asBolhas).join('');m.scrollTop=m.scrollHeight;}
async function perguntaAssistente(q){
  if(AS_OCUP)return;AS_OCUP=true;
  const h={p:String(q).slice(0,300),r:'',carregando:true};AS_HIST.push(h);if(AS_HIST.length>20)AS_HIST.shift();asPinta();
  let F;try{F=fatosAssistente(h.p);}catch(e){F={erro:'não foi possível calcular'};}
  const local=nota=>{h.r=respostaLocal(F);h.local=true;h.nota=nota;};
  try{
    if(!USER)local('calculado neste aparelho, sem IA');
    else if(!navigator.onLine)local('sem internet: resposta calculada no aparelho, sem IA');
    else{
      const r=await invokeIA('assistente',{pergunta:h.p,fatos:F,historico:AS_HIST.slice(0,-1).filter(x=>!x.carregando).slice(-3).map(x=>({p:x.p,r:x.r}))},()=>{h.status=IA_OCUPADA;asPinta();});
      const o=r.o,erro=r.erro;h.status='';
      if(trataLimitePlano(o,r.status,'ia_frase',{manual:false}))local('resposta calculada no aparelho');
      else if(r.status!==200||erro||!o)local((erro||'a IA não respondeu')+' · resposta calculada no aparelho');
      else if(!o.resposta)local('resposta direta dos seus números');
      else{h.r=o.resposta;h.nota=o.conferida?'conferido com os seus lançamentos':'';}
    }
  }catch(e){local('resposta calculada no aparelho');}
  h.carregando=false;AS_OCUP=false;asPinta();
}
/* ---------- v10.81: LGPD. exportar todos os meus dados / excluir minha conta ---------- */
function baixaArquivo(nome,conteudo,tipo){
  const url=URL.createObjectURL(new Blob([conteudo],{type:tipo}));const a=document.createElement('a');a.href=url;a.download=nome;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
}
/* v10.123: célula de CSV segura num lugar só. Também neutraliza tab e retorno de carro no início (injeção de fórmula). */
function csvCel(v){let x=String(v??'');if(/^[=+\-@\t\r]/.test(x)&&!/^-?\d/.test(x))x="'"+x;return '"'+x.replace(/"/g,'""')+'"';}
function dataValida(v){const s=String(v??'');return /^\d{4}-\d{2}-\d{2}$/.test(s)?dataOk(s.slice(0,4),s.slice(5,7),s.slice(8,10)):'';}
function csvLancTodos(){
  const esc2=csvCel;
  const lista=S.tx.slice().sort((a,b)=>b.data.localeCompare(a.data));
  return '\ufeff'+txLinhasPlanilha(lista).map(r=>r.map(esc2).join(';')).join('\r\n');
}
function telaMeusDados(){
  const box=$('#modal');
  box.innerHTML=`<div class="sheet lgSheet">
    <div class="sh-head"><h3>Exportar meus dados</h3><button class="x" data-act="fechar" aria-label="fechar">${I('close')}</button></div>
    <p class="iaDica">Uma cópia de tudo o que o GranaViva guarda sobre você, para guardar ou levar para outro app (LGPD, art. 18).</p>
    <div class="lkList">
      <button class="lkRow" data-act="lg-json"><span class="lkRi">${I('lu_download')}</span><span class="lkRt"><b>Arquivo completo (JSON)</b><small>${USER?'conta, lançamentos, cartões, contas, metas, investimentos, ajustes, notificações, uso da IA e lista de comprovantes':'dados deste aparelho (entre na conta para incluir os do servidor)'}</small></span><span class="lkCh">${I('chevR')}</span></button>
      <button class="lkRow" data-act="lg-csv"><span class="lkRi">${I('report')}</span><span class="lkRt"><b>Planilha de lançamentos (CSV)</b><small>${S.tx.length} lançamento${S.tx.length===1?'':'s'}, abre no Excel ou Google Planilhas</small></span><span class="lkCh">${I('chevR')}</span></button>
    </div>
    <p class="iaDica sm">Senhas e chaves de acesso não entram no arquivo. Os comprovantes aparecem listados; cada um pode ser aberto no lançamento.</p>
  </div>`;
  box.classList.add('on');
}
async function exportaJSON(){
  const pac={app:'GranaViva',versao:GV_BUILD,formato:'exportacao-lgpd-1',geradoEm:new Date().toISOString()};
  let servidor=null;
  if(USER){
    toast('Preparando seus dados…');
    try{const {data:o,error}=await sb.functions.invoke('minha-conta',{body:{acao:'exportar'}});
      let erro=o&&o.erro;try{if(!erro&&error&&error.context)erro=(await error.context.json()).erro;}catch(e){}
      if(error||erro)throw new Error(erro||'falhou');servidor=o;}
    catch(e){toast('Não consegui buscar os dados do servidor ('+String(e.message||e)+'). Vou exportar a cópia deste aparelho.',true);}
  }
  if(servidor){pac.conta=servidor.conta;pac.tabelas=servidor.tabelas;pac.comprovantes=servidor.comprovantes;}
  /* a cópia do aparelho entra quando não há servidor ou quando há alterações que ainda não subiram */
  if(!servidor||temPendencia()){pac.copiaDoAparelho=JSON.parse(JSON.stringify(S));if(pac.copiaDoAparelho.cfg){delete pac.copiaDoAparelho.cfg.brapi;}pac.notaAparelho=servidor?'há alterações deste aparelho ainda não sincronizadas; elas estão em copiaDoAparelho':'exportado sem acesso ao servidor';}
  baixaArquivo('granaviva-meus-dados-'+hojeISO()+'.json',JSON.stringify(pac,null,2),'application/json');
  toast('Arquivo com seus dados baixado');
}
function excluirConta(){
  if(!USER){toast('Entre na conta que você quer excluir.',true);return;}
  confirma({titulo:'Excluir minha conta?',texto:'Isso apaga para sempre a sua conta ('+(USER.email||'')+') e todos os dados: lançamentos, cartões, contas, metas, investimentos, ajustes, comprovantes e notificações, em todos os aparelhos. Não dá para desfazer. Se quiser uma cópia, use antes "Exportar meus dados". Para confirmar, digite EXCLUIR.',ok:'Excluir conta',perigo:true,digitar:'EXCLUIR'},async()=>{
    if(!navigator.onLine){toast('Sem internet. Conecte-se para excluir a conta.',true);return;}
    toast('Excluindo sua conta…');
    let erro='';
    try{const {data:o,error}=await sb.functions.invoke('minha-conta',{body:{acao:'excluir',confirmacao:'EXCLUIR'}});
      erro=o&&o.erro;try{if(!erro&&error&&error.context)erro=(await error.context.json()).erro;}catch(e){}
      if(!erro&&(error||!o||!o.ok))erro='não foi possível excluir agora';}
    catch(e){erro='não foi possível excluir agora';}
    if(erro){toast(erro,true);return;}
    await apagaRastrosLocais();
    toast('Conta excluída. Seus dados foram apagados.');
    setTimeout(()=>location.replace(location.pathname),1600);
  });
}
/* depois da exclusão: nada da conta fica neste aparelho (cache cifrado, chave, sessão, preferências, bloqueio, push) */
async function apagaRastrosLocais(){
  clearTimeout(syncT);USER=null;CR_OK=false; // nada mais é gravado neste aparelho até recarregar
  try{const r=navigator.serviceWorker&&await Promise.race([navigator.serviceWorker.getRegistration(),new Promise(ok=>setTimeout(ok,1500))]);const s=r&&r.pushManager&&await r.pushManager.getSubscription();if(s)await s.unsubscribe();}catch(e){}
  try{await sb.auth.signOut({scope:'local'});}catch(e){}
  try{limpaCache();}catch(e){}
  try{const rm=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(/^(gv-|grana-viva|sb-)/.test(k)||k===KEY||k===OWNER_KEY||k===LOCK_KEY)rm.push(k);}rm.forEach(k=>localStorage.removeItem(k));}catch(e){}
  try{sessionStorage.clear();}catch(e){}
  try{CR_KEY=null;await new Promise(ok=>{const r=indexedDB.deleteDatabase('gv-cripto');r.onsuccess=r.onerror=r.onblocked=()=>ok();});}catch(e){}
  try{await new Promise(ok=>{const r=indexedDB.deleteDatabase('gv-dados');r.onsuccess=r.onerror=r.onblocked=()=>ok();});}catch(e){} // v10.106
  try{localStorage.removeItem(ERR_KEY);localStorage.removeItem(LOC_KEY);}catch(e){}
  S=vazio();AS_HIST=[];
}
const ACT={
  'rd-bell':id=>alertaAtivo(id),
  'meta-mes':()=>metaMesForm(),
  'lanc-manual':()=>novoTx(null,'despesa'),
  'gs-extrato':()=>navega('lanc',{tipo:'',mes:mesAtual()}),
  'nav-sub':id=>navega(rotaResolve(id)),
  'nav-grupo':()=>{const p=NAV_PILHA[NAV_PILHA.length-1];if(p&&p.tab!==TAB)navVolta();else go(grupoDe(TAB));},
  'wa-ex':txt=>waExemplo(txt),
  'fechar':closeModal,
  'hm-sem':id=>{const W=semanasDados(8),i=+id,L=document.getElementById('hbSemL');if(!L)return;L.innerHTML=semLegenda(W,i);document.querySelectorAll('.hB-sem .sg').forEach((g,k)=>g.classList.toggle('sel',k===i));},
  'pp-ok':()=>{S.cfg.onbOk=1;salvar();render();},
  'hm-go-orc':()=>{go('orc');},
  'alertas-ver':()=>abrirAlertas(),
  'al-todas':()=>{const ids=[...document.querySelectorAll('.alItem:not(.lido)')].map(e=>e.dataset.aid);alMarca(ids,'l');abrirAlertas();toast('Todos os alertas marcados como lidos');},
  'hm-go':t=>go(t),
  'per-atual':()=>{PER_ATUAL=1;render();},
  'hm-per':k=>{const atual=periodo();if(k==='mes'&&PER.k==='mes'&&mesAntAuto())PER_ATUAL=1;PER.k=k;if(k==='custom'&&!PER.ini){PER.ini=atual.ini;PER.fim=atual.fim;}salvaPer();render();},
  'novo-tx':()=>novoTx(),
  'push-on':()=>ativarPush(),
  'push-off':()=>desativarPush(),
  'ia-ler':()=>lerComprovanteIA(),
  'ia-frase':()=>fraseIA(),
  'ia-frase-ok':()=>enviaFraseIA(),
  'ia-mic':()=>micIA(),
  'push-teste':async()=>{const {data,error}=await sb.functions.invoke('alertas-push',{body:{teste:true}});toast(error?'não consegui enviar o teste':'teste enviado, confira as notificações');},
  'instalar':async()=>{if(!PROMPT_INST)return;PROMPT_INST.prompt();try{await PROMPT_INST.userChoice;}catch(e){}PROMPT_INST=null;render();},
  'inst-ok':()=>{try{localStorage.setItem('gv-inst-ok','1');}catch(e){}render();},
  'importar':()=>importarExtrato(),
  'banco-sync':()=>bancoSync(),
  'wa-ligar':()=>waLigar(),
  'wa-abrir':()=>{const n=WA_ST&&WA_ST.st&&String(WA_ST.st.numero||'').replace(/\D/g,'');if(n)location.href='https://wa.me/'+n;},
  'wa-desligar':()=>waDesligar(),
  'parc-verif':()=>prcVerifica(),
  'banco-config':()=>bancoConfig(),
  'banco-remover':()=>confirma({titulo:'Desconectar o banco?',texto:'As credenciais do Pluggy são apagadas do servidor. Os lançamentos que já entraram continuam no app.',ok:'Desconectar',perigo:true},async()=>{try{await (BC_ST=null,delete S.cfg.pluggyVisto,pluggy({acao:'remover'}));S.cfg.pluggyOn=false;salvar();render();toast('Banco desconectado');}catch(e){toast(e.message,true);}}),
  'anexos':id=>telaAnexos(id),
  'anx-ver':i=>{const t=S.tx.find(x=>x.id===$('#modal').dataset.tx),a=t&&(t.anexos||[])[+i];if(a)abreAnexo(a.p);},
  'anx-del':i=>{const id=$('#modal').dataset.tx,t=S.tx.find(x=>x.id===id),a=t&&(t.anexos||[])[+i];if(!a)return;
    confirma({titulo:'Remover comprovante?',texto:a.n,ok:'Remover',perigo:true},()=>{t.anexos=t.anexos.filter(x=>x!==a);removeArquivos([a.p]);salvar();render();telaAnexos(id);toast('Comprovante removido');});},
  'dup-tx':id=>{const t=S.tx.find(x=>x.id===id);if(!t||t.faturaKey||t.tipo==='transf')return;
    novoTx(null,t.tipo,Object.assign({},t,{anexos:[],trab:'',data:hojeISO(),status:'pago',parcelas:1,parcela:0,descricao:String(t.descricao||'').replace(/ \(\d+\/\d+\)$/,'')}));},
  'edit-tx':id=>{const t=S.tx.find(x=>x.id===id);if(t&&t.emp)return abreEmp(t.emp);return t&&t.tipo==='transf'?novaTransf(id):novoTx(id);},
  'tx-emp':id=>converteEmp(id,'out'),
  'tx-empv':id=>converteEmp(id,'in'),
  'tx-desemp':id=>desfazEmp(id),
  'emp-lista':()=>abreEmprestimos(),
  'emp-abre':id=>abreEmp(id),
  'emp-novo':id=>novoEmp(id||''),
  'emp-recebi':id=>recebiEmp(id),
  'emp-cobrar':id=>cobrarEmp(id),
  'emp-edit':id=>editaEmp(id),
  'emp-del':id=>delEmp(id),
  'emp-perdoa':id=>perdoaEmp(id),
  'emp-abre-tx':id=>{const t=S.tx.find(x=>x.id===id);if(t&&t.emp)abreEmp(t.emp);},
  'emp-ant':id=>empAntForm(id),
  'sem-abre':id=>abreSemana(id||''),
  'sem-rec':R=>{const r=resumoSemana(R);navega('lanc',{tipo:'receita',ini:r.ini,fim:r.fim,perL:'semana de '+fmtFaixa(r.ini,r.fim)});},
  'sem-tudo':R=>{const r=resumoSemana(R);navega('lanc',{tipo:'',ini:r.ini,fim:r.fim,perL:'semana de '+fmtFaixa(r.ini,r.fim)});},
  'sem-des':R=>{const r=resumoSemana(R);navega('lanc',{tipo:'despesa',ini:r.ini,fim:r.fim,perL:'semana de '+fmtFaixa(r.ini,r.fim)});},
  'emp-ant-tx':id=>{const t=S.tx.find(x=>x.id===id);if(t&&t.emp)empAntForm(t.emp);},
  'emp-desant-tx':id=>{const t=S.tx.find(x=>x.id===id);if(!t||!empAntDesfaz(t))return;salvar();render();toast('Voltou a descontar de '+nomeLado(t.de||t.para));setTimeout(()=>abreEmp(t.emp),40);},
  'emp-ant-ign':id=>{S.cfg.empAntIgn=(S.cfg.empAntIgn||[]).concat(id).slice(-200);salvar();render();},
  'emp-sug-out':id=>{const [tid,eid]=String(id).split('~');const t=S.tx.find(x=>x.id===tid);if(t&&empPorId(eid))aplicaEmp(t,eid,'out');if($('#modal').classList.contains('on')&&$('.revSheet'))abreRevisar();},
  'fat-abre':id=>abreFatura(id),
  'cc-ativa':id=>ccAtiva(id),
  'cc-fm':id=>{CC_FSEL=String(id||'');render();},
  'cc-vira':id=>{ccPedeOri();ccVira(id);},
  'cc-ag':id=>{CC_AG=id==='este'?'este':'todos';try{localStorage.setItem('gv-cc-ag',CC_AG);}catch(e){}render();},
  'cc-pagar-aberta':id=>{const c=S.cartoes.find(x=>x.id===id);if(!c)return;const u=usoCartao(c);toast('A fatura ainda está aberta: fecha '+ccDM(u.ci.fim)+'. Dá para pagar depois que ela fechar.');},
  'prev-abre':()=>abrePrevisao(),
  'nav-contas':()=>navega('bancos'),
  'nav-rec':()=>navLanc('receita'),
  'nav-des':()=>navLanc('despesa'),
  'nav-tudo':()=>navLanc(''),
  'nav-cat':c=>navLanc('despesa',{cat:c}),
  'nav-cat-orc':c=>navega('lanc',{tipo:'despesa',cat:c,mes:(TAB==='orc'&&OMES)||mesAtual()}),
  'nav-mes-orc':()=>navega('lanc',{tipo:'despesa',mes:(TAB==='orc'&&OMES)||mesAtual()}),
  'nav-aberto':()=>navega('lanc',{st:'aberto'}),
  'nav-orc':()=>navega('orc'),
  'nav-cartoes':()=>navega('cartoes'),
  'nav-fii':()=>navega('fii'),
  'nav-conta':id=>navega('lanc',{conta:id,mes:mesAtual()}),
  'nav-rel':()=>{const p=periodo();navega('rel');if(p.meses===1){REL.a=p.ini.slice(0,7);REL.b=mesAdd(REL.a,-1);render();}},
  'nav-rel-mes':(m)=>navega('lanc',{tipo:'',mes:m}),
  'nav-rel-rec':m=>navega('lanc',{tipo:'receita',mes:m}),
  'nav-rel-comp':m=>navega('lanc',{tipo:'receita',mes:m,comp:'trab'}),
  'nav-rel-des':m=>navega('lanc',{tipo:'despesa',mes:m}),
  'nav-rel-cat':k=>{const [m,c]=String(k).split('~');navega('lanc',{tipo:'despesa',mes:m,cat:c});},
  'tx-emp-novo':()=>empDoNovoTx('out'),
  'tx-emp-volta':()=>empDoNovoTx('in'),
  'emp-sug-ok':id=>{const [tid,eid]=String(id).split('~');const t=S.tx.find(x=>x.id===tid);if(t)aplicaEmp(t,eid,'in');if($('#modal').classList.contains('on')&&$('.revSheet'))abreRevisar();},
  'emp-sug-nao':id=>{const tid=String(id).split('~')[0];S.cfg.empIgn=(S.cfg.empIgn||[]).concat(tid).slice(-300);salvar();render();},
  'nova-transf':()=>novaTransf(),
  'del-tx':id=>{const tx=S.tx.find(x=>x.id===id);if(tx&&tx.grupo&&tx.parcelas>1){
    /* v10.51: parcela em fatura já fechada é história (pode estar paga). padrão = só as que ainda não fecharam */
    const rest=S.tx.filter(x=>x.grupo===tx.grupo),hj=hojeISO(),nm=String(tx.descricao).replace(/ \(\d+\/\d+\)$/,'');
    const fut=x=>{const c=x.cartao&&S.cartoes.find(k=>k.id===x.cartao);return c?fechamentoDe(c,x.data).fecha>hj:x.data>hj;};
    const fu=rest.filter(fut),fe=rest.length-fu.length,pl=n=>n+' parcela'+(n>1?'s':'');
    const apaga=L=>{const ids=new Set(L.map(x=>x.id));removeArquivos(anexosDe(L));S.tx=S.tx.filter(x=>!ids.has(x.id));geraRecorrentes();salvar();render();toast(pl(L.length)+' excluída'+(L.length>1?'s':''));};
    if(!fe)return confirma({titulo:'Excluir compra parcelada?',texto:'Isso exclui '+(rest.length>1?'as ':'a ')+pl(rest.length)+' de "'+nm+'".',ok:'Excluir parcelas',perigo:true},()=>apaga(rest));
    if(!fu.length)return confirma({titulo:'Excluir compra parcelada?',texto:'As '+pl(rest.length)+' de "'+nm+'" já estão em faturas fechadas. Fatura paga continua com o pagamento; a sobra aparece como pago a mais.',ok:'Excluir todas',perigo:true},()=>apaga(rest));
    return confirma({titulo:'Excluir compra parcelada?',texto:'"'+nm+'": '+pl(fu.length)+' por vir e '+pl(fe)+' em fatura já fechada. O mais seguro é excluir só as futuras.',ok:'Só as futuras ('+fu.length+')',alt:'Todas, até as fechadas ('+rest.length+')',altPerigo:true,altCb:()=>apaga(rest)},()=>apaga(fu));}return confirma({titulo:'Excluir lançamento?',texto:'Essa ação não pode ser desfeita.',ok:'Excluir',perigo:true},()=>{const t=S.tx.find(x=>x.id===id);if(t&&t.faturaKey)S.gerados[t.faturaKey]='del';if(t&&t.meta)mtTxSaiu(t);if(t)removeArquivos(anexosDe([t]));S.tx=S.tx.filter(x=>x.id!==id);if(geraRecorrentes()){}salvar();render();toast('Lançamento excluído');});},
  'def-orc':c=>defOrc(c),
  'orc-renda':()=>{const m=OMES||mesAtual(),P=S.cfg.orcPlano||{},au=rendaAuto(m);
    form('Quanto você ganha por mês?',[{name:'valor',label:'Renda líquida mensal (R$)'+(au>0?'. média dos últimos meses: '+brl(au):''),value:+P.renda>0?num(P.renda):au>0?num(c2(au)):'',inputmode:'decimal',placeholder:'0,00'}],v=>{
      const n=parseBR(v.valor);if(!(n>0))return 'Informe um valor maior que zero.';
      S.cfg.orcPlano=Object.assign({perfil:'eq'},S.cfg.orcPlano||{},{renda:c2(n)});salvar();render();toast('Plano montado');});},
  'orc-perfil':k=>{if(!PERFIS[k])return;S.cfg.orcPlano=Object.assign({},S.cfg.orcPlano||{},{perfil:k});salvar();render();},
  'orc-plano-todos':()=>{PLANO_TODOS=!PLANO_TODOS;render();},
  'orc-aplica':()=>{const m=OMES||mesAtual(),R=calcPlano(m),L=R.linhas.filter(x=>x.sug>0);if(!L.length)return;
    confirma({titulo:'Usar o plano como limites?',texto:L.length+' categorias recebem o limite sugerido a partir de '+nomeMes(m)+'. Os outros limites continuam como estão.',ok:'Usar limites'},()=>{L.forEach(x=>setLimOrc(m,x.c,x.sug));salvar();render();toast('Limites atualizados');});},
  'def-orc-sug':id=>{const k=id.lastIndexOf('|');defOrc(id.slice(0,k),+id.slice(k+1)||0);},
  'mais-lista':()=>{const y=scrollY;LIM_LISTA+=50;render();scrollTo(0,y);},
  'tag-filtro':g=>{F.tag=F.tag===g?'':g;render();},
  'orc-mes':m=>{if(/^\d{4}-\d{2}$/.test(m)){OMES=m;render();}},
  'orc-copia':()=>{const m=OMES||mesAtual(),ant=mesMais(m,-1),L=limOrc(ant);if(!Object.keys(L).length)return toast('Sem limites em '+nomeMes(ant));
    confirma({titulo:'Copiar limites?',texto:'Os limites de '+nomeMes(m)+' passam a ser iguais aos de '+nomeMes(ant)+'.',ok:'Copiar'},()=>{copiaOrcAnterior(m);salvar();render();toast('Limites copiados');});},
  'pagar-fat':id=>pagarFatura(id),
  'desfaz-pag':id=>desfazPagamento(id),
  'novo-fii':()=>fiiForm(),
  'edit-fii':id=>fiiForm(id),
  'hist-fii':id=>historico(id),
  'rf-ap':id=>rfMovForm(id,'ap'),
  'rf-res':id=>rfMovForm(id,'res'),
  'op-compra':id=>opForm(id,'compra'),
  'alvo-fii':id=>rdDoAtivo(id), // v10.155: o alerta de preço do ativo agora vive no Radar (alvoForm fica só para referência)
  'fmodo':id=>rdModoSet(id),
  'rd-busca':()=>radarBuscaAbre(),
  'rd-alertas':id=>radarAlertasAbre(id),
  'rd-reativa':id=>rdReativa(id),
  'rd-remove':id=>rdRemove(id),
  'rd-comprei':id=>rdComprei(id),
  'rd-atualiza':()=>{radarAtualiza(true);toast('Atualizando cotações…');},
  'rd-ver':()=>rdVer(),
  'rd-add-rapido':t=>{const x=rdCatalogo().find(c=>c.t===t);if(!x)return;const it=radarAdd(x);if(it){render();setTimeout(()=>radarAlertasAbre(rdQKey(it),true),250);}},
  'darf-pago':m=>darfPago(m),
  'op-venda':id=>opForm(id,'venda'),
  'op-provento':id=>opForm(id,'provento'),
  'prov-receber':id=>opForm(id,'provento',true),
  'del-op':v=>{const [a,b]=String(v).split('|');delOp(a,b);},
  'del-fii':id=>confirma({titulo:'Remover da carteira?',texto:'O investimento sai da sua carteira.',ok:'Remover',perigo:true},()=>{S.fiis=S.fiis.filter(x=>x.id!==id);salvar();render();toast('Removido da carteira');}),
  'mc-criar':()=>metaCotasCria(),
  'mc-dispensar':()=>{const mc=S.cfg.metaCotas;if(!mc)return;mc.fim='dispensada';salvar();render();toast('Aviso dispensado. O número antigo continua guardado.');},
  'nova-meta':()=>metaForm(),
  'novo-bem':()=>bemForm(),'edit-bem':id=>bemForm(id),
  'del-bem':id=>confirma({titulo:'Excluir bem?',texto:'Ele sai do patrimônio.',ok:'Excluir',perigo:true},()=>{S.bens=(S.bens||[]).filter(x=>x.id!==id);salvar();render();toast('Bem excluído');}),
  'novo-pas':()=>pasForm(),'edit-pas':id=>pasForm(id),
  'del-pas':id=>confirma({titulo:'Excluir dívida?',texto:'Ela sai do patrimônio.',ok:'Excluir',perigo:true},()=>{S.passivos=(S.passivos||[]).filter(x=>x.id!==id);salvar();render();toast('Dívida excluída');}),
  'edit-meta':id=>metaForm(id),
  'aporte':id=>{const v=!!$('#modal .mtSheet');aporte(id);MT_VOLTA=v?id:null;},
  'meta-abre':id=>abreMeta(id),
  'meta-fontes':id=>metaFontes(id),
  'meta-ap-del':k=>{const [mid,aid]=String(k).split('|'),m=S.metas.find(x=>x.id===mid);if(!m)return;confirma({titulo:'Desfazer este aporte?',texto:'O valor sai da meta'+((m.aportes||[]).some(a=>a.id===aid&&a.tx)?' e o lançamento de saída da conta é desfeito.':'.'),ok:'Desfazer',perigo:true},()=>{if(mtApDel(m,aid)){salvar();render();abreMeta(m.id);toast('Aporte desfeito');}});},
  'del-meta':id=>confirma({titulo:'Excluir meta?',texto:'Essa ação não pode ser desfeita.'+(S.tx.some(t=>t.meta===id)?' As saídas de "guardei" continuam em Lançamentos como transferência.':''),ok:'Excluir',perigo:true},()=>{S.metas=S.metas.filter(x=>x.id!==id);salvar();render();toast('Meta excluída');}),
  'lock-pin':()=>lockCfg()?lockPedeAtual('Digite o PIN atual',lockNovoPin):lockNovoPin(),
  'lock-off':()=>lockPedeAtual('Digite o PIN para desativar',()=>{lockSalva(null);lockFecha();render();toast('Bloqueio desativado');}),
  'lock-bio':()=>{const c=lockCfg();if(!c)return;if(c.bio){c.bio=null;lockSalva(c);lkBioGuarda(null);render();toast('Face ID desativado');}else lockBioAtiva();},
  'lock-atraso':id=>{const c=lockCfg();if(!c)return;c.atraso=+id||0;lockSalva(c);render();},
  'oculta':()=>{OCULTO=!OCULTO;try{localStorage.setItem('gv-oculto',OCULTO?'1':'0');}catch(e){}pintaOlho();render();},
  'notif-tog':id=>{if(!S.cfg.notif)S.cfg.notif={};const on=!notifOn(id);S.cfg.notif[id]=on;salvar();const b=document.querySelector('.ntRow[data-id="'+id+'"]');if(b){b.setAttribute('aria-checked',on);b.querySelector('.ntSw').classList.toggle('on',on);}toast(on?'Aviso ligado':'Aviso desligado');},
  /* v10.94: antes o valor novo era calculado ao contrário (pushDiscreto ficava sempre true): o botão nunca desligava */
  'notif-disc':()=>{S.cfg.pushDiscreto=!(S.cfg.pushDiscreto!==false);salvar();const b=document.querySelector('[data-act="notif-disc"]');if(b){b.setAttribute('aria-checked',S.cfg.pushDiscreto);b.querySelector('.ntSw').classList.toggle('on',S.cfg.pushDiscreto);}toast(S.cfg.pushDiscreto?'Notificações discretas: sem valores nem nomes':'Notificações completas: com valores e nomes');},
  'tema':id=>{S.cfg.tema=['claro','preto'].includes(id)?id:'escuro';salvar();applyCfg();render();},
  'accent':id=>{S.cfg.accent=id;salvar();applyCfg();render();},
  'nova-cat':()=>catForm(),
  'cats-toggle':()=>{const y=window.scrollY;CATS_ABERTAS=!CATS_ABERTAS;render();window.scrollTo(0,y);
    const g=document.querySelector('.catGrid');if(g&&!CATS_ABERTAS)g.scrollIntoView({block:'nearest'});},
  'edit-cat':c=>catForm(c),
  'del-cat':c=>confirma({titulo:'Remover categoria?',texto:'Remover a categoria "'+c+'"? Lançamentos antigos continuam com esse nome.',ok:'Remover',perigo:true},()=>{
    S.cats=S.cats.filter(x=>x!==c);delete S.orc[c];Object.values(S.orcMes||{}).forEach(mp=>delete mp[c]);delete S.catIcons[c];delete S.catCores[c];salvar();render();toast('Categoria removida');
  }),
  'exportar':exportar,
  'erros-ver':abreErros,
  'erros-copiar':()=>{copiaTexto(errTextoCopia()).then(()=>toast('Erros copiados'),()=>toast('Não deu para copiar neste navegador',true));},
  'erros-limpar':()=>{try{localStorage.removeItem(ERR_KEY);}catch(e){}abreErros();if(TAB==='cfg')render();toast('Registro de erros limpo');},
  'lg-dados':()=>telaMeusDados(),
  'lg-json':()=>exportaJSON(),
  'lg-csv':()=>{if(!S.tx.length){toast('Nenhum lançamento para exportar.',true);return;}baixaArquivo('granaviva-lancamentos-'+hojeISO()+'.csv',csvLancTodos(),'text/csv;charset=utf-8');toast(S.tx.length+' lançamentos na planilha');},
  'lg-excluir':()=>excluirConta(),
  'assist':()=>abreAssistente(),
  'planos':rec=>abrePlanos(rec||''),
  'pl-per':v=>plPer(v),
  'pw-manual':()=>{closeModal();setTimeout(()=>novoTx(null,'despesa'),30);},
  'assinar':id=>assinar(id),
  'ass-cancelar':()=>confirma({titulo:'Cancelar a assinatura?',texto:'As próximas cobranças param. Seu acesso continua até o fim do período já pago e nada é apagado.',ok:'Cancelar assinatura',perigo:true},async()=>{
    try{const {data:o,error}=await sb.functions.invoke('assinatura',{body:{acao:'cancelar'}});let m=o&&o.erro;try{if(!m&&error&&error.context)m=(await error.context.json()).erro;}catch(e){}
      if(error||!o||!o.ok)throw new Error(m||'não consegui cancelar agora');toast(o.aviso||'Cancelamento enviado');setTimeout(()=>carregaPlano(),4000);}catch(e){toast(e.message,true);}}),
  'q-gasto':()=>novoTx(undefined,'despesa'),
  'q-receita':()=>novoTx(undefined,'receita'),
  'q-inv':()=>abreInvest(),
  'inv-tipo':id=>fiiForm(undefined,id),
  'set-tipo':id=>{F.tipo=id;render();},
  'set-comp':id=>{F.comp=id==='trab'?'trab':'';render();},
  'trab-lote':id=>abreTrabLote(id),
  'lmes':id=>{const base=F.mes||(F.ini?F.ini.slice(0,7):hojeISO().slice(0,7));F.mes=mesMais(base,+id);F.ini=F.fim=F.perL='';render();},
  'nav-volta':()=>navVolta(),
  'f-tira':k=>{if(k==='per'){F.ini=F.fim=F.perL='';F.mes=mesAtual();}else F[k]='';render();},
  'tx-menu':id=>txMenu(id),
  'nova-fixa':()=>fixaForm(),
  'edit-fixa':id=>fixaForm(id),
  'assin-menu':id=>assinMenu(id),
  'assin-fixa':key=>{const c=detectaAssinaturas().find(x=>x.key===key);if(!c)return;if(!S.fixas)S.fixas=[];
    S.fixas.push({id:uid(),criadoEm:hojeISO(),nome:c.nome,valor:c2(c.valorAtual),dia:Math.max(1,Math.min(31,c.dia||1)),categoria:c.categoria||'Outros',tipo:'despesa',freq:'mensal',auto:false,fim:'',assinatura:true,assinKey:c.key});
    geraRecorrentes();salvar();render();toast(c.nome+' agora é conta fixa');},
  'assin-ignora':key=>{if(!key)return;S.cfg.assinIgnora=(S.cfg.assinIgnora||[]).filter(x=>x!==key).concat(key).slice(-300);salvar();render();toast('Não vai mais aparecer como cobrança recorrente');},
  'assin-atualiza':id=>{const r=assinRastreadas().find(x=>x.f.id===id);if(!r||!r.t)return;r.f.valor=c2(r.t.valor);if(!S.cfg.assinVisto)S.cfg.assinVisto={};S.cfg.assinVisto[r.k]=r.t.data.slice(0,7);geraRecorrentes();salvar();render();toast('Valor de '+r.f.nome+' atualizado para '+brl(r.f.valor));},
  'assin-visto':v=>{v=String(v||'');const i=v.lastIndexOf('|');if(i<1)return;if(!S.cfg.assinVisto)S.cfg.assinVisto={};S.cfg.assinVisto[v.slice(0,i)]=v.slice(i+1);salvar();render();},
  'plan-n':id=>{PLAN.n=+id||6;render();},
  'cal-m':id=>{CAL_M=Math.max(0,Math.min(3,CAL_M+(+id||0)));render();},
  'cal-dia':id=>abreDiaSaldo(id),
  'rev-abre':()=>abreRevisar(),
  'res-abre':id=>abreResumo(id),
  'res-m':id=>abreResumo(id),
  'res-ok':id=>{if(id&&(S.cfg.resumoVisto||'')<id){S.cfg.resumoVisto=id;salvar();render();}closeModal();},
  'res-rel':()=>abreResumo(mesOff(1)),
  'conc-abre':()=>abreConc(),
  'conc-sim':k=>{const p=concCache()[+k];if(p&&juntaPar(p)){salvar();render();toast('Virou transferência');}abreConc();},
  'conc-nao':k=>{const p=concCache()[+k];if(p){S.cfg.concIgn=(S.cfg.concIgn||[]).concat(p.o.id+'|'+p.i.id).slice(-2000);salvar();render();}abreConc();},
  'conc-todos':()=>{let n=0;concCache().slice(0,100).forEach(p=>{if(juntaPar(p))n++;});salvar();render();closeModal();toast(n+' transferência'+(n>1?'s':'')+' juntada'+(n>1?'s':''));},
  'rev-ok':id=>{const t=S.tx.find(x=>x.id===id);if(t){delete t.rev;salvar();render();}abreRevisar();},
  'rev-todos':()=>{revPend().slice(0,150).forEach(t=>delete t.rev);salvar();render();closeModal();toast('Revisão concluída');},
  'rev-del':id=>{const t=S.tx.find(x=>x.id===id);if(!t)return;if(t.pluggyId)S.cfg.pluggyIgn=(S.cfg.pluggyIgn||[]).concat(t.pluggyId).slice(-3000);removeArquivos(anexosDe([t]));S.tx=S.tx.filter(x=>x!==t);geraRecorrentes();salvar();render();abreRevisar();toast('Lançamento descartado');},
  'ir-cal':()=>{CAL_M=0;go('plan');},
  'plan-limpa':()=>{PLAN.renda=0;PLAN.extra=0;PLAN.corte=0;PLAN.dia=false;PLAN.itens=[];render();},
  'sim-add':id=>{if(!SIM_TIPOS[id])return;if(PLAN.itens.length>=8){toast('até 8 itens na simulação');return;}PLAN.itens.push({t:id,v:0,n:id==='parc'?10:0,k:id==='gun'||id==='run'||id==='parc'?0:1});render();setTimeout(()=>{const ins=document.querySelectorAll('[data-sim$="|v"]');const el=ins[ins.length-1];if(el)el.focus();},60);},
  'sim-del':id=>{PLAN.itens.splice(+id,1);render();},
  'sim-dia':()=>{PLAN.dia=!PLAN.dia;render();},
  'vc-pagar':id=>pagarConta(id),
  'cart-abre':()=>{FMODO='carteira';try{localStorage.setItem('gv-fmodo','carteira');}catch(e){}go('fii');},
  'tx-pagar':id=>{const t=S.tx.find(x=>x.id===id);if(!t)return;const hj=hojeISO();t.status='pago';delete t.fxAuto;t.pagoManual=1;if(t.data>hj)t.data=hj;salvar();render();toast(t.tipo==='receita'?'Marcado como recebido':'Marcado como pago');},
  'del-fixa':id=>confirma({titulo:'Remover conta fixa?',texto:'Os lançamentos já pagos continuam no extrato. Os previstos que ainda não venceram saem.',ok:'Remover',perigo:true},()=>{S.fixas=(S.fixas||[]).filter(x=>x.id!==id);const hj=hojeISO();S.tx=S.tx.filter(t=>!(t.fixaKey&&t.fixaKey.split('|')[1]===id&&t.status==='previsto'&&t.data>hj));salvar();render();toast('Conta fixa removida');}),
  'cot-now':()=>{atualizaCotacoes(true);atualizaCripto(true);atualizaCDI(true);},
  'ftab':id=>{FTAB=id;render();},
  /* v10.108: renda passiva (toque na barra mostra quem pagou; "próximo mês" mostra a estimativa) e yield on cost */
  'rp-mes':id=>{RP_VER='mes';RP_SEL=id;rpAtualiza();},
  'rp-proj':()=>{RP_VER=RP_VER==='proj'?'mes':'proj';rpAtualiza();},
  'yoc-ord':id=>{YOC_ORD=id;const c=document.querySelector('#view .yocCard');if(!c){render();return;}const t=document.createElement('div');t.innerHTML=yocCardHTML(yocCalc());c.replaceWith(t.firstElementChild);},
  'yoc-info':()=>yocInfo(),
  'brapi-token':()=>form('Token brapi (opcional)',[{name:'tok',label:'Token gratuito do brapi.dev (cadastro grátis)',value:S.cfg.brapi||''}],v=>{S.cfg.brapi=String(v.tok).trim();salvar();render();atualizaCotacoes(true);toast('Token salvo');}),
  'rel-print':()=>window.print(),
  'rel-a-prev':()=>relShift('a',-1),
  'rel-a-next':()=>relShift('a',1),
  'rel-b-prev':()=>relShift('b',-1),
  'rel-b-next':()=>relShift('b',1),
  'rel-mes':(id)=>{REL.a=id;REL.b=mesAdd(id,-1);render();},
  'rel-csv':()=>relCSV(),
  'tx-planilha':()=>txPlanilha(),
  'limpar':limpar,
  'tour':()=>tourAbre(),
  'novo-cartao':()=>cartaoForm(),
  'edit-cartao':id=>cartaoForm(id),
  'tx-propria':id=>{const t=S.tx.find(x=>x.id===id);if(!t)return;const cp=norm(String(t.descricao).split('|').slice(1).join('|'));
    const iguais=cp?S.tx.filter(x=>x.origem==='banco'&&x.conta&&(x.tipo==='despesa'||x.tipo==='receita')&&norm(String(x.descricao).split('|').slice(1).join('|'))===cp):[t];
    confirma({titulo:'Foi pra investir ou pra outra conta sua?',texto:'Vira transferência e sai das receitas e despesas. O saldo da conta não muda.'+(cp&&iguais.length>1?' Vale para os '+iguais.length+' lançamentos com '+String(t.descricao).split('|').slice(1).join('|')+', e os próximos já entram assim.':cp?' Os próximos com esse destino já entram assim.':''),ok:'Marcar como transferência'},()=>{
      iguais.forEach(x=>{const b='b:'+x.conta;Object.assign(x,{tipo:'transf',de:x.tipo==='despesa'?b:'',para:x.tipo==='receita'?b:'',categoria:'Transferência',conta:'',forma:'',cartao:''});});
      if(cp){S.cfg.proprias=(S.cfg.proprias||[]).filter(x=>x!==cp).concat(cp).slice(-200);}
      salvar();render();toast(iguais.length>1?iguais.length+' lançamentos viraram transferência':'Virou transferência');});},
  'del-cartao':id=>{const c=S.cartoes.find(x=>x.id===id);if(!c)return;const hj=hojeISO();
    /* v10.51: compra que ainda vai entrar em fatura não vira despesa paga. o caminho seguro é arquivar */
    const fut=S.tx.filter(t=>t.cartao===id&&!t.faturaKey&&t.data&&fechamentoDe(c,t.data).fecha>hj),n=fut.length;
    const exclui=()=>{const ids=new Set(fut.map(t=>t.id));S.tx.forEach(t=>{if(t.faturaKey&&t.faturaKey.indexOf('fat|'+id+'|')===0)t.vence=fechamentoDe(c,t.data).vence;});removeArquivos(anexosDe(fut));S.tx=S.tx.filter(t=>!ids.has(t.id));S.cartoes=S.cartoes.filter(x=>x.id!==id);geraRecorrentes();salvar();render();toast('Cartão excluído');};
    if(!n)return confirma({titulo:'Excluir cartão?',texto:'Faturas já fechadas continuam no extrato.'+(c.arq?'':' Para só tirar das listas, arquive.'),ok:'Excluir',perigo:true},exclui);
    confirma({titulo:'Cartão com compras a vencer',texto:n+(n>1?' compras ou parcelas ainda vão':' compra ou parcela ainda vai')+' entrar em fatura. '+(c.arq?'Ele já está arquivado: as faturas seguem valendo.':'Arquive: ele sai das listas, as faturas seguem e dá para desarquivar.')+' Excluir apaga essas compras futuras.',ok:c.arq?'Manter arquivado':'Arquivar',alt:'Excluir e apagar as futuras ('+n+')',altPerigo:true,altCb:exclui},()=>{if(!c.arq)arqCartao(c);});},
  'arq-cartao':id=>{const c=S.cartoes.find(x=>x.id===id);if(!c)return;confirma({titulo:'Arquivar '+c.nome+'?',texto:'O cartão sai das listas de escolha. Faturas e parcelas seguem valendo. Dá para desarquivar depois.',ok:'Arquivar'},()=>arqCartao(c));},
  'desarq-cartao':id=>{const c=S.cartoes.find(x=>x.id===id);if(!c)return;c.arq=false;delete c.arqEm;salvar();render();toast('Cartão desarquivado');},
  'novo-banco':()=>bancoForm(),
  'edit-banco':id=>bancoForm(id),
  'del-banco':id=>{const b=S.bancos.find(x=>x.id===id);if(!b)return;
    /* v10.51: conta com lançamentos não é excluída (o saldo cairia duas vezes): arquivar mantém o histórico */
    const k='b:'+id,n=S.tx.filter(t=>t.conta===id||t.pagoConta===id||t.de===k||t.para===k||pagsFatura(t).some(p=>p.conta===id)).length+S.fiis.reduce((a,f)=>a+(f.ops||[]).filter(o=>o.conta===id).length,0)+(S.fixas||[]).filter(f=>f.conta===id).length;
    if(n){if(b.arq)return toast('Conta com '+n+' lançamento'+(n>1?'s':'')+' ligado'+(n>1?'s':'')+': não dá para excluir. Ela segue arquivada.',true);
      return confirma({titulo:'Conta com lançamentos',texto:b.nome+' tem '+n+' lançamento'+(n>1?'s':'')+' ligado'+(n>1?'s':'')+' (pagamentos, transferências ou investimentos). Excluir bagunçaria o saldo. Arquive: ela sai das listas e o histórico fica.',ok:'Arquivar'},()=>{b.arq=true;b.arqEm=hojeISO();if(b.principal){b.principal=false;const nx=bancosAtivos()[0];if(nx)nx.principal=true;}salvar();render();toast('Conta arquivada');});}
    confirma({titulo:'Excluir conta?',texto:'Essa ação não pode ser desfeita.',ok:'Excluir',perigo:true},()=>{S.bancos=S.bancos.filter(x=>x.id!==id);if(bancosAtivos().length&&!S.bancos.some(x=>x.principal))bancosAtivos()[0].principal=true;salvar();render();toast('Conta excluída');});},
  'arq-banco':id=>{const b=S.bancos.find(x=>x.id===id);if(!b)return;const sd=saldoBanco(b);
    confirma({titulo:'Arquivar '+b.nome+'?',texto:(Math.abs(sd)>=0.005?'Ela ainda tem saldo de '+brl(sd)+', que continua contando no total. ':'')+'A conta sai das listas de escolha; o histórico fica no extrato e nos relatórios. Dá para desarquivar depois.',ok:'Arquivar'},()=>{
      b.arq=true;b.arqEm=hojeISO();if(b.principal){b.principal=false;const n=bancosAtivos()[0];if(n)n.principal=true;}salvar();render();toast('Conta arquivada');});},
  'desarq-banco':id=>{const b=S.bancos.find(x=>x.id===id);if(!b)return;b.arq=false;delete b.arqEm;if(!S.bancos.some(x=>x.principal))b.principal=true;salvar();render();toast('Conta desarquivada');},
  'principal':id=>{if((S.bancos.find(x=>x.id===id)||{}).arq)return;S.bancos.forEach(b=>{b.principal=b.id===id;});salvar();render();toast('Conta principal definida');}
};

document.addEventListener('click',e=>{const c=e.target.closest&&e.target.closest('.chip[data-act^="ir-"],.atalho[data-act^="ir-"],.hmLink[data-act^="ir-"]');if(!c)return;const t=c.dataset.act.replace('ir-','');go(t);});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target&&e.target.id==='logoHome')go('inicio');});
// logo: checa pela posição do toque, então funciona com menu aberto (#ov/#side por cima) e com a tela de login (#auth)
document.addEventListener('click',e=>{
  const lg=document.getElementById('logoHome');
  if(!lg)return;
  const r=lg.getBoundingClientRect();
  const hitLogo=e.target.closest&&e.target.closest('#logoHome')||(e.clientX>=r.left-10&&e.clientX<=r.right+10&&e.clientY>=r.top-10&&e.clientY<=r.bottom+10);
  if(hitLogo&&r.width>0){toggleSide(false);go('inicio');e.stopPropagation();e.preventDefault();}
},true);
document.addEventListener('click',e=>{
  if(e.target.closest('#fab')){abreRapido();return;}
  if(e.target.closest('#logoHome')){go('inicio');return;}
  if(e.target.closest('#btnMenu')){toggleSide(true);return;}
  if(e.target.closest('#btnBell')){abrirAlertas();return;}
  if(e.target.closest('#syncTxt')){syncDetalhe();return;}
  if(e.target.id==='ov'||e.target.closest('#btnClose')){toggleSide(false);return;}
  const tb=e.target.closest('[data-tab]');
  if(tb){if(MVP_MODE&&tb.closest('#tabbar,#sbNav'))NAV_PILHA=[];go(tb.dataset.tab);return;}
  if(e.target.id==='modal'){closeModal();return;}
  const t=e.target.closest('[data-act]');
  if(!t)return;
  const rq=ACT_RECURSO[t.dataset.act]; // v10.82: recurso de outro plano abre a tela de planos
  if(rq&&!pode(rq)){abrePlanos(rq);return;}
  const fn=ACT[t.dataset.act];
  if(fn)fn(t.dataset.id);
});

document.addEventListener('input',e=>{
  const t=e.target;
  if(t.dataset&&t.dataset.filter==='q'){
    F.q=t.value;const pos=t.selectionStart;render();
    const n=document.querySelector('[data-filter="q"]');
    if(n){n.focus();try{n.setSelectionRange(pos,pos);}catch(_){}}
  }
});

document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset&&t.dataset.aviso){S.cfg.avisoDias=+t.value;salvar();toast('Antecedência dos avisos salva');render();return;}
  if(t.dataset&&(t.dataset.filter==='relA'||t.dataset.filter==='relB')){REL[t.dataset.filter==='relA'?'a':'b']=t.value;render();return;}
  if(t.dataset&&t.dataset.filter){F[t.dataset.filter]=t.value;render();return;}
  if(t.dataset&&t.dataset.per){const k=t.dataset.per;if(k==='k'){const atual=periodo();PER.k=t.value;if(t.value==='custom'&&!PER.ini){PER.ini=atual.ini;PER.fim=atual.fim;}}else if(DATA_OK.test(t.value))PER[k]=t.value;salvaPer();render();return;}
  if(t.dataset&&t.dataset.sim){const [i,k]=t.dataset.sim.split('|'),it=PLAN.itens[+i];if(!it)return;
    if(k==='v')it.v=Math.max(0,Math.min(1e8,parseBR(t.value)||0));else if(k==='n')it.n=Math.max(1,Math.min(48,Math.round(parseBR(t.value)||1)));else if(k==='k')it.k=Math.max(0,Math.min(11,+t.value||0));render();return;}
  if(t.dataset&&t.dataset.plan){const k=t.dataset.plan;PLAN[k]=k==='n'?(+t.value||6):Math.max(k==='corte'?0:-1e9,Math.min(k==='corte'?100:1e9,parseBR(t.value)||0));render();return;}
  if(t.id==='imp'){
    const f=t.files[0];t.value='';if(!f)return;
    const r=new FileReader();
    r.onload=()=>{
      let d=null;
      try{d=JSON.parse(r.result);}catch(err){d=null;}
      if(!d||typeof d!=='object'||!Array.isArray(d.tx)||!Array.isArray(d.cats)){toast('Arquivo de backup inválido',true);return;}
      /* v10.52: um backup malformado não trava mais o app — o saneamento roda antes de confirmar e falha com mensagem */
      const novo=(()=>{try{return sanea(d);}catch(e){return null;}})();
      if(!novo){toast('Esse backup tem dados inválidos e não pôde ser restaurado.',true);return;}
      confirma({titulo:'Substituir dados?',texto:'Isso troca todos os dados atuais pelo backup. Exporte antes se quiser guardar.',ok:'Substituir',perigo:true},()=>{
        S=novo;APAGA_LIBERADO=true;geraRecorrentes();{const a=migraPropria(),b=recatBanco();if(a||b)setTimeout(()=>{render();if(b)toast(b+' lançamentos foram para categorias mais específicas');},0);}
        salvar();applyCfg();render();toast('Backup importado');
      });
    };
    r.readAsText(f);
  }
});

/* v10.107: partes pesadas e pouco usadas ficam em arquivos à parte (nome.min.js?v=versão), carregados na primeira vez.
   script do próprio site (a CSP só aceita 'self'), sem atributo onload no HTML; o service worker guarda junto com o app.
   cada parte se registra em window.__gvParte[nome] e recebe o contexto X (funções do app e getters do estado que muda). */
const PARTES={};
const PARTE_X={get MVP(){return MVP_MODE;},$,I,esc,logoSVG,go,abreRapido,salvar,get S(){return S;},get USER(){return USER;},get TAB(){return TAB;}};
function carregaParte(nome){
  if(PARTES[nome])return PARTES[nome];
  return PARTES[nome]=new Promise((ok,falha)=>{
    const reg=window.__gvParte=window.__gvParte||{};
    if(typeof reg[nome]==='function'){const f=reg[nome];delete reg[nome];try{ok(f(PARTE_X));}catch(e){delete PARTES[nome];falha(e);}return;}
    const sc=document.createElement('script');sc.src=nome+'.min.js?v='+GV_BUILD;sc.async=true;
    sc.onload=()=>{const f=reg[nome];delete reg[nome];sc.remove();
      if(typeof f!=='function'){delete PARTES[nome];falha(new Error('parte '+nome+' não registrada'));return;}
      try{ok(f(PARTE_X));}catch(e){delete PARTES[nome];falha(e);}};
    sc.onerror=()=>{delete PARTES[nome];sc.remove();falha(new Error('não carregou '+nome));};
    document.head.appendChild(sc);
  });
}
/* v10.103: tour de boas-vindas. Abre sozinho na primeira entrada de uma conta nova (sem lançamentos, cartões nem contas)
   e pode ser refeito em Ajustes. Destaca o elemento real da tela e explica cada seção.
   v10.107: o tour mora em tour.js (carregado na primeira vez que abre); aqui fica só a decisão de abrir. */
let TOUR_P=null;
const tourAberto=()=>!!(TOUR_P&&TOUR_P.TOUR);
function tourTalvez(){
  try{
    if(tourAberto()||S.cfg.tourVisto||localStorage.getItem('gv-tour-'+(USER&&USER.id)))return;
    if((S.tx||[]).length||(S.cartoes||[]).length||(S.bancos||[]).length)return;
    if(MVP_MODE){if(metaMes()>0)return;setTimeout(()=>{if(USER&&!$('#modal').classList.contains('on')&&!$('#auth').classList.contains('on')&&!$('#lock').classList.contains('on'))metaOnbAbre();},600);return;} // v10.160: sem tour no primeiro acesso
    setTimeout(()=>{if(!tourAberto()&&USER&&!$('#modal').classList.contains('on')&&!$('#auth').classList.contains('on'))tourAbre();},900);
  }catch(e){}
}
function tourAbre(){
  return carregaParte('tour').then(p=>{TOUR_P=p;p.abre();})
    .catch(()=>toast('Não consegui abrir o tour agora. Confira a conexão e tente de novo.',true));
}
function tourFecha(f){if(TOUR_P)TOUR_P.fecha(f);}

/* v10.102: o gancho de testes só existe rodando localmente (antes bastava ?gvtest no site publicado para expor S, planoAplica etc.) */
const GV_LOCAL=/^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
/* gancho de testes automatizados (só com ?gvtest na URL): expõe funções puras de cálculo */
if(GV_LOCAL&&/[?&]gvtest\b/.test(location.search))window.__GV={sb,planoAplica,geraRecorrentes,getS:()=>S,lockDesconecta,numExt,temPendencia,csvCel,dataValida,aplicaOps,hojeISO,rpCalc,yocCalc,yocOrdena,rpCotasNaData,rpPorCota,rpInicio,rpCardHTML,yocCardHTML,limpaCache,apagaRastrosLocais,errLista,errRegistra,errTexto,errTextoCopia,abreErros,copiaTexto,locIdb,gravaLocal,gravaLocalJa,dadosIdb,guardaCopia,chamaIA,invokeIA,perguntaAssistente,lerComprovanteIA,
  get LOC_BLOQ(){return LOC_BLOQ;},set IA_FN(f){IA_FN=f;},set IA_ESP(a){IA_ESP=a;},get AS_HIST(){return AS_HIST;},enviar,rfMovForm,tourAbre,tourFecha,get TOUR(){return TOUR_P&&TOUR_P.TOUR;},carregaParte,get SNAP(){return SNAP;},set SNAP(v){SNAP=v;},nomeAtivo,rfCodigo,ativoBanco,rfTaxaTxt,mtPkLista,prcDetecta,prcAplica,prcDesfaz,prcPrevia,prcVerifica,prcAuto,prcFontes,get PRC(){return PRC;},ccFaturasLista,ccFmHTML,get CC_FSEL(){return CC_FSEL;},rvCalc,rvDesfaz,rvPode,metaCotasDados,metaCotasCria,metaCotasHTML,parcelaDesc,parcelaDataBanco,assinGrupo,assinHTML,assinAvisos,assinRastreadas,delOp,historico,ccFatHTML,usoCartao,dataParcela,montaImport,confirmaImport,juntaCfgRemoto,setSync,syncDetalhe,ccTom,ccResumoDados,diasAte,fechaChip,lerCSV,abreImport,importarExtratoIA,ymOk,isoTsOk,ccVisual,ccAuto,cartaoHTML,cartaoMini,CC_DES,ccAtiva,ccVira,ccOpcoesVisual,notifListaHTML,ccMelhor,ccAgendaLista,ccPrazo,ccMelhorDia,ccFatEstado,ccEscolhe,get CC_AT(){return CC_AT;},set CC_AT(v){CC_AT=v;},get OCULTO(){return OCULTO;},pode,planoAgora,planoAplica,planoZera,carregaPlano,abrePlanos,verificaPagamento,TAB_RECURSO,ACT_RECURSO,partesTx,valorNaCat,temCat,rateiaSplit,confereSplit,maiorParte,fatosAssistente,respostaLocal,asPeriodo,asCategoria,csvLancTodos,txLinhasPlanilha,exportaJSON,somaMes,catsFatura,limOrc,navega,sugereReceb,compMes,receitasAtrasadas,abreTrabLote,prevReceitaIgual,txDatas,trabCat,relComp,proximosVenc,vencEntre,resumoSemana,abreSemana,domingoDe,orcVigia,orcNiveis,empSuspeitos,empAntForm,empAntMarca,empAntDesfaz,empCasa,txBancoIgual,revEmpHTML,cfgNuvem,novoEmp,recebiEmp,get S(){return S},set S(v){S=v},get PLAN(){return PLAN},simItemMes,folgaPlano,gastoDiaADia,temSimulacao,infoCot,b3Aberta,applyCfg,listaAlertas,limpar,memoOn:()=>{MEMO={};},memoOff:()=>{MEMO=null;},memoVivo:()=>MEMO!==null,despesasPorCat,projetaMeses,usadoCartaoTotal,detectaAssinaturas,avisaFalhaAuth,go,render,salvar,crDecifra,abreEmprestimos,abreEmp,cobrarEmp,aplicaEmp,empTot,saldoTotal,saldoBanco,empSugestoes,patLiquido,txMenu,compromissos,dadosResumo,abreResumo,pmtMeta,mesesMeta,taxaMesMeta,cdiAnoAtual,saldoMeta,mtSaldoD,mtCaixa,alvoMeta,mtProj,mtChega,mtRisco,mtStreak,mtAlocado,mtReservado,mtAvisos,mtLembra,mtApDel,metaManualIgual,fipeAtualiza,fipeLista,fipePreco,fipeVar,abreMeta,metaFontes,metaForm,aporte,saneaMetaExtra,IR_RF,rfCresce,cdiCache,mtNova,paresConc,juntaPar,_impFila:f=>{IMP_FILA=f;proxImportBanco();},revPend,revCat,abreRevisar,projecaoDiaria,brlK,nomeTx,filtrados,parseBR,encargosMes,custoAtraso,bancosAtivos,ocorrenciasFixa,mensalEq,descFreq,limpaAnexos,anexar,limpaTags,F,fotoPat,setLimOrc,copiaOrcAnterior,histOrc,periodo,sparkPer,get PER(){return PER;},set PER(v){PER=v;},somaC,cents,fechamentoDe,geraRecorrentes,efetivo,statusTx,previsaoMes,sanea,resumoMes,divMensal,patrimonio,ACT,closeModal,bancoSync,get IMP(){return IMP;},set IMP(v){IMP=v;},get USER(){return USER;},set USER(v){USER=v;},set pluggy(f){pluggy=f;},get pluggyDesde(){return S.cfg.pluggyDesde;},ritmoEconomia,ritmoMensal,mesAntAuto,get PER_ATUAL(){return PER_ATUAL;},set PER_ATUAL(v){PER_ATUAL=v;},alertasHTML,relMesA,notifOn,NOTIF_T,mtGraficoSVG,brl,empJurosTot,proxPags,empDivide,opForm,get REND(){return REND;},radarSaneia,radarMigra,radarAdd,rdBusca,rdQKey,rdChave,rdAdivinha,radarAlertasAbre,radarBuscaAbre,rdComprei,rdAvisos,viewRadar,get RD_D(){return RD_D;},set RD_D(v){RD_D=v;},get RD_Q(){return RD_Q;},set RD_Q(v){RD_Q=v;},get FMODO(){return FMODO;},rdModoSet,radarDisparos,radarCota,_puxar:()=>{ultimaPuxada=0;return puxar();}};
let rsz,rszW=innerWidth;
window.addEventListener('resize',()=>{clearTimeout(rsz);rsz=setTimeout(()=>{if(Math.abs(innerWidth-rszW)<2)return;rszW=innerWidth;if(TAB==='inicio')AFTER.inicio();},200);});

$('#sbNav').innerHTML='<div class="sb-sec">navegação</div>'+NAV.map(n=>'<button class="sb-item" data-tab="'+n.t+'">'+I(n.i)+'<span>'+esc(n.l)+'</span></button>').join('')
  +(MVP_MODE?'<div class="sb-sec">mais</div>'+NAV_MVP_MAIS.map(n=>'<button class="sb-item sbSub" data-tab="'+n.t+'">'+I(n.i)+'<span>'+esc(n.l)+'</span></button>').join(''):'');
if(MVP_MODE){document.documentElement.classList.add('mvp');const tb=document.createElement('nav');tb.id='tabbar';tb.className='tabbar';tb.setAttribute('aria-label','abas principais');
  tb.innerHTML=NAV_MVP.map(n=>'<button type="button" class="tbItem" data-tab="'+n.t+'">'+I(n.i)+'<span>'+esc(n.l)+'</span></button>').join('');document.body.appendChild(tb);pintaNav();}
$('#logo').innerHTML=logoSVG();
$('#btnMenu').innerHTML=I('menu');
$('#btnBell').insertAdjacentHTML('afterbegin',I('bell'));
/* app instalável: service worker só em https (GitHub Pages) ou localhost */
/* versão nova: ao voltar para o app (o iPhone mantém a página aberta por dias), confere se saiu atualização */
/* a cada publicação: troque GV_BUILD aqui e V no sw.js juntos (./bump.sh faz os dois) */
let checouEm=0;
async function confereVersao(){
  if(Date.now()-checouEm<60000||!navigator.onLine)return;checouEm=Date.now();
  try{const r=await fetch(location.pathname+'?v='+Date.now(),{cache:'no-store'});if(!r.ok)return;const h=await r.text();
    const m=h.match(/const GV_BUILD='([^']+)'/);if(!m||m[1]===GV_BUILD)return;
    const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration();if(reg)reg.update().catch(()=>{});
    const ocupado=$('#modal').classList.contains('on')||$('#lock').classList.contains('on')||document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    /* v10.91: nunca recarrega no meio do uso (a tela piscava ao voltar para o app). a versão nova entra quietinha:
       quando o app sai da tela (recarrega escondido) ou pelo aviso "nova versão pronta". */
    VERSAO_NOVA=m[1];avisoVersao();
  }catch(e){}
}
let VERSAO_NOVA=null;
function avisoVersao(){if(document.getElementById('gvAtu'))return;const d=document.createElement('button');d.id='gvAtu';d.type='button';d.className='gvAtu';
  d.innerHTML=I('refresh')+'<span>Nova versão<em> pronta</em></span><b>atualizar</b>';d.onclick=()=>{window.__gvRecarrega=1;location.reload();};document.body.appendChild(d);}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')confereVersao();
  else if(VERSAO_NOVA&&!$('#modal').classList.contains('on')&&!(document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))){window.__gvRecarrega=1;try{location.reload();}catch(e){}}
});
window.addEventListener('pageshow',e=>{if(e.persisted)confereVersao();});
/* v10.97: tudo do service worker dentro do if. Antes o bloco do controllerchange rodava fora e, sem navigator.serviceWorker
   (navegador dentro do Instagram/Facebook no iPhone, Firefox privado, http), dava TypeError e o app abria em branco. */
try{if(navigator.serviceWorker){
  if(location.protocol==='https:'||location.hostname==='localhost')
    window.addEventListener('load',()=>{try{navigator.serviceWorker.register('sw.js').catch(()=>{});}catch(e){}});
  const tinha=!!navigator.serviceWorker.controller; // v10.77: versão nova instalada enquanto o app está aberto
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!tinha||window.__gvRecarrega)return;VERSAO_NOVA=VERSAO_NOVA||'sw';avisoVersao();});}}catch(e){}

/* v10.48: com um formulário aberto a página de trás não rola junto (iPhone) */
(function(){const m=$('#modal');let y=0,on=false;
  const sync=()=>{const ab=m.classList.contains('on');if(ab===on)return;on=ab;const b=document.body;
    if(ab){y=window.scrollY;b.style.top=(-y)+'px';b.classList.add('modalAberto');}
    else{b.classList.remove('modalAberto');b.style.top='';window.scrollTo(0,y);}};
  new MutationObserver(sync).observe(m,{attributes:true,attributeFilter:['class']});
  m.addEventListener('touchmove',e=>{if(!e.target.closest('.sheet'))e.preventDefault();},{passive:false});
})();
$('#btnClose').innerHTML=I('close');
$('#fab').innerHTML=I('plus');
(function(){let y0=window.scrollY,tk=false;const f=$('#fab');
  window.addEventListener('scroll',()=>{if(tk)return;tk=true;requestAnimationFrame(()=>{const y=window.scrollY,d=y-y0;
    if(y<80||d<-6)f.classList.remove('esc');else if(d>6)f.classList.add('esc');
    if(Math.abs(d)>6)y0=y;tk=false;});},{passive:true});})();

restauraAba();
if(!S.cfg.pagDesde){S.cfg.pagDesde=hojeISO();}
if(geraRecorrentes())salvar();
applyCfg();
document.querySelectorAll('.sb-item').forEach(b=>b.classList.toggle('on',b.dataset.tab===TAB));
render();

atualizaCotacoes();
/* v10.69: com a Carteira aberta e o app na tela, atualiza sozinho a cada minuto (B3 no pregão, cripto sempre) */
setInterval(()=>{if(document.visibilityState==='visible'&&TAB==='fii'&&!document.querySelector('#modal.on')){atualizaCotacoes();atualizaCripto();}},60e3);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&TAB==='fii'){atualizaCotacoes();atualizaCripto();}});
if(aplicaCDI())salvar();atualizaCDI();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')atualizaCDI();});
setInterval(()=>atualizaCDI(),3600e3);
/* ---------- bloqueio do app: PIN e Face ID / Touch ID, guardado só neste aparelho (não vai para a nuvem) ---------- */
var LK_IOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
var LOCK_KEY='gv-lock',LOCK_LEN=4,LK={o:null,buf:'',saiu:0,bioBusy:false};
ICONS.faceid='<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 15.5a3.5 3.5 0 0 0 5 0"/>';
function lockCfg(){try{const c=JSON.parse(localStorage.getItem(LOCK_KEY)||'null');return c&&c.hash&&c.salt?c:null;}catch(e){return null;}}
function lockSalva(c){try{if(c)localStorage.setItem(LOCK_KEY,JSON.stringify(c));else localStorage.removeItem(LOCK_KEY);}catch(e){}}
function lkBioBk(){try{const b=JSON.parse(localStorage.getItem('gv-lock-bio')||'null');return b&&b.id&&(!b.uid||!USER||b.uid===USER.id)?b:null;}catch(e){return null;}}
function lkBioGuarda(id){try{if(id)localStorage.setItem('gv-lock-bio',JSON.stringify({id,uid:USER?USER.id:null}));else localStorage.removeItem('gv-lock-bio');}catch(e){}}
function lkB64(buf){return btoa(String.fromCharCode.apply(null,new Uint8Array(buf)));}
function lkDeB64(t){return Uint8Array.from(atob(t),ch=>ch.charCodeAt(0));}
async function lockHash(pin,salt){
  const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
  return lkB64(await crypto.subtle.deriveBits({name:'PBKDF2',salt:lkDeB64(salt),iterations:150000,hash:'SHA-256'},k,256));
}
async function lockConfere(pin){const c=lockCfg();if(!c)return true;return (await lockHash(pin,c.salt))===c.hash;}
async function bioDisponivel(){try{return !!(window.PublicKeyCredential&&await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());}catch(e){return false;}}
/* v10.45: enquanto travado, o app por trás não recebe foco, toque nem leitor de tela */
function lockInerte(on){['#app','#modal','#toast'].forEach(sel=>{const e=document.querySelector(sel);if(!e)return;if(on){e.setAttribute('inert','');e.setAttribute('aria-hidden','true');}else{e.removeAttribute('inert');e.removeAttribute('aria-hidden');}});}
function lockLen(c){return c&&c.len===6?6:LOCK_LEN;} // PIN antigo (sem len) = 4 dígitos
function lockTela(o){
  o.len=o.len||lockLen(lockCfg());
  LK.o=o;LK.buf='';
  const el=$('#lock');
  el.innerHTML=`<div class="lkBox">
    <div class="ahead">${logoSVG()}<h1>GranaViva</h1></div>
    <p class="lkTit">${esc(o.titulo)}</p><p class="lkSub" id="lkSub">${esc(o.sub||'')}</p>
    ${o.bio?`<button type="button" class="lkBioBig" data-k="bio">${I('faceid')}<span>Desbloquear com Face ID</span></button>`:''}
    <div class="lkDots" id="lkDots">${'<i></i>'.repeat(o.len)}</div>
    <div class="lkPad">${[1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-k="${n}">${n}</button>`).join('')}
      <button type="button" class="lkAlt" data-k="bio" ${o.bio?'':'disabled'} aria-label="usar Face ID">${o.bio?I('faceid'):''}</button>
      <button type="button" data-k="0">0</button>
      <button type="button" class="lkAlt" data-k="del" aria-label="apagar">&#9003;</button>
    </div>
    <div class="lkFoot" id="lkFoot">${o.modo==='novo'?`<button type="button" class="alink" data-k="len">usar PIN de ${o.len===6?4:6} dígitos</button>`:''}${o.cancelar?'<button type="button" class="alink" data-k="cancel">cancelar</button>':'<button type="button" class="alink" data-k="esqueci">esqueci o PIN</button>'}</div>
  </div>`;
  el.classList.add('on');document.documentElement.classList.add('travado');lockInerte(true);
}
function lockFecha(){const el=$('#lock');if(el){el.classList.remove('on');el.innerHTML='';}LK.o=null;LK.buf='';document.documentElement.classList.remove('travado');lockInerte(false);}
function lockPinta(){document.querySelectorAll('#lkDots i').forEach((x,i)=>x.classList.toggle('on',i<LK.buf.length));}
function lockMsg(t,erro){const e=$('#lkSub');if(e){e.textContent=t;e.classList.toggle('err',!!erro);}}
function lockErro(t){LK.buf='';lockPinta();lockMsg(t,true);const d=$('#lkDots');if(d){d.classList.remove('shake');void d.offsetWidth;d.classList.add('shake');}try{if(navigator.vibrate)navigator.vibrate(80);}catch(e){}}
function lockTecla(k){
  const o=LK.o;if(!o)return;
  if(k==='bio'){lockBio();return;}
  if(k==='cancel'){lockFecha();return;}
  if(k==='esqueci'){lockEsqueci();return;}
  if(k==='volta'){lockAbre(true);return;}
  if(k==='sair'){lockSair();return;}
  if(k==='sairJa'){lockSair(true);return;}
  if(k==='len'){if(o.modo==='novo')lockNovoPin(o.len===6?4:6);return;}
  const c=lockCfg();
  if(o.modo==='abrir'&&c&&c.ate&&c.ate-Date.now()>300000){c.ate=Date.now()+300000;lockSalva(c);} // relógio voltou: o bloqueio continua, no máximo 5 min a partir de agora
  if(o.modo==='abrir'&&c&&c.ate&&Date.now()<c.ate){lockMsg('muitas tentativas, aguarde '+Math.ceil((c.ate-Date.now())/1000)+' s',true);return;}
  if(k==='del'){LK.buf=LK.buf.slice(0,-1);lockPinta();return;}
  if(!/^\d$/.test(k)||LK.buf.length>=o.len)return;
  LK.buf+=k;lockPinta();
  if(LK.buf.length===o.len){const pin=LK.buf,cb=o.cb;setTimeout(()=>{if(LK.o===o)cb(pin);},120);}
}
/* guarda quando o app foi deixado de lado (sobrevive a fechar o app) */
function lockMarcaSaida(){try{localStorage.setItem('gv-lock-saiu',String(Date.now()));}catch(e){}}
function lockLimpaSaida(){try{localStorage.removeItem('gv-lock-saiu');}catch(e){}}
function lockDentroDoPrazo(){const c=lockCfg();if(!c||!c.atraso)return false;const t=+localStorage.getItem('gv-lock-saiu')||0,d=Date.now()-t;return !!t&&d>=0&&d<c.atraso*60000;} // v10.51: relógio voltado para trás (d<0) pede o PIN
function lockAbre(forca){
  lockLimpaSaida();
  const c=lockCfg();if(!c){lockFecha();return;}
  if(!forca&&LK.o&&LK.o.modo==='abrir')return;
  lockTela({modo:'abrir',titulo:'Digite seu PIN',sub:c.bio?'ou use o Face ID':'',bio:!!c.bio,cb:async pin=>{
    const ok=await lockConfere(pin),cc=lockCfg();
    if(ok){if(cc){cc.falhas=0;cc.ate=0;lockSalva(cc);}lockFecha();return;}
    if(!cc){lockFecha();return;}
    cc.falhas=(cc.falhas||0)+1;
    if(cc.falhas>=10){lockMsg('muitas tentativas erradas. Entre de novo com sua conta.',true);lockDesconecta();return;}
    if(cc.falhas>=5){const seg=Math.min(300,30*Math.pow(2,cc.falhas-5));cc.ate=Date.now()+seg*1000;lockSalva(cc);lockErro('PIN incorreto. Tente de novo em '+seg+' s');}
    else{lockSalva(cc);lockErro('PIN incorreto');}
  }});
  if(c.bio&&document.visibilityState!=='hidden')setTimeout(()=>{if(LK.o&&LK.o.modo==='abrir')lockBio(true);},350);
}
async function lockBio(auto){
  const c=lockCfg();if(!c||!c.bio||LK.bioBusy)return;
  LK.bioBusy=true;
  try{
    const r=await navigator.credentials.get({publicKey:{challenge:crypto.getRandomValues(new Uint8Array(32)),allowCredentials:[{type:'public-key',id:lkDeB64(c.bio),transports:['internal']}],userVerification:'required',timeout:60000}});
    const fl=r&&r.response&&r.response.authenticatorData?new Uint8Array(r.response.authenticatorData)[32]:0;
    if(fl&4){c.falhas=0;c.ate=0;lockSalva(c);lockFecha();return;}
    lockMsg('não deu certo, use o PIN',true);
  }catch(e){if(!auto)lockMsg('Face ID cancelado, toque no botão de novo ou use o PIN',true);}
  finally{setTimeout(()=>{LK.bioBusy=false;},400);}
}
async function lockBioAtiva(){
  const c=lockCfg();if(!c){toast('Crie um PIN primeiro',true);return;}
  if(!await bioDisponivel()){toast('Este aparelho não tem Face ID ou Touch ID disponível para o app',true);return;}
  LK.bioBusy=true;
  try{
    const cred=await navigator.credentials.create({publicKey:{
      challenge:crypto.getRandomValues(new Uint8Array(32)),rp:{name:'GranaViva'},
      user:{id:new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('gv-lock:'+(USER?USER.id:'local')))).slice(0,16),name:(USER&&USER.email)||'GranaViva',displayName:'GranaViva · desbloqueio'},
      excludeCredentials:(lkBioBk()?[{type:'public-key',id:lkDeB64(lkBioBk().id),transports:['internal']}]:[]),
      pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
      authenticatorSelection:{authenticatorAttachment:'platform',userVerification:'required',residentKey:'preferred'},
      timeout:60000,attestation:'none'}});
    if(!cred)throw new Error('sem credencial');
    const cc=lockCfg();if(!cc)return;cc.bio=lkB64(cred.rawId);lockSalva(cc);lkBioGuarda(cc.bio);render();toast('Face ID ativado');
  }catch(e){const bk=lkBioBk(),cc=lockCfg();if(e&&e.name==='InvalidStateError'&&bk&&cc){cc.bio=bk.id;lockSalva(cc);render();toast('Face ID ativado');}else toast('Face ID não foi ativado',true);}
  finally{setTimeout(()=>{LK.bioBusy=false;},400);}
}
function lockNovoPin(len){
  len=len===6||len===4?len:lockLen(lockCfg());
  lockTela({modo:'novo',len,titulo:'Crie um PIN de '+len+' dígitos',sub:'ele vai ser pedido ao abrir o app neste aparelho',cancelar:true,cb:pin1=>{
    lockTela({modo:'confirma',len,titulo:'Confirme o PIN',sub:'digite o mesmo PIN de novo',cancelar:true,cb:async pin2=>{
      if(pin2!==pin1){lockNovoPin(len);lockErro('os PINs não batem, crie o PIN de novo');return;}
      const ant=lockCfg()||{},salt=lkB64(crypto.getRandomValues(new Uint8Array(16)));
      const bk=lkBioBk();lockSalva({hash:await lockHash(pin1,salt),salt:salt,len,bio:ant.bio||(bk&&bk.id)||null,uid:USER?USER.id:null,atraso:ant.hash?ant.atraso:1,falhas:0,ate:0});
      lockFecha();render();toast(ant.hash?'PIN trocado':'Bloqueio ativado');
      if(!ant.hash&&!(lockCfg()||{}).bio&&await bioDisponivel())setTimeout(()=>confirma({titulo:'Usar Face ID também?',texto:'Você abre o app com o rosto (ou a digital) e o PIN fica de reserva.',ok:'Ativar'},lockBioAtiva),400);
    }});
  }});
}
function lockPedeAtual(titulo,depois){
  lockTela({modo:'atual',titulo:titulo,cancelar:true,cb:async pin=>{if(await lockConfere(pin))depois();else lockErro('PIN incorreto');}});
}
function lockEsqueci(){
  lockMsg('Para criar outro PIN, saia da conta e entre de novo com seu e-mail e senha. Seus dados continuam salvos na nuvem.',false);
  const f=$('#lkFoot');if(f)f.innerHTML='<button type="button" class="btn2" data-k="volta">voltar</button><button type="button" class="btn2 danger" data-k="sair">sair da conta</button>';
}
async function lockSair(mesmoAssim){
  lockMsg('saindo…',false);
  try{if(typeof temPendencia==='function'&&temPendencia()&&navigator.onLine)await enviar();}catch(e){}
  /* v10.45: igual ao "sair" normal, avisa se há alterações que ainda não chegaram à nuvem (ex.: offline) */
  if(!mesmoAssim&&typeof temPendencia==='function'&&temPendencia()){
    lockMsg('Atenção: há alterações deste aparelho que ainda não chegaram à nuvem. Se sair agora, elas serão perdidas. Conecte-se à internet e aguarde antes de sair.',true);
    const f=$('#lkFoot');if(f)f.innerHTML='<button type="button" class="btn2" data-k="volta">voltar</button><button type="button" class="btn2 danger" data-k="sairJa">sair mesmo assim</button>';
    return;
  }
  lockDesconecta();
}
/* sai da conta neste aparelho e exige login de verdade na volta (o Google não entra direto pela sessão já aberta) */
async function lockDesconecta(){
  try{localStorage.setItem('gv-reauth','1');}catch(e){}
  LK.manual=true;lockSalva(null);lockFecha();
  try{await sb.auth.signOut({scope:'local'});}catch(e){}
}
function lockCardHTML(){
  const c=lockCfg();
  if(!c)return `<div class="card lkCard"><div class="lkHead"><span class="lkIc">${I('lu_lock_keyhole')}</span><div><h4>Bloqueio do app</h4><small>desligado neste aparelho</small></div></div><p class="small" style="margin:12px 0">Peça um PIN ou Face ID para abrir o GranaViva neste aparelho.</p><button class="btn full" data-act="lock-pin">ativar bloqueio com PIN</button></div>`;
  const a=c.atraso||0;
  return `<div class="card lkCard">
    <div class="lkHead"><span class="lkIc">${I('lu_lock_keyhole')}</span><div><h4>Bloqueio do app</h4><small>protegendo este aparelho</small></div><span class="lkOk">ativo</span></div>
    <div class="lkList">
      <button class="lkRow" data-act="lock-bio" id="lockBioBtn"><span class="lkRi">${I('lu_scan_face')}</span><span class="lkRt"><b>Face ID</b><small>${c.bio?'abre o app olhando pro celular':'use o rosto em vez do PIN'}</small></span><span class="lkSw${c.bio?' on':''}" aria-hidden="true"><i></i></span></button>
      <button class="lkRow" data-act="lock-pin"><span class="lkRi">${I('lu_key_round')}</span><span class="lkRt"><b>Trocar PIN</b><small>4 ou 6 dígitos</small></span><span class="lkCh">${I('chevR')}</span></button>
      <div class="lkRow lkRowCol"><div class="lkRowTop"><span class="lkRi">${I('lu_timer')}</span><span class="lkRt"><b>Pedir de novo</b><small>depois de sair do app</small></span></div>
        <div class="lkSeg">${[[0,'na hora'],[1,'1 min'],[5,'5 min'],[15,'15 min']].map(([v,l])=>`<button data-act="lock-atraso" data-id="${v}" class="${a===v?'on':''}">${l}</button>`).join('')}</div></div>
    </div>
    <button class="lkOff" data-act="lock-off">desativar bloqueio</button></div>`;
}
async function atualizaLockUI(){const b=document.getElementById('lockBioBtn');if(!b)return;const c=lockCfg();if(c&&c.bio)return;if(!await bioDisponivel())b.remove();}
window.addEventListener('click',e=>{
  const lk=e.target.closest&&e.target.closest('#lock');if(!lk)return;
  e.stopPropagation();
  const b=e.target.closest('[data-k]');if(!b||b.disabled)return;
  e.preventDefault();lockTecla(b.dataset.k);
},true);
document.addEventListener('keydown',e=>{
  if(!LK.o)return;
  if(/^\d$/.test(e.key)){lockTecla(e.key);e.preventDefault();}
  else if(e.key==='Backspace'){lockTecla('del');e.preventDefault();}
  else if(e.key==='Escape'&&LK.o.cancelar){lockFecha();}
});
document.addEventListener('visibilitychange',()=>{
  const c=lockCfg();if(!c){document.documentElement.classList.remove('privado');return;}
  if(document.visibilityState==='hidden'){
    if(LK.bioBusy)return;
    LK.saiu=Date.now();
    if(!(LK.o&&LK.o.modo==='abrir'))lockMarcaSaida();
    if(LK.o&&LK.o.modo!=='abrir')lockFecha();
    if(!c.atraso)lockAbre();else document.documentElement.classList.add('privado');
  }else{
    tiraPrivado();
    if(LK.saiu){const d=Date.now()-LK.saiu;if(d<0||d>=(c.atraso||0)*60000)lockAbre();}
    LK.saiu=0;
    /* "na hora": a tela travou com o app em segundo plano, quando o Face ID não pode abrir. pede agora */
    if(!c.atraso&&c.bio&&LK.o&&LK.o.modo==='abrir')setTimeout(()=>{if(LK.o&&LK.o.modo==='abrir'&&document.visibilityState==='visible')lockBio(true);},350);
  }
});
window.addEventListener('pageshow',e=>{tiraPrivado();if(e.persisted&&lockCfg()&&!lockDentroDoPrazo())lockAbre();});
/* v10.157: tela "embaçada" com só o botão + nítido. html.privado borra o app (blur 18px) enquanto ele está em segundo plano;
   no iPhone (app na tela de início) a volta às vezes não dispara visibilitychange "visible" ou o WebKit não repinta a camada
   com filtro, e o app ficava borrado. agora a marca sai em qualquer sinal de que a tela está visível (pageshow, focus,
   toque, resize) e o app é repintado à força. */
function tiraPrivado(){
  if(document.visibilityState==='hidden')return;
  const h=document.documentElement;if(!h.classList.contains('privado'))return;
  h.classList.remove('privado');
  const a=document.getElementById('app');if(a){a.style.transform='translateZ(0)';requestAnimationFrame(()=>{a.style.transform='';});}
}
['focus','resize'].forEach(ev=>window.addEventListener(ev,tiraPrivado));
['pointerdown','touchstart','keydown'].forEach(ev=>document.addEventListener(ev,tiraPrivado,{capture:true,passive:true}));
window.addEventListener('pagehide',()=>{if(lockCfg()&&!(LK.o&&LK.o.modo==='abrir'))lockMarcaSaida();});
if(!lockDentroDoPrazo())lockAbre();else{$('#lock').classList.remove('on');document.documentElement.classList.remove('travado');lockInerte(false);}
/* ---------- arrastar da esquerda para a direita abre o menu lateral; da direita para a esquerda fecha (celular) ---------- */
(function(){
  const W=()=>($('#side').offsetWidth||248);
  let x0=0,y0=0,t0=0,modo=null,abrindo=false,dx=0;
  function bloqueado(){return innerWidth>=900||$('#lock').classList.contains('on')||$('#auth').classList.contains('on')||$('#modal').classList.contains('on');}
  function rolaHoriz(el){
    for(;el&&el!==document.body;el=el.parentElement){
      if(/INPUT|TEXTAREA|SELECT|CANVAS/.test(el.tagName))return true;
      if(el.scrollWidth>el.clientWidth+2){const ox=getComputedStyle(el).overflowX;if(ox==='auto'||ox==='scroll')return true;}
    }
    return false;
  }
  function pinta(p){OV_ARRASTA=true;const sd=$('#side'),ov=$('#ov');ov.style.visibility='visible';sd.style.transition='none';ov.style.transition='none';sd.style.transform='translateX('+((p-1)*102)+'%)';ov.style.pointerEvents='none';ov.style.opacity=String(p);ov.classList.add('on');}
  function limpa(){OV_ARRASTA=false;const sd=$('#side'),ov=$('#ov');sd.style.transition='';sd.style.transform='';ov.style.transition='';ov.style.opacity='';ov.style.pointerEvents='';ov.style.visibility='';}
  /* v10.63: se o dedo começa num elemento que o render troca no meio do gesto, o touchend não sobe até o document
     e o menu ficava preso aberto pela metade. agora o fim também é ouvido no próprio alvo, e um gesto preso é desfeito. */
  function preso(){const sd=$('#side');return !!(sd&&sd.style.transform);}
  function solta(){if(preso()||OV_ARRASTA){limpa();toggleSide($('#side').classList.contains('open'));}else ovConfere();}
  let alvo=null,guarda=0;
  function ligaAlvo(el){if(alvo===el)return;desligaAlvo();alvo=el;if(!el)return;el.addEventListener('touchmove',mv,{passive:false});el.addEventListener('touchend',fimAlvo,{passive:true});el.addEventListener('touchcancel',fimAlvo,{passive:true});}
  function desligaAlvo(){if(!alvo)return;alvo.removeEventListener('touchmove',mv);alvo.removeEventListener('touchend',fimAlvo);alvo.removeEventListener('touchcancel',fimAlvo);alvo=null;}
  function fimAlvo(e){if(e.target&&e.target.isConnected)return;fim();} // ainda no DOM: o listener do document trata
  document.addEventListener('visibilitychange',()=>{modo=null;clearTimeout(guarda);desligaAlvo();solta();});
  window.addEventListener('pageshow',()=>{modo=null;solta();});window.addEventListener('focus',()=>{if(modo!=='arrasta')solta();});
  /* rede de segurança: mudou a classe do menu ou terminou a transição, confere o fundo */
  try{new MutationObserver(()=>{if(modo!=='arrasta')setTimeout(ovConfere,0);}).observe($('#side'),{attributes:true,attributeFilter:['class']});}catch(e){}
  $('#ov').addEventListener('transitionend',()=>{if(modo!=='arrasta')ovConfere();});
  $('#side').addEventListener('transitionend',()=>{if(modo!=='arrasta')ovConfere();});
  window.addEventListener('resize',()=>{if(modo!=='arrasta')solta();});
  document.addEventListener('touchstart',e=>{
    if(modo!=='arrasta')solta();
    modo=null;if(e.touches.length!==1||bloqueado())return;
    const t=e.touches[0];abrindo=$('#side').classList.contains('open');
    if(!abrindo&&t.clientX>30&&rolaHoriz(e.target))return;
    x0=t.clientX;y0=t.clientY;t0=performance.now();dx=0;modo='?';ligaAlvo(e.target);
  },{passive:true});
  let ultMv=null;
  function mv(e){
    if(!modo||e===ultMv)return;ultMv=e;const t=e.touches[0];if(!t)return;const ddx=t.clientX-x0,ddy=t.clientY-y0;
    clearTimeout(guarda);guarda=setTimeout(()=>{if(modo==='arrasta')fim();},900); // nenhum movimento nem fim por quase 1s: encerra o gesto
    if(modo==='?'){
      if(Math.abs(ddx)<10&&Math.abs(ddy)<10)return;
      if(Math.abs(ddx)>Math.abs(ddy)*1.3&&(abrindo?ddx<0:ddx>0))modo='arrasta';else{modo=null;return;}
    }
    if(e.cancelable)e.preventDefault();
    dx=ddx;const w=W();
    pinta(abrindo?Math.max(0,Math.min(1,1+dx/w)):Math.max(0,Math.min(1,dx/w)));
  }
  document.addEventListener('touchmove',mv,{passive:false});
  function fim(){
    clearTimeout(guarda);desligaAlvo();
    if(modo!=='arrasta'){modo=null;solta();return;}
    modo=null;const w=W(),v=dx/Math.max(1,performance.now()-t0);
    const abre=abrindo?!(dx<-w*.35||v<-.5):(dx>w*.35||v>.5);
    limpa();toggleSide(abre);
  }
  /* depois de qualquer fim de toque: se o gesto não está ativo, nada de fundo preso (iOS às vezes perde touchend/transitionend) */
  let confT=0;function fimSeguro(){clearTimeout(confT);confT=setTimeout(()=>{if(modo!=='arrasta')solta();},420);}
  document.addEventListener('touchend',e=>{fim(e);fimSeguro();},{passive:true});
  document.addEventListener('touchcancel',e=>{fim(e);fimSeguro();},{passive:true});
})();
function pintaOlho(){const b=$('#btnEye');if(!b)return;b.innerHTML=I(OCULTO?'eyeOff':'eye');b.setAttribute('aria-label',OCULTO?'mostrar valores':'ocultar valores');b.classList.toggle('on',OCULTO);}
pintaOlho();
$('#aLogo').innerHTML=logoSVG();
$('#topMark').innerHTML=logoSVG();
$('#icMail').innerHTML=I('mail');
$('#icLock').innerHTML=I('lock');
let aMode='in';
function mostraAuth(){$('#auth').classList.add('on');$('#fab').style.display='none';}
function escondeAuth(){$('#auth').classList.remove('on');$('#fab').style.display='';}
/* v10.104: o servidor exige letras e números em senha nova (cadastro e troca); o login com senha antiga continua igual */
const senhaForte=p=>/[A-Za-zÀ-ÿ]/.test(p)&&/\d/.test(p);
/* v10.126: falha de cadastro/login que é do servidor (e-mail de confirmação, erro genérico) vira alarme para o dono do app.
   manda só o tipo e a mensagem técnica (sem e-mail nem senha); o servidor limpa, limita e junta os avisos */
function avisaFalhaAuth(modo,err,msg){
  try{
    if(!/e-mail de confirmação|não deu pra entrar agora/.test(msg||''))return;
    const tec=String(err&&(err.message||err.code)||'').replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g,'<email>').slice(0,200);
    fetch(SB_URL+'/functions/v1/alertas-push',{method:'POST',headers:{'content-type':'application/json',apikey:SB_KEY},body:JSON.stringify({so:'erro-auth',modo:modo==='up'?'cadastro':'login',msg:tec})}).catch(()=>{});
  }catch(e){}
}
function erroTraduzido(m){
  m=String(m||'');
  if(/Invalid login/i.test(m))return 'email ou senha incorretos';
  if(/already registered|already been registered/i.test(m))return 'esse email já tem conta, entre com ela';
  if(/Password should (contain|be)|weak.?password/i.test(m))return 'a senha precisa ter pelo menos 8 caracteres, com letras e números';
  if(/valid email|invalid.*email/i.test(m))return 'confira o e-mail';
  if(/rate limit|too many/i.test(m))return 'muitas tentativas, espera um pouco';
  if(/Failed to fetch|NetworkError|network/i.test(m))return 'sem conexão com o servidor';
  /* v10.124: falha no envio do e-mail de confirmação (SMTP) tinha a mensagem genérica */
  if(/sending (confirmation|magic|recovery)|smtp|535|mail/i.test(m))return 'não conseguimos enviar o e-mail de confirmação agora. tenta com o Google ou daqui a pouco';
  return 'não deu pra entrar agora, tenta de novo';
}
document.querySelectorAll('.aTabs button').forEach(b=>b.addEventListener('click',()=>{
  aMode=b.dataset.m;
  document.querySelectorAll('.aTabs button').forEach(x=>x.classList.toggle('on',x===b));
  $('#aSubmit').textContent=aMode==='in'?'Entrar':'Criar conta';
  $('#aGoogle span').textContent=aMode==='in'?'Entrar com Google':'Criar conta com Google';
  $('#aPass').setAttribute('autocomplete',aMode==='in'?'current-password':'new-password');
  $('#aErr').textContent='';$('#aErr').className='aerr';
}));
$('#aGoogle').addEventListener('click',async ()=>{
  const btn=$('#aGoogle');btn.disabled=true;$('#aErr').textContent='';$('#aErr').className='aerr';
  try{
    /* depois de sair pela tela de bloqueio (esqueci o PIN / muitas tentativas), o Google pede a conta e a senha de novo */
    let reauth=false;try{reauth=localStorage.getItem('gv-reauth')==='1';}catch(e){}
    const {error}=await sb.auth.signInWithOAuth({provider:'google',options:Object.assign({redirectTo:window.location.origin+window.location.pathname},reauth?{queryParams:{prompt:'select_account',max_age:'0'}}:{queryParams:{prompt:'select_account'}})});
    if(error)throw error;
  }catch(err){
    $('#aErr').textContent=erroTraduzido(err&&err.message)||'não deu pra entrar com o google agora';
    btn.disabled=false;
  }
});
$('#authForm').addEventListener('submit',async ev=>{
  ev.preventDefault();
  const email=$('#aEmail').value.trim(),pass=$('#aPass').value;
  marcaCampo('#aEmail',false);marcaCampo('#aPass',false);
  if(!email||!pass){marcaCampo('#aEmail',!email);marcaCampo('#aPass',!pass);$('#aErr').textContent='Preencha e-mail e senha';return;}
  if(pass.length<6||(aMode==='up'&&pass.length<8)){marcaCampo('#aPass',true);$('#aErr').textContent=aMode==='up'?'use pelo menos 8 caracteres na nova senha':'a senha precisa ter pelo menos 6 caracteres';return;}
  if(aMode==='up'&&!senhaForte(pass)){marcaCampo('#aPass',true);$('#aErr').textContent='use letras e números na senha';return;}
  const btn=$('#aSubmit');btn.disabled=true;$('#aErr').textContent='';$('#aErr').className='aerr';
  try{
    if(aMode==='up'){
      const {data,error}=await sb.auth.signUp({email,password:pass,options:{emailRedirectTo:window.location.origin+window.location.pathname}});
      if(error)throw error;
      if(!data.session){
        // com confirmação de e-mail ativa, o Supabase só cria a sessão depois do clique no link
        const r=await sb.auth.signInWithPassword({email,password:pass});
        if(r.error){if(/confirm/i.test(r.error.message||'')){toast('Conta criada! Confirme pelo link que enviamos para '+email+' e depois entre.');return;}throw r.error;}
      }
    }else{
      const {error}=await sb.auth.signInWithPassword({email,password:pass});
      if(error){if(/confirm/i.test(error.message||'')){toast('Confirme seu e-mail pelo link que enviamos antes de entrar.',true);return;}throw error;}
    }
    $('#aPass').value='';
  }catch(err){
    const msg=erroTraduzido(err&&err.message);
    $('#aErr').textContent=msg;
    avisaFalhaAuth(aMode,err,msg);
    /* v10.52: cadastro fechado no Supabase → some com a aba "Criar conta" (antes ficava visível e falhava) */
    if(/sign ?ups? (not|are)|signup.*(disabled|not allowed)|cadastro.*(fechado|desativ)/i.test(err&&err.message||'')){
      document.querySelectorAll('.aTabs button[data-m=up]').forEach(b=>{b.style.display='none';});
      document.querySelector('.aTabs button[data-m=in]').click();
      $('#aErr').textContent='Novas contas estão fechadas neste momento. Use Entrar.';
    }
    if(/incorretos/.test(msg)){marcaCampo('#aEmail',true);marcaCampo('#aPass',true);}
    if(/confira o e-mail/.test(msg))marcaCampo('#aEmail',true);
  }finally{btn.disabled=false;}
});
function limpaCache(){
  crCancela(KEY);
  try{localStorage.removeItem(LOC_KEY);localStorage.removeItem(ERR_KEY);}catch(e){}LOC_BLOQ=false;LOC_AVISOU=false; // v10.106
  dadosIdb('readwrite',st=>st.delete(KEY)).catch(()=>{});
  try{
    const rm=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k===KEY||k===OWNER_KEY||k==='gv-cot-ts'||/^gv-snap-/.test(k))rm.push(k);}
    rm.forEach(k=>localStorage.removeItem(k));
  }catch(e){}
  SNAP=null;LEGADO=null;COPIA_LIDA=false;BASE_OK=false;SEGURA={};
}
function marcaCampo(sel,on){const el=$(sel);if(!el)return;const f=el.closest('.fld');if(f)f.classList.toggle('bad',!!on);}
['#aEmail','#aPass'].forEach(sel=>$(sel).addEventListener('input',()=>marcaCampo(sel,false)));
$('#aForgot').addEventListener('click',async ()=>{
  const email=$('#aEmail').value.trim();
  if(!email){marcaCampo('#aEmail',true);$('#aErr').textContent='Digite seu e-mail primeiro';$('#aEmail').focus();return;}
  marcaCampo('#aEmail',false);$('#aErr').textContent='';$('#aErr').className='aerr';
  try{
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname});
    if(error)throw error;
    toast('enviamos um link pro seu email');
  }catch(err){$('#aErr').textContent=erroTraduzido(err&&err.message)||'não deu pra enviar o link agora';}
});
/* v10.82: 'Termos e privacidade' virou links para site/termos.html e site/privacidade.html (index.html) */
function pedeNovaSenha(){
  form('Nova senha',[{name:'p',label:'Nova senha (mín. 8 caracteres, letras e números)',type:'password',required:true}],v=>{
    const p=String(v.p);
    if(p.length<8)return 'use pelo menos 8 caracteres';
    if(!senhaForte(p))return 'use letras e números na senha';
    sb.auth.updateUser({password:p}).then(({error})=>{
      if(error)toast(erroTraduzido(error.message)||'não deu pra trocar a senha',true);
      else toast('Senha atualizada');
    });
    return null;
  });
}
function pintaUsuario(){
  const ch=$('#uchip');
  if(!USER){ch.innerHTML='';return;}
  ch.innerHTML='<span class="av">'+I('user')+'</span><span class="who">'+esc(USER.email||'conta')+'<small>conectado</small></span><button id="btnOut" aria-label="sair da conta" title="sair">'+I('logout')+'</button>';
}
$('#uchip').addEventListener('click',async e=>{
  if(!e.target.closest('#btnOut'))return;
  confirma({titulo:'Sair da conta?',texto:temPendencia()?'Atenção: há alterações deste aparelho que ainda não chegaram à nuvem. Se sair agora, elas serão perdidas. Conecte-se à internet e aguarde "sincronizado" antes de sair.':'Você sai desta conta neste aparelho. Seus dados continuam salvos na nuvem.',ok:'Sair',perigo:temPendencia()},async()=>{LK.manual=true;const r=await sb.auth.signOut().catch(e=>({error:e}));if(r&&r.error)await sb.auth.signOut({scope:'local'}).catch(()=>{});});
});
async function entraComSessao(sess){
  if(!sess||!sess.user)return;
  await CR_PRONTO;
  try{localStorage.removeItem('gv-reauth');}catch(e){}
  {const lc=lockCfg();if(lc&&lc.uid&&lc.uid!==sess.user.id){lockSalva(null);lockFecha();}}
  if(!USER||USER.id!==sess.user.id){
    if(localStorage.getItem(OWNER_KEY)!==sess.user.id){
      // cache de outra conta (ou sem dono): nunca exibir nem enviar para esta conta
      const leg=LEGADO;limpaCache();LEGADO=leg;S=Object.assign(vazio(),{cfg:S.cfg});
    }
    USER=sess.user;SNAP=COPIA_LIDA?lerSnap():null;BASE_OK=false;SEGURA={};/* v10.117: sem a cópia deste aparelho, o snapshot não vale (senão o envio apagaria da nuvem o que só sumiu daqui) */pintaUsuario();escondeAuth();
    planoZera();carregaPlano().then(()=>{retornoAssinatura();abrePlanosURL();}); // v10.82: lê o plano uma vez por login
    /* v10.52: sessão expirou com edições pendentes? recoloca elas como pendência e reenvia antes de baixar */
    try{
      const pend=await leTalvezCifrado('gv-pend');
      if(pend&&pend.dono===sess.user.id&&pend.S&&Array.isArray(pend.S.tx)){
        S=sanea(pend.S);zeraCfgH();SNAP={};salvar();try{localStorage.removeItem('gv-pend');}catch(e){}
      }
    }catch(e){}
    setSync('carregando seus dados…');
    /* alterações feitas offline (ou logo antes de fechar a página) ainda não enviadas: envia antes de baixar,
       senão a cópia da nuvem sobrescreveria o que foi feito neste aparelho */
    if(SNAP&&temPendencia()){try{await enviar();}catch(e){}}
    if(SNAP&&temPendencia()){setSync('pendente, tenta de novo ao voltar a conexão');applyCfg();render();restauraAba();agendaSync(15000);return;}
    syncBusy=true;
    let igual=false;
    try{igual=(await baixar())==='igual';}catch(err){setSync('offline, usando cópia deste aparelho');}
    finally{syncBusy=false;}
    if(!S.cfg.pagDesde){S.cfg.pagDesde=hojeISO();salvar();}
    const ger=geraRecorrentes();if(ger)salvar();
    if(radarMigra())salvar(); // v10.155
    // v10.73: a tela já mostra a cópia deste aparelho e a nuvem não trouxe nada novo: não redesenha (nem pula de aba)
    if(!(igual&&!ger&&CR_TELA)){restauraAba();applyCfg();render();}
    prcAuto();tourTalvez(); // v10.96: verificar parcelas, uma vez; v10.103: tour na conta nova
  }
}
// bootstrap explícito: após o redirect do Google a sessão vem no hash (#access_token)
sb.auth.getSession().then(({data})=>{
  if(data&&data.session){
    try{if(window.location.hash.includes('access_token')||/[?&]code=/.test(window.location.search))history.replaceState(null,'',window.location.pathname+window.location.search);}catch(e){}
    /* v10.52: limite de sessão por inatividade (o Supabase só permite isso no plano pago, então o app mesmo desloga):
       7 dias sem abrir o app pede login de novo. os dados continuam salvos na nuvem. */
    try{
      const ult=+(localStorage.getItem('gv-last-act')||0);
      if(ult&&Date.now()-ult>7*864e5&&data.session)sb.auth.signOut().catch(()=>{});
      else localStorage.setItem('gv-last-act',String(Date.now()));
    }catch(e){}
    entraComSessao(data.session);
  }else{
    if(!sessaoGuardadaId()&&localStorage.getItem(OWNER_KEY))limpaCache();
    mostraAuth();
  }
}).catch(()=>mostraAuth());
sb.auth.onAuthStateChange(async (ev,sess)=>{
  if(ev==='PASSWORD_RECOVERY'&&sess)setTimeout(pedeNovaSenha,300);
  if(!sess){
    if(ev==='SIGNED_OUT'){
      /* só apaga o PIN quando a pessoa saiu de propósito; sessão expirada mantém PIN e Face ID */
      const saiuDeProposito=LK.manual;
      if(saiuDeProposito)lockSalva(null);LK.manual=false;lockFecha();
      /* v10.52: sessão expirada (não foi um sair de propósito) com edições ainda não enviadas:
         guarda uma cópia local e devolve no próximo login da mesma conta, em vez de apagar sem aviso */
      if(!saiuDeProposito&&USER&&temPendencia()){try{gravaCifrado('gv-pend',JSON.stringify({dono:USER.id,S:sanea(S)}));}catch(e){}}
      clearTimeout(syncT);syncPend=false; // v10.103: nada agendado da conta anterior roda depois de sair
      USER=null;planoZera();pintaUsuario();setSync('');
      limpaCache();
      S=Object.assign(vazio(),{cfg:S.cfg});applyCfg();render();
    }
    USER=null;pintaUsuario();
    mostraAuth();
    return;
  }
  if(ev==='SIGNED_IN'){try{localStorage.removeItem('gv-reauth');}catch(e){}}
  await CR_PRONTO; // v10.64: espera abrir a cópia cifrada antes de comparar/enviar
  if(!USER||USER.id!==sess.user.id){
    if(localStorage.getItem(OWNER_KEY)!==sess.user.id){
      // cache de outra conta (ou sem dono): nunca exibir nem enviar para esta conta
      const leg=LEGADO;limpaCache();LEGADO=leg;S=Object.assign(vazio(),{cfg:S.cfg});
    }
    USER=sess.user;SNAP=COPIA_LIDA?lerSnap():null;BASE_OK=false;SEGURA={};/* v10.117: sem a cópia deste aparelho, o snapshot não vale (senão o envio apagaria da nuvem o que só sumiu daqui) */pintaUsuario();escondeAuth();
    planoZera();carregaPlano().then(()=>{retornoAssinatura();abrePlanosURL();}); // v10.82: lê o plano uma vez por login
    /* v10.52: sessão expirou com edições pendentes? recoloca elas como pendência e reenvia antes de baixar */
    try{
      const pend=await leTalvezCifrado('gv-pend');
      if(pend&&pend.dono===sess.user.id&&pend.S&&Array.isArray(pend.S.tx)){
        S=sanea(pend.S);zeraCfgH();SNAP={};salvar();try{localStorage.removeItem('gv-pend');}catch(e){}
      }
    }catch(e){}
    setSync('carregando seus dados…');
    /* alterações feitas offline (ou logo antes de fechar a página) ainda não enviadas: envia antes de baixar,
       senão a cópia da nuvem sobrescreveria o que foi feito neste aparelho */
    if(SNAP&&temPendencia()){try{await enviar();}catch(e){}}
    if(SNAP&&temPendencia()){setSync('pendente, tenta de novo ao voltar a conexão');applyCfg();render();restauraAba();agendaSync(15000);return;}
    syncBusy=true;
    let igual=false;
    try{igual=(await baixar())==='igual';}catch(err){setSync('offline, usando cópia deste aparelho');}
    finally{syncBusy=false;}
    if(!S.cfg.pagDesde){S.cfg.pagDesde=hojeISO();salvar();}
    const ger=geraRecorrentes();if(ger)salvar();
    if(radarMigra())salvar(); // v10.155
    // v10.73: a tela já mostra a cópia deste aparelho e a nuvem não trouxe nada novo: não redesenha (nem pula de aba)
    if(!(igual&&!ger&&CR_TELA)){restauraAba();applyCfg();render();}
    prcAuto();tourTalvez(); // v10.96: verificar parcelas, uma vez; v10.103: tour na conta nova
  }
});
if(!navigator.onLine){
  // sem conexão: se já há sessão guardada, o onAuthStateChange carrega o cache local
}
})();
