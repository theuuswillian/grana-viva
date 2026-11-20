-- Valida persistência, unicidade e permissões das intenções de checkout.
begin;

do $$
declare
  v_uid uuid := '00000000-0000-4000-8000-000000000001';
  v_intent uuid := '00000000-0000-4000-8000-000000000099';
  v_status text;
  v_url text;
begin
  insert into auth.users(id,email) values (v_uid,'checkout-test@example.invalid')
  on conflict (id) do nothing;

  insert into public.pagamento_checkout_intencoes(id,user_id,plano,email_pagador)
  values (v_intent,v_uid,'pro','checkout-test@example.invalid');

  -- A mesma intenção não pode criar uma segunda linha; a aplicação recupera a existente.
  begin
    insert into public.pagamento_checkout_intencoes(id,user_id,plano,email_pagador)
    values (v_intent,v_uid,'pro','checkout-test@example.invalid');
    raise exception 'intenção repetida deveria conflitar';
  exception when unique_violation then
    null;
  end;

  update public.pagamento_checkout_intencoes
     set status='criado', provedor_preapproval_id='mp-preapproval-test',
         init_point='https://www.mercadopago.com.br/checkout/test',
         atualizado_em=now()
   where id=v_intent and user_id=v_uid and status='pendente';

  select status,init_point into v_status,v_url
    from public.pagamento_checkout_intencoes where id=v_intent;
  if v_status <> 'criado' or v_url not like 'https://www.mercadopago.com.br/%' then
    raise exception 'intenção criada precisa persistir o link retornado pelo provedor';
  end if;

  if not (select relrowsecurity from pg_class where oid='public.pagamento_checkout_intencoes'::regclass) then
    raise exception 'RLS precisa permanecer habilitada na tabela de checkout';
  end if;
  if has_table_privilege('anon','public.pagamento_checkout_intencoes','SELECT')
     or has_table_privilege('authenticated','public.pagamento_checkout_intencoes','SELECT')
     or not has_table_privilege('service_role','public.pagamento_checkout_intencoes','SELECT')
     or not has_table_privilege('service_role','public.pagamento_checkout_intencoes','INSERT')
     or not has_table_privilege('service_role','public.pagamento_checkout_intencoes','UPDATE') then
    raise exception 'permissões da tabela de intenções de checkout incorretas';
  end if;
end $$;

rollback;
select 'Payment checkout idempotency tests passed.' as result;
