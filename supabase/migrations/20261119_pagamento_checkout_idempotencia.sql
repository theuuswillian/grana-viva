-- Intenção persistente de checkout: a mesma tentativa reutiliza a mesma chave do Mercado Pago.
begin;

create table if not exists public.pagamento_checkout_intencoes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plano text not null check (plano in ('pro','pro_anual')),
  email_pagador text not null check (length(email_pagador) between 5 and 200),
  status text not null default 'pendente' check (status in ('pendente','criado')),
  provedor_preapproval_id text,
  init_point text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint pagamento_checkout_criado_com_link
    check (status <> 'criado' or (provedor_preapproval_id is not null and init_point is not null))
);

create index if not exists pagamento_checkout_user_criado
  on public.pagamento_checkout_intencoes(user_id, criado_em desc);

alter table public.pagamento_checkout_intencoes enable row level security;
revoke all on public.pagamento_checkout_intencoes from anon, authenticated, public;
grant select, insert, update on public.pagamento_checkout_intencoes to service_role;

commit;
