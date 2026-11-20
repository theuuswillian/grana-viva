-- Fixture isolado para validar a reconciliação do schema sem tocar na produção.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to public;

create table public.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Simula tabelas de produção parcialmente provisionadas: dados e colunas essenciais
-- existem, mas faltam colunas auxiliares, PKs e checks/FK.
create table public.cotacao_cache (ticker text, v jsonb);
create table public.radar_disparos (user_id uuid, chave text);

insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002');
insert into public.settings(user_id,data) values
 ('00000000-0000-0000-0000-000000000001','{"preservar":"dado-existente"}'::jsonb);
insert into public.cotacao_cache(ticker,v) values
 ('PETR4','{"preco":37.5}'::jsonb);
insert into public.radar_disparos(user_id,chave) values
 ('00000000-0000-0000-0000-000000000001','alvo|A'),
 ('00000000-0000-0000-0000-000000000002','alvo|B');
