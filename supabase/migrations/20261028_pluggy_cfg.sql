-- credenciais do Meu Pluggy por usuário. RLS ligada e nenhuma política: o app (anon/autenticado)
-- não lê nem grava; só a Edge Function pluggy-sync, com a service role.
create table if not exists public.pluggy_cfg (
  user_id uuid primary key references auth.users(id) on delete cascade,
  client_id text not null,
  client_secret text not null,
  item_ids text[] not null default '{}',
  ultima_sync timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.pluggy_cfg enable row level security;
revoke all on public.pluggy_cfg from anon, authenticated;
