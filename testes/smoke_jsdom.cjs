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
const HOOK="\n;window.__t={get S(){return S},set S(v){S=v},sanea,limpaLegadoLocal,saldoTotal,ccFaturasLista,rpPorCota,rpMetaHTML,yocCalc,calcOps,irVendas,hojeISO,resetMemo:()=>{MEMO={};},forceLocalSave:()=>{clearTimeout(GL_T);GL_T=null;GL_PEND=true;CR_OK=true;LOC_BLOQ=false;return gravaLocalJa();},forceCipherWrite:()=>gravaCifrado('gv-crypto-fail-test','sensitive financial data'),cancelLocalSave:()=>{clearTimeout(GL_T);GL_T=null;},localCopyKey:KEY,readLocalCopy:async()=>await dadosIdb('readonly',st=>st.get(KEY)).catch(()=>null)||localStorage.getItem(KEY),go:typeof go!=='undefined'?go:null,render,demoPreenche,demoLimpa,conquistasDivHTML,gsExtratoHTML,limiteMesHTML,salvaRapidoIA,qcFecha,diaRotulo,hojeSP,ritmoMes,mesAtual,setUser:u=>{USER=u;PLANO_LIDO=true;},setMvp:()=>MVP_MODE,saldoLivre,fixosDoImport,lerOFX,lerCSV,conciliarSaldoImportacao,abreImport,montaImport,confirmaImport,impLoteAnalisa,viewBancos,prcDetecta,get IMP(){return IMP;},set IMP(v){IMP=v;},waResumoHTML,waCmdHTML,faturasAbertasHTML,checkoutUrlMercadoPago};\n";
try{const src=fs.readFileSync(R+'app.js','utf8');const k=src.lastIndexOf('})();');w.eval(src.slice(0,k)+HOOK+src.slice(k));}
catch(e){console.log('ERRO ao carregar app.js:',e.stack.split('\n').slice(0,4).join('\n'));process.exit(1);}
const T=w.__t;
const ok=(c,m)=>{if(!c){console.log('FALHOU:',m);process.exitCode=1;}else console.log('ok',m);};
ok(T.checkoutUrlMercadoPago('https://www.mercadopago.com.br/checkout/teste'),'checkout aceita domínio oficial Mercado Pago');
ok(T.checkoutUrlMercadoPago('https://mercadopago.com/checkout/teste'),'checkout aceita domínio oficial sem .br');
ok(!T.checkoutUrlMercadoPago('https://mercadopago.com.evil.example/'),'checkout rejeita domínio com sufixo malicioso');
ok(!T.checkoutUrlMercadoPago('https://evilmercadopago.com.br/'),'checkout rejeita domínio parecido');
ok(!T.checkoutUrlMercadoPago('http://www.mercadopago.com.br/'),'checkout exige HTTPS');
ok(!T.checkoutUrlMercadoPago('javascript:alert(1)'),'checkout rejeita protocolo não HTTPS');
const limpo=T.sanea({tx:[{id:'legado',pluggyId:'old-1',data:'2026-11-18',tipo:'despesa',valor:10},{id:'manual',data:'2026-11-18',tipo:'despesa',valor:20,par:{id:'par',pluggyId:'old-2'}}],fiis:[{id:'legado-fii',ticker:'OLD11',pluggyInv:'old',cotas:1,preco:10},{id:'manual-fii',ticker:'MXRF11',cotas:1,preco:10}],cfg:{tema:'dark',pluggyIgn:['old-1']}});
ok(limpo.tx.length===1&&limpo.tx[0].id==='manual'&&!limpo.tx[0].par.pluggyId,'cópia local descarta registros antigos e limpa referência aninhada');
ok(limpo.fiis.length===1&&limpo.fiis[0].id==='manual-fii'&&!('pluggyInv' in limpo.fiis[0]),'cópia local descarta posição importada antiga');
ok(!('pluggyIgn' in limpo.cfg),'cópia local limpa lista antiga de identificadores');
T.setUser({id:'00000000-0000-0000-0000-000000000001',email:'t@t.com'});
const S=T.S;
S.tx=[{id:'cache-legado',pluggyId:'old-3',data:'2026-11-18',tipo:'despesa',valor:5},{id:'cache-manual',data:'2026-11-18',tipo:'despesa',valor:8,par:{id:'p',pluggyId:'old-4'}}];
S.fiis=[{id:'cache-fii',ticker:'OLD11',pluggyInv:'old',cotas:1,preco:5}];
S.cfg.pluggyIgn=['old-3'];
T.limpaLegadoLocal();
ok(S.tx.length===1&&S.tx[0].id==='cache-manual'&&!S.tx[0].par.pluggyId,'limpeza do cache antes de sincronizar preserva lançamento manual');
ok(S.fiis.length===0&&!('pluggyIgn' in S.cfg),'limpeza do cache antes de sincronizar remove posição e configuração antiga');
S.tx=[];S.fiis=[];
S.bancos=S.bancos&&S.bancos.length?S.bancos:[{id:'b1',nome:'Nubank',tipo:'Conta corrente',saldo:1000,principal:true}];
S.cartoes=[{id:'c1',nome:'Nubank',banco:'Nubank',limite:5000,fecha:20,vence:27,cor:'roxo'}];
// saldo livre: inclui faturas vencidas/fechadas, parciais e o ciclo atual; ignora parcelas futuras.
const hoje=T.hojeISO();
const mesN=(n)=>{const d=new Date(hoje+'T12:00:00');d.setDate(1);d.setMonth(d.getMonth()-n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-15';};
const dataPg=mesN(1).slice(0,8)+'20';
S.bancos=[{id:'b-fin',nome:'Conta teste',saldo:2000,saldoData:hoje,saldoFecha:true}];
S.cartoes=[{id:'c-fin',nome:'Cartão teste',fechamento:15,vencimento:25,limite:5000}];
delete S.cfg.pagDesde;T.resetMemo();
S.tx=[
 {id:'fat-parcial',faturaKey:'fat|c-fin|'+mesN(1).slice(0,7),data:mesN(1),tipo:'despesa',cartao:'c-fin',valor:1000,pagoValor:400,pagamentos:[{valor:400,data:dataPg,conta:'b-fin'}]},
 {id:'fat-vencida',faturaKey:'fat|c-fin|'+mesN(2).slice(0,7),data:mesN(2),tipo:'despesa',cartao:'c-fin',valor:300,pagoValor:0,pagamentos:[]},
 {id:'compra-ciclo',tipo:'despesa',data:hoje,valor:200,cartao:'c-fin',forma:'cartao'}
];
const stTeste=T.saldoTotal(),slTeste=T.saldoLivre();
ok(Math.abs(stTeste-2000)<0.01,'saldo total mantém o saldo bancário após pagamento já refletido na conta');
ok(Math.abs(slTeste-900)<0.01,'saldo livre desconta duas faturas antigas e o ciclo atual, sem somar parcelas futuras');
S.tx=[];S.cartoes=[{id:'c1',nome:'Nubank',banco:'Nubank',limite:5000,fecha:20,vence:27,cor:'roxo'}];
const ativoYield={id:'yield-test',tipo:'fii',ticker:'TST11',cotas:10,pago:100,preco:10,ops:[{tipo:'compra',data:mesN(1),qtd:10,preco:10},{tipo:'provento',data:mesN(2),valor:100},{tipo:'provento',data:hoje,valor:10}]};
ok(T.rpPorCota(ativoYield,ativoYield.ops[1])===0,'yield não atribui provento anterior à compra');
ok(Math.abs(T.rpPorCota(ativoYield,ativoYield.ops[2])-1)<0.001,'yield calcula provento com cotas efetivas na data');
const ymOps=mesN(1).slice(0,7),foraOrdem={cotas:3,ops:[{tipo:'compra',data:ymOps+'-01',qtd:10},{tipo:'venda',data:ymOps+'-10',qtd:12},{tipo:'compra',data:ymOps+'-05',qtd:5}]};
ok(Math.abs(T.rpPorCota(foraOrdem,{data:ymOps+'-12',valor:3})-1)<0.001,'yield reconstrói cotas em ordem cronológica mesmo com compra retroativa');
const posicaoDatada={id:'initial-date-test',tipo:'fii',ticker:'INI11',cotas:10,ops:[{tipo:'venda',data:ymOps+'-01',qtd:5,preco:10},{tipo:'inicial',data:ymOps+'-05',qtd:10,custo:100}]};
ok(T.calcOps(posicaoDatada.ops).qtd===10,'posição inicial datada não é afetada por venda anterior à data-base');
ok(T.rpPorCota(posicaoDatada,{data:ymOps+'-01',valor:10})===0,'provento anterior à posição inicial datada não recebe cotas futuras');
ok(Math.abs(T.rpPorCota(posicaoDatada,{data:ymOps+'-05',valor:10})-1)<0.001,'posição inicial passa a valer na própria data registrada');
S.fiis=[posicaoDatada];
ok(T.irVendas().length===0,'apuração de vendas ignora venda anterior à posição inicial datada');
S.fiis=[];
S.fiis=[ativoYield];
const yieldTeste=T.yocCalc(hoje).lista[0];
ok(Math.abs(yieldTeste.recebido-10)<0.01,'yield on cost exclui provento anterior à entrada na carteira');
const legadoYield={cotas:10,ops:[{tipo:'provento',data:hoje,valor:10}]};
ok(Math.abs(T.rpPorCota(legadoYield,legadoYield.ops[0])-1)<0.001,'yield mantém compatibilidade com posição manual sem histórico de operações');
const metaOriginal=T.S.cfg.metaRendaPassiva, prazoOriginal=T.S.cfg.metaRendaPrazoAnos, fiisOriginais=T.S.fiis;
T.S.cfg.metaRendaPassiva=2000;T.S.cfg.metaRendaPrazoAnos=10;
const metaHtml=T.rpMetaHTML({media:1000,mesAtual:1000});
ok(/50%/.test(metaHtml)&&/Faltam/.test(metaHtml),'meta de renda passiva calcula progresso e valor restante');
T.S.fiis=[{id:'meta-fii',tipo:'fii',ticker:'TST11',cotas:1000,preco:100,ops:[]}];
const metaProj=T.rpMetaHTML({media:500,mediaN:12,mesAtual:500});
ok(/Capital estimado/.test(metaProj)&&/Aporte mensal em 10 anos/.test(metaProj)&&/2[.]500,00/.test(metaProj),'meta estima capital e aporte mensal usando 12 meses realizados');
delete T.S.cfg.metaRendaPassiva;
ok(/Definir meta/.test(T.rpMetaHTML({media:null,mesAtual:0})),'meta de renda passiva oferece configuração no estado vazio');
const metaSanea=T.sanea({cfg:{metaRendaPassiva:2500,metaRendaPrazoAnos:20}});
ok(metaSanea.cfg.metaRendaPassiva===2500&&metaSanea.cfg.metaRendaPrazoAnos===20,'meta e prazo persistem na configuração sincronizada');
const metaInvalida=T.sanea({cfg:{metaRendaPassiva:-1,metaRendaPrazoAnos:60}});
ok(!Object.prototype.hasOwnProperty.call(metaInvalida.cfg,'metaRendaPassiva')&&!Object.prototype.hasOwnProperty.call(metaInvalida.cfg,'metaRendaPrazoAnos'),'meta e prazo inválidos são descartados na sanitização');
if(metaOriginal!=null)T.S.cfg.metaRendaPassiva=metaOriginal;else delete T.S.cfg.metaRendaPassiva;
if(prazoOriginal!=null)T.S.cfg.metaRendaPrazoAnos=prazoOriginal;else delete T.S.cfg.metaRendaPrazoAnos;
T.S.fiis=fiisOriginais;
S.fiis=[];
ok(T.setMvp()===true,'MVP_MODE ligado');
const doc=w.document;
const view=()=>doc.querySelector('#view').innerHTML;
try{T.render();}catch(e){console.log('render inicio',e.stack.split('\n').slice(0,3).join(' | '));}
ok(/Preencher exemplo para explorar/.test(view()),'conta vazia mostra "Preencher exemplo"');
T.demoPreenche();
ok(T.S.tx.filter(t=>t.demo).length===7,'7 lançamentos de exemplo');
ok(/Limpar exemplo/.test(view()),'faixa "Limpar exemplo" no Início');
ok(/omniF/.test(view())&&/omniCam/.test(view()),'barra com frase + câmera');
ok(/lmCard/.test(view()),'termômetro no Início');
ok(/Definir meta/.test(view()),'meta de renda passiva acessível diretamente no Início');
const metaOriginalForm=T.S.cfg.metaRendaPassiva,prazoOriginalForm=T.S.cfg.metaRendaPrazoAnos;
doc.querySelector('[data-act="rp-meta"]').click();
const metaForm=doc.querySelector('#mf');
ok(!!metaForm&&/Em quantos anos deseja alcançar/.test(doc.querySelector('#modal').textContent),'ação da meta abre formulário com prazo');
if(metaForm){
  metaForm.querySelector('[name="valor"]').value='2000';
  metaForm.querySelector('[name="prazo"]').value='0';
  metaForm.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  ok(T.S.cfg.metaRendaPassiva===metaOriginalForm&&doc.querySelector('#modal').classList.contains('on'),'prazo zero é rejeitado sem salvar a meta');
  metaForm.querySelector('[name="prazo"]').value='10';
  metaForm.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  ok(T.S.cfg.metaRendaPassiva===2000&&T.S.cfg.metaRendaPrazoAnos===10,'formulário salva meta e prazo válidos');
}
if(metaOriginalForm!=null)T.S.cfg.metaRendaPassiva=metaOriginalForm;else delete T.S.cfg.metaRendaPassiva;
if(prazoOriginalForm!=null)T.S.cfg.metaRendaPrazoAnos=prazoOriginalForm;else delete T.S.cfg.metaRendaPrazoAnos;
T.render();
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
// regressão: importação CSV/OFX local continua funcionando sem o fluxo bancário Pluggy
const nImport=T.S.tx.length;
T.IMP={nome:'extrato-teste.csv',cartao:false,linhas:[{desc:'PADARIA TESTE',valor:-23.5,data:T.hojeSP()}],destino:'b:b1'};
T.montaImport();
const impHtml=doc.querySelector('#modal').innerHTML;
ok(/Importar extrato/.test(impHtml)&&!/Lançamentos do banco|pular esta conta|não importar esta conta/.test(impHtml),'importação local sem controles da integração bancária');
T.confirmaImport();
ok(T.S.tx.length===nImport+1&&T.S.tx[T.S.tx.length-1].importado&&T.S.tx[T.S.tx.length-1].conta==='b1','CSV/OFX importa lançamento na conta selecionada');

const ofxTeste='OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n<OFX><BANKMSGSRSV1><STMTRS><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT\n<DTPOSTED>20261119000000\n<TRNAMT>-12.50\n<FITID>FIT-123\n<NAME>PADARIA CENTRAL\n</STMTTRN></BANKTRANLIST></STMTRS></BANKMSGSRSV1></OFX>';
const ofxLido=T.lerOFX(ofxTeste);
ok(ofxLido.linhas.length===1&&ofxLido.linhas[0].fitid==='FIT-123'&&ofxLido.linhas[0].data==='2026-11-19','OFX SGML lê data, valor e FITID');
const csvLido=T.lerCSV('Data;Valor;Descrição;FITID\n19/11/2026;-12,50;PADARIA CENTRAL;CSV-123');
ok(csvLido.linhas.length===1&&csvLido.linhas[0].fitid==='CSV-123'&&csvLido.linhas[0].valor===-12.5,'CSV brasileiro com ponto e vírgula e FITID');
const csvSemCabecalhoPadrao='Quando;Histórico;Montante R$;Identificação\n19/11/2026;PADARIA CENTRAL;-12,50;MOV-9';
const csvPedeMapa=T.lerCSV(csvSemCabecalhoPadrao);
ok(csvPedeMapa.mapear&&csvPedeMapa.cabecalho.length===4,'CSV com cabeçalhos desconhecidos solicita mapeamento em vez de falhar');
const csvMapeado=T.lerCSV(csvSemCabecalhoPadrao,{data:0,desc:1,valor:2,id:3});
ok(csvMapeado.linhas.length===1&&csvMapeado.linhas[0].desc==='PADARIA CENTRAL'&&csvMapeado.linhas[0].fitid==='MOV-9'&&csvMapeado.linhas[0].valor===-12.5,'mapeamento manual converte data, descrição, valor e identificador');
const saldoOk=T.conciliarSaldoImportacao('100,00','87,50',[{valor:-12.5}]);
const saldoDivergente=T.conciliarSaldoImportacao('100,00','88,00',[{valor:-12.5}]);
ok(saldoOk.ok&&saldoOk.esperado===87.5,'conciliação valida saldo inicial + movimentos = saldo final');
ok(!saldoDivergente.ok&&Math.abs(saldoDivergente.diferenca-0.5)<0.001,'conciliação identifica divergência sem arredondamento indevido');
T.abreImport('mapeamento.csv',csvSemCabecalhoPadrao);
ok(/Configurar CSV/.test(doc.querySelector('#modal').innerHTML),'CSV desconhecido abre tela de mapeamento');
doc.querySelector('#csvMapContinuar').click();
ok(/Importar extrato/.test(doc.querySelector('#modal').innerHTML)&&T.IMP.linhas.length===1,'confirmar mapeamento leva à prévia, sem importar automaticamente');
T.IMP={nome:'saldo-divergente.csv',cartao:false,linhas:[{desc:'COMPRA TESTE',valor:-12.5,data:T.hojeSP()}],destino:'b:b1',conciliacao:saldoDivergente,conciliacaoAceita:false};
T.montaImport();
ok(!!doc.querySelector('#impConciliacaoAceita')&&doc.querySelector('#impOk').disabled,'divergência exige reconhecimento explícito antes de importar');
doc.querySelector('#impConciliacaoAceita').click();
ok(!doc.querySelector('#impOk').disabled,'usuário pode continuar após reconhecer divergência');
const linhasLote=[{desc:'PADARIA A',valor:-23.5,data:T.hojeSP()},{desc:'CAFETERIA B',valor:-23.5,data:T.hojeSP()}];
T.IMP={nome:'lote-teste.csv',cartao:false,linhas:linhasLote.map(x=>Object.assign({},x)),destino:'b:b1'};
T.montaImport();
ok(T.IMP.linhas.every(x=>x.on&&!x.dup),'compras diferentes com mesmo dia e valor não são duplicatas');
T.confirmaImport();
const loteTeste=T.S.cfg.impLotes[T.S.cfg.impLotes.length-1],txLote=T.S.tx.filter(x=>x.impLote===loteTeste.id);
ok(!!loteTeste&&loteTeste.qtd===2&&txLote.length===2,'lote guarda metadados e associa os dois lançamentos');
const estadoAntesSan=T.S;T.S=T.sanea(T.S);
const analiseSan=T.impLoteAnalisa(loteTeste.id);T.S=estadoAntesSan;
ok(analiseSan.removiveis.length===2,'hash de desfazer sobrevive ao saneamento e à sincronização');
txLote[0].descricao='PADARIA A - corrigida pelo usuário';
const analiseEdit=T.impLoteAnalisa(loteTeste.id);
ok(analiseEdit.removiveis.length===1&&analiseEdit.preservados.length===1,'desfazer protege lançamento editado depois da importação');
ok(/Importações recentes/.test(T.viewBancos()),'histórico de importações aparece em Bancos');
T.IMP={nome:'lote-teste.csv',cartao:false,linhas:linhasLote.map(x=>Object.assign({},x)),destino:'b:b1'};
T.montaImport();
ok(T.IMP.linhas.every(x=>x.dup&&!x.on),'reimportar o mesmo CSV identifica os registros já importados');
T.IMP={nome:'fitid-repetido.ofx',cartao:false,linhas:[
  {desc:'COMPRA 1',valor:-10,data:'2026-11-18',fitid:'FIT-DUP'},
  {desc:'COMPRA 2',valor:-11,data:'2026-11-19',fitid:'FIT-DUP'}
],destino:'b:b1'};
T.montaImport();
ok(T.IMP.linhas[0].on&&T.IMP.linhas[1].dup&&!T.IMP.linhas[1].on,'FITID repetido no mesmo extrato é sinalizado e desmarcado');
// regressão: recuperação de parcelas antigas usa apenas o histórico local e não chama código removido
const txAntesParc=T.S.tx,cartoesAntesParc=T.S.cartoes;
T.S.cartoes=[{id:'prc-card',fechamento:20,vencimento:27}];
T.S.tx=[
  {id:'hist-parc-1',tipo:'despesa',valor:20,categoria:'',descricao:'LOJA PARC 1/3',data:'2026-09-20',dataCompra:'2026-09-20',cartao:'prc-card',importado:true,impId:'historico-1'},
  {id:'hist-parc-2',tipo:'despesa',valor:20,categoria:'',descricao:'LOJA PARC 2/3',data:'2026-10-20',dataCompra:'2026-09-20',cartao:'prc-card',importado:true,impId:'historico-2'}
];
const prcLocal=T.prcDetecta([]);
ok(prcLocal.add.length===1&&typeof prcLocal.add[0].categoria==='string'&&prcLocal.add[0].categoria.length>0,'parcela faltante recuperada só pelo histórico local');
T.S.tx=txAntesParc;T.S.cartoes=cartoesAntesParc;
ok(/Resumo semanal toda segunda às 8h/.test(T.waResumoHTML(false))&&/wa-copia/.test(T.waCmdHTML()),'WhatsApp: toggle e chips');
T.demoLimpa();ok(!T.S.tx.some(t=>t.demo),'Limpar exemplo apaga tudo de exemplo');
// privacidade
T.go('inicio');doc.querySelector('#btnEye').click();ok(/•••••/.test(view())&&w.localStorage.getItem('gv-oculto')==='1','olho do cabeçalho mascara os valores e grava');
doc.querySelector('#btnEye').click();
const e2=erros.filter(x=>!/Not implemented|Could not parse CSS|navigation/.test(x));
if(e2.length)console.log('erros do jsdom:',e2.slice(0,8));
(async()=>{
  // Segurança: sem Web Crypto/IndexedDB, nunca substitui a cópia anterior por JSON em texto puro.
  const chave=T.localCopyKey,anterior='gve1:copia-anterior-preservada';
  w.localStorage.setItem(chave,anterior);
  await T.forceLocalSave();
  const copiaSalva=await T.readLocalCopy();ok(copiaSalva==null||copiaSalva===anterior||(typeof copiaSalva==='string'&&copiaSalva.startsWith('gve1:')),'sem criptografia local, não grava dados em texto puro; cópia local ausente ou cifrada');
  await T.forceCipherWrite();
  const copiaAux=w.localStorage.getItem('gv-crypto-fail-test');ok(copiaAux===null||(typeof copiaAux==='string'&&copiaAux.startsWith('gve1:')),'gravaCifrado não faz fallback para texto puro');
  T.cancelLocalSave();
  setTimeout(()=>process.exit(process.exitCode||0),300);
})().catch(e=>{console.error('falha no teste de criptografia local:',e);process.exit(1);});
