# Monitoramento das funções (v10.93)

As Edge Functions gravam uma linha em `public.erros_fn` quando algo falha em:
`pluggy-sync`, `pluggy-webhook`, `pagamento-webhook`, `assinatura` e `minha-conta`.

- Colunas: `ts`, `funcao`, `etapa` (ação ou evento), `codigo` (ex.: 500, 23505), `mensagem` (até 300 caracteres).
- **Sem dados pessoais**: `_shared/erros.ts` troca e-mails, ids (uuid), tokens/JWT, sequências longas e números de 6+ dígitos
  por marcadores (`<email>`, `<id>`, `<oculto>`, `<jwt>`, `<longo>`, `<n>`) antes de gravar.
- Ninguém do app lê ou escreve (RLS ligada, sem policies, sem grants para `anon`/`authenticated`). Só as funções (service role)
  e você pelo SQL Editor do Supabase.
- Guarda 30 dias: o job `granaviva-erros-fn-limpeza` (pg_cron, 06:30 UTC) apaga o resto.
- Registrar nunca derruba a função (falha ao gravar é ignorada).

## Ver os últimos erros (SQL Editor do Supabase)

```sql
-- últimos 50
select ts at time zone 'America/Sao_Paulo' as quando, funcao, etapa, codigo, mensagem
from public.erros_fn order by ts desc limit 50;

-- resumo das últimas 24 h por função e etapa
select funcao, etapa, codigo, count(*) as vezes, max(ts) at time zone 'America/Sao_Paulo' as ultima
from public.erros_fn where ts > now() - interval '24 hours'
group by 1, 2, 3 order by vezes desc;
```

## Segredos

Tudo vem de `Deno.env.get` (secrets das funções) ou do Supabase Vault:
`SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `PLUGGY_ENC_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`,
`VAPID_PRIVATE_KEY`/`VAPID_PUBLIC_KEY`. O job diário do `alertas-push` lê o `x-cron-secret` do Vault (`gv_cron_secret`).
O app (navegador) só tem a chave publicável (`sb_publishable_…`), protegida pelas regras RLS.

## Alarme por push (v10.126)

- Job `granaviva-saude` (pg_cron, a cada 30 min) chama `alertas-push` com `{so:'saude'}`.
- Se `erros_fn` tiver falha nos últimos 35 min em `pagamento-webhook` (inclusive assinatura inválida), `assinatura`, `auth` ou `minha-conta`,
  manda um push para o dono (`GV_ADMIN_UID`, padrão = conta Fundadora). Repete no máximo uma vez a cada 6 h por função+etapa (`push_log`).
- O app avisa falha de cadastro/login do lado do servidor (ex.: SMTP) com `{so:'erro-auth'}`, sem e-mail. Grava em `erros_fn` com função `auth`.
  Limite global de 30 por hora.
