-- Asserts pós-migration: falha com erro se qualquer dado protegido for perdido.
do $$
begin
  if exists (select 1 from public.tx where id='tx-pluggy') then
    raise exception 'registro explicitamente Pluggy não foi removido';
  end if;
  if not exists (select 1 from public.tx where id='tx-bank-generic') then
    raise exception 'registro genérico de origem banco foi apagado indevidamente';
  end if;
  if not exists (select 1 from public.tx where id='tx-manual') then
    raise exception 'registro manual foi apagado indevidamente';
  end if;
  if exists (select 1 from public.fiis where id='fii-pluggy') then
    raise exception 'posição explicitamente Pluggy não foi removida';
  end if;
  if not exists (select 1 from public.fiis where id='fii-manual') then
    raise exception 'posição manual foi apagada indevidamente';
  end if;
  if (select data ?| array['pluggyOn','pluggyMap','pluggyIgn'] from public.settings limit 1) then
    raise exception 'chaves Pluggy permaneceram em settings';
  end if;
  if (select data->>'tema' from public.settings limit 1) <> 'dark' then
    raise exception 'preferências não relacionadas foram perdidas';
  end if;
  if (select data ?| array['saldo','saldoData','saldoFecha'] from public.bancos where id='bank-1') then
    raise exception 'saldo automático Pluggy não foi removido da conta mapeada';
  end if;
  if not (select data ? 'saldo' from public.bancos where id='bank-2') then
    raise exception 'saldo da conta não mapeada foi removido indevidamente';
  end if;
  if (select data ?| array['bancoUsado','bancoData'] from public.cartoes where id='card-1') then
    raise exception 'metadados Pluggy não foram removidos do cartão mapeado';
  end if;
  if not (select data ? 'bancoData' from public.cartoes where id='card-2') then
    raise exception 'metadados do cartão não mapeado foram removidos indevidamente';
  end if;
  if to_regclass('public.pluggy_tx') is not null
     or to_regclass('public.pluggy_acc') is not null
     or to_regclass('public.pluggy_cfg') is not null then
    raise exception 'tabelas Pluggy permaneceram após a migration';
  end if;
end $$;
select 'Pluggy cleanup migration tests passed.' as result;
