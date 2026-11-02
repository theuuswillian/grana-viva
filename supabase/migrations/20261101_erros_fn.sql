-- v10.93: registro mínimo de erros das Edge Functions (pluggy-sync, pluggy-webhook, pagamento-webhook, assinatura, minha-conta).
-- Sem dados pessoais: função, etapa, código e mensagem curta já limpa pela função (_shared/erros.ts troca e-mails, ids, tokens e números).
-- Ninguém do app lê nem escreve (RLS ligada, sem policies, sem grants): só a service role (funções) e o dono pelo SQL.
-- Guarda 30 dias (limpeza diária pelo pg_cron). Consultas prontas em MONITORAMENTO.md.
begin;
create table if not exists public.erros_fn (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  funcao text not null check (length(funcao) <= 40),
  etapa text not null default '' check (length(etapa) <= 60),
  codigo text check (codigo is null or length(codigo) <= 40),
  mensagem text not null default '' check (length(mensagem) <= 300)
);
create index if not exists erros_fn_ts on public.erros_fn (ts desc);
create index if not exists erros_fn_funcao_ts on public.erros_fn (funcao, ts desc);
alter table public.erros_fn enable row level security;
revoke all on public.erros_fn from anon, authenticated, public;
commit;

select cron.unschedule(jobid) from cron.job where jobname = 'granaviva-erros-fn-limpeza';
select cron.schedule('granaviva-erros-fn-limpeza', '30 6 * * *', $$delete from public.erros_fn where ts < now() - interval '30 days'$$);
