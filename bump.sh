#!/bin/sh
# publica versão nova: troca GV_BUILD (index.html) e V (sw.js) juntos.
# numeração: v10.54, v10.55, ... (cada publicação = uma versão nova)
# uso: ./bump.sh          -> próxima versão (10.54 -> 10.55)
#      ./bump.sh 11.0     -> versão escolhida
set -e
cd "$(dirname "$0")"
ant=$(sed -n "s/^const GV_BUILD='\([^']*\)';.*/\1/p" index.html)
if [ -n "$1" ]; then novo=$1; else novo=$(echo "$ant" | awk -F. '{printf "%d.%02d", $1, $2+1}'); fi
sed -i "s/^const GV_BUILD='[^']*';/const GV_BUILD='$novo';/" index.html
sed -i "s/^const V='[^']*';/const V='gv-v$novo';/" sw.js
echo "v$ant -> v$novo"

# v10.75: o código do app fica em app.js?v=versão (index.html e sw.js trocam a versão juntos)
sed -i "s/app\.js?v=[0-9.]*/app.js?v=$novo/g" index.html sw.js
# app.js é servido diretamente pelo index.html e pelo service worker.
# Apenas o módulo sob demanda (tour.js) é minificado.
sed -i "s/tour\\.min\\.js?v=[0-9.]*/tour.min.js?v=$novo/g" index.html sw.js
for f in tour; do
  [ -f $f.js ] || continue
  if command -v npx >/dev/null 2>&1 && npx --yes esbuild@0.24.0 $f.js --minify-whitespace --minify-syntax --charset=utf8 --log-level=error --outfile=$f.min.js; then
    echo "$f.min.js: $(wc -c < $f.js) -> $(wc -c < $f.min.js) bytes"
  else
    cp $f.js $f.min.js; echo "$f.min.js: sem esbuild, cópia sem minificar"
  fi
done
# v10.82: planos.js (fonte única dos planos) tem a mesma versão
sed -i "s/planos\.js?v=[0-9.]*/planos.js?v=$novo/g" index.html sw.js
# O design system também é asset versionado e acompanha o build no HTML e no precache.
sed -i "s/design-system\.css?v=[0-9.]*/design-system.css?v=$novo/g" index.html sw.js
sed -i "1s/Design System v[0-9.]*/Design System v$novo/" design-system.css
# v10.79: o GV_BUILD fica num script inline, então os hashes da CSP precisam ser recalculados junto
python3 ./csp.py index.html --fix
