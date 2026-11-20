-- Vinculação WhatsApp atômica: valida código, substitui vínculos e consome códigos em uma transação.
begin;

create or replace function public.wa_vincula_codigo(
  p_telefone text,
  p_codigo text
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_expira timestamptz;
begin
  if p_telefone is null or p_telefone !~ '^[0-9]{8,15}$'
     or p_codigo is null or p_codigo !~ '^[0-9]{6}$' then
    raise exception 'Telefone ou código WhatsApp inválido';
  end if;

  -- Ordem estável: telefone e depois usuário. Evita corrida entre códigos
  -- diferentes do mesmo usuário e entre usuários disputando o mesmo telefone.
  perform pg_advisory_xact_lock(hashtextextended('wa-vinculo:telefone:' || p_telefone, 0));

  select user_id into v_user_id
    from public.wa_codigo
   where codigo = p_codigo;

  if v_user_id is null then
    if exists (select 1 from public.wa_vinculo where telefone = p_telefone) then
      return 'ja_vinculado';
    end if;
    return 'codigo_expirado';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('wa-vinculo:usuario:' || v_user_id::text, 0));

  -- Revalida depois dos locks: outro request pode ter consumido o código.
  select user_id, expira
    into v_user_id, v_expira
    from public.wa_codigo
   where codigo = p_codigo
   for update;

  if not found or v_expira <= now() then
    if exists (select 1 from public.wa_vinculo where telefone = p_telefone) then
      return 'ja_vinculado';
    end if;
    return 'codigo_expirado';
  end if;

  delete from public.wa_vinculo
   where telefone = p_telefone or user_id = v_user_id;

  insert into public.wa_vinculo(user_id, telefone)
  values (v_user_id, p_telefone);

  delete from public.wa_codigo
   where user_id = v_user_id;

  return 'vinculado';
end;
$$;

revoke all on function public.wa_vincula_codigo(text, text) from public, anon, authenticated;
grant execute on function public.wa_vincula_codigo(text, text) to service_role;

commit;
