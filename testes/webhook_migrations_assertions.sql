-- Confere idempotência, isolamento e configuração dos jobs das migrations v10.165.
do $$
declare
  v_count integer;
  v_schedule text;
  v_command text;
begin
  select count(*) into v_count from cron.job
   where jobname in ('granaviva-wa-msg-limpeza','granaviva-wa-resumo-semanal');
  if v_count <> 2 then raise exception 'esperados exatamente dois jobs, encontrados %',v_count; end if;

  select schedule,command into v_schedule,v_command
    from cron.job where jobname='granaviva-wa-msg-limpeza';
  if v_schedule <> '40 3 * * *' then raise exception 'schedule incorreto para limpeza WhatsApp: %',v_schedule; end if;
  if v_command not ilike '%wa_msg%' or v_command not ilike '%30 days%' then
    raise exception 'comando de limpeza WhatsApp incorreto';
  end if;

  select schedule,command into v_schedule,v_command
    from cron.job where jobname='granaviva-wa-resumo-semanal';
  if v_schedule <> '0 11 * * 1' then raise exception 'schedule incorreto para resumo semanal: %',v_schedule; end if;
  if v_command not ilike '%whatsapp-webhook?acao=resumo-semanal%'
     or v_command not ilike '%gv_cron_secret%'
     or v_command not ilike '%net.http_post%' then
    raise exception 'comando do resumo semanal não contém endpoint, Vault e HTTP POST esperados';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='wa_vinculo' and column_name='resumo_semanal'
  ) or not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='wa_vinculo' and column_name='resumo_enviado'
  ) then raise exception 'colunas do resumo semanal não foram criadas'; end if;

  if not (select relrowsecurity from pg_class where oid='public.wa_vinculo'::regclass) then
    raise exception 'RLS não está habilitada em wa_vinculo';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.pagamento_eventos'::regclass)
     or not (select relrowsecurity from pg_class where oid='public.wa_msg'::regclass) then
    raise exception 'RLS não está habilitada nas tabelas de idempotência';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.pagamento_eventos'::regclass and contype='p')
     or not exists (select 1 from pg_constraint where conrelid='public.wa_msg'::regclass and contype='p') then
    raise exception 'chave primária de idempotência ausente';
  end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and indexname='wa_msg_criado') then
    raise exception 'índice de limpeza da tabela wa_msg ausente';
  end if;
  insert into public.pagamento_eventos(id) values ('mp-duplicate-test');
  begin
    insert into public.pagamento_eventos(id) values ('mp-duplicate-test');
    raise exception 'id duplicado de pagamento deveria falhar';
  exception when unique_violation then
    null;
  end;
  insert into public.wa_msg(id) values ('wamid-duplicate-test');
  begin
    insert into public.wa_msg(id) values ('wamid-duplicate-test');
    raise exception 'wamid duplicado deveria falhar';
  exception when unique_violation then
    null;
  end;

  -- Uma mensagem reentregue não consome novamente a leitura diária.
  insert into public.wa_msg(id) values ('wamid-ai-quota-once');
  if not public.wa_conta_leitura_ia('00000000-0000-0000-0000-000000000001', 'wamid-ai-quota-once', date '2026-11-19', 2) then
    raise exception 'primeira leitura deveria ser permitida';
  end if;
  if not public.wa_conta_leitura_ia('00000000-0000-0000-0000-000000000001', 'wamid-ai-quota-once', date '2026-11-19', 2) then
    raise exception 'retry da mesma mensagem deve reutilizar a autorização';
  end if;
  if (select n from public.ia_uso where user_id='00000000-0000-0000-0000-000000000001' and dia=date '2026-11-19' and k='leitura') <> 1 then
    raise exception 'retry duplicou o consumo da cota IA';
  end if;

  insert into public.wa_msg(id) values ('wamid-ai-quota-limit');
  if public.wa_conta_leitura_ia('00000000-0000-0000-0000-000000000001', 'wamid-ai-quota-limit', date '2026-11-19', 1) then
    raise exception 'mensagem nova deveria respeitar cota esgotada';
  end if;
  if public.wa_conta_leitura_ia('00000000-0000-0000-0000-000000000001', 'wamid-ai-quota-limit', date '2026-11-19', 5) then
    raise exception 'retry não pode liberar retroativamente uma mensagem bloqueada';
  end if;
  if (select n from public.ia_uso where user_id='00000000-0000-0000-0000-000000000001' and dia=date '2026-11-19' and k='leitura') <> 1 then
    raise exception 'retry de mensagem bloqueada alterou a cota';
  end if;
  if public.wa_conta_leitura_ia('00000000-0000-0000-0000-000000000001', 'wamid-ai-quota-once', date '2026-11-20', 5) then
    raise exception 'mensagem não pode trocar de dia de cota durante retry';
  end if;


  -- Outbox: uma resposta enviada não é repetida; uma recusa 429 pode ser retomada.
  if public.wa_saida_reserva('wa:test:sent','5561999999999','{"type":"text","text":"oi"}'::jsonb,90) <> 'nova' then
    raise exception 'primeiro envio deveria reservar outbox';
  end if;
  if public.wa_saida_reserva('wa:test:sent','5561999999999','{"type":"text","text":"oi"}'::jsonb,90) <> 'ocupada' then
    raise exception 'reserva ativa deveria bloquear segundo worker';
  end if;
  if not public.wa_saida_finaliza('wa:test:sent','enviada','wamid-provider-1',null) then
    raise exception 'finalização enviada deveria atualizar outbox';
  end if;
  if public.wa_saida_reserva('wa:test:sent','5561999999999','{"type":"text","text":"texto alterado após retry"}'::jsonb,90) <> 'enviada' then
    raise exception 'envio concluído não pode ser repetido mesmo após reconstrução do payload';
  end if;

  if public.wa_saida_reserva('wa:test:429','5561999999999','{"type":"text","text":"limite"}'::jsonb,90) <> 'nova' then
    raise exception 'reserva inicial 429 falhou';
  end if;
  if not public.wa_saida_finaliza('wa:test:429','falhou_segura',null,'HTTP 429') then
    raise exception 'falha segura deveria finalizar';
  end if;
  if public.wa_saida_reserva('wa:test:429','5561999999999','{"type":"text","text":"nova tentativa"}'::jsonb,90) <> 'retomada' then
    raise exception 'HTTP 429 deveria permitir retry seguro';
  end if;
  if (select corpo->'text'->>'text' from public.wa_saida where chave='wa:test:429') <> 'nova tentativa' then
    raise exception 'retry seguro não atualizou o payload ainda não enviado';
  end if;

  if public.wa_saida_reserva('wa:test:crash','5561999999999','{"type":"text","text":"crash"}'::jsonb,90) <> 'nova' then
    raise exception 'reserva de crash falhou';
  end if;
  update public.wa_saida set lease_until=now()-interval '1 second' where chave='wa:test:crash';
  if public.wa_saida_reserva('wa:test:crash','5561999999999','{"type":"text","text":"crash"}'::jsonb,90) <> 'incerta' then
    raise exception 'lease expirado deve virar incerto, nunca reenviar automaticamente';
  end if;
  if public.wa_saida_reserva('wa:test:crash','5561999999999','{"type":"text","text":"crash"}'::jsonb,90) <> 'incerta' then
    raise exception 'envio incerto não pode ser reenviado';
  end if;

  if public.wa_saida_reserva('wa:test:4xx','5561999999999','{"type":"text","text":"bad"}'::jsonb,90) <> 'nova' then
    raise exception 'reserva 4xx falhou';
  end if;
  if not public.wa_saida_finaliza('wa:test:4xx','falhou',null,'HTTP 400') then
    raise exception 'falha permanente deveria finalizar';
  end if;
  if public.wa_saida_reserva('wa:test:4xx','5561999999999','{"type":"text","text":"bad"}'::jsonb,90) <> 'falhou' then
    raise exception 'falha permanente não pode ser repetida';
  end if;

  if not (select relrowsecurity from pg_class where oid='public.wa_saida'::regclass) then
    raise exception 'RLS não está habilitada em wa_saida';
  end if;
  if has_table_privilege('anon','public.wa_saida','select')
     or has_table_privilege('authenticated','public.wa_saida','select') then
    raise exception 'outbox não pode ser acessível pelo cliente';
  end if;

  if exists (select 1 from pg_policies where schemaname='public' and tablename='wa_vinculo') then
    raise exception 'wa_vinculo não deve receber policies para acesso direto do cliente';
  end if;
  if has_table_privilege('anon','public.wa_vinculo','select')
     or has_table_privilege('authenticated','public.wa_vinculo','select')
     or has_table_privilege('anon','public.pagamento_eventos','select')
     or has_table_privilege('authenticated','public.pagamento_eventos','select')
     or has_table_privilege('anon','public.wa_msg','select')
     or has_table_privilege('authenticated','public.wa_msg','select') then
    raise exception 'tabelas de webhook/resumo ficaram legíveis pelo cliente';
  end if;
end $$;
select 'Webhook idempotency and weekly summary migrations tests passed.' as result;
