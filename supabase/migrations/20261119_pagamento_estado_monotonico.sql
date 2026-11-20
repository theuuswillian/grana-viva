-- Estado monotônico da assinatura: uma notificação atrasada não pode reverter versão mais nova do MP.
begin;

alter table public.assinaturas
  add column if not exists provedor_versao bigint;

-- A versão é fornecida pelo próprio recurso preapproval do Mercado Pago.
-- Recria a RPC com versão explícita para que a comparação e a gravação sejam atômicas.
drop function if exists public.pagamento_evento_aplica_assinatura(text,uuid,uuid,text,text,timestamptz,text,text);

create function public.pagamento_evento_aplica_assinatura(
  p_id text,
  p_token uuid,
  p_uid uuid,
  p_plano text,
  p_status text,
  p_periodo_fim timestamptz,
  p_provedor_assinatura_id text,
  p_provedor_cliente_id text,
  p_provedor_versao bigint
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
     or coalesce(p_provedor_assinatura_id,'') = ''
     or p_provedor_versao is null or p_provedor_versao < 0 then
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

  -- FOR UPDATE não bloqueia quando a conta ainda não tem linha em assinaturas.
  -- O advisory lock serializa também a primeira gravação concorrente do mesmo usuário.
  perform pg_advisory_xact_lock(hashtextextended('pagamento-assinatura:' || p_uid::text, 0));

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

  -- Versões só são comparáveis dentro do mesmo preapproval.
  -- Se já existe outra assinatura ativa, nenhum evento de outra ID pode substituí-la.
  if found
     and v_atual.status = 'ativo'
     and v_atual.provedor_assinatura_id is not null
     and v_atual.provedor_assinatura_id <> p_provedor_assinatura_id then
    update public.pagamento_eventos
       set processado_em=now(), resultado='outra_assinatura_ativa', user_id=p_uid,
           lease_until=null, lease_token=null
     where id=p_id and lease_token=p_token and processado_em is null;
    return 'outra_assinatura_ativa';
  end if;

  if found
     and v_atual.provedor_assinatura_id = p_provedor_assinatura_id
     and v_atual.provedor_versao is not null
     and p_provedor_versao <= v_atual.provedor_versao then
    update public.pagamento_eventos
       set processado_em=now(), resultado='obsoleto:versao_mp', user_id=p_uid,
           lease_until=null, lease_token=null
     where id=p_id and lease_token=p_token and processado_em is null;
    return 'obsoleto';
  end if;

  insert into public.assinaturas(
    user_id, plano, status, periodo_fim, provedor,
    provedor_assinatura_id, provedor_cliente_id, atualizado_em, provedor_versao
  ) values (
    p_uid, p_plano, p_status, p_periodo_fim, 'mercadopago',
    p_provedor_assinatura_id, p_provedor_cliente_id, now(), p_provedor_versao
  )
  on conflict (user_id) do update set
    plano = excluded.plano,
    status = excluded.status,
    periodo_fim = coalesce(excluded.periodo_fim, public.assinaturas.periodo_fim),
    provedor = excluded.provedor,
    provedor_assinatura_id = excluded.provedor_assinatura_id,
    provedor_cliente_id = excluded.provedor_cliente_id,
    atualizado_em = now(),
    provedor_versao = excluded.provedor_versao;

  update public.pagamento_eventos
     set processado_em=now(),
         resultado='aplicado:' || p_status || ':' || p_plano || ':v' || p_provedor_versao,
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

revoke all on function public.pagamento_evento_aplica_assinatura(text,uuid,uuid,text,text,timestamptz,text,text,bigint) from public, anon, authenticated;
grant execute on function public.pagamento_evento_aplica_assinatura(text,uuid,uuid,text,text,timestamptz,text,text,bigint) to service_role;

commit;
