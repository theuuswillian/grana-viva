-- Verifica limite de tentativas por telefone, janela, bloqueio silencioso e limpeza após sucesso.
do $$
declare
  i integer;
  resultado text;
  telefone text := '5561999000001';
  telefone_reset text := '5561999000002';
  telefone_sucesso text := '5561999000003';
begin
  if not (select relrowsecurity from pg_class where oid='public.wa_codigo_tentativa'::regclass) then
    raise exception 'RLS ausente na tabela de tentativas de código';
  end if;
  if has_table_privilege('anon','public.wa_codigo_tentativa','select')
     or has_table_privilege('authenticated','public.wa_codigo_tentativa','select')
     or has_table_privilege('anon','public.wa_codigo_tentativa','insert')
     or has_table_privilege('authenticated','public.wa_codigo_tentativa','insert') then
    raise exception 'tabela de tentativas exposta ao cliente';
  end if;

  for i in 1..10 loop
    resultado := public.wa_vincula_codigo(telefone, lpad(i::text,6,'0'));
    if resultado <> 'codigo_expirado' then
      raise exception 'tentativa % deveria ser contabilizada como código inválido, recebeu %', i, resultado;
    end if;
  end loop;
  if public.wa_vincula_codigo(telefone,'999999') <> 'limite_tentativas' then
    raise exception '11ª tentativa deveria ativar bloqueio';
  end if;
  if public.wa_vincula_codigo(telefone,'999999') <> 'limite_tentativas_silencioso' then
    raise exception 'tentativas durante bloqueio deveriam ser silenciosas';
  end if;
  if (select tentativas from public.wa_codigo_tentativa where telefone=telefone) <> 10 then
    raise exception 'contador deveria parar em 10 tentativas';
  end if;

  -- Janela vencida libera uma nova janela e reinicia a contagem.
  update public.wa_codigo_tentativa
     set janela_inicio=now()-interval '16 minutes', bloqueado_ate=null
   where telefone=telefone_reset;
  if public.wa_vincula_codigo(telefone_reset,'999998') <> 'codigo_expirado' then
    raise exception 'janela expirada deveria liberar nova tentativa';
  end if;
  if (select tentativas from public.wa_codigo_tentativa where telefone=telefone_reset) <> 1 then
    raise exception 'nova janela deveria começar em uma tentativa';
  end if;

  -- Um vínculo legítimo limpa o histórico de tentativas daquele telefone.
  insert into public.wa_codigo(codigo,user_id,expira)
  values ('765432','00000000-0000-0000-0000-000000000104',now()+interval '15 minutes');
  if public.wa_vincula_codigo(telefone_sucesso,'765432') <> 'vinculado' then
    raise exception 'código correto deveria vincular mesmo após a proteção';
  end if;
  if exists (select 1 from public.wa_codigo_tentativa where telefone=telefone_sucesso) then
    raise exception 'sucesso deveria limpar contador de tentativas';
  end if;

  if has_function_privilege('anon','public.wa_vincula_codigo(text,text)','execute')
     or has_function_privilege('authenticated','public.wa_vincula_codigo(text,text)','execute')
     or not has_function_privilege('service_role','public.wa_vincula_codigo(text,text)','execute') then
    raise exception 'permissões da RPC protegida estão incorretas';
  end if;
end $$;
select 'WhatsApp link rate limit tests passed.' as result;
