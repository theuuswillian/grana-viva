-- Fixture isolada para testar a migration de cotas mensais em PostgreSQL.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create table public.ia_uso (
  user_id uuid not null,
  dia date not null,
  k text not null,
  n integer not null default 0,
  primary key (user_id, dia, k)
);
create table public.wa_pendente (
  id text primary key,
  user_id uuid not null,
  payload jsonb
);
create table public.tx (
  user_id uuid not null,
  id text not null,
  data jsonb,
  updated_at timestamptz not null,
  primary key (user_id, id)
);
