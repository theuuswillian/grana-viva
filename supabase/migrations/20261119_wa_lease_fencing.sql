-- Fencing token: impede worker antigo de finalizar a reserva que outro worker retomou.
begin;

alter table public.wa_msg
  add column if not exists lease_token uuid;

drop function if exists public.wa_reserva_mensagem(text, integer);
drop function if exists public.wa_finaliza_mensagem(text, boolean, text);

create function public.wa_reserva_mensagem(
  p_id text,
  p_token uuid,
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
     or p_token is null
     or p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Parâmetros inválidos para reservar mensagem WhatsApp';
  end if;

  insert into public.wa_msg(id, status, lease_until, lease_token, attempts, last_error, completed_at)
  values (p_id, 'processando', now() + make_interval(secs => p_lease_seconds), p_token, 1, null, null)
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
         lease_token = p_token,
         attempts = attempts + 1,
         last_error = null
   where id = p_id;

  return 'retomada';
end;
$$;

create function public.wa_finaliza_mensagem(
  p_id text,
  p_token uuid,
  p_sucesso boolean,
  p_erro text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(p_id,'') = '' or p_token is null or p_sucesso is null then
    raise exception 'Parâmetros inválidos para finalizar mensagem WhatsApp';
  end if;

  update public.wa_msg
     set status = case when p_sucesso then 'concluida' else 'falhou' end,
         lease_until = null,
         lease_token = null,
         last_error = case when p_sucesso then null else left(coalesce(p_erro,'falha não detalhada'), 1000) end,
         completed_at = case when p_sucesso then now() else null end
   where id = p_id
     and status = 'processando'
     and lease_token = p_token
     and lease_until > now();

  return found;
end;
$$;

revoke all on function public.wa_reserva_mensagem(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.wa_finaliza_mensagem(text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.wa_reserva_mensagem(text, uuid, integer) to service_role;
grant execute on function public.wa_finaliza_mensagem(text, uuid, boolean, text) to service_role;

commit;
