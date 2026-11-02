# deploy-fn.py (v10.93): publica uma função pelo Management API do Supabase, com a pasta _shared junto.
# uso: python3 deploy-fn.py <função> [--so-copiar]      |  python3 deploy-fn.py --conferir
# - as funções importam ../_shared/*.ts e ../_shared/planos.js (o deploy manda <função>/* e _shared/* com os caminhos)
# - _shared/planos.js é a ÚNICA cópia de /planos.js (o app usa o da raiz); é gerada aqui e conferida antes de publicar
# - recusa publicar se sobrar cópia antiga dentro da pasta da função ou se algum import relativo apontar para fora
# - o token (PAT) não fica em arquivo: é injetado pela rede do ambiente de deploy
import sys,os,re,json,subprocess
REF='hydvhpfpvhopetqqjido'
RAIZ=os.path.dirname(os.path.abspath(__file__))
FN=os.path.join(RAIZ,'supabase','functions')
SH=os.path.join(FN,'_shared')
CAB='/* CÓPIA GERADA por deploy-fn.py a partir de /planos.js (raiz). Não edite aqui: edite /planos.js. */\n'
def planos_esperado(): return CAB+open(os.path.join(RAIZ,'planos.js'),encoding='utf-8').read()
def gera_planos():
    alvo=os.path.join(SH,'planos.js'); novo=planos_esperado()
    if not os.path.exists(alvo) or open(alvo,encoding='utf-8').read()!=novo: open(alvo,'w',encoding='utf-8').write(novo)
def problemas(nome=None):
    p=[]
    alvo=os.path.join(SH,'planos.js')
    if not os.path.exists(alvo) or open(alvo,encoding='utf-8').read()!=planos_esperado(): p.append('_shared/planos.js diferente de /planos.js')
    compart=set(os.listdir(SH))
    nomes=[nome] if nome else [d for d in sorted(os.listdir(FN)) if d!='_shared' and os.path.isdir(os.path.join(FN,d))]
    for n in nomes:
        d=os.path.join(FN,n)
        if not os.path.isfile(os.path.join(d,'index.ts')): p.append(n+': sem index.ts'); continue
        for f in os.listdir(d):
            if f in compart: p.append(f'{n}/{f}: cópia antiga de _shared/{f} (apague; importe ../_shared/{f})')
        for f in os.listdir(d):
            if not f.endswith(('.ts','.js')): continue
            for imp in re.findall(r'''(?:from\s+|import\s+)["'](\.[^"']+)["']''',open(os.path.join(d,f),encoding='utf-8').read()):
                alvo=os.path.normpath(os.path.join(d,imp))
                if not (alvo.startswith(d+os.sep) or alvo.startswith(SH+os.sep)): p.append(f'{n}/{f}: import fora de função/_shared: {imp}')
                elif not os.path.exists(alvo): p.append(f'{n}/{f}: import não encontrado: {imp}')
    for f in os.listdir(SH):
        if not f.endswith('.ts'): continue
        for imp in re.findall(r'''(?:from\s+|import\s+)["'](\.[^"']+)["']''',open(os.path.join(SH,f),encoding='utf-8').read()):
            if not os.path.exists(os.path.normpath(os.path.join(SH,imp))): p.append(f'_shared/{f}: import não encontrado: {imp}')
    return p
def publica(nome):
    d=os.path.join(FN,nome)
    arqs=[(os.path.join(d,x),nome+'/'+x) for x in sorted(os.listdir(d)) if x.endswith(('.ts','.js'))]
    arqs+=[(os.path.join(SH,x),'_shared/'+x) for x in sorted(os.listdir(SH)) if x.endswith(('.ts','.js'))]
    meta={'entrypoint_path':nome+'/index.ts','name':nome,'verify_jwt':False}
    cmd=['curl','-s','-X','POST',f'https://api.supabase.com/v1/projects/{REF}/functions/deploy?slug={nome}','-F','metadata='+json.dumps(meta)+';type=application/json']
    for a,n in arqs:cmd+=['-F',f'file=@{a};filename={n}']
    out=subprocess.run(cmd,capture_output=True,text=True).stdout
    try: j=json.loads(out); print(nome,'versão',j.get('version'),j.get('status'))
    except Exception: print(nome,out[:400])
if __name__=='__main__':
    if sys.argv[1]=='--conferir':
        gera_planos(); p=problemas(); print('\n'.join(p) or 'ok'); sys.exit(1 if p else 0)
    nome=sys.argv[1]; gera_planos()
    p=problemas(nome)
    if p: print('RECUSADO:\n'+'\n'.join(p)); sys.exit(1)
    if '--so-copiar' not in sys.argv: publica(nome)
