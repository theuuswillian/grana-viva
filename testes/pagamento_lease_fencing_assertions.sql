-- Testa retomada de lease, rejeição de worker antigo e aplicação atômica da assinatura.
begin;

do $$
declare
  v_id text := 'mp-fencing-' || txid_current()::text;
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
    v_id, token_a, v_uid, 'pro', 'ativo', now()+interval '30 days', 'mp-sub-fence', 'payer-fence', false
  );
  if v <> 'perdido' then raise exception 'worker A não pode aplicar assinatura: %', v; end if;
  if exists(select 1 from public.assinaturas where user_id=v_uid) then
    raise exception 'worker A não pode gravar assinatura após perder o lease';
  end if;

  v := public.pagamento_evento_aplica_assinatura(
    v_id, token_b, v_uid, 'pro', 'ativo', now()+interval '30 days', 'mp-sub-fence', 'payer-fence', false
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
  if has_function_privilege('anon','public.pagamento_evento_aplica_assinatura(text,uuid,uuid,text,text,timestamptz,text,text,boolean)','EXECUTE')
     or has_function_privilege('authenticated','public.pagamento_evento_aplica_assinatura(text,uuid,uuid,text,text,timestamptz,text,text,boolean)','EXECUTE')
     or not has_function_privilege('service_role','public.pagamento_evento_aplica_assinatura(text,uuid,uuid,text,text,timestamptz,text,text,boolean)','EXECUTE') then
    raise exception 'permissões da RPC de aplicação incorretas';
  end if;
end $$;

rollback;
select 'Payment webhook lease fencing tests passed.' as result;
