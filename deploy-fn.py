# deploy-fn.py (v10.82): copia os arquivos compartilhados para dentro da função e publica pelo Management API do Supabase.
# uso: python3 deploy-fn.py <função> [--so-copiar]
# - planos.js (raiz) vai para as funções que usam planos; _shared/*.ts para as que importam
# - o token (PAT) não fica em arquivo: é injetado pela rede do ambiente de deploy
import sys,os,json,shutil,subprocess
REF='hydvhpfpvhopetqqjido'
RAIZ=os.path.dirname(os.path.abspath(__file__))
FN=os.path.join(RAIZ,'supabase','functions')
COPIAS={'assistente':['planos.js'],'alertas-push':['planos.js'],'ler-comprovante':['planos.js'],
        'assinatura':['planos.js','mercadopago.ts'],
        'pagamento-webhook':['planos.js','mercadopago.ts','webhook-nucleo.ts'],
        'minha-conta':['mercadopago.ts']}
CAB={'.js':'/* CÓPIA GERADA por deploy-fn.py a partir de /planos.js. Não edite aqui. */\n','.ts':'// CÓPIA GERADA por deploy-fn.py a partir de supabase/functions/_shared. Não edite aqui.\n'}
def copia(nome):
    for f in COPIAS.get(nome,[]):
        src=os.path.join(RAIZ,f) if f=='planos.js' else os.path.join(FN,'_shared',f)
        txt=open(src,encoding='utf-8').read()
        open(os.path.join(FN,nome,f),'w',encoding='utf-8').write(CAB[os.path.splitext(f)[1]]+txt)
def publica(nome):
    d=os.path.join(FN,nome);arqs=sorted(x for x in os.listdir(d) if x.endswith(('.ts','.js')))
    meta={'entrypoint_path':'index.ts','name':nome,'verify_jwt':False}
    cmd=['curl','-s','-X','POST',f'https://api.supabase.com/v1/projects/{REF}/functions/deploy?slug={nome}','-F','metadata='+json.dumps(meta)+';type=application/json']
    for a in arqs:cmd+=['-F',f'file=@{os.path.join(d,a)};filename={a}']
    out=subprocess.run(cmd,capture_output=True,text=True).stdout
    print(nome,out[:400])
if __name__=='__main__':
    nome=sys.argv[1];copia(nome)
    if '--so-copiar' not in sys.argv:publica(nome)
