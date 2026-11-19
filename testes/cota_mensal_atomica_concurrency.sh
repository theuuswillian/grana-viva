#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -X -qAt -h 127.0.0.1 -U postgres -d granaviva_test -v ON_ERROR_STOP=1)
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Delays only the test rows, widening the race window while the RPC holds its advisory lock.
"${PSQL[@]}" <<'SQL'
create or replace function public.test_delay_ia_uso() returns trigger
language plpgsql as $$
begin
  if new.k = 'concurrent' then perform pg_sleep(0.8); end if;
  return new;
end $$;
create trigger test_delay_ia_uso before insert or update on public.ia_uso
for each row execute function public.test_delay_ia_uso();

create or replace function public.test_delay_tx() returns trigger
language plpgsql as $$
begin
  if new.data->>'test' = 'wa-concurrency' then perform pg_sleep(0.8); end if;
  return new;
end $$;
create trigger test_delay_tx before insert on public.tx
for each row execute function public.test_delay_tx();
SQL

uid='33333333-3333-4333-8333-333333333333'
day='2026-11-20'

# Two concurrent consumers, one remaining monthly slot: exactly one may win.
"${PSQL[@]}" -c "select public.ia_consume_cota_mes('$uid','$day','concurrent',1)" > "$tmp/ia-a" &
p1=$!
"${PSQL[@]}" -c "select public.ia_consume_cota_mes('$uid','$day','concurrent',1)" > "$tmp/ia-b" &
p2=$!
wait "$p1"
wait "$p2"
test "$(cat "$tmp/ia-a" "$tmp/ia-b" | sort | tr -d '\n')" = "ft"
test "$("${PSQL[@]}" -c "select sum(n) from public.ia_uso where user_id='$uid' and k='concurrent'")" = "1"

# Two concurrent saves of the same pending WhatsApp item: only one may insert and consume it.
"${PSQL[@]}" -c "insert into public.wa_pendente(id,user_id) values ('pending-concurrent','$uid')" >/dev/null
sql="select public.wa_salva_pendente_com_cota('$uid','pending-concurrent','2026-12-15',5,'[{\"id\":\"wa-concurrent\",\"data\":{\"test\":\"wa-concurrency\"},\"updated_at\":\"2026-12-15T10:00:00Z\"}]'::jsonb)"
"${PSQL[@]}" -c "$sql" > "$tmp/wa-a" &
p1=$!
"${PSQL[@]}" -c "$sql" > "$tmp/wa-b" &
p2=$!
wait "$p1"
wait "$p2"
grep -qx 'salvo' "$tmp/wa-a" "$tmp/wa-b"
grep -qx 'pendente_ausente' "$tmp/wa-a" "$tmp/wa-b"
test "$("${PSQL[@]}" -c "select count(*) from public.tx where id='wa-concurrent'")" = "1"
test "$("${PSQL[@]}" -c "select n from public.ia_uso where user_id='$uid' and k='whatsapp' and dia='2026-12-15'")" = "1"

echo "Atomic quota concurrency tests passed."
