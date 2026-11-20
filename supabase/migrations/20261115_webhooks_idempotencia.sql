-- v10.165: idempotência dos webhooks (pagamento-webhook e whatsapp-webhook). Idempotente: pode rodar de novo.
-- As duas funções já gravam o id do evento ANTES de processar numa tabela com chave primária (insert que falha com 23505 =
-- evento repetido, ignorado). Esta migração só garante que as tabelas e as chaves existem, fecha o acesso do cliente
-- e limpa o que não precisa ficar guardado para sempre.

-- Mercado Pago: id estável do aviso (mp:<tópico>:<data.id>:<id da notificação ou x-request-id>:<ação>)
create table if not exists public.pagamento_eventos (
  id text primary key,
  provedor text not null default 'mercadopago',
  topico text,
  recurso_id text,
  user_id uuid,
  resultado text,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz
);
alter table public.pagamento_eventos enable row level security;
revoke all on public.pagamento_eventos from anon, authenticated, public;

-- WhatsApp (Meta): id da mensagem (wamid...). A Meta reenvia quando a resposta demora.
create table if not exists public.wa_msg (
  id text primary key,
  criado_em timestamptz not null default now()
);
alter table public.wa_msg enable row level security;
revoke all on public.wa_msg from anon, authenticated, public;
create index if not exists wa_msg_criado on public.wa_msg(criado_em);

-- limpeza diária (03:40 UTC): a Meta reenvia por no máximo alguns dias; 30 dias de ids bastam com folga
do $$
begin
  if exists (select 1 from cron.job where jobname = 'granaviva-wa-msg-limpeza') then
    perform cron.unschedule('granaviva-wa-msg-limpeza');
  end if;
  perform cron.schedule('granaviva-wa-msg-limpeza', '40 3 * * *', $cmd$delete from public.wa_msg where criado_em < now() - interval '30 days'$cmd$);
end $$;
