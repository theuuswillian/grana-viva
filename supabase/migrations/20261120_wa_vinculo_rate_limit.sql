-- Protege a vinculação do WhatsApp contra tentativa exaustiva de códigos.
-- Limite: 10 tentativas por telefone a cada janela de 15 minutos.
begin;

create table if not exists public.wa_codigo_tentativa (
  telefone text primary key check (telefone ~ '^[0-9]{8,15}$'),
  janela_inicio timestamptz not null default now(),
  tentativas smallint not null default 0 check (tentativas between 0 and 10),
  bloqueado_ate timestamptz,
  atualizado_em timestamptz not null default now()
);

create index if not exists wa_codigo_tentativa_atualizado
  on public.wa_codigo_tentativa (atualizado_em);

alter table public.wa_codigo_tentativa enable row level security;
revoke all on public.wa_codigo_tentativa from public, anon, authenticated;

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
  v_janela timestamptz;
  v_tentativas smallint;
  v_bloqueado timestamptz;
begin
  if p_telefone is null or p_telefone !~ '^[0-9]{8,15}$'
     or p_codigo is null or p_codigo !~ '^[0-9]{6}$' then
    raise exception 'Telefone ou código WhatsApp inválido';
  end if;

  -- Serializa por telefone antes de consultar/incrementar o contador.
  perform pg_advisory_xact_lock(hashtextextended('wa-vinculo:telefone:' || p_telefone, 0));

  insert into public.wa_codigo_tentativa(telefone)
  values (p_telefone)
  on conflict (telefone) do nothing;

  select janela_inicio, tentativas, bloqueado_ate
    into v_janela, v_tentativas, v_bloqueado
    from public.wa_codigo_tentativa
   where telefone = p_telefone
   for update;

  if v_bloqueado is not null and v_bloqueado > now() then
    return 'limite_tentativas_silencioso';
  end if;

  if v_janela <= now() - interval '15 minutes' then
    update public.wa_codigo_tentativa
       set janela_inicio = now(), tentativas = 0, bloqueado_ate = null,
           atualizado_em = now()
     where telefone = p_telefone;
    v_tentativas := 0;
  end if;

  if v_tentativas >= 10 then
    update public.wa_codigo_tentativa
       set bloqueado_ate = now() + interval '15 minutes',
           atualizado_em = now()
     where telefone = p_telefone;
    return 'limite_tentativas';
  end if;

  update public.wa_codigo_tentativa
     set tentativas = tentativas + 1, atualizado_em = now()
   where telefone = p_telefone;

  -- A validação e o consumo continuam atômicos, agora protegidos por limite.
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

  -- Sucesso limpa o contador para permitir uma futura vinculação legítima.
  delete from public.wa_codigo_tentativa where telefone = p_telefone;

  return 'vinculado';
end;
$$;

revoke all on function public.wa_vincula_codigo(text, text) from public, anon, authenticated;
grant execute on function public.wa_vincula_codigo(text, text) to service_role;

-- Remove contadores antigos para limitar a retenção de telefones que tentaram vincular.
select cron.schedule(
  'granaviva-wa-codigo-tentativas-limpeza',
  '25 4 * * *',
  $job$delete from public.wa_codigo_tentativa where atualizado_em < now() - interval '30 days'$job$
);

commit;
