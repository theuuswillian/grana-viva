-- v10.52: limite de leituras de comprovante por IA (30/mês por usuário).
-- RLS ligada: cada usuário lê/escreve só a própria linha. o app conta antes e depois da leitura.
create table if not exists public.ia_uso (
  user_id uuid not null references auth.users(id) on delete cascade,
  mes text not null,
  leituras int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, mes)
);
alter table public.ia_uso enable row level security;
revoke all on public.ia_uso from anon, authenticated;
drop policy if exists ia_uso_own on public.ia_uso;
create policy ia_uso_own on public.ia_uso for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
