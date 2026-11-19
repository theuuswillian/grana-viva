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
