# Monitoramento das funções (v10.167)

Este documento descreve o registro de erros implementado no código versionado. A existência de uma função ou rotina no código não prova, por si só, que ela esteja implantada ou agendada em produção.

## Registro de erros

O helper `supabase/functions/_shared/erros.ts` grava eventos em `public.erros_fn` com:

- `ts`: horário do registro;
- `funcao`: função que registrou o erro;
- `etapa`: operação/evento;
- `codigo`: código de erro, quando disponível;
- `mensagem`: mensagem sanitizada, limitada a 300 caracteres.

A sanitização remove e-mails, UUIDs, JWTs, tokens/segredos e sequências longas. A falha ao registrar não deve interromper a operação original.

### Funções que usam o helper no código desta branch

- `minha-conta`
- `whatsapp-webhook`
- `pagamento-webhook`
- `radar-precos`
- `assinatura`

As demais funções podem ter logs próprios; esta lista se refere especificamente ao uso de `registraErro`.

## Consultar os registros

No SQL Editor do Supabase:

```sql
-- últimos 50 registros
select ts at time zone 'America/Sao_Paulo' as quando, funcao, etapa, codigo, mensagem
from public.erros_fn
order by ts desc
limit 50;

-- resumo das últimas 24 horas
select funcao, etapa, codigo, count(*) as vezes,
       max(ts) at time zone 'America/Sao_Paulo' as ultima
from public.erros_fn
where ts > now() - interval '24 hours'
group by 1, 2, 3
order by vezes desc;
```

A tabela é destinada ao uso do servidor. Na auditoria de produção, RLS estava habilitada sem policies e sem privilégios de leitura/escrita para `anon` e `authenticated`; o acesso administrativo deve ser feito pelo SQL Editor ou por serviço autorizado.

## Retenção e rotinas agendadas

Na inspeção de produção de 18/11/2026 foram observados estes jobs:

- `granaviva-alertas-push`: diariamente às 12:00 UTC;
- `granaviva-alertas-precos`: dias úteis às 21:30 UTC;
- `granaviva-wa-msg-limpeza`: diariamente às 03:40 UTC;
- `granaviva-wa-resumo-semanal`: segunda-feira às 11:00 UTC;
- `granaviva-wa-resumo-semanal-lote`: segunda-feira às 11:15, 11:30 e 11:45 UTC.

A rotina `granaviva-erros-fn-limpeza` e o job `granaviva-saude` citados em versões anteriores deste documento não apareceram na relação de jobs ativos consultada nessa auditoria. Portanto, não se deve presumir que a retenção automática de 30 dias ou o alerta de saúde estejam ativos. Confirmar no painel/SQL do Supabase antes de depender dessas rotinas.

## Segredos e configuração

As Edge Functions dependem de variáveis de ambiente e/ou segredos do Supabase Vault. Entre as integrações ainda presentes no código estão Mercado Pago, Supabase, provedor de IA, WhatsApp e notificações push.

Não registrar valores secretos em logs, documentação, issues ou no repositório. Conferir nomes e presença dos secrets diretamente no painel do Supabase; esta auditoria não exportou nem alterou valores.

## Procedimento operacional

1. Verificar os erros recentes em `public.erros_fn`.
2. Correlacionar `funcao`, `etapa` e `codigo` com os logs da Edge Function.
3. Confirmar se os cron jobs esperados estão ativos e com última execução bem-sucedida.
4. Investigar aumento de falhas antes de reiniciar jobs ou fazer novo deploy.
5. Não executar migrations, alterar secrets ou implantar funções diretamente em produção sem revisão e autorização.
