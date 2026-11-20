-- Confirma search_path seguro em todas as funções SECURITY DEFINER relevantes.
do $$
declare
  v_signature text;
  v_config text[];
  v_signatures text[] := array[
    'public.ia_conta(uuid,date,integer)',
    'public.rl_conta(uuid,text,integer,integer)',
    'public.assinatura_conta_nova()',
    'public.ia_conta_k(uuid,date,text,integer)',
    'public.ia_consume_cota_mes(uuid,date,text,integer)',
    'public.wa_salva_pendente_com_cota(uuid,text,date,integer,jsonb)'
  ];
begin
  foreach v_signature in array v_signatures loop
    select p.proconfig into v_config
      from pg_proc p
     where p.oid = to_regprocedure(v_signature);
    if v_config is null or not (v_config @> array['search_path=pg_catalog, public']) then
      raise exception 'search_path inseguro ou ausente em %: %', v_signature, v_config;
    end if;
  end loop;
end $$;
select 'SECURITY DEFINER search_path tests passed.' as result;
