#!/bin/sh
# publica versão nova: troca GV_BUILD (index.html) e V (sw.js) juntos.
# uso: ./bump.sh            -> AAAA-MM-DD.N com N = anterior + 1
#      ./bump.sh 2026-11-02.1
set -e
cd "$(dirname "$0")"
ant=$(sed -n "s/^const GV_BUILD='\([^']*\)';.*/\1/p" index.html)
novo=${1:-$(date +%Y-%m-%d).$(( ${ant##*.} + 1 ))}
sed -i "s/^const GV_BUILD='[^']*';/const GV_BUILD='$novo';/" index.html
sed -i "s/^const V='[^']*';/const V='gv-$(echo "$novo" | tr . -)';/" sw.js
echo "GV_BUILD $ant -> $novo"
