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
create schema cron;
create table cron.job (jobid bigserial primary key, jobname text unique not null, schedule text not null, command text not null);
create function cron.unschedule(p_jobname text) returns boolean language plpgsql as $$
declare n integer; begin delete from cron.job where jobname=p_jobname; get diagnostics n=row_count; return n>0; end $$;
create function cron.schedule(p_jobname text,p_schedule text,p_command text) returns bigint language plpgsql as $$
declare n bigint; begin insert into cron.job(jobname,schedule,command) values(p_jobname,p_schedule,p_command)
on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid into n; return n; end $$;

create table public.wa_pendente (
  id text primary key,
  user_id uuid not null,
  payload jsonb,
  telefone text,
  lanc jsonb,
  criado_em timestamptz not null default now()
);
create table public.tx (
  user_id uuid not null,
  id text not null,
  data jsonb,
  updated_at timestamptz not null,
  primary key (user_id, id)
);
