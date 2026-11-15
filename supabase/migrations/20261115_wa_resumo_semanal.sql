-- v10.165: resumo semanal pelo WhatsApp (toda segunda às 8h de Brasília = 11:00 UTC; o Brasil não tem horário de verão
-- desde 2019 — se voltar a ter, trocar para '0 10 * * 1' no verão). Idempotente: pode rodar mais de uma vez.
-- Grátis em todos os planos. Quem liga/desliga é a função whatsapp-vincular {acao:'resumo'}; quem envia é a whatsapp-webhook
-- (?acao=resumo-semanal, conferindo x-cron-secret = secret CRON_SECRET, o mesmo do alertas-push, lido do Vault 'gv_cron_secret').

alter table public.wa_vinculo add column if not exists resumo_semanal boolean not null default false;
-- segunda-feira (Brasília) da última semana já enviada: a função reserva a semana ANTES de enviar (nunca manda duas vezes)
alter table public.wa_vinculo add column if not exists resumo_enviado date;
create index if not exists wa_vinculo_resumo on public.wa_vinculo(resumo_semanal) where resumo_semanal;

-- RLS: wa_vinculo continua só do servidor (RLS ligada e SEM policies; anon/authenticated sem privilégio nenhum).
-- O app nunca lê esta tabela direto: usa a função whatsapp-vincular com o login da pessoa (auth.uid() conferido lá).
alter table public.wa_vinculo enable row level security;
revoke all on public.wa_vinculo from anon, authenticated;

-- job do pg_cron (recria se já existir, para rodar de novo sem duplicar)
do $$
begin
  if exists (select 1 from cron.job where jobname = 'granaviva-wa-resumo-semanal') then
    perform cron.unschedule('granaviva-wa-resumo-semanal');
  end if;
  perform cron.schedule('granaviva-wa-resumo-semanal', '0 11 * * 1', $cmd$
    select net.http_post(
      url:='https://hydvhpfpvhopetqqjido.supabase.co/functions/v1/whatsapp-webhook?acao=resumo-semanal',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'gv_cron_secret')),
      body:='{}'::jsonb,
      timeout_milliseconds:=120000);
  $cmd$);
end $$;
