-- Valida a fila persistente, recuperação de lease e fencing de workers concorrentes.
do $$
declare
  v text;
  v_error text;
  ok boolean;
  token_a uuid := '00000000-0000-4000-8000-000000000001';
  token_b uuid := '00000000-0000-4000-8000-000000000002';
  token_c uuid := '00000000-0000-4000-8000-000000000003';
  token_d uuid := '00000000-0000-4000-8000-000000000004';
begin
  if (select status from public.wa_msg where id='wamid-legacy-before-queue') <> 'concluida' then
    raise exception 'mensagens antigas precisam permanecer concluídas';
  end if;

  v := public.wa_reserva_mensagem('wamid-queue-test', token_a, 180);
  if v <> 'nova' then raise exception 'primeira reserva deveria ser nova: %', v; end if;

  v := public.wa_reserva_mensagem('wamid-queue-test', token_b, 180);
  if v <> 'ocupada' then raise exception 'lease ativo deveria impedir worker concorrente: %', v; end if;

  ok := public.wa_finaliza_mensagem('wamid-queue-test', token_b, false, 'worker errado');
  if ok then raise exception 'worker sem token proprietário não pode finalizar a reserva'; end if;

  ok := public.wa_finaliza_mensagem('wamid-queue-test', token_a, false, 'falha simulada');
  if not ok then raise exception 'worker proprietário deveria finalizar a falha'; end if;

  v := public.wa_reserva_mensagem('wamid-queue-test', token_b, 180);
  if v <> 'retomada' then raise exception 'mensagem falha deveria ser retomada: %', v; end if;

  update public.wa_msg set lease_until = now() - interval '1 second'
   where id='wamid-queue-test';
  v := public.wa_reserva_mensagem('wamid-queue-test', token_c, 180);
  if v <> 'retomada' then raise exception 'lease expirado deveria ser retomado: %', v; end if;

  ok := public.wa_finaliza_mensagem('wamid-queue-test', token_b, true, null);
  if ok then raise exception 'worker antigo não pode finalizar depois que o lease foi retomado'; end if;

  ok := public.wa_finaliza_mensagem('wamid-queue-test', token_c, true, null);
  if not ok then raise exception 'worker atual deveria finalizar a reserva'; end if;

  if exists (select 1 from public.wa_msg where id='wamid-queue-test' and lease_token is not null) then
    raise exception 'token deve ser limpo após finalização';
  end if;

  v := public.wa_reserva_mensagem('wamid-queue-test', token_d, 180);
  if v <> 'repetida' then raise exception 'mensagem concluída deveria ser ignorada: %', v; end if;

  -- Após oito tentativas, a mensagem permanece preservada e não entra em retry infinito.
  insert into public.wa_msg(id,status,attempts,last_error)
  values ('wamid-max-attempts-test','falhou',8,'falhas transitórias repetidas');
  v := public.wa_reserva_mensagem('wamid-max-attempts-test', token_d, 180);
  if v <> 'esgotada' then raise exception 'mensagem com oito tentativas deveria ser esgotada: %', v; end if;
  if exists (select 1 from public.wa_msg where id='wamid-max-attempts-test'
             and (status <> 'falhou' or lease_until is not null or lease_token is not null or attempts <> 8)) then
    raise exception 'mensagem esgotada deve permanecer sem lease e preservada para análise';
  end if;
  select last_error into v_error from public.wa_msg where id='wamid-max-attempts-test';
  v := public.wa_reserva_mensagem('wamid-max-attempts-test', token_d, 180);
  if v <> 'esgotada' then raise exception 'mensagem esgotada deve continuar terminal: %', v; end if;
  if (select last_error from public.wa_msg where id='wamid-max-attempts-test') <> v_error then
    raise exception 'reentrega de mensagem esgotada não deve alterar repetidamente o diagnóstico';
  end if;

  if has_function_privilege('anon','public.wa_reserva_mensagem(text,uuid,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.wa_reserva_mensagem(text,uuid,integer)','EXECUTE')
     or not has_function_privilege('service_role','public.wa_reserva_mensagem(text,uuid,integer)','EXECUTE') then
    raise exception 'permissões da RPC de reserva incorretas';
  end if;
  if has_function_privilege('anon','public.wa_finaliza_mensagem(text,uuid,boolean,text)','EXECUTE')
     or has_function_privilege('authenticated','public.wa_finaliza_mensagem(text,uuid,boolean,text)','EXECUTE')
     or not has_function_privilege('service_role','public.wa_finaliza_mensagem(text,uuid,boolean,text)','EXECUTE') then
    raise exception 'permissões da RPC de finalização incorretas';
  end if;
  if to_regprocedure('public.wa_reserva_mensagem(text,integer)') is not null
     or to_regprocedure('public.wa_finaliza_mensagem(text,boolean,text)') is not null then
    raise exception 'assinaturas antigas sem fencing não podem permanecer disponíveis';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.wa_msg'::regclass) then
    raise exception 'RLS precisa permanecer habilitada em wa_msg';
  end if;
end $$;
select 'WhatsApp fenced recoverable queue tests passed.' as result;
