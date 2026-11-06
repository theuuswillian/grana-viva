-- v10.136: lançar pelo WhatsApp (Cloud API da Meta). Só o servidor lê e escreve (RLS sem policies).
create table if not exists public.wa_vinculo (
  user_id uuid primary key references auth.users(id) on delete cascade,
  telefone text not null unique,          -- só dígitos, com DDI (ex: 5561999999999)
  criado_em timestamptz not null default now()
);
create table if not exists public.wa_codigo (
  codigo text primary key,                -- 6 dígitos, vale 15 minutos
  user_id uuid not null references auth.users(id) on delete cascade,
  expira timestamptz not null
);
create index if not exists wa_codigo_user on public.wa_codigo(user_id);
create table if not exists public.wa_pendente (
  id text primary key,                    -- lançamento lido, esperando o botão "Salvar"
  user_id uuid not null references auth.users(id) on delete cascade,
  telefone text not null,
  lanc jsonb not null,
  criado_em timestamptz not null default now()
);
create index if not exists wa_pendente_user on public.wa_pendente(user_id);
create table if not exists public.wa_msg (  -- ids de mensagens já processadas (a Meta pode reenviar)
  id text primary key,
  criado_em timestamptz not null default now()
);
create table if not exists public.wa_saida_teste ( -- só enquanto não houver token da Meta: guarda o que seria enviado
  id bigint generated always as identity primary key,
  telefone text not null,
  corpo jsonb not null,
  criado_em timestamptz not null default now()
);
alter table public.wa_vinculo enable row level security;
alter table public.wa_codigo enable row level security;
alter table public.wa_pendente enable row level security;
alter table public.wa_msg enable row level security;
alter table public.wa_saida_teste enable row level security;
revoke all on public.wa_vinculo, public.wa_codigo, public.wa_pendente, public.wa_msg, public.wa_saida_teste from anon, authenticated;
