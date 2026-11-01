-- v10.81: o limite diário de IA passa a ser por tipo de uso (k): 'leitura' (comprovante/frase) e 'assistente' (perguntas sobre os dados)
begin;
alter table public.ia_uso add column if not exists k text not null default 'leitura';
alter table public.ia_uso drop constraint if exists ia_uso_pkey;
alter table public.ia_uso add primary key (user_id, dia, k);
-- a função antiga (usada pela ler-comprovante) continua igual para quem chama: conta como 'leitura'
create or replace function public.ia_conta(p_uid uuid, p_dia date, p_lim int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into ia_uso(user_id, dia, k, n) values (p_uid, p_dia, 'leitura', 1)
  on conflict (user_id, dia, k) do update set n = ia_uso.n + 1 where ia_uso.n < p_lim
  returning n into v;
  return v is not null;
end $$;
create or replace function public.ia_conta_k(p_uid uuid, p_dia date, p_k text, p_lim int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into ia_uso(user_id, dia, k, n) values (p_uid, p_dia, p_k, 1)
  on conflict (user_id, dia, k) do update set n = ia_uso.n + 1 where ia_uso.n < p_lim
  returning n into v;
  return v is not null;
end $$;
revoke all on function public.ia_conta(uuid, date, int) from public, anon, authenticated;
revoke all on function public.ia_conta_k(uuid, date, text, int) from public, anon, authenticated;
commit;
