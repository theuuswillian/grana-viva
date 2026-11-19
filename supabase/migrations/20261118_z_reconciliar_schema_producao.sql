-- Reconcilia o schema versionado com objetos já confirmados no Supabase de produção (18/11/2026).
-- Idempotente: cria as tabelas ausentes, preserva as existentes e aplica permissões/RLS esperadas.
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
