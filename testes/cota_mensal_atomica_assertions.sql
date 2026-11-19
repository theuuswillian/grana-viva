-- Testes funcionais e de rollback das RPCs de cotas e WhatsApp.
do $$
declare
  v boolean;
  r text;
  uid uuid := '22222222-2222-4222-8222-222222222222';
begin
  if not public.ia_consume_cota_mes(uid, date '2026-11-10', 'assistente', 2) then
    raise exception 'primeiro consumo deveria ser permitido';
  end if;
  if not public.ia_consume_cota_mes(uid, date '2026-11-11', 'assistente', 2) then
    raise exception 'segundo consumo no mesmo mês deveria ser permitido';
  end if;
  if public.ia_consume_cota_mes(uid, date '2026-11-12', 'assistente', 2) then
    raise exception 'terceiro consumo deveria exceder a cota mensal';
  end if;
  if not public.ia_consume_cota_mes(uid, date '2026-12-01', 'assistente', 2) then
    raise exception 'novo mês deveria iniciar uma cota nova';
  end if;

  insert into public.wa_pendente(id,user_id,payload)
  values ('pending-ok',uid,'{"text":"teste"}');
  r := public.wa_salva_pendente_com_cota(
    uid,'pending-ok',date '2026-11-18',2,
    '[{"id":"wa-1","data":{"descricao":"Compra A"},"updated_at":"2026-11-18T10:00:00Z"},{"id":"wa-2","data":{"descricao":"Compra B"},"updated_at":"2026-11-18T10:01:00Z"}]'::jsonb
  );
  if r <> 'salvo' then raise exception 'salvamento esperado, recebido: %',r; end if;
  if (select count(*) from public.tx where user_id=uid) <> 2 then
    raise exception 'as duas transações do WhatsApp não foram gravadas';
  end if;
  if exists (select 1 from public.wa_pendente where id='pending-ok') then
    raise exception 'pendente salvo não foi consumido';
  end if;
  if (select n from public.ia_uso where user_id=uid and k='whatsapp' and dia=date '2026-11-18') <> 1 then
    raise exception 'cota WhatsApp não foi contabilizada exatamente uma vez';
  end if;

  insert into public.wa_pendente(id,user_id,payload)
  values ('pending-limit',uid,'{"text":"limite"}');
  r := public.wa_salva_pendente_com_cota(
    uid,'pending-limit',date '2026-11-18',1,
    '[{"id":"wa-limit","data":{"descricao":"Não salvar"},"updated_at":"2026-11-18T10:02:00Z"}]'::jsonb
  );
  if r <> 'limite' then raise exception 'deveria retornar limite, recebeu: %',r; end if;
  if not exists (select 1 from public.wa_pendente where id='pending-limit') then
    raise exception 'pendente foi apagado ao atingir o limite';
  end if;
  if exists (select 1 from public.tx where id='wa-limit') then
    raise exception 'transação foi gravada mesmo com limite excedido';
  end if;

  insert into public.wa_pendente(id,user_id,payload)
  values ('pending-rollback',uid,'{"text":"rollback"}');
  begin
    perform public.wa_salva_pendente_com_cota(
      uid,'pending-rollback',date '2026-11-18',5,
      '[{"id":"wa-1","data":{"descricao":"duplicado"},"updated_at":"2026-11-18T10:03:00Z"}]'::jsonb
    );
    raise exception 'a inserção duplicada deveria falhar';
  exception when unique_violation then
    null;
  end;
  if not exists (select 1 from public.wa_pendente where id='pending-rollback') then
    raise exception 'falha de INSERT apagou o pendente';
  end if;
  if (select n from public.ia_uso where user_id=uid and k='whatsapp' and dia=date '2026-11-18') <> 1 then
    raise exception 'falha de INSERT consumiu cota indevidamente';
  end if;

  r := public.wa_salva_pendente_com_cota(
    uid,'pending-ok',date '2026-11-18',5,
    '[{"id":"wa-unused","data":{},"updated_at":"2026-11-18T10:04:00Z"}]'::jsonb
  );
  if r <> 'pendente_ausente' then
    raise exception 'pendente já consumido deveria retornar pendente_ausente';
  end if;

  if has_function_privilege('anon','public.ia_consume_cota_mes(uuid,date,text,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.ia_consume_cota_mes(uuid,date,text,integer)','EXECUTE')
     or not has_function_privilege('service_role','public.ia_consume_cota_mes(uuid,date,text,integer)','EXECUTE') then
    raise exception 'permissões da RPC ia_consume_cota_mes incorretas';
  end if;
  if has_function_privilege('anon','public.wa_salva_pendente_com_cota(uuid,text,date,integer,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.wa_salva_pendente_com_cota(uuid,text,date,integer,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.wa_salva_pendente_com_cota(uuid,text,date,integer,jsonb)','EXECUTE') then
    raise exception 'permissões da RPC wa_salva_pendente_com_cota incorretas';
  end if;
end $$;
select 'Atomic monthly quota migration tests passed.' as result;
