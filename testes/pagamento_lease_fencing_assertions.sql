-- Testa retomada de lease, rejeição de worker antigo e aplicação atômica da assinatura.
begin;

do $$
declare
  v_id text := 'mp-fencing-' || txid_current()::text;
  v_id2 text := 'mp-founder-' || txid_current()::text;
  v_id3 text := 'mp-old-sub-' || txid_current()::text;
  v_id4 text := 'mp-new-version-' || txid_current()::text;
  v_id5 text := 'mp-old-version-' || txid_current()::text;
  v_uid uuid := '00000000-0000-4000-8000-000000000001';
  token_a uuid := '00000000-0000-4000-8000-000000000011';
  token_b uuid := '00000000-0000-4000-8000-000000000022';
  token_c uuid := '00000000-0000-4000-8000-000000000033';
  v text;
  ok boolean;
begin
  insert into auth.users(id,email) values (v_uid,'fencing-test@example.invalid')
  on conflict (id) do nothing;

  v := public.pagamento_evento_reserva(v_id, token_a, 'mercadopago', 'subscription_preapproval', 'sub-test', 120);
  if v <> 'novo' then raise exception 'primeira reserva deveria ser nova: %', v; end if;

  v := public.pagamento_evento_reserva(v_id, token_b, 'mercadopago', 'subscription_preapproval', 'sub-test', 120);
  if v <> 'pendente' then raise exception 'lease ativo deveria bloquear worker concorrente: %', v; end if;

  update public.pagamento_eventos set lease_until=now()-interval '1 second' where id=v_id;
  v := public.pagamento_evento_reserva(v_id, token_b, 'mercadopago', 'subscription_preapproval', 'sub-test', 120);
  if v <> 'retomado' then raise exception 'lease expirado deveria ser retomado: %', v; end if;

  ok := public.pagamento_evento_finaliza(v_id, token_a, 'worker_antigo');
  if ok then raise exception 'worker A não pode finalizar após B assumir'; end if;

  v := public.pagamento_evento_aplica_assinatura(
    v_id, token_a, v_uid, 'pro', 'ativo', now()+interval '30 days', 'mp-sub-fence', 'payer-fence', 1
  );
  if v <> 'perdido' then raise exception 'worker A não pode aplicar assinatura: %', v; end if;
  if exists(select 1 from public.assinaturas where user_id=v_uid) then
    raise exception 'worker A não pode gravar assinatura após perder o lease';
  end if;

  v := public.pagamento_evento_aplica_assinatura(
    v_id, token_b, v_uid, 'pro', 'ativo', now()+interval '30 days', 'mp-sub-fence', 'payer-fence'
  );
  if v <> 'aplicado' then raise exception 'worker B deveria aplicar assinatura: %', v; end if;

  if not exists(select 1 from public.assinaturas where user_id=v_uid and plano='pro' and status='ativo' and provedor_assinatura_id='mp-sub-fence') then
    raise exception 'assinatura não foi gravada pelo worker proprietário';
  end if;
  if not exists(select 1 from public.pagamento_eventos where id=v_id and processado_em is not null and lease_token is null) then
    raise exception 'evento deve ser concluído e liberar o lease atomicamente';
  end if;

  v := public.pagamento_evento_reserva(v_id, token_c, 'mercadopago', 'subscription_preapproval', 'sub-test', 120);
  if v <> 'concluido' then raise exception 'evento concluído não pode ser retomado: %', v; end if;

  -- Isola uma assinatura que já foi cancelada; as versões só são comparáveis dentro da mesma ID.
  update public.assinaturas set status='cancelado', provedor_assinatura_id='mp-sub-versioned', provedor_versao=null where user_id=v_uid;

  -- Evento de versão nova chega primeiro; evento antigo da mesma assinatura não pode rebaixar.
  v := public.pagamento_evento_reserva(v_id4, token_a, 'mercadopago', 'subscription_preapproval', 'sub-versioned', 120);
  if v <> 'novo' then raise exception 'evento versão 10 deveria ser reservado: %', v; end if;
  v := public.pagamento_evento_aplica_assinatura(v_id4, token_a, v_uid, 'pro', 'ativo', now()+interval '60 days', 'mp-sub-versioned', 'payer', 10);
  if v <> 'aplicado' then raise exception 'versão 10 deveria aplicar: %', v; end if;

  v := public.pagamento_evento_reserva(v_id5, token_b, 'mercadopago', 'subscription_preapproval', 'sub-versioned', 120);
  if v <> 'novo' then raise exception 'evento versão 9 deveria ser reservado: %', v; end if;
  v := public.pagamento_evento_aplica_assinatura(v_id5, token_b, v_uid, 'pro', 'cancelado', now()+interval '60 days', 'mp-sub-versioned', 'payer', 9);
  if v <> 'obsoleto' then raise exception 'versão antiga deve ser descartada: %', v; end if;
  if not exists(select 1 from public.assinaturas where user_id=v_uid and status='ativo' and provedor_versao=10 and provedor_assinatura_id='mp-sub-versioned') then
    raise exception 'evento antigo não pode reverter status nem versão';
  end if;

  -- Conta fundadora nunca pode ser rebaixada por notificação de pagamento.
  update public.assinaturas set plano='pro', status='fundador', provedor_assinatura_id=null where user_id=v_uid;
  v := public.pagamento_evento_reserva(v_id2, token_a, 'mercadopago', 'subscription_preapproval', 'sub-founder', 120);
  if v <> 'novo' then raise exception 'evento de conta fundadora deveria ser reservado: %', v; end if;
  v := public.pagamento_evento_aplica_assinatura(v_id2, token_a, v_uid, 'pro', 'ativo', now()+interval '30 days', 'mp-sub-founder', 'payer');
  if v <> 'fundador_mantido' then raise exception 'conta fundadora precisa ser preservada: %', v; end if;
  if not exists(select 1 from public.assinaturas where user_id=v_uid and status='fundador' and provedor_assinatura_id is null) then
    raise exception 'notificação não pode alterar conta fundadora';
  end if;

  -- Aviso de cancelamento de uma assinatura antiga não derruba outra assinatura ativa.
  update public.assinaturas set plano='pro', status='ativo', provedor='mercadopago',
    provedor_assinatura_id='mp-sub-current' where user_id=v_uid;
  v := public.pagamento_evento_reserva(v_id3, token_a, 'mercadopago', 'subscription_preapproval', 'sub-old', 120);
  if v <> 'novo' then raise exception 'evento de assinatura antiga deveria ser reservado: %', v; end if;
  v := public.pagamento_evento_aplica_assinatura(v_id3, token_a, v_uid, 'pro', 'cancelado', now()+interval '30 days', 'mp-sub-old', 'payer');
  if v <> 'outra_assinatura_ativa' then raise exception 'assinatura ativa diferente precisa ser preservada: %', v; end if;
  if not exists(select 1 from public.assinaturas where user_id=v_uid and status='ativo' and provedor_assinatura_id='mp-sub-current') then
    raise exception 'aviso antigo não pode substituir assinatura ativa atual';
  end if;

  if has_function_privilege('anon','public.pagamento_evento_reserva(text,uuid,text,text,text,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.pagamento_evento_reserva(text,uuid,text,text,text,integer)','EXECUTE')
     or not has_function_privilege('service_role','public.pagamento_evento_reserva(text,uuid,text,text,text,integer)','EXECUTE') then
    raise exception 'permissões da RPC de reserva incorretas';
  end if;
  if has_function_privilege('anon','public.pagamento_evento_finaliza(text,uuid,text,uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.pagamento_evento_finaliza(text,uuid,text,uuid)','EXECUTE')
     or not has_function_privilege('service_role','public.pagamento_evento_finaliza(text,uuid,text,uuid)','EXECUTE') then
    raise exception 'permissões da RPC de finalização incorretas';
  end if;
  if has_function_privilege('anon','public.pagamento_evento_aplica_assinatura(text,uuid,uuid,text,text,timestamptz,text,text,bigint)','EXECUTE')
     or has_function_privilege('authenticated','public.pagamento_evento_aplica_assinatura(text,uuid,uuid,text,text,timestamptz,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.pagamento_evento_aplica_assinatura(text,uuid,uuid,text,text,timestamptz,text,text)','EXECUTE') then
    raise exception 'permissões da RPC de aplicação incorretas';
  end if;
end $$;

rollback;
select 'Payment webhook lease fencing tests passed.' as result;
