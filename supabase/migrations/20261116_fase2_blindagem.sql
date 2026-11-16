-- Fase 2 (blindagem). Idempotente: pode rodar mais de uma vez sem efeito colateral. NÃO mexe em dados de usuários.
-- Antes de aplicar: publicar cotacoes e whatsapp-webhook desta fase (as duas funcionam também sem esta migração:
-- sem a tabela, o fallback de cotação usa só a memória da função; sem o job extra, o resumo vai só na chamada das 11:00).

begin;

-- 1) último preço conhecido de cada ativo da B3 (fallback da função cotacoes quando o Yahoo falha ou não responde).
--    Dado público de mercado, sem user_id. Só o servidor lê e escreve (RLS ligada e sem policies).
create table if not exists public.cotacao_cache (
  ticker text primary key check (ticker ~ '^[A-Z0-9]{4,7}$'),
  v jsonb not null,                       -- {p, ant, var, varPct, t, nome, div} como a função devolve
  salvo_em timestamptz not null default now()
);
alter table public.cotacao_cache enable row level security;
revoke all on public.cotacao_cache from anon, authenticated, public;

commit;

-- 2) resumo semanal do WhatsApp em lotes: a função envia com 1,5 s entre um disparo e outro e para em ~100 s
--    (limite da função e timeout de 120 s do pg_cron). Quem não coube recebe na próxima chamada da MESMA segunda.
--    O job das 11:00 UTC (8h de Brasília) continua igual; este job extra chama de novo às 11:15, 11:30 e 11:45 UTC.
--    Sem risco de duplicar: a função reserva a semana em wa_vinculo.resumo_enviado antes de cada envio e pula quem já recebeu.
do $$
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron ausente: job extra do resumo não criado';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'granaviva-wa-resumo-semanal-lote') then
    perform cron.unschedule('granaviva-wa-resumo-semanal-lote');
  end if;
  perform cron.schedule('granaviva-wa-resumo-semanal-lote', '15,30,45 11 * * 1', $cmd$
    select net.http_post(
      url:='https://hydvhpfpvhopetqqjido.supabase.co/functions/v1/whatsapp-webhook?acao=resumo-semanal',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'gv_cron_secret')),
      body:='{}'::jsonb,
      timeout_milliseconds:=120000);
  $cmd$);
end $$;
