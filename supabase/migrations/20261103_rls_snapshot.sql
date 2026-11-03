-- Retrato do RLS ATIVO no Supabase (projeto hydvhpfpvhopetqqjido), schema public.
-- Tirado em 2026-11-03 por leitura (SELECT em pg_policies, pg_class e information_schema).
-- Não é uma mudança: reproduz o estado que já está em produção nessa data.
-- Idempotente: pode rodar de novo sem efeito colateral (enable RLS + drop policy if exists/create policy).
-- Nenhuma tabela tem FORCE ROW LEVEL SECURITY ligado.
-- Tabelas com RLS ligado e SEM policy (cliente não acessa; só service_role):
--   erros_fn, pagamento_eventos, pluggy_cfg, push_log, rl_uso

begin;

-- 1) RLS ligado em todas as tabelas do public
alter table public.assinaturas enable row level security;
alter table public.bancos enable row level security;
alter table public.cartoes enable row level security;
alter table public.erros_fn enable row level security;
alter table public.fiis enable row level security;
alter table public.ia_uso enable row level security;
alter table public.metas enable row level security;
alter table public.pagamento_eventos enable row level security;
alter table public.pluggy_acc enable row level security;
alter table public.pluggy_cfg enable row level security;
alter table public.pluggy_tx enable row level security;
alter table public.push_log enable row level security;
alter table public.push_subs enable row level security;
alter table public.rl_uso enable row level security;
alter table public.settings enable row level security;
alter table public.tx enable row level security;

-- 2) Policies

-- assinaturas
drop policy if exists assinaturas_le_propria on public.assinaturas;
create policy assinaturas_le_propria on public.assinaturas
  as permissive
  for select
  to authenticated
  using ((( SELECT auth.uid() AS uid) = user_id));

-- bancos
drop policy if exists own_bancos on public.bancos;
create policy own_bancos on public.bancos
  as permissive
  for all
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));

-- cartoes
drop policy if exists own_cartoes on public.cartoes;
create policy own_cartoes on public.cartoes
  as permissive
  for all
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));

-- fiis
drop policy if exists own_fiis on public.fiis;
create policy own_fiis on public.fiis
  as permissive
  for all
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));

-- ia_uso
drop policy if exists ia_uso_own on public.ia_uso;
create policy ia_uso_own on public.ia_uso
  as permissive
  for all
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));

-- metas
drop policy if exists own_metas on public.metas;
create policy own_metas on public.metas
  as permissive
  for all
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));

-- pluggy_acc
drop policy if exists pluggy_acc_sel on public.pluggy_acc;
create policy pluggy_acc_sel on public.pluggy_acc
  as permissive
  for select
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

-- pluggy_tx
drop policy if exists pluggy_tx_sel on public.pluggy_tx;
create policy pluggy_tx_sel on public.pluggy_tx
  as permissive
  for select
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

-- push_subs
drop policy if exists "push_subs dono altera" on public.push_subs;
create policy "push_subs dono altera" on public.push_subs
  as permissive
  for update
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "push_subs dono apaga" on public.push_subs;
create policy "push_subs dono apaga" on public.push_subs
  as permissive
  for delete
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "push_subs dono grava" on public.push_subs;
create policy "push_subs dono grava" on public.push_subs
  as permissive
  for insert
  to authenticated
  with check ((user_id = ( SELECT auth.uid() AS uid)));
drop policy if exists "push_subs dono le" on public.push_subs;
create policy "push_subs dono le" on public.push_subs
  as permissive
  for select
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)));

-- settings
drop policy if exists own_settings on public.settings;
create policy own_settings on public.settings
  as permissive
  for all
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));

-- tx
drop policy if exists own_tx on public.tx;
create policy own_tx on public.tx
  as permissive
  for all
  to authenticated
  using ((user_id = ( SELECT auth.uid() AS uid)))
  with check ((user_id = ( SELECT auth.uid() AS uid)));

commit;

-- 3) Grants observados em 2026-11-03 (só documentação, NÃO executados aqui):
--    anon: nenhum privilégio em tabela do public.
--    anon e authenticated: EXECUTE em public.assinaturas_toca() (função de trigger).
--    authenticated:
--      grant SELECT on public.assinaturas to authenticated;
--      grant SELECT, INSERT, UPDATE, DELETE on public.bancos to authenticated;
--      grant SELECT, INSERT, UPDATE, DELETE on public.cartoes to authenticated;
--      grant SELECT, INSERT, UPDATE, DELETE on public.fiis to authenticated;
--      grant SELECT, INSERT, UPDATE, DELETE on public.metas to authenticated;
--      grant SELECT on public.pluggy_acc to authenticated;
--      grant SELECT on public.pluggy_tx to authenticated;
--      grant SELECT, INSERT, UPDATE, DELETE on public.push_subs to authenticated;
--      grant SELECT, INSERT, UPDATE, DELETE on public.settings to authenticated;
--      grant SELECT, INSERT, UPDATE, DELETE on public.tx to authenticated;
--    ia_uso tem policy ALL para authenticated, mas authenticated não tem grant na tabela.
