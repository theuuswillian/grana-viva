-- Asserções da reconciliação do schema de produção.
do $$
declare
  v_default text;
  v_count integer;
begin
  if not (select relrowsecurity from pg_class where oid='public.cotacao_cache'::regclass)
     or not (select relrowsecurity from pg_class where oid='public.radar_disparos'::regclass) then
    raise exception 'RLS deve estar habilitada nas duas tabelas';
  end if;

  if exists (select 1 from pg_policies where schemaname='public' and tablename='cotacao_cache') then
    raise exception 'cotacao_cache deve permanecer sem policies (service_role only)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='radar_disparos'
      and policyname='radar_disparos_select_own' and cmd='SELECT'
      and roles @> array['authenticated']::name[]) then
    raise exception 'policy de leitura própria do radar ausente';
  end if;

  if has_table_privilege('anon','public.cotacao_cache','select')
     or has_table_privilege('authenticated','public.cotacao_cache','select')
     or has_table_privilege('anon','public.radar_disparos','select')
     or has_table_privilege('authenticated','public.radar_disparos','insert')
     or has_table_privilege('authenticated','public.radar_disparos','update')
     or has_table_privilege('authenticated','public.radar_disparos','delete') then
    raise exception 'permissões de cliente excessivas';
  end if;
  if not has_table_privilege('service_role','public.cotacao_cache','select')
     or not has_table_privilege('service_role','public.cotacao_cache','insert')
     or not has_table_privilege('service_role','public.radar_disparos','insert') then
    raise exception 'service_role sem permissões esperadas';
  end if;

  if not exists (select 1 from pg_constraint where conrelid='public.cotacao_cache'::regclass and conname='cotacao_cache_pkey')
     or not exists (select 1 from pg_constraint where conrelid='public.cotacao_cache'::regclass and conname='cotacao_cache_ticker_check')
     or not exists (select 1 from pg_constraint where conrelid='public.radar_disparos'::regclass and conname='radar_disparos_pkey')
     or not exists (select 1 from pg_constraint where conrelid='public.radar_disparos'::regclass and conname='radar_disparos_user_id_fkey')
     or not exists (select 1 from pg_constraint where conrelid='public.radar_disparos'::regclass and conname='radar_disparos_chave_check') then
    raise exception 'constraints/PK/FK esperadas ausentes';
  end if;

  select column_default into v_default from information_schema.columns
   where table_schema='public' and table_name='settings' and column_name='whatsapp_resumo_semanal';
  if v_default not like '%true%' then raise exception 'default da preferência semanal deve ser true: %',v_default; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public'
      and table_name='settings' and column_name='whatsapp_resumo_semanal' and is_nullable='NO') then
    raise exception 'whatsapp_resumo_semanal deve ser NOT NULL';
  end if;
  if (select data->>'preservar' from public.settings where user_id='00000000-0000-0000-0000-000000000001') <> 'dado-existente' then
    raise exception 'a reconciliação alterou dados preexistentes de settings';
  end if;
  if (select v->>'preco' from public.cotacao_cache where ticker='PETR4') <> '37.5'
     or (select salvo_em from public.cotacao_cache where ticker='PETR4') is null then
    raise exception 'a reconciliação não preservou/completou a cotação preexistente';
  end if;
  if (select count(*) from public.radar_disparos) <> 2
     or not exists (select 1 from public.radar_disparos where user_id='00000000-0000-0000-0000-000000000001' and chave='alvo|A' and em is not null)
     or not exists (select 1 from public.radar_disparos where user_id='00000000-0000-0000-0000-000000000002' and chave='alvo|B' and em is not null) then
    raise exception 'a reconciliação não preservou/completou os disparos preexistentes';
  end if;
end $$;

do $$ begin
  if (select whatsapp_resumo_semanal from public.settings where user_id='00000000-0000-0000-0000-000000000001') is distinct from true then
    raise exception 'preferência semanal não recebeu default true';
  end if;
end $$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.radar_disparos;
  if v_count <> 1 then raise exception 'RLS do radar retornou % linhas para um usuário; esperado 1',v_count; end if;
end
$$;
reset role;

select 'Production schema reconciliation tests passed.' as result;
