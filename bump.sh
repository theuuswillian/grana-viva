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
