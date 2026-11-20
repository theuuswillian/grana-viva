-- Fila recuperável para mensagens recebidas do WhatsApp.
-- IDs históricos são considerados concluídos para não reprocessar mensagens antigas.
begin;

alter table public.wa_msg
  add column if not exists status text not null default 'concluida',
  add column if not exists lease_until timestamptz,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text,
  add column if not exists completed_at timestamptz;

alter table public.wa_msg
  alter column status set default 'concluida';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.wa_msg'::regclass
      and conname = 'wa_msg_status_check'
  ) then
    alter table public.wa_msg
      add constraint wa_msg_status_check
      check (status in ('concluida','processando','falhou'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.wa_msg'::regclass
      and conname = 'wa_msg_attempts_check'
  ) then
    alter table public.wa_msg
      add constraint wa_msg_attempts_check check (attempts >= 0);
  end if;
end $$;

create index if not exists wa_msg_recovery
  on public.wa_msg (lease_until)
  where status in ('processando','falhou');

create or replace function public.wa_reserva_mensagem(
  p_id text,
  p_lease_seconds integer default 180
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id text;
  v_status text;
  v_lease timestamptz;
begin
  if coalesce(p_id,'') = '' or length(p_id) > 200
     or p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Parâmetros inválidos para reservar mensagem WhatsApp';
  end if;

  insert into public.wa_msg(id, status, lease_until, attempts, last_error, completed_at)
  values (p_id, 'processando', now() + make_interval(secs => p_lease_seconds), 1, null, null)
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is not null then
    return 'nova';
  end if;

  select status, lease_until
    into v_status, v_lease
    from public.wa_msg
   where id = p_id
   for update;

  if not found then
    raise exception 'Mensagem desapareceu durante reserva';
  end if;

  if v_status = 'concluida' then
    return 'repetida';
  end if;

  if v_status = 'processando' and v_lease > now() then
    return 'ocupada';
  end if;

  update public.wa_msg
     set status = 'processando',
         lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts = attempts + 1,
         last_error = null
   where id = p_id;

  return 'retomada';
end;
$$;

create or replace function public.wa_finaliza_mensagem(
  p_id text,
  p_sucesso boolean,
  p_erro text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(p_id,'') = '' or p_sucesso is null then
    raise exception 'Parâmetros inválidos para finalizar mensagem WhatsApp';
  end if;

  update public.wa_msg
     set status = case when p_sucesso then 'concluida' else 'falhou' end,
         lease_until = null,
         last_error = case when p_sucesso then null else left(coalesce(p_erro,'falha não detalhada'), 1000) end,
         completed_at = case when p_sucesso then now() else null end
   where id = p_id
     and status = 'processando';

  return found;
end;
$$;

revoke all on function public.wa_reserva_mensagem(text, integer) from public, anon, authenticated;
revoke all on function public.wa_finaliza_mensagem(text, boolean, text) from public, anon, authenticated;
grant execute on function public.wa_reserva_mensagem(text, integer) to service_role;
grant execute on function public.wa_finaliza_mensagem(text, boolean, text) to service_role;

commit;
