#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=granaviva_webhooks_test}"
export PGHOST PGPORT PGUSER PGDATABASE

telefone="5561999000099"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
pids=()

for i in $(seq 1 20); do
  psql -X -qAt -v ON_ERROR_STOP=1 -c "select public.wa_vincula_codigo('$telefone','999999')" > "$tmp/$i" &
  pids+=("$!")
done

for pid in "${pids[@]}"; do
  wait "$pid"
done

permitidas="$(awk '$0 == "codigo_expirado" {n++} END {print n+0}' "$tmp"/*)"
primeiro_bloqueio="$(awk '$0 == "limite_tentativas" {n++} END {print n+0}' "$tmp"/*)"
silenciosas="$(awk '$0 == "limite_tentativas_silencioso" {n++} END {print n+0}' "$tmp"/*)"

if [[ "$permitidas" != "10" || "$primeiro_bloqueio" != "1" || "$silenciosas" != "9" ]]; then
  echo "Concorrência inesperada: permitidas=$permitidas primeiro_bloqueio=$primeiro_bloqueio silenciosas=$silenciosas"
  cat "$tmp"/*
  exit 1
fi

contador="$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select tentativas from public.wa_codigo_tentativa where telefone='$telefone'")"
if [[ "$contador" != "10" ]]; then
  echo "Contador concorrente deveria terminar em 10, recebeu: $contador"
  exit 1
fi

echo "WhatsApp link rate limit concurrency test passed."
