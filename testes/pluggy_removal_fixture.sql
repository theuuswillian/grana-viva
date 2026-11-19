-- Fixture isolada para validar a migration de remoção do Pluggy.
-- Executada somente no PostgreSQL descartável do GitHub Actions.
create schema auth;
create table auth.users (id uuid primary key);

create table public.tx (id text primary key, user_id uuid not null, data jsonb);
create table public.fiis (id text primary key, user_id uuid not null, data jsonb);
create table public.settings (user_id uuid primary key, data jsonb);
create table public.bancos (id text primary key, user_id uuid not null, data jsonb);
create table public.cartoes (id text primary key, user_id uuid not null, data jsonb);

create table public.pluggy_tx (id text primary key);
create table public.pluggy_acc (id text primary key);
create table public.pluggy_cfg (id text primary key);

insert into auth.users values ('11111111-1111-4111-8111-111111111111');

insert into public.tx (id,user_id,data) values
('tx-pluggy','11111111-1111-4111-8111-111111111111','{"pluggyId":"legacy-123","origem":"banco","valor":100}'::jsonb),
('tx-bank-generic','11111111-1111-4111-8111-111111111111','{"origem":"banco","valor":200}'::jsonb),
('tx-manual','11111111-1111-4111-8111-111111111111','{"origem":"manual","valor":300}'::jsonb);

insert into public.fiis (id,user_id,data) values
('fii-pluggy','11111111-1111-4111-8111-111111111111','{"pluggyInv":"legacy-investment","nome":"Importado"}'::jsonb),
('fii-manual','11111111-1111-4111-8111-111111111111','{"nome":"Manual"}'::jsonb);

insert into public.settings (user_id,data) values
('11111111-1111-4111-8111-111111111111',
 '{"pluggyOn":true,"pluggyMap":{"acc-1":"b:bank-1","card-1":"c:card-1"},"pluggyIgn":["legacy-123"],"tema":"dark"}'::jsonb);

insert into public.bancos (id,user_id,data) values
('bank-1','11111111-1111-4111-8111-111111111111','{"nome":"Conta mapeada","saldo":1000,"saldoData":"2026-11-18","saldoFecha":"2026-11-18"}'::jsonb),
('bank-2','11111111-1111-4111-8111-111111111111','{"nome":"Conta manual","saldo":2000,"saldoData":"2026-11-18","saldoFecha":"2026-11-18"}'::jsonb);

insert into public.cartoes (id,user_id,data) values
('card-1','11111111-1111-4111-8111-111111111111','{"nome":"Cartão mapeado","bancoUsado":true,"bancoData":"2026-11-18","limite":5000}'::jsonb),
('card-2','11111111-1111-4111-8111-111111111111','{"nome":"Cartão manual","bancoUsado":true,"bancoData":"2026-11-18","limite":3000}'::jsonb);
