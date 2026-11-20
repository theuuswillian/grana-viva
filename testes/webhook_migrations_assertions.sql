-- Confere idempotência, isolamento e configuração dos jobs das migrations v10.165.
do $$
declare
  v_count integer;
  v_schedule text;
  v_command text;
  token_a uuid := '20000000-0000-4000-8000-000000000001';
  token_b uuid := '20000000-0000-4000-8000-000000000002';
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
  if public.wa_saida_reserva('wa:test:sent',token_a,'5561999999999','{"type":"text","text":"oi"}'::jsonb,90) <> 'nova' then
    raise exception 'primeiro envio deveria reservar outbox';
  end if;
  if public.wa_saida_reserva('wa:test:sent',token_b,'5561999999999','{"type":"text","text":"oi"}'::jsonb,90) <> 'ocupada' then
    raise exception 'reserva ativa deveria bloquear segundo worker';
  end if;
  if not public.wa_saida_finaliza('wa:test:sent',token_a,'enviada','wamid-provider-1',null) then
    raise exception 'finalização enviada deveria atualizar outbox';
  end if;
  if public.wa_saida_reserva('wa:test:sent',token_b,'5561999999999','{"type":"text","text":"oi"}'::jsonb,90) <> 'enviada' then
    raise exception 'envio concluído não pode ser repetido mesmo após reconstrução do payload';
  end if;

  if public.wa_saida_reserva('wa:test:429',token_a,'5561999999999','{"type":"text","text":"limite"}'::jsonb,90) <> 'nova' then
    raise exception 'reserva inicial 429 falhou';
  end if;
  if not public.wa_saida_finaliza('wa:test:429',token_a,'falhou_segura',null,'HTTP 429') then
    raise exception 'falha segura deveria finalizar';
  end if;
  if public.wa_saida_reserva('wa:test:429',token_b,'5561999999999','{"type":"text","text":"nova tentativa"}'::jsonb,90) <> 'retomada' then
    raise exception 'HTTP 429 deveria permitir retry seguro';
  end if;
  if (select corpo->'text'->>'text' from public.wa_saida where chave='wa:test:429') <> 'nova tentativa' then
    raise exception 'retry seguro não atualizou o payload ainda não enviado';
  end if;

  if public.wa_saida_reserva('wa:test:crash',token_a,'5561999999999','{"type":"text","text":"crash"}'::jsonb,90) <> 'nova' then
    raise exception 'reserva de crash falhou';
  end if;
  update public.wa_saida set lease_until=now()-interval '1 second' where chave='wa:test:crash';
  if public.wa_saida_reserva('wa:test:crash',token_b,'5561999999999','{"type":"text","text":"crash"}'::jsonb,90) <> 'incerta' then
    raise exception 'lease expirado deve virar incerto, nunca reenviar automaticamente';
  end if;
  if public.wa_saida_reserva('wa:test:crash',token_b,'5561999999999','{"type":"text","text":"crash"}'::jsonb,90) <> 'incerta' then
    raise exception 'envio incerto não pode ser reenviado';
  end if;

  if public.wa_saida_reserva('wa:test:4xx',token_a,'5561999999999','{"type":"text","text":"bad"}'::jsonb,90) <> 'nova' then
    raise exception 'reserva 4xx falhou';
  end if;
  if not public.wa_saida_finaliza('wa:test:4xx',token_a,'falhou',null,'HTTP 400') then
    raise exception 'falha permanente deveria finalizar';
  end if;
  if public.wa_saida_reserva('wa:test:4xx',token_b,'5561999999999','{"type":"text","text":"bad"}'::jsonb,90) <> 'falhou' then
    raise exception 'falha permanente não pode ser repetida';
  end if;

  select schedule,command into v_schedule,v_command
    from cron.job where jobname='granaviva-wa-saida-limpeza';
  if v_schedule <> '*/5 * * * *'
     or v_command not ilike '%status=''incerta''%'
     or v_command not ilike '%30 days%' then
    raise exception 'job de reconciliação/retention da outbox incorreto';
  end if;

  if not (select relrowsecurity from pg_class where oid='public.wa_saida'::regclass) then
    raise exception 'RLS não está habilitada em wa_saida';
  end if;
  if has_table_privilege('anon','public.wa_saida','select')
     or has_table_privilege('authenticated','public.wa_saida','select') then
    raise exception 'outbox não pode ser acessível pelo cliente';
  end if;

  -- Vinculação atômica: troca os vínculos conflitantes e consome os códigos juntos.
  insert into public.wa_vinculo(user_id,telefone)
  values ('00000000-0000-0000-0000-000000000101','5561000000001'),
         ('00000000-0000-0000-0000-000000000102','5561000000002');
  insert into public.wa_codigo(codigo,user_id,expira)
  values ('123456','00000000-0000-0000-0000-000000000101',now()+interval '15 minutes');
  if public.wa_vincula_codigo('5561000000002','123456') <> 'vinculado' then
    raise exception 'código válido deveria vincular telefone';
  end if;
  if (select count(*) from public.wa_vinculo) <> 1
     or not exists (select 1 from public.wa_vinculo
                     where user_id='00000000-0000-0000-0000-000000000101'
                       and telefone='5561000000002')
     or exists (select 1 from public.wa_codigo where codigo='123456') then
    raise exception 'vinculação não substituiu vínculos e consumiu código atomicamente';
  end if;
  if public.wa_vincula_codigo('5561000000002','123456') <> 'ja_vinculado' then
    raise exception 'retry de vínculo já concluído deveria ser idempotente';
  end if;
  if public.wa_vincula_codigo('5561000000003','654321') <> 'codigo_expirado' then
    raise exception 'código ausente deveria ser rejeitado';
  end if;
  insert into public.wa_codigo(codigo,user_id,expira)
  values ('654321','00000000-0000-0000-0000-000000000103',now()-interval '1 minute');
  if public.wa_vincula_codigo('5561000000003','654321') <> 'codigo_expirado' then
    raise exception 'código vencido deveria ser rejeitado';
  end if;
  if exists (select 1 from public.wa_vinculo where telefone='5561000000003') then
    raise exception 'código vencido não pode criar vínculo';
  end if;
  if has_function_privilege('anon','public.wa_vincula_codigo(text,text)','execute')
     or has_function_privilege('authenticated','public.wa_vincula_codigo(text,text)','execute')
     or not has_function_privilege('service_role','public.wa_vincula_codigo(text,text)','execute') then
    raise exception 'permissões da RPC de vínculo estão incorretas';
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
