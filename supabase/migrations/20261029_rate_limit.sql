-- v10.55: limite de chamadas por pessoa nas funções do servidor (janela fixa)
create table if not exists public.rl_uso (
  user_id uuid not null references auth.users(id) on delete cascade,
  k text not null,
  janela bigint not null,
  n int not null default 0,
  primary key (user_id, k, janela)
);
alter table public.rl_uso enable row level security;
revoke all on public.rl_uso from anon, authenticated;
create or replace function public.rl_conta(p_uid uuid, p_k text, p_lim int, p_seg int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v int; j bigint := floor(extract(epoch from now()) / p_seg);
begin
  delete from rl_uso where user_id = p_uid and k = p_k and janela < j;
  insert into rl_uso(user_id, k, janela, n) values (p_uid, p_k, j, 1)
  on conflict (user_id, k, janela) do update set n = rl_uso.n + 1 where rl_uso.n < p_lim
  returning n into v;
  return v is not null;
end $$;
revoke all on function public.rl_conta(uuid, text, int, int) from public, anon, authenticated;
