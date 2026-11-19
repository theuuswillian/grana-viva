-- Stubs de extensões para testar as migrations sem executar cron, HTTP ou acessar segredos reais.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create schema cron;
create table cron.job (
  jobid bigserial primary key,
  jobname text unique not null,
  schedule text not null,
  command text not null
);
create function cron.unschedule(p_jobname text) returns boolean
language plpgsql as $$
declare v_count integer;
begin
  delete from cron.job where jobname=p_jobname;
  get diagnostics v_count = row_count;
  return v_count > 0;
end $$;
create function cron.schedule(p_jobname text,p_schedule text,p_command text) returns bigint
language plpgsql as $$
declare v_id bigint;
begin
  insert into cron.job(jobname,schedule,command)
  values(p_jobname,p_schedule,p_command)
  on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command
  returning jobid into v_id;
  return v_id;
end $$;

create schema net;
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
returns bigint language sql as $$ select 1::bigint $$;

create schema vault;
create table vault.decrypted_secrets(name text primary key,decrypted_secret text not null);
insert into vault.decrypted_secrets values ('gv_cron_secret','fixture-only-not-a-real-secret');

create table public.wa_vinculo (
  user_id uuid primary key,
  telefone text,
  vinculado_em timestamptz default now()
);

-- Quota diária usada pelo webhook; a chave mantém um contador por usuário/dia/tipo.
create table public.ia_uso (
  user_id uuid not null,
  dia date not null,
  k text not null,
  n integer not null default 0,
  primary key (user_id, dia, k)
);


create table public.wa_codigo (
  codigo text primary key,
  user_id uuid not null,
  expira timestamptz not null
);
