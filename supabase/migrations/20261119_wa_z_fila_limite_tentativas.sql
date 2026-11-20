-- Limita retries da fila de entrada para impedir reprocessamento infinito.
-- Mensagens esgotadas permanecem em wa_msg para diagnóstico e recuperação manual.
begin;

create or replace function public.wa_reserva_mensagem(
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
  v_attempts integer;
  v_max_attempts constant integer := 8;
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

  select status, lease_until, attempts
    into v_status, v_lease, v_attempts
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

  if v_attempts >= v_max_attempts then
    if v_status <> 'falhou' then
      update public.wa_msg
         set status = 'falhou',
             lease_until = null,
             lease_token = null,
             last_error = left('Limite de 8 tentativas atingido; requer análise manual. Último erro: ' || coalesce(last_error, 'não detalhado'), 1000)
       where id = p_id;
    end if;
    return 'esgotada';
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

revoke all on function public.wa_reserva_mensagem(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.wa_reserva_mensagem(text, uuid, integer) to service_role;

commit;
