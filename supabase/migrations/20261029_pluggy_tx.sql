-- GranaViva · P1: transações e contas do Pluggy guardadas no servidor (alimentadas pelo webhook pluggy-webhook).
-- O app só LÊ (RLS: select do próprio usuário). Quem grava é a service role (Edge Functions).
create table if not exists public.pluggy_tx (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,                         -- id da transação no Pluggy
  account_id text not null,
  item_id text not null,
  data jsonb not null,                      -- {id,data,valor,desc,cat} igual à resposta de 'sincronizar'
  removed boolean not null default false,   -- transactions/deleted (pode reaparecer depois)
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists pluggy_tx_user_upd on public.pluggy_tx (user_id, updated_at);

create table if not exists public.pluggy_acc (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,                         -- id da conta no Pluggy
  item_id text not null,
  data jsonb not null,                      -- {id,nome,tipo,saldo,credito}
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists pluggy_acc_user_upd on public.pluggy_acc (user_id, updated_at);

alter table public.pluggy_tx enable row level security;
alter table public.pluggy_acc enable row level security;
revoke all on public.pluggy_tx, public.pluggy_acc from anon, authenticated;
grant select on public.pluggy_tx, public.pluggy_acc to authenticated;
drop policy if exists pluggy_tx_sel on public.pluggy_tx;
create policy pluggy_tx_sel on public.pluggy_tx for select to authenticated using (auth.uid() = user_id);
drop policy if exists pluggy_acc_sel on public.pluggy_acc;
create policy pluggy_acc_sel on public.pluggy_acc for select to authenticated using (auth.uid() = user_id);

alter table public.pluggy_cfg add column if not exists api_key text;
alter table public.pluggy_cfg add column if not exists api_key_exp timestamptz;
alter table public.pluggy_cfg add column if not exists webhook_id text;
alter table public.pluggy_cfg add column if not exists webhook_secret text;
alter table public.pluggy_cfg add column if not exists item_status jsonb not null default '{}'::jsonb; -- {itemId:{status,erro,em}}
