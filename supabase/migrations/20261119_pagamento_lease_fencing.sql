-- Fencing transacional do webhook de pagamento.
-- Um worker só pode concluir o evento ou aplicar a assinatura enquanto possuir o lease atual.
begin;

alter table public.pagamento_eventos
  add column if not exists lease_token uuid,
  add column if not exists lease_until timestamptz;

-- Preserva a janela de recuperação das reservas antigas durante a transição.
update public.pagamento_eventos
   set lease_until = recebido_em + interval '2 minutes'
 where processado_em is null
   and lease_until is null;

drop function if exists public.pagamento_evento_reserva(text,text,text,text,integer);
drop function if exists public.pagamento_evento_finaliza(text,text,uuid);
drop function if exists public.pagamento_evento_aplica_assinatura(text,uuid,uuid,text,text,timestamptz,text,text,boolean);
drop function if exists public.pagamento_evento_aplica_assinatura(text,uuid,uuid,text,text,timestamptz,text,text);

create function public.pagamento_evento_reserva(
  p_id text,
  p_token uuid,
  p_provedor text,
  p_topico text,
  p_recurso_id text,
  p_lease_seconds integer default 120
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id text;
  v_processado timestamptz;
  v_lease timestamptz;
begin
  if coalesce(p_id,'') = '' or length(p_id) > 200
     or p_token is null
     or coalesce(p_provedor,'') = '' or length(p_provedor) > 40
     or p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Parâmetros inválidos para reservar evento de pagamento';
  end if;

  insert into public.pagamento_eventos(id, provedor, topico, recurso_id, recebido_em, lease_until, lease_token)
  values (p_id, p_provedor, left(coalesce(p_topico,''),100), left(coalesce(p_recurso_id,''),200),
          now(), now() + make_interval(secs => p_lease_seconds), p_token)
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is not null then return 'novo'; end if;

  select processado_em, lease_until
    into v_processado, v_lease
    from public.pagamento_eventos
   where id = p_id
   for update;

  if not found then raise exception 'Evento desapareceu durante reserva'; end if;
  if v_processado is not null then return 'concluido'; end if;
  if v_lease is not null and v_lease > now() then return 'pendente'; end if;

  update public.pagamento_eventos
     set recebido_em = now(),
         lease_until = now() + make_interval(secs => p_lease_seconds),
         lease_token = p_token
   where id = p_id;

  return 'retomado';
end;
$$;

create function public.pagamento_evento_finaliza(
  p_id text,
  p_token uuid,
  p_resultado text,
  p_uid uuid default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(p_id,'') = '' or p_token is null or p_resultado is null then
    raise exception 'Parâmetros inválidos para finalizar evento de pagamento';
  end if;

  update public.pagamento_eventos
     set processado_em = now(),
         resultado = left(p_resultado,200),
         user_id = p_uid,
         lease_until = null,
         lease_token = null
   where id = p_id
     and processado_em is null
     and lease_token = p_token
     and lease_until > now();

  return found;
end;
$$;

-- Aplica a assinatura e conclui o evento na MESMA transação.
-- O lock do evento valida o fencing token; o lock da assinatura protege as regras
-- de fundador e troca de assinatura contra alterações concorrentes.
create function public.pagamento_evento_aplica_assinatura(
  p_id text,
  p_token uuid,
  p_uid uuid,
  p_plano text,
  p_status text,
  p_periodo_fim timestamptz,
  p_provedor_assinatura_id text,
  p_provedor_cliente_id text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_evento public.pagamento_eventos%rowtype;
  v_atual public.assinaturas%rowtype;
begin
  if coalesce(p_id,'') = '' or p_token is null or p_uid is null
     or p_plano not in ('pro','pro_anual','plus')
     or p_status not in ('ativo','cancelado','inadimplente')
     or coalesce(p_provedor_assinatura_id,'') = '' then
    raise exception 'Parâmetros inválidos para aplicar assinatura';
  end if;

  select * into v_evento
    from public.pagamento_eventos
   where id = p_id
   for update;

  if not found or v_evento.processado_em is not null
     or v_evento.lease_token is distinct from p_token
     or v_evento.lease_until is null or v_evento.lease_until <= now() then
    return 'perdido';
  end if;

  select * into v_atual
    from public.assinaturas
   where user_id = p_uid
   for update;

  if found and v_atual.status = 'fundador' then
    update public.pagamento_eventos
       set processado_em=now(), resultado='fundador_mantido', user_id=p_uid,
           lease_until=null, lease_token=null
     where id=p_id and lease_token=p_token and processado_em is null;
    return 'fundador_mantido';
  end if;

  if found
     and v_atual.status = 'ativo'
     and v_atual.provedor_assinatura_id is not null
     and v_atual.provedor_assinatura_id <> p_provedor_assinatura_id
     and p_status <> 'ativo' then
    update public.pagamento_eventos
       set processado_em=now(), resultado='outra_assinatura_ativa', user_id=p_uid,
           lease_until=null, lease_token=null
     where id=p_id and lease_token=p_token and processado_em is null;
    return 'outra_assinatura_ativa';
  end if;

  insert into public.assinaturas(
    user_id, plano, status, periodo_fim, provedor,
    provedor_assinatura_id, provedor_cliente_id, atualizado_em
  ) values (
    p_uid, p_plano, p_status, p_periodo_fim, 'mercadopago',
    p_provedor_assinatura_id, p_provedor_cliente_id, now()
  )
  on conflict (user_id) do update set
    plano = excluded.plano,
    status = excluded.status,
    periodo_fim = coalesce(excluded.periodo_fim, public.assinaturas.periodo_fim),
    provedor = excluded.provedor,
    provedor_assinatura_id = excluded.provedor_assinatura_id,
    provedor_cliente_id = excluded.provedor_cliente_id,
    atualizado_em = now();

  update public.pagamento_eventos
     set processado_em=now(),
         resultado='aplicado:' || p_status || ':' || p_plano,
         user_id=p_uid,
         lease_until=null,
         lease_token=null
   where id=p_id and lease_token=p_token and processado_em is null;

  if not found then
    raise exception 'Lease do evento foi perdido durante aplicação';
  end if;
  return 'aplicado';
end;
$$;

revoke all on function public.pagamento_evento_reserva(text,uuid,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.pagamento_evento_finaliza(text,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.pagamento_evento_aplica_assinatura(text,uuid,uuid,text,text,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.pagamento_evento_reserva(text,uuid,text,text,text,integer) to service_role;
grant execute on function public.pagamento_evento_finaliza(text,uuid,text,uuid) to service_role;
grant execute on function public.pagamento_evento_aplica_assinatura(text,uuid,uuid,text,text,timestamptz,text,text) to service_role;

commit;
