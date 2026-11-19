-- Valida fencing da outbox: um worker antigo não finaliza a tentativa retomada.
do $$
declare
  v text;
  ok boolean;
  token_a uuid := '10000000-0000-4000-8000-000000000001';
  token_b uuid := '10000000-0000-4000-8000-000000000002';
  corpo jsonb := '{"type":"text","text":{"body":"teste"}}'::jsonb;
begin
  v := public.wa_saida_reserva('wa-outbox-fence-test', token_a, '5561999999999', corpo, 90);
  if v <> 'nova' then raise exception 'reserva inicial deveria ser nova: %', v; end if;

  ok := public.wa_saida_finaliza('wa-outbox-fence-test', token_a, 'falhou_segura', null, 'HTTP 429');
  if not ok then raise exception 'worker A deveria registrar falha segura'; end if;

  v := public.wa_saida_reserva('wa-outbox-fence-test', token_b, '5561999999999', corpo, 90);
  if v <> 'retomada' then raise exception 'worker B deveria retomar falha segura: %', v; end if;

  ok := public.wa_saida_finaliza('wa-outbox-fence-test', token_a, 'incerta', null, 'resultado tardio de A');
  if ok then raise exception 'worker A não pode finalizar a reserva assumida por B'; end if;

  ok := public.wa_saida_finaliza('wa-outbox-fence-test', token_b, 'enviada', 'wamid-provider-test', null);
  if not ok then raise exception 'worker B deveria finalizar a reserva atual'; end if;

  if (select status from public.wa_saida where chave='wa-outbox-fence-test') <> 'enviada' then
    raise exception 'estado final da outbox deveria ser enviada';
  end if;
  if (select lease_token from public.wa_saida where chave='wa-outbox-fence-test') is not null then
    raise exception 'token deve ser limpo após finalização';
  end if;

  if has_function_privilege('anon','public.wa_saida_reserva(text,uuid,text,jsonb,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.wa_saida_reserva(text,uuid,text,jsonb,integer)','EXECUTE')
     or not has_function_privilege('service_role','public.wa_saida_reserva(text,uuid,text,jsonb,integer)','EXECUTE') then
    raise exception 'permissões da RPC de reserva da outbox incorretas';
  end if;
  if has_function_privilege('anon','public.wa_saida_finaliza(text,uuid,text,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.wa_saida_finaliza(text,uuid,text,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.wa_saida_finaliza(text,uuid,text,text,text)','EXECUTE') then
    raise exception 'permissões da RPC de finalização da outbox incorretas';
  end if;
  if to_regprocedure('public.wa_saida_reserva(text,text,jsonb,integer)') is not null
     or to_regprocedure('public.wa_saida_finaliza(text,text,text,text)') is not null then
    raise exception 'assinaturas antigas da outbox sem fencing não podem permanecer disponíveis';
  end if;
end $$;
select 'WhatsApp outbox fencing tests passed.' as result;
