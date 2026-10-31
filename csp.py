# confere/atualiza os hashes sha256 dos <script> inline na CSP do index.html (usado pelo bump.sh)
# uso: python3 csp.py [index.html] [--fix]
import re,hashlib,base64,sys
p=next((a for a in sys.argv[1:] if not a.startswith('--')),'index.html')
s=open(p,encoding='utf-8').read()
scripts=re.findall(r'<script>(.*?)</script>',s,re.S)
hs=["'sha256-"+base64.b64encode(hashlib.sha256(x.encode('utf-8')).digest()).decode()+"'" for x in scripts]
m=re.search(r"script-src 'self'((?: 'sha256-[^']+')*);",s)
atual=m.group(1).split()
print('atuais',atual);print('calc  ',hs)
if '--fix' in sys.argv:
    s=s[:m.start(1)]+' '+' '.join(hs)+s[m.end(1):]
    open(p,'w',encoding='utf-8').write(s);print('CSP atualizado')
