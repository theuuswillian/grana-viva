-- Reconcilia o schema versionado com objetos já confirmados no Supabase de produção (18/11/2026).
-- Idempotente e conservadora: completa colunas auxiliares e constraints; não inventa chaves/dados
-- essenciais em tabelas parciais. Se faltar uma coluna-chave ou houver dados incompatíveis, aborta
-- com erro explícito em vez de declarar uma reconciliação incompleta.
-- Não altera dados financeiros nem agenda jobs/cron.
begin;

create table if not exists public.cotacao_cache (
  ticker text not null,
  v jsonb not null,
  salvo_em timestamptz not null default now(),
  constraint cotacao_cache_pkey primary key (ticker),
  constraint cotacao_cache_ticker_check check (ticker ~ '^[A-Z0-9]{4,7}$')
);

create table if not exists public.radar_disparos (
  user_id uuid not null,
  chave text not null,
  em timestamptz not null default now(),
  preco numeric,
  constraint radar_disparos_pkey primary key (user_id, chave),
  constraint radar_disparos_chave_check check (length(chave) <= 120),
  constraint radar_disparos_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade
);

-- Tabelas que já existiam podem estar parcialmente provisionadas. Completa apenas
-- colunas auxiliares seguras; ticker/v e user_id/chave são identidade/conteúdo essencial.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='cotacao_cache' and column_name='ticker')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='cotacao_cache' and column_name='v') then
    raise exception 'cotacao_cache parcial: colunas essenciais ticker e v precisam existir; nenhuma coluna/dado foi inventado';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='radar_disparos' and column_name='user_id')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='radar_disparos' and column_name='chave') then
    raise exception 'radar_disparos parcial: colunas essenciais user_id e chave precisam existir; nenhuma identidade foi inventada';
  end if;
end
$$;

alter table public.cotacao_cache
  add column if not exists salvo_em timestamptz not null default now();
alter table public.radar_disparos
  add column if not exists em timestamptz not null default now(),
  add column if not exists preco numeric;

-- Valida os dados existentes antes de acrescentar constraints. Falha fechada em caso
-- de duplicidade, NULL, ticker/chave inválidos ou referências órfãs.
do $$
begin
  if exists (select 1 from public.cotacao_cache where ticker is null or v is null or ticker !~ '^[A-Z0-9]{4,7}$')
     or exists (select ticker from public.cotacao_cache group by ticker having count(*) > 1) then
    raise exception 'cotacao_cache contém ticker/valor inválido ou ticker duplicado; reconciliação cancelada';
  end if;
  if exists (select 1 from public.radar_disparos where user_id is null or chave is null or length(chave) > 120)
     or exists (select 1 from public.radar_disparos group by user_id,chave having count(*) > 1) then
    raise exception 'radar_disparos contém chave inválida, identidade nula ou duplicada; reconciliação cancelada';
  end if;
  if exists (select 1 from public.radar_disparos r left join auth.users u on u.id=r.user_id where u.id is null) then
    raise exception 'radar_disparos contém user_id sem auth.users correspondente; reconciliação cancelada';
  end if;
end
$$;

alter table public.cotacao_cache alter column ticker set not null, alter column v set not null;
alter table public.radar_disparos alter column user_id set not null, alter column chave set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.cotacao_cache'::regclass and contype='p') then
    alter table public.cotacao_cache add constraint cotacao_cache_pkey primary key (ticker);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.cotacao_cache'::regclass and conname='cotacao_cache_ticker_check') then
    alter table public.cotacao_cache add constraint cotacao_cache_ticker_check check (ticker ~ '^[A-Z0-9]{4,7}$');
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.radar_disparos'::regclass and contype='p') then
    alter table public.radar_disparos add constraint radar_disparos_pkey primary key (user_id,chave);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.radar_disparos'::regclass and conname='radar_disparos_chave_check') then
    alter table public.radar_disparos add constraint radar_disparos_chave_check check (length(chave) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.radar_disparos'::regclass and contype='f' and confrelid='auth.users'::regclass) then
    alter table public.radar_disparos add constraint radar_disparos_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end
$$;

-- settings já existe nos ambientes atuais; esta coluna foi confirmada em produção.
alter table public.settings
  add column if not exists whatsapp_resumo_semanal boolean not null default true;

alter table public.cotacao_cache enable row level security;
alter table public.radar_disparos enable row level security;

-- Cache de cotações: somente Edge Functions com service_role.
revoke all on table public.cotacao_cache from public, anon, authenticated;
grant all on table public.cotacao_cache to service_role;

-- Radar: cliente autenticado pode apenas consultar os próprios disparos.
revoke all on table public.radar_disparos from public, anon, authenticated;
grant select on table public.radar_disparos to authenticated;
grant all on table public.radar_disparos to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'radar_disparos'
      and policyname = 'radar_disparos_select_own'
  ) then
    create policy radar_disparos_select_own
      on public.radar_disparos for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
end
$$;

commit;
