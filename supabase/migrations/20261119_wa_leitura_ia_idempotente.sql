-- Conta cada wamid uma única vez na cota diária de leitura da IA.
-- A data é a data local de recebimento da mensagem, preservada nos retries.
begin;

alter table public.wa_msg
  add column if not exists ia_dia date,
  add column if not exists ia_contada boolean not null default false;

create or replace function public.wa_conta_leitura_ia(
  p_uid uuid,
  p_msg_id text,
  p_dia date,
  p_lim integer
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_dia date;
  v_contada boolean;
  v_n integer;
begin
  if p_uid is null or coalesce(p_msg_id,'') = '' or length(p_msg_id) > 200
     or p_dia is null or p_lim is null or p_lim < 1 then
    raise exception 'Parâmetros inválidos para contabilizar leitura IA WhatsApp';
  end if;

  select ia_dia, ia_contada
    into v_dia, v_contada
    from public.wa_msg
   where id = p_msg_id
   for update;

  if not found then
    raise exception 'Mensagem WhatsApp não reservada';
  end if;

  -- Retry da mesma mensagem: devolve a decisão original sem incrementar novamente.
  if v_dia is not null then
    if v_dia <> p_dia then return false; end if;
    return v_contada;
  end if;

  insert into public.ia_uso(user_id, dia, k, n)
  values (p_uid, p_dia, 'leitura', 1)
  on conflict (user_id, dia, k)
  do update set n = public.ia_uso.n + 1
   where public.ia_uso.n < p_lim
  returning n into v_n;

  update public.wa_msg
     set ia_dia = p_dia,
         ia_contada = (v_n is not null)
   where id = p_msg_id;

  return v_n is not null;
end;
$$;

revoke all on function public.wa_conta_leitura_ia(uuid, text, date, integer) from public, anon, authenticated;
grant execute on function public.wa_conta_leitura_ia(uuid, text, date, integer) to service_role;

commit;
