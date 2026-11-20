#!/usr/bin/env bash
set -euo pipefail

HOST="${PGHOST:-127.0.0.1}"
USER="${PGUSER:-postgres}"
DB="${PGDATABASE:-granaviva_payment_test}"
UID="00000000-0000-4000-8000-000000000191"
TOKEN="00000000-0000-4000-8000-000000000192"
EVENT="mp-monotonic-concurrency-low"

psql -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -c \
  "insert into auth.users(id,email) values ('$UID','monotonic-concurrency@example.invalid') on conflict (id) do nothing"
psql -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q -c \
  "select public.pagamento_evento_reserva('$EVENT','$TOKEN','mercadopago','subscription_preapproval','sub-concurrency',120)"

# Simula uma gravação de versão mais nova que já iniciou para uma conta sem linha prévia.
# A RPC de versão antiga precisa aguardar o mesmo lock e, ao prosseguir, reconhecer a versão 20.
psql -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -q > /tmp/gv-payment-lock-holder.log <<SQL &
begin;
select pg_advisory_xact_lock(hashtextextended('pagamento-assinatura:' || '$UID'::text, 0));
select pg_sleep(2);
insert into public.assinaturas(user_id,plano,status,periodo_fim,provedor,provedor_assinatura_id,provedor_cliente_id,provedor_versao,atualizado_em)
values ('$UID','pro','ativo',now()+interval '60 days','mercadopago','sub-concurrency','payer',20,now())
on conflict (user_id) do update set provedor_versao=excluded.provedor_versao,status=excluded.status,provedor_assinatura_id=excluded.provedor_assinatura_id;
commit;
SQL
HOLDER_PID=$!
sleep 0.2
RESULT="$(psql -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -Atq -c \
  "begin; select public.pagamento_evento_aplica_assinatura('$EVENT','$TOKEN','$UID','pro','cancelado',now()+interval '30 days','sub-concurrency','payer',19); commit;")"
wait "$HOLDER_PID"

if [[ "$RESULT" != "obsoleto" ]]; then
  echo "ERRO: evento antigo deveria aguardar e retornar obsoleto; retorno: $RESULT" >&2
  cat /tmp/gv-payment-lock-holder.log >&2
  exit 1
fi
VERSAO="$(psql -h "$HOST" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -Atq -c "select provedor_versao from public.assinaturas where user_id='$UID'")"
if [[ "$VERSAO" != "20" ]]; then
  echo "ERRO: versão final deveria permanecer 20; veio $VERSAO" >&2
  exit 1
fi
echo "Payment monotonic concurrency test passed."
