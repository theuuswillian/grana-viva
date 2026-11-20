-- Impede duas requisições concorrentes de reservar checkouts pendentes diferentes para a mesma conta.
-- A reserva é liberada quando a intenção passa para "criado"; nesse ponto o preapproval já foi persistido
-- e as próximas tentativas devem localizá-lo pela API do Mercado Pago.
begin;

create unique index if not exists pagamento_checkout_uma_intencao_pendente_por_usuario
  on public.pagamento_checkout_intencoes(user_id)
  where status = 'pendente';

commit;
