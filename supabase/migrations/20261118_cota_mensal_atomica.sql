-- v10.166: consumo mensal atômico das cotas de IA e salvamento WhatsApp.
-- A trava por usuário/recurso/mês serializa requisições concorrentes. A gravação da cota
-- e, no WhatsApp, do lançamento + consumo do pendente ocorre na mesma transação.
begin;

create or replace function public.ia_consume_cota_mes(
  p_uid uuid, p_dia date, p_k text, p_lim int
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_usado bigint;
  v_ini date;
begin
  if p_uid is null or p_dia is null or coalesce(p_k, '') = '' or p_lim is null or p_lim < 1 then
    raise exception 'Parâmetros inválidos para consumo de cota';
  end if;
  v_ini := date_trunc('month', p_dia)::date;
  perform pg_advisory_xact_lock(hashtext(p_uid::text), hashtext(p_k || ':' || v_ini::text));
  select coalesce(sum(n), 0) into v_usado
    from public.ia_uso
   where user_id = p_uid and k = p_k and dia >= v_ini and dia < (v_ini + interval '1 month')::date;
  if v_usado >= p_lim then return false; end if;
  insert into public.ia_uso(user_id, dia, k, n)
  values (p_uid, p_dia, p_k, 1)
  on conflict (user_id, dia, k) do update set n = public.ia_uso.n + 1;
  return true;
end $$;
revoke all on function public.ia_consume_cota_mes(uuid, date, text, int) from public, anon, authenticated;
grant execute on function public.ia_consume_cota_mes(uuid, date, text, int) to service_role;

-- Confere a cota, insere os lançamentos, contabiliza o uso e consome o pendente
-- em uma única transação. Se qualquer INSERT falhar, nada é apagado nem contado.
create or replace function public.wa_salva_pendente_com_cota(
  p_uid uuid, p_pendente_id text, p_dia date, p_lim int, p_linhas jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_usado bigint;
  v_ini date;
  v_pendente text;
  v_qtd int;
begin
  if p_uid is null or p_pendente_id is null or p_dia is null or p_lim is null or p_lim < 1
     or jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) < 1 then
    raise exception 'Parâmetros inválidos para salvar lançamento WhatsApp';
  end if;
  v_ini := date_trunc('month', p_dia)::date;
  perform pg_advisory_xact_lock(hashtext(p_uid::text), hashtext('whatsapp:' || v_ini::text));
  select coalesce(sum(n), 0) into v_usado
    from public.ia_uso
   where user_id = p_uid and k = 'whatsapp' and dia >= v_ini and dia < (v_ini + interval '1 month')::date;
  if v_usado >= p_lim then return 'limite'; end if;

  select id into v_pendente from public.wa_pendente
   where id = p_pendente_id and user_id = p_uid for update;
  if v_pendente is null then return 'pendente_ausente'; end if;

  insert into public.tx(user_id, id, data, updated_at)
  select p_uid, x.id, x.data, x.updated_at
    from jsonb_to_recordset(p_linhas) as x(id text, data jsonb, updated_at timestamptz);
  get diagnostics v_qtd = row_count;
  if v_qtd <> jsonb_array_length(p_linhas) then
    raise exception 'Quantidade de lançamentos gravados divergente';
  end if;

  insert into public.ia_uso(user_id, dia, k, n)
  values (p_uid, p_dia, 'whatsapp', 1)
  on conflict (user_id, dia, k) do update set n = public.ia_uso.n + 1;
  delete from public.wa_pendente where id = p_pendente_id and user_id = p_uid;
  return 'salvo';
end $$;
revoke all on function public.wa_salva_pendente_com_cota(uuid, text, date, int, jsonb) from public, anon, authenticated;
grant execute on function public.wa_salva_pendente_com_cota(uuid, text, date, int, jsonb) to service_role;

commit;
