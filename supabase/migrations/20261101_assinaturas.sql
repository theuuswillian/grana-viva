-- v10.82 (Lote 2): planos e assinaturas.
-- assinaturas: uma linha por pessoa. A pessoa só LÊ a própria linha; quem escreve é o servidor (service role):
--   o gatilho de conta nova (teste Pro de 14 dias) e a função pagamento-webhook (única que ativa plano pago).
-- pagamento_eventos: eventos de pagamento já recebidos (para não processar o mesmo evento duas vezes). Só o servidor vê.
begin;

create table if not exists public.assinaturas (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plano text not null default 'gratis' check (plano in ('gratis', 'plus', 'pro', 'pro_anual')),
  status text not null default 'ativo' check (status in ('ativo', 'cancelado', 'inadimplente', 'teste', 'fundador')),
  periodo_fim timestamptz,
  provedor text check (provedor is null or provedor in ('mercadopago')),
  provedor_assinatura_id text,
  provedor_cliente_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists assinaturas_prov_idx on public.assinaturas (provedor, provedor_assinatura_id);
alter table public.assinaturas enable row level security;
revoke all on public.assinaturas from anon, authenticated, public;
grant select on public.assinaturas to authenticated;
drop policy if exists assinaturas_le_propria on public.assinaturas;
create policy assinaturas_le_propria on public.assinaturas for select to authenticated using ((select auth.uid()) = user_id);
-- sem policy de insert/update/delete: pela API REST ninguém além do service role escreve aqui.

create or replace function public.assinaturas_toca() returns trigger
language plpgsql set search_path = public as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists assinaturas_toca on public.assinaturas;
create trigger assinaturas_toca before update on public.assinaturas for each row execute function public.assinaturas_toca();

create table if not exists public.pagamento_eventos (
  id text primary key,                 -- provedor:chave do evento
  provedor text not null,
  topico text,
  recurso_id text,
  user_id uuid,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  resultado text
);
alter table public.pagamento_eventos enable row level security;
revoke all on public.pagamento_eventos from anon, authenticated, public;

-- todas as contas que já existem hoje: Pro "fundador", sem data de fim (nada do que já usam fica bloqueado)
insert into public.assinaturas (user_id, plano, status, periodo_fim)
select id, 'pro', 'fundador', null from auth.users
on conflict (user_id) do update set plano = 'pro', status = 'fundador', periodo_fim = null;

-- conta nova: Pro em teste por 14 dias; depois vira Grátis sozinha (o app e as funções leem periodo_fim)
create or replace function public.assinatura_conta_nova() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.assinaturas (user_id, plano, status, periodo_fim)
  values (new.id, 'pro', 'teste', now() + interval '14 days')
  on conflict (user_id) do nothing;
  return new;
end $$;
revoke all on function public.assinatura_conta_nova() from public, anon, authenticated;
drop trigger if exists assinatura_conta_nova on auth.users;
create trigger assinatura_conta_nova after insert on auth.users for each row execute function public.assinatura_conta_nova();

commit;
