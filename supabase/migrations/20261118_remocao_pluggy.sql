-- Retirada definitiva do Pluggy.
-- Remove somente dados identificados como originados da integração; preserva lançamentos manuais,
-- importações CSV e os cadastros de contas/cartões criados pelo usuário.
begin;

-- Lançamentos importados diretamente do Pluggy.
delete from public.tx
where coalesce(data, '{}'::jsonb) ? 'pluggyId';

-- Posições de investimento criadas/vinculadas à sincronização Pluggy.
delete from public.fiis
where coalesce(data, '{}'::jsonb) ? 'pluggyInv';

-- Remove os saldos automáticos Pluggy de contas e cartões mapeados, sem excluir os cadastros.
with mapas as (
  select s.user_id, e.value
  from public.settings s
  cross join lateral jsonb_each_text(coalesce(s.data->'pluggyMap','{}'::jsonb)) e
)
update public.bancos b
set data = coalesce(b.data, '{}'::jsonb) - array['saldo','saldoData','saldoFecha']
where exists (
  select 1 from mapas m
  where m.user_id = b.user_id and m.value = 'b:' || b.id::text
);

with mapas as (
  select s.user_id, e.value
  from public.settings s
  cross join lateral jsonb_each_text(coalesce(s.data->'pluggyMap','{}'::jsonb)) e
)
update public.cartoes c
set data = coalesce(c.data, '{}'::jsonb) - array['bancoUsado','bancoData']
where exists (
  select 1 from mapas m
  where m.user_id = c.user_id and m.value = 'c:' || c.id::text
);

-- Apaga referências locais da integração sem mexer no restante das preferências.
update public.settings
set data = coalesce(data, '{}'::jsonb) - array[
  'pluggyOn','pluggyMap','pluggyIgn','pluggyDesde','pluggyVisto','pluggyInvDia'
]
where coalesce(data, '{}'::jsonb) ?| array[
  'pluggyOn','pluggyMap','pluggyIgn','pluggyDesde','pluggyVisto','pluggyInvDia'
];

-- A cópia sincronizada do app guarda parte das preferências dentro de data.cfg.
-- Limpa também a lista antiga de identificadores nesse nível, preservando as demais configurações.
update public.settings
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{cfg}',
  data->'cfg' - array['pluggyOn','pluggyMap','pluggyIgn','pluggyDesde','pluggyVisto','pluggyInvDia'],
  true
)
where jsonb_typeof(data->'cfg') = 'object'
  and data->'cfg' ?| array['pluggyOn','pluggyMap','pluggyIgn','pluggyDesde','pluggyVisto','pluggyInvDia'];

drop table if exists public.pluggy_tx;
drop table if exists public.pluggy_acc;
drop table if exists public.pluggy_cfg;

commit;
