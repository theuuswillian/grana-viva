# Auditoria de reconciliação: produção x GitHub

Data da inspeção: 18/11/2026  
Projeto Supabase: `hydvhpfpvhopetqqjido`  
Branch de trabalho: `auditoria/reconciliacao-producao-2026-11-18`  
Referência de código implantado: consulta somente leitura das Edge Functions ativas e do catálogo PostgreSQL.

## Regras de segurança desta auditoria

- Nenhum deploy, merge ou alteração direta no Supabase foi realizado.
- As fontes das Edge Functions foram lidas do ambiente ativo; secrets/valores secretos não foram exportados.
- Esta branch é uma proposta de reconciliação e não deve ser publicada em produção sem revisão e aprovação.
- Migrations históricas não devem ser apagadas nem reescritas; novas migrations aditivas documentam o estado esperado.

## Edge Functions ativas em produção

Todas as dez funções abaixo estavam ativas na consulta. O campo `verify_jwt` estava `false` em todas; isso não é, isoladamente, prova de falha: as funções precisam validar manualmente o token de usuário, a assinatura do provedor ou o segredo de cron, conforme o endpoint. A revisão deve confirmar cada caminho de entrada.

| Função | Versão implantada | Estado |
|---|---:|---|
| minha-conta | 21 | ACTIVE |
| assistente | 23 | ACTIVE |
| ler-comprovante | 33 | ACTIVE |
| whatsapp-webhook | 17 | ACTIVE |
| pagamento-webhook | 21 | ACTIVE |
| whatsapp-vincular | 12 | ACTIVE |
| cotacoes | 16 | ACTIVE |
| alertas-push | 41 | ACTIVE |
| radar-precos | 12 | ACTIVE |
| assinatura | 22 | ACTIVE |

As entradas de `radar-precos` e `assinatura` coincidiram byte a byte com a branch de referência consultada. As outras oito entradas divergiram do código versionado. Portanto, não se deve fazer deploy dessas funções a partir do GitHub até revisar as diferenças e identificar quais alterações são posteriores, anteriores ou específicas da produção.

## Arquivos auxiliares recuperados

Os seguintes arquivos estavam presentes nas fontes ativas e ausentes do repositório; foram adicionados a esta branch a partir das fontes lidas em produção:

- `supabase/functions/minha-conta/tabelas.ts`
- `supabase/functions/_shared/wa-idem.ts`
- `supabase/functions/_shared/arquivo.ts`
- `supabase/functions/cotacoes/cache.ts`
- `supabase/functions/alertas-push/alvos.ts`

Esses arquivos foram versionados sem modificar as funções implantadas.

## Schema PostgreSQL confirmado

### `public.cotacao_cache`

- `ticker text NOT NULL PRIMARY KEY`
- `v jsonb NOT NULL`
- `salvo_em timestamptz NOT NULL DEFAULT now()`
- CHECK: ticker entre 4 e 7 caracteres alfanuméricos maiúsculos.
- RLS habilitada, sem policies.
- Sem privilégios para `anon` e `authenticated`; `service_role` tem acesso.

### `public.radar_disparos`

- `user_id uuid NOT NULL`, FK para `auth.users(id) ON DELETE CASCADE`
- `chave text NOT NULL`, CHECK de tamanho máximo 120.
- `em timestamptz NOT NULL DEFAULT now()`
- `preco numeric`
- PK composta: `(user_id, chave)`.
- RLS habilitada; policy SELECT somente para o próprio usuário.
- `authenticated` tem SELECT, não tem INSERT/UPDATE/DELETE; `service_role` tem acesso.

### `public.settings`

- Coluna `whatsapp_resumo_semanal boolean NOT NULL DEFAULT true` presente em produção, mas ausente nas migrations versionadas anteriores.

A migration `20261118_z_reconciliar_schema_producao.sql` representa esses objetos de forma aditiva e idempotente. Ela não apaga dados, não altera cron jobs e não deve ser aplicada em produção antes de revisão e reconciliação formal do histórico de migrations.

## Cron jobs observados

Foram observados jobs ativos de alertas, limpeza de mensagens e resumo semanal. Há mais de um agendamento para o endpoint de resumo semanal; isso requer revisão operacional separada antes de alterar ou remover qualquer job. Esta branch não modifica cron.

## Próximas verificações obrigatórias

1. Revisar diferenças das oito Edge Functions divergentes antes de qualquer deploy.
2. Comparar todas as versões dos módulos `_shared` usados por funções diferentes; uma mesma rota compartilhada pode ter sido implantada em momentos distintos.
3. Identificar o motivo do histórico de migrations ausente e definir um baseline controlado, sem marcar migrations como aplicadas sem comparar o schema inteiro.
4. Confirmar manualmente no painel Supabase os secrets de ambiente e revogar credenciais Pluggy no painel do fornecedor, se ainda existirem.
5. Rodar os testes da migration em PostgreSQL descartável; só depois abrir PR para revisão.

## Alterações feitas nesta branch

- Recuperação de cinco arquivos auxiliares ativos.
- Migration aditiva para as tabelas de cache/radar e preferência semanal.
- Fixture e assertions para validar RLS, grants, constraints, default e isolamento por usuário.
- Nenhuma alteração em produção.
