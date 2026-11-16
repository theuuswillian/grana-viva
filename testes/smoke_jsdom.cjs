// v10.165: teste de fumaça do app.js no jsdom (Supabase falso). Rodar: npm i --no-save jsdom@24 && node testes/smoke_jsdom.cjs
// smoke test do app.js no jsdom com Supabase falso: renderiza as 4 abas com dados de exemplo e confere os blocos novos
const fs=require('fs'),{JSDOM,VirtualConsole}=require('jsdom');
const R=require('path').join(__dirname,'..')+'/';
const html=fs.readFileSync(R+'index.html','utf8').replace(/<script[\s\S]*?<\/script>/g,'');
const vc=new VirtualConsole();const erros=[];
vc.on('jsdomError',e=>erros.push('jsdom: '+(e.message||e)));vc.on('error',e=>erros.push('console.error: '+e));
const dom=new JSDOM(html,{url:'https://theuuswillian.github.io/grana-viva/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
const w=dom.window;
w.matchMedia=w.matchMedia||(()=>({matches:false,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}));
w.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
w.scrollTo=()=>{};w.HTMLCanvasElement.prototype.getContext=()=>null;
const q=()=>{const o={select:()=>o,eq:()=>o,gte:()=>o,lte:()=>o,order:()=>o,range:()=>o,limit:()=>o,in:()=>o,maybeSingle:async()=>({data:null,error:null}),single:async()=>({data:null,error:null}),upsert:async()=>({error:null}),insert:async()=>({error:null}),delete:()=>o,update:()=>o,then:(ok)=>ok({data:[],error:null})};return o;};
w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getUser:async()=>({data:{user:null}})},from:q,rpc:async()=>({data:null,error:null}),functions:{invoke:async()=>({data:{},error:null})},storage:{from:()=>({upload:async()=>({}),remove:async()=>({})})},channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel(){}})};
w.eval(fs.readFileSync(R+'planos.js','utf8'));
w.eval("var GV_BUILD='test';");
const HOOK="\n;window.__t={get S(){return S},set S(v){S=v},go:typeof go!=='undefined'?go:null,render,demoPreenche,demoLimpa,conquistasDivHTML,gsExtratoHTML,limiteMesHTML,salvaRapidoIA,qcFecha,diaRotulo,hojeSP,ritmoMes,mesAtual,setUser:u=>{USER=u;PLANO_LIDO=true;},origemBadge,saldoLivre,fixosDoImport,waResumoHTML,waCmdHTML,faturasAbertasHTML};\n";
try{const src=fs.readFileSync(R+'app.js','utf8');const k=src.lastIndexOf('})();');w.eval(src.slice(0,k)+HOOK+src.slice(k));}
catch(e){console.log('ERRO ao carregar app.js:',e.stack.split('\n').slice(0,4).join('\n'));process.exit(1);}
const T=w.__t;
T.setUser({id:'00000000-0000-0000-0000-000000000001',email:'t@t.com'});
const S=T.S;S.bancos=S.bancos&&S.bancos.length?S.bancos:[{id:'b1',nome:'Nubank',tipo:'Conta corrente',saldo:1000,principal:true}];
S.cartoes=[{id:'c1',nome:'Nubank',banco:'Nubank',limite:5000,fecha:20,vence:27,cor:'roxo'}];
const ok=(c,m)=>{if(!c){console.log('FALHOU:',m);process.exitCode=1;}else console.log('ok',m);};
const doc=w.document;
// fase 1: sem chave de modo; o app tem sempre as 4 abas
ok(doc.documentElement.classList.contains('mvp')&&doc.querySelectorAll('#tabbar [data-tab]').length===4,'4 abas na barra de baixo');
// lançamento antigo da conexão bancária (origem 'banco') aparece com o selo "Importado"
ok(/txOrg o-imp[^>]*>Importado</.test(T.origemBadge({id:'x',tipo:'despesa',valor:1,data:'2026-01-01',origem:'banco'})),'selo "Importado" no lançamento antigo do banco');
const view=()=>doc.querySelector('#view').innerHTML;
try{T.render();}catch(e){console.log('render inicio',e.stack.split('\n').slice(0,3).join(' | '));}
ok(/Preencher exemplo para explorar/.test(view()),'conta vazia mostra "Preencher exemplo"');
T.demoPreenche();
ok(T.S.tx.filter(t=>t.demo).length===7,'7 lançamentos de exemplo');
ok(/Limpar exemplo/.test(view()),'faixa "Limpar exemplo" no Início');
ok(/omniF/.test(view())&&/omniCam/.test(view()),'barra com frase + câmera');
ok(/lmCard/.test(view()),'termômetro no Início');
const g=T.gsExtratoHTML();ok(/class="dayH"/.test(g)&&/Hoje/.test(g),'extrato agrupado por dia com "Hoje"');
ok(/txOrg o-wa/.test(g)&&/txOrg o-rec/.test(g)&&/txOrg o-ia/.test(g),'selos de origem IA / WhatsApp / Recibo');
console.log('  rótulos:',T.diaRotulo(T.hojeSP()),'|',(()=>{const d=new Date();d.setDate(d.getDate()-3);return T.diaRotulo(d.toISOString().slice(0,10));})());
for(const tab of ['gastos','fii','conta','inicio']){try{T.go(tab);if(view().length<=500)console.log('VIEW',tab,view().slice(0,300));ok(view().length>500,'aba '+tab+' renderiza');}catch(e){ok(false,'aba '+tab+': '+e.message);}}
// conquistas
T.S.fiis=[{id:'f1',tipo:'fii',ticker:'MXRF11',nome:'',cotas:500,preco:10,dpc:0.1,diaPag:15,pago:0,ops:[]}];
const cq=T.conquistasDivHTML();ok(/conquistas de dividendos/.test(cq)&&/Café/.test(cq)&&/Aluguel/.test(cq),'conquistas de dividendos (R$ 50/mês)');
ok((cq.match(/<li class="on"/g)||[]).length===1&&/Streaming/.test(cq),'Café aceso, próximo Streaming');
T.go('fii');ok(/cqCard/.test(view()),'conquistas na aba Patrimônio');ok(/astBell/.test(view()),'sino de alerta por ativo');
T.S.fiis=[];
// confirmação rápida
const n0=T.S.tx.length;
T.salvaRapidoIA({valor:45.9,data:T.hojeSP(),tipo:'despesa',descricao:'almoço',categoria:'Restaurantes',forma:'pix',parcelas:1,confianca:0.9});
ok(T.S.tx.length===n0+1,'confiança alta salva na hora');
const qc=doc.querySelector('.qcCard');ok(!!qc&&/Categoria/.test(qc.innerHTML)&&/Pagamento/.test(qc.innerHTML)&&/Desfazer/.test(qc.innerHTML),'cartão de confirmação com as 3 pílulas');
const sel=qc.querySelector('select[data-qc="cat"]');sel.value='Mercado';sel.dispatchEvent(new w.Event('change',{bubbles:true}));
ok(T.S.tx[T.S.tx.length-1].categoria==='Mercado','pílula Categoria troca na hora');
const sp=doc.querySelector('.qcCard select[data-qc="pag"]');sp.value='c:c1';sp.dispatchEvent(new w.Event('change',{bubbles:true}));
ok(T.S.tx[T.S.tx.length-1].forma==='cartao'&&T.S.tx[T.S.tx.length-1].cartao==='c1','pílula Pagamento troca para o cartão');
doc.querySelector('.qcCard [data-qc="undo"]').click();
ok(T.S.tx.length===n0,'Desfazer remove o lançamento');
T.salvaRapidoIA({valor:45.9,data:T.hojeSP(),tipo:'despesa',descricao:'tv',categoria:'Compras',forma:'cartao',parcelas:10,confianca:0.9});
ok(T.S.tx.length===n0&&/Confira o lançamento/.test(doc.querySelector('#modal').innerHTML),'parcelado abre o formulário (sem salvar direto)');
// faturas com logo
const fa=T.faturasAbertasHTML(false);ok(/logos\/nubank\.com\.br\.png/.test(fa),'logo real do banco na fatura');
// fixos do extrato
const fx=T.fixosDoImport([{fixo:true,on:true,tipo:'despesa',valor:-55.9,desc:'NETFLIX.COM',data:'2026-11-03',cat:'Assinaturas'},{fixo:true,on:true,tipo:'despesa',valor:-55.9,desc:'NETFLIX.COM',data:'2026-10-03',cat:'Assinaturas'},{fixo:false,on:true,tipo:'despesa',valor:-10,desc:'PADARIA',data:'2026-11-03'}],'b1',true);
ok(fx.length===1&&fx[0].meses.size===2&&fx[0].data==='2026-11-03','extrato: 1 assinatura sugerida com 2 meses');
ok(/Resumo semanal toda segunda às 8h/.test(T.waResumoHTML(false))&&/wa-copia/.test(T.waCmdHTML()),'WhatsApp: toggle e chips');
T.demoLimpa();ok(!T.S.tx.some(t=>t.demo),'Limpar exemplo apaga tudo de exemplo');
// privacidade
T.go('inicio');doc.querySelector('#btnEye').click();ok(/•••••/.test(view())&&w.localStorage.getItem('gv-oculto')==='1','olho do cabeçalho mascara os valores e grava');
doc.querySelector('#btnEye').click();
// fase 1: nenhuma aba mostra a conexão bancária automática nem o imposto das vendas
{const txt=[];for(const tab of ['inicio','gastos','lanc','cartoes','bancos','fii','cfg']){try{T.go(tab);txt.push(view());}catch(e){ok(false,'aba '+tab+': '+e.message);}}
 ok(!/imposto das vendas|conectar banco|banco-sync|banco-config|parc-verif|bcTxt|\birCard/i.test(txt.join('')),'sem conexão bancária automática e sem imposto das vendas nas telas');}
const e2=erros.filter(x=>!/Not implemented|Could not parse CSS|navigation/.test(x));
if(e2.length)console.log('erros do jsdom:',e2.slice(0,8));
setTimeout(()=>process.exit(process.exitCode||0),300);
