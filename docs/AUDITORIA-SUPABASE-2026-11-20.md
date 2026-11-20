# Auditoria read-only do Supabase — 20/11/2026

## Escopo e segurança

Esta verificação foi feita em modo somente leitura. Nenhuma migration foi aplicada, nenhuma tabela alterada, nenhuma função publicada e nenhum dado de usuário foi consultado. As consultas analisaram metadados, privilégios, políticas e histórico de migrations.

## Estado observado

- PostgreSQL 17.
- 18 migrations registradas no histórico remoto.
- 30 arquivos SQL versionados em `supabase/migrations/`.
- Nenhuma migration registrada remotamente sem arquivo correspondente no repositório.
- 12 arquivos SQL locais não aparecem no histórico remoto.

### Arquivos não registrados remotamente

```text
20261028_pluggy_cfg
20261029_ia_uso
20261029_pluggy_tx
20261029_rate_limit
20261101_assinaturas
20261101_cron_secret_vault
20261101_erros_fn
20261101_ia_uso_tipo
20261103_rls_snapshot
20261106_whatsapp
20261115_wa_resumo_semanal
20261118_remocao_pluggy
```

**Interpretação:** divergência de histórico, não prova de schema incorreto. Parte dessas alterações pode ter sido aplicada manualmente ou por um fluxo anterior. Não executar esses arquivos nem usar `migration repair` antes de comparar cada efeito com o schema real e com os dados existentes.

## RLS e privilégios

As tabelas de domínio com acesso do usuário têm policies que restringem leitura/escrita por `auth.uid() = user_id`:

- `bancos`, `cartoes`, `fiis`, `metas`, `settings`, `tx`;
- `ia_uso`;
- `assinaturas` (leitura da própria assinatura);
- `push_subs` (policies separadas de SELECT/INSERT/UPDATE/DELETE);
- `radar_disparos` (leitura própria).

O advisor sinaliza 13 tabelas com RLS habilitado e sem policies. A consulta de privilégios confirmou que essas tabelas não concedem SELECT/INSERT a `anon` nem a `authenticated`; o acesso observado é exclusivo de `service_role`:

```text
cotacao_cache
erros_fn
pagamento_checkout_intencoes
pagamento_eventos
push_log
rl_uso
wa_codigo
wa_codigo_tentativa
wa_msg
wa_pendente
wa_saida
wa_saida_teste
wa_vinculo
```

**Conclusão:** o aviso `rls_enabled_no_policy` é informativo para essas tabelas internas, não evidência de exposição pública. Não criar policies genéricas para eliminar o alerta. Preservar o isolamento por service role e auditar os caminhos das Edge Functions que as acessam.

## Findings de segurança

| Finding | Nível | Avaliação / ação |
|---|---|---|
| `pg_net` instalado no schema `public` | WARN | Verificar dependências, versão e schema recomendado antes de mover a extensão |
| Proteção contra senhas vazadas desativada | WARN | Habilitar em Supabase Auth/Authentication e testar cadastro, troca e recuperação de senha |
| 13 tabelas RLS sem policies | INFO | Grants confirmados sem acesso de anon/authenticated; manter sem policy enquanto forem internas |
| Tabelas de usuário com policies por `auth.uid()` | — | Estrutura coerente; incluir em testes automatizados de isolamento entre usuários |

A proteção contra senhas vazadas é uma configuração do Auth que não é gerenciada pelos comandos SQL desta auditoria. Deve ser ativada no painel do Supabase e validada em homologação.

## Findings de performance

- `backup.copias` não possui chave primária. Confirmar finalidade e padrão de leitura/escrita antes de alterar uma tabela de backup.
- Sete índices aparecem como não utilizados no período observado. Não removê-los automaticamente: podem servir a jobs pouco frequentes, recuperação, filas ou picos de carga. Avaliar query plans, cron jobs e janela de observação maior.

## Plano seguro de reconciliação

1. Capturar schema-only dump e inventário de constraints, índices, policies, grants, triggers, views e funções do projeto.
2. Para cada uma das 12 migrations não registradas, mapear DDL/DML e comparar com a produção; classificar como já aplicada, parcialmente aplicada, obsoleta ou pendente.
3. Revisar especialmente a migration de remoção do Pluggy: confirmar ausência de tabelas, colunas, funções, secrets e referências antigas sem apagar lançamentos manuais.
4. Criar baseline/registro reconciliado e fixtures de upgrade em PostgreSQL isolado.
5. Validar políticas com dois usuários de teste, além de anon/authenticated/service_role.
6. Só então propor migrations corretivas pequenas, transacionais e com rollback documentado.
7. Não aplicar nada na produção sem PR aprovada, backup, janela e autorização explícita.

## Resultado

A base apresenta uma separação coerente entre dados do usuário (RLS + `auth.uid()`) e tabelas internas acessadas por funções privilegiadas. O maior risco operacional encontrado é a divergência do histórico de migrations; os avisos de extensão e Auth precisam de tratamento controlado, não de correção automática.
