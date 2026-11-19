-- Torna a confirmação do WhatsApp idempotente mesmo quando o webhook é retomado após um crash.
begin;

alter table public.wa_pendente
  add column if not exists origem_msg_id text,
  add column if not exists status text not null default 'pendente',
  add column if not exists finalizado_em timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.wa_pendente'::regclass
      and conname='wa_pendente_status_check'
  ) then
    alter table public.wa_pendente
      add constraint wa_pendente_status_check
      check (status in ('pendente','salvo','cancelado','expirado'));
  end if;
end $$;

create unique index if not exists wa_pendente_origem_msg_uidx
  on public.wa_pendente(origem_msg_id)
  where origem_msg_id is not null;
create index if not exists wa_pendente_terminal_cleanup
  on public.wa_pendente(finalizado_em)
  where status <> 'pendente';

-- Mantém o pendente em estado terminal em vez de apagá-lo. Assim, uma repetição
-- da mensagem original não cria uma segunda confirmação depois de um salvamento.
create or replace function public.wa_salva_pendente_com_cota(
  p_uid uuid, p_pendente_id text, p_dia date, p_lim int, p_linhas jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_usado bigint;
  v_ini date;
  v_pendente text;
  v_qtd int;
begin
  if p_uid is null or p_pendente_id is null or p_dia is null or p_lim is null or p_lim < 1
     or jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) < 1 then
    raise exception 'Parâmetros inválidos para salvar lançamento WhatsApp';
  end if;
  v_ini := date_trunc('month', p_dia)::date;
  perform pg_advisory_xact_lock(hashtext(p_uid::text), hashtext('whatsapp:' || v_ini::text));
  select id into v_pendente from public.wa_pendente
   where id = p_pendente_id and user_id = p_uid and status = 'pendente'
   for update;
  if v_pendente is null then return 'pendente_ausente'; end if;

  select coalesce(sum(n), 0) into v_usado
    from public.ia_uso
   where user_id = p_uid and k = 'whatsapp' and dia >= v_ini and dia < (v_ini + interval '1 month')::date;
  if v_usado >= p_lim then return 'limite'; end if;

  insert into public.tx(user_id, id, data, updated_at)
  select p_uid, x.id, x.data, x.updated_at
    from jsonb_to_recordset(p_linhas) as x(id text, data jsonb, updated_at timestamptz);
  get diagnostics v_qtd = row_count;
  if v_qtd <> jsonb_array_length(p_linhas) then
    raise exception 'Quantidade de lançamentos gravados divergente';
  end if;

  insert into public.ia_uso(user_id, dia, k, n)
  values (p_uid, p_dia, 'whatsapp', 1)
  on conflict (user_id, dia, k) do update set n = public.ia_uso.n + 1;

  update public.wa_pendente
     set status = 'salvo', finalizado_em = now()
   where id = p_pendente_id and user_id = p_uid and status = 'pendente';
  if not found then raise exception 'Pendente mudou de estado durante o salvamento'; end if;
  return 'salvo';
end $$;

revoke all on function public.wa_salva_pendente_com_cota(uuid, text, date, int, jsonb) from public, anon, authenticated;
grant execute on function public.wa_salva_pendente_com_cota(uuid, text, date, int, jsonb) to service_role;

-- Pendentes expiram em 24h; estados terminais são mantidos por 30 dias para bloquear retries.
do $$
begin
  if exists (select 1 from cron.job where jobname='granaviva-wa-pendente-limpeza') then
    perform cron.unschedule('granaviva-wa-pendente-limpeza');
  end if;
  perform cron.schedule(
    'granaviva-wa-pendente-limpeza',
    '15 4 * * *',
    $cmd$
      update public.wa_pendente
         set status='expirado', finalizado_em=now()
       where status='pendente' and criado_em < now() - interval '24 hours';
      delete from public.wa_pendente
       where status <> 'pendente' and finalizado_em < now() - interval '30 days';
    $cmd$
  );
end $$;

commit;
