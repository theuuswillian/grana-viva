-- Garante que duas tentativas concorrentes não reservem checkouts pendentes diferentes para a mesma conta.
begin;

do $$
declare
  v_uid uuid := '00000000-0000-4000-8000-000000000091';
  v_conflict boolean := false;
begin
  insert into auth.users(id, email)
  values (v_uid, 'checkout-unique@example.invalid')
  on conflict (id) do nothing;

  insert into public.pagamento_checkout_intencoes(id, user_id, plano, email_pagador, status)
  values ('00000000-0000-4000-8000-000000000092', v_uid, 'pro', 'checkout-unique@example.invalid', 'pendente');

  begin
    insert into public.pagamento_checkout_intencoes(id, user_id, plano, email_pagador, status)
    values ('00000000-0000-4000-8000-000000000093', v_uid, 'pro_anual', 'checkout-unique@example.invalid', 'pendente');
  exception when unique_violation then
    v_conflict := true;
  end;

  if not v_conflict then
    raise exception 'segunda intenção pendente para o mesmo usuário deveria ser rejeitada';
  end if;

  if (select count(*) from public.pagamento_checkout_intencoes where user_id = v_uid and status = 'pendente') <> 1 then
    raise exception 'deve existir exatamente uma intenção pendente por usuário';
  end if;
end $$;

rollback;
select 'Checkout intent uniqueness tests passed.' as result;
