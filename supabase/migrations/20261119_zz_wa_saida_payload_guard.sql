-- Impede reutilizar a mesma chave de idempotência para um payload diferente.
-- Exceção: falhou_segura (HTTP 429) não foi aceito pelo provedor e pode atualizar o corpo antes do retry.
begin;

create or replace function public.wa_saida_reserva(
  p_chave text,
  p_token uuid,
  p_telefone text,
  p_corpo jsonb,
  p_lease_seconds integer default 90
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_lease timestamptz;
  v_telefone text;
  v_corpo jsonb;
begin
  if coalesce(p_chave,'') = '' or length(p_chave) > 200
     or p_token is null
     or coalesce(p_telefone,'') = '' or length(p_telefone) > 100
     or p_corpo is null or jsonb_typeof(p_corpo) <> 'object'
     or p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Parâmetros inválidos para outbox WhatsApp';
  end if;

  insert into public.wa_saida(chave, telefone, corpo, status, lease_until, lease_token, tentativas)
  values (p_chave, p_telefone, p_corpo, 'enviando', now() + make_interval(secs => p_lease_seconds), p_token, 1)
  on conflict (chave) do nothing;

  if found then return 'nova'; end if;

  select status, lease_until, telefone, corpo
    into v_status, v_lease, v_telefone, v_corpo
    from public.wa_saida
   where chave = p_chave
   for update;

  if not found then raise exception 'Registro de outbox desapareceu'; end if;
  if v_telefone <> p_telefone then
    raise exception 'Chave de outbox reutilizada para outro destinatário';
  end if;
  if v_status <> 'falhou_segura' and v_corpo is distinct from p_corpo then
    raise exception 'Chave de outbox reutilizada com payload diferente';
  end if;

  if v_status = 'enviada' then return 'enviada'; end if;
  if v_status = 'incerta' then return 'incerta'; end if;
  if v_status = 'falhou' then return 'falhou'; end if;

  if v_status = 'enviando' then
    if v_lease > now() then return 'ocupada'; end if;
    update public.wa_saida
       set status='incerta', lease_until=null, lease_token=null,
           ultimo_erro='Lease expirou sem confirmação do provedor',
           atualizado_em=now()
     where chave=p_chave;
    return 'incerta';
  end if;

  if v_status = 'falhou_segura' then
    update public.wa_saida
       set status='enviando',
           corpo=p_corpo,
           lease_until=now() + make_interval(secs => p_lease_seconds),
           lease_token=p_token,
           tentativas=tentativas + 1,
           ultimo_erro=null,
           atualizado_em=now()
     where chave=p_chave;
    return 'retomada';
  end if;

  raise exception 'Estado de outbox desconhecido: %', v_status;
end;
$$;

revoke all on function public.wa_saida_reserva(text,uuid,text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.wa_saida_reserva(text,uuid,text,jsonb,integer) to service_role;

commit;
