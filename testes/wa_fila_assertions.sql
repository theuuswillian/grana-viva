-- Valida a fila persistente, recuperação de lease e isolamento das RPCs.
do $$
declare
  v text;
  ok boolean;
begin
  if (select status from public.wa_msg where id='wamid-legacy-before-queue') <> 'concluida' then
    raise exception 'mensagens antigas precisam permanecer concluídas';
  end if;

  v := public.wa_reserva_mensagem('wamid-queue-test', 180);
  if v <> 'nova' then raise exception 'primeira reserva deveria ser nova: %', v; end if;

  v := public.wa_reserva_mensagem('wamid-queue-test', 180);
  if v <> 'ocupada' then raise exception 'lease ativo deveria impedir worker concorrente: %', v; end if;

  ok := public.wa_finaliza_mensagem('wamid-queue-test', false, 'falha simulada');
  if not ok then raise exception 'finalização com falha não atualizou a reserva'; end if;

  v := public.wa_reserva_mensagem('wamid-queue-test', 180);
  if v <> 'retomada' then raise exception 'mensagem falha deveria ser retomada: %', v; end if;

  update public.wa_msg set lease_until = now() - interval '1 second'
   where id='wamid-queue-test';
  v := public.wa_reserva_mensagem('wamid-queue-test', 180);
  if v <> 'retomada' then raise exception 'lease expirado deveria ser retomado: %', v; end if;

  ok := public.wa_finaliza_mensagem('wamid-queue-test', true, null);
  if not ok then raise exception 'finalização de sucesso não atualizou a reserva'; end if;

  v := public.wa_reserva_mensagem('wamid-queue-test', 180);
  if v <> 'repetida' then raise exception 'mensagem concluída deveria ser ignorada: %', v; end if;

  if has_function_privilege('anon','public.wa_reserva_mensagem(text,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.wa_reserva_mensagem(text,integer)','EXECUTE')
     or not has_function_privilege('service_role','public.wa_reserva_mensagem(text,integer)','EXECUTE') then
    raise exception 'permissões da RPC de reserva incorretas';
  end if;
  if has_function_privilege('anon','public.wa_finaliza_mensagem(text,boolean,text)','EXECUTE')
     or has_function_privilege('authenticated','public.wa_finaliza_mensagem(text,boolean,text)','EXECUTE')
     or not has_function_privilege('service_role','public.wa_finaliza_mensagem(text,boolean,text)','EXECUTE') then
    raise exception 'permissões da RPC de finalização incorretas';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.wa_msg'::regclass) then
    raise exception 'RLS precisa permanecer habilitada em wa_msg';
  end if;
end $$;
select 'WhatsApp recoverable queue tests passed.' as result;
