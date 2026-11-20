-- Endurece o search_path das funções SECURITY DEFINER históricas.
-- pg_catalog vem antes de public para impedir shadowing de objetos internos.
begin;

alter function public.ia_conta(uuid, date, integer)
  set search_path to pg_catalog, public;
alter function public.rl_conta(uuid, text, integer, integer)
  set search_path to pg_catalog, public;
alter function public.assinatura_conta_nova()
  set search_path to pg_catalog, public;
alter function public.ia_conta_k(uuid, date, text, integer)
  set search_path to pg_catalog, public;
alter function public.ia_consume_cota_mes(uuid, date, text, integer)
  set search_path to pg_catalog, public;
alter function public.wa_salva_pendente_com_cota(uuid, text, date, integer, jsonb)
  set search_path to pg_catalog, public;

commit;
