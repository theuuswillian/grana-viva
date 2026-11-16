-- Fase 1 (16/11/2026): fim da conexão bancária automática (Pluggy) e preferência do resumo semanal do WhatsApp em settings.
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- NÃO mexe em tx, contas (bancos/cartoes), fiis, metas nem em usuários: os lançamentos que já vieram do banco continuam
-- na tabela tx (origem 'banco') e o app mostra o selo "Importado".
-- Antes de aplicar: publicar as funções desta fase (minha-conta e alertas-push já não leem as tabelas pluggy_*).

begin;

-- 1) jobs do pg_cron ligados ao Pluggy (se existirem): desagenda pelo nome ou pelo comando
do $$
declare j record;
begin
  if to_regclass('cron.job') is not null then
    for j in select jobid, jobname from cron.job
             where coalesce(jobname, '') ilike '%pluggy%' or coalesce(command, '') ilike '%pluggy%'
    loop
      perform cron.unschedule(j.jobid);
      raise notice 'pg_cron: job % (%) desagendado', j.jobid, j.jobname;
    end loop;
  end if;
end $$;

-- 2) tabelas auxiliares da conexão (credenciais cifradas, cópia de contas e de transações recebidas do Pluggy).
--    As policies (pluggy_tx_sel, pluggy_acc_sel) e os índices saem junto com as tabelas.
drop table if exists public.pluggy_tx, public.pluggy_acc, public.pluggy_cfg;

-- 3) preferência do resumo semanal do WhatsApp na tabela de configurações por usuário (public.settings: uma linha por
--    user_id, RLS ligada com a policy own_settings FOR ALL usando auth.uid() = user_id, ver 20261103_rls_snapshot.sql).
--    Padrão ligado. O app grava a configuração com upsert de (user_id, data, updated_at), que não toca nesta coluna.
--    Quem lê e grava: whatsapp-vincular (status/resumo) e whatsapp-webhook (envio de segunda), com a service role.
alter table public.settings add column if not exists whatsapp_resumo_semanal boolean not null default true;
comment on column public.settings.whatsapp_resumo_semanal is
  'Resumo semanal pelo WhatsApp (segunda 8h de Brasília). Fonte da verdade desde a Fase 1; só vale para quem ligou o WhatsApp (wa_vinculo).';

-- 4) wa_vinculo.resumo_semanal (20261115_wa_resumo_semanal.sql) deixa de ser a fonte da verdade. A coluna fica por enquanto
--    para as funções antigas continuarem funcionando até a publicação das novas; pode ser removida numa limpeza futura.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'wa_vinculo' and column_name = 'resumo_semanal') then
    execute $c$comment on column public.wa_vinculo.resumo_semanal is
      'OBSOLETA desde a Fase 1: use public.settings.whatsapp_resumo_semanal. Lida só como recuo pelas funções.'$c$;
  end if;
end $$;

commit;
