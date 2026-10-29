-- limite de leituras por IA (comprovante e frase): contado só no servidor, por dia
create table if not exists public.ia_uso (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  n int not null default 0,
  primary key (user_id, dia)
);
alter table public.ia_uso enable row level security;
revoke all on public.ia_uso from anon, authenticated;
-- incrementa e confere de forma atômica; devolve false quando já chegou ao limite
create or replace function public.ia_conta(p_uid uuid, p_dia date, p_lim int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into ia_uso(user_id, dia, n) values (p_uid, p_dia, 1)
  on conflict (user_id, dia) do update set n = ia_uso.n + 1 where ia_uso.n < p_lim
  returning n into v;
  return v is not null;
end $$;
revoke all on function public.ia_conta(uuid, date, int) from public, anon, authenticated;
