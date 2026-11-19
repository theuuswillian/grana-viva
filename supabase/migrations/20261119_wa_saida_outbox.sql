-- Outbox com semântica at-most-once para evitar respostas duplicadas após crash.
-- Resultados ambíguos não são reenviados automaticamente: exigem reconciliação operacional.
begin;

create table if not exists public.wa_saida (
  chave text primary key,
  telefone text not null,
  corpo jsonb not null,
  status text not null default 'enviando',
  lease_until timestamptz,
  tentativas integer not null default 1,
  provider_msg_id text,
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint wa_saida_status_check check (status in ('enviando','enviada','falhou_segura','falhou','incerta')),
  constraint wa_saida_tentativas_check check (tentativas > 0)
);

alter table public.wa_saida enable row level security;
revoke all on public.wa_saida from public, anon, authenticated;
grant all on public.wa_saida to service_role;

create index if not exists wa_saida_status_lease
  on public.wa_saida(status, lease_until)
  where status in ('enviando','falhou_segura','incerta');

create or replace function public.wa_saida_reserva(
  p_chave text,
  p_telefone text,
  p_corpo jsonb,
  p_lease_seconds integer default 90
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_lease timestamptz;
  v_telefone text;
  v_corpo jsonb;
begin
  if coalesce(p_chave,'') = '' or length(p_chave) > 200
     or coalesce(p_telefone,'') = '' or length(p_telefone) > 100
     or p_corpo is null or jsonb_typeof(p_corpo) <> 'object'
     or p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Parâmetros inválidos para outbox WhatsApp';
  end if;

  insert into public.wa_saida(chave, telefone, corpo, status, lease_until, tentativas)
  values (p_chave, p_telefone, p_corpo, 'enviando', now() + make_interval(secs => p_lease_seconds), 1)
  on conflict (chave) do nothing;

  if found then return 'nova'; end if;

  select status, lease_until, telefone, corpo
    into v_status, v_lease, v_telefone, v_corpo
    from public.wa_saida
   where chave = p_chave
   for update;

  if not found then raise exception 'Registro de outbox desapareceu'; end if;
  if v_telefone <> p_telefone then
    raise exception 'Chave de outbox reutilizada para outro destinatário';
  end if;

  if v_status = 'enviada' then return 'enviada'; end if;
  if v_status = 'incerta' then return 'incerta'; end if;
  if v_status = 'falhou' then return 'falhou'; end if;

  if v_status = 'enviando' then
    if v_lease > now() then return 'ocupada'; end if;
    update public.wa_saida
       set status = 'incerta', lease_until = null,
           ultimo_erro = 'Lease expirou sem confirmação do provedor',
           atualizado_em = now()
     where chave = p_chave;
    return 'incerta';
  end if;

  if v_status = 'falhou_segura' then
    update public.wa_saida
       set status = 'enviando',
           corpo = p_corpo,
           lease_until = now() + make_interval(secs => p_lease_seconds),
           tentativas = tentativas + 1,
           ultimo_erro = null,
           atualizado_em = now()
     where chave = p_chave;
    return 'retomada';
  end if;

  raise exception 'Estado de outbox desconhecido: %', v_status;
end;
$$;

create or replace function public.wa_saida_finaliza(
  p_chave text,
  p_status text,
  p_provider_msg_id text default null,
  p_erro text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(p_chave,'') = '' or p_status is null or p_status not in ('enviada','falhou_segura','falhou','incerta') then
    raise exception 'Parâmetros inválidos para finalizar outbox WhatsApp';
  end if;

  update public.wa_saida
     set status = p_status,
         lease_until = null,
         provider_msg_id = coalesce(p_provider_msg_id, provider_msg_id),
         ultimo_erro = case when p_status = 'enviada' then null else left(coalesce(p_erro,'falha sem detalhe'),1000) end,
         atualizado_em = now()
   where chave = p_chave and status = 'enviando';

  return found;
end;
$$;

revoke all on function public.wa_saida_reserva(text, text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.wa_saida_finaliza(text, text, text, text) from public, anon, authenticated;
grant execute on function public.wa_saida_reserva(text, text, jsonb, integer) to service_role;
grant execute on function public.wa_saida_finaliza(text, text, text, text) to service_role;

commit;
