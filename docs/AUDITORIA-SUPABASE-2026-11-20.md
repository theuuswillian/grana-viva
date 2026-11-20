# Auditoria read-only do Supabase — 20/11/2026

## Escopo e segurança

Verificação em modo somente leitura no projeto principal `hydvhpfpvhopetqqjido` (PostgreSQL 17). Foram consultados histórico de migrations, catálogos do PostgreSQL, policies, grants, triggers, índices, objetos do Vault e jobs do pg_cron. Não foram lidos valores financeiros individuais nem segredos. Nenhuma migration foi aplicada, tabela alterada ou função publicada.

## Estado observado

- 30 arquivos SQL versionados em `supabase/migrations/`.
- 18 migrations registradas no histórico remoto.
- 12 arquivos locais não aparecem no histórico remoto.
- Não foi encontrada migration registrada remotamente sem arquivo correspondente no repositório.

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

**Interpretação:** a diferença é de histórico, não necessariamente de schema. A reconciliação abaixo mostra que a maior parte dos efeitos já está presente no banco; não há evidência para simplesmente reaplicar os 12 arquivos.

## Reconciliação individual dos 12 arquivos

| Arquivo | Evidência observada na produção | Classificação / ação segura |
|---|---|---|
| `20261028_pluggy_cfg` | `pluggy_cfg` ausente; consistente com a retirada posterior da integração | Obsoleta após remoção do Pluggy. Não registrar/reaplicar isoladamente |
| `20261029_ia_uso` | `ia_uso` existe; possui coluna `k` e PK `(user_id,dia,k)`; função `ia_conta` existe | Efeito aplicado e evoluído por migração posterior, mas sem registro histórico |
| `20261029_pluggy_tx` | `pluggy_tx` e `pluggy_acc` ausentes | Obsoleta após remoção do Pluggy. Não reaplicar |
| `20261029_rate_limit` | `rl_uso` e função `rl_conta(uuid,text,integer,integer)` existem | Efeito aplicado, sem registro histórico |
| `20261101_assinaturas` | Tabela, índice, policy de SELECT próprio, trigger de atualização e trigger em `auth.users` existem; schema também contém `provedor_versao` | Efeito aplicado e posteriormente evoluído, sem registro histórico |
| `20261101_cron_secret_vault` | Secret `gv_cron_secret` existe no Vault; job `granaviva-alertas-push` está ativo e consulta o Vault | Efeito operacional presente. Não ler nem copiar o valor do segredo |
| `20261101_erros_fn` | Tabela e índices existem; job `granaviva-erros-fn-limpeza` ativo | Efeito aplicado, sem registro histórico |
| `20261101_ia_uso_tipo` | Coluna `k`, PK composta, `ia_conta` e `ia_conta_k` existem | Efeito aplicado e confirmado por catálogo |
| `20261103_rls_snapshot` | O próprio arquivo declara ser retrato histórico do RLS de 03/11, não uma mudança incremental | Não tratar como migration pendente. Reaplicá-lo poderia substituir policies criadas depois |
| `20261106_whatsapp` | Tabelas-base do WhatsApp existem; tabelas internas consultadas não concedem privilégios a `anon` nem `authenticated` | Efeito aplicado e posteriormente evoluído |
| `20261115_wa_resumo_semanal` | Colunas `resumo_semanal` e `resumo_enviado`, índice parcial e job semanal ativo às 11:00 UTC de segunda | Efeito aplicado, sem registro histórico |
| `20261118_remocao_pluggy` | Tabelas Pluggy ausentes; nenhum marcador `pluggyId` em `tx`, `pluggyInv` em `fiis`, nem chaves Pluggy em `settings`/ `settings.cfg` | Efeito principal da limpeza presente. Não reaplicar: contém DELETE/UPDATE e DROP TABLE |

### Ressalva sobre a limpeza do Pluggy

A checagem agregada encontrou uma linha em `bancos` com os campos genéricos `saldoData`/`saldoFecha`. Esses nomes, isoladamente, não provam origem Pluggy. Como o mapeamento de origem já foi removido, não é seguro inferir que esse registro seja legado nem apagá-lo. Os marcadores específicos da integração consultados retornaram zero. Preservar esse dado até existir evidência inequívoca de origem.

### Resultado da reconciliação

- **8 arquivos:** efeitos centrais presentes no schema/infraestrutura.
- **2 arquivos Pluggy de criação:** obsoletos porque as tabelas foram removidas.
- **1 arquivo:** snapshot histórico de RLS, não uma migration incremental.
- **1 arquivo de remoção Pluggy:** efeitos principais observados; não reaplicar por conter DML/DDL destrutivo.
- **0 migrations aplicadas durante esta auditoria.**
- **Nenhuma migration deve ser adicionada ao histórico remoto apenas para fazer a contagem coincidir.** O registro retroativo exige decisão específica, backup e comparação do conteúdo completo; em particular, não usar `migration repair` em lote.

## RLS e privilégios

As tabelas de domínio com acesso do usuário têm policies que restringem operações por `auth.uid() = user_id`:

- `bancos`, `cartoes`, `fiis`, `metas`, `settings`, `tx`;
- `ia_uso` (policy existe, mas não há grants de tabela para `anon` ou `authenticated`);
- `assinaturas` (leitura da própria assinatura);
- `push_subs` (policies separadas de SELECT/INSERT/UPDATE/DELETE);
- `radar_disparos` (leitura própria).

As tabelas internas sem policies continuam sem privilégios de tabela para `anon` e `authenticated`, incluindo `erros_fn`, `pagamento_eventos`, `rl_uso`, `wa_codigo`, `wa_msg`, `wa_pendente`, `wa_saida_teste` e `wa_vinculo`. A ausência de policy, nesse contexto, não significa exposição: os grants não permitem acesso pelo Data API aos papéis públicos/autenticados. Não criar policies genéricas para silenciar o advisor.

## Findings de segurança

| Finding | Nível | Avaliação / ação |
|---|---|---|
| `pg_net` instalado no schema `public` | WARN | Verificar dependências, versão e schema recomendado antes de mover a extensão |
| Proteção contra senhas vazadas desativada | WARN | Habilitar em Supabase Auth/Authentication e testar cadastro, troca e recuperação de senha |
| Tabelas internas com RLS sem policies | INFO | Grants confirmados sem acesso de anon/authenticated; manter internas |
| Tabelas de usuário com policies por `auth.uid()` | — | Estrutura coerente; incluir em testes automatizados de isolamento entre usuários |

A proteção contra senhas vazadas é uma configuração do Auth que não foi alterada nesta auditoria. Deve ser ativada no painel do Supabase e validada em homologação.

## Findings de performance

- `backup.copias` não possui chave primária. Confirmar finalidade e padrão de leitura/escrita antes de alterar.
- Sete índices aparecem como não utilizados no período observado. Não removê-los automaticamente: podem servir a jobs pouco frequentes, recuperação, filas ou picos de carga. Avaliar query plans e janela de observação maior.

## Próximas ações seguras

1. Manter os 12 arquivos não registrados sem replay automático.
2. Preparar uma baseline formal do schema e um inventário de migrations com estado `aplicada_sem_registro`, `obsoleta` ou `snapshot`, sem falsificar histórico.
3. Revisar a migration de remoção Pluggy e os dados genéricos de saldo com cuidado, sem apagar registros ambíguos.
4. Validar policies com dois usuários de teste, além de `anon`, `authenticated` e `service_role`, em ambiente isolado.
5. Investigar warnings de Auth e `pg_net` separadamente.
6. Só propor correções de schema em PR pequena, com teste PostgreSQL e rollback documentado.
7. Não aplicar nada na produção sem PR aprovada, backup, janela e autorização explícita.

## Resultado

O schema ativo contém os principais efeitos dos arquivos ausentes do histórico, com evolução posterior em tabelas de assinatura, IA e WhatsApp. O problema principal é rastreabilidade do histórico de migrations, não uma lista de 12 alterações comprovadamente pendentes. O risco maior seria reaplicar arquivos antigos sem critério: isso pode recriar integração removida, substituir policies atuais ou executar limpeza destrutiva sobre dados do usuário.


## Rechecagem de advisors e grants — 20/11/2026, 16:40 UTC

Consulta read-only aos advisors de segurança, performance e saúde, seguida de inspeção dos ACLs das tabelas sinalizadas. Nenhum DDL ou configuração foi alterado.

### Segurança — RLS sem policies

O advisor reportou 13 tabelas com RLS habilitado e nenhuma policy: `cotacao_cache`, `erros_fn`, `pagamento_checkout_intencoes`, `pagamento_eventos`, `push_log`, `rl_uso`, `wa_codigo`, `wa_codigo_tentativa`, `wa_msg`, `wa_pendente`, `wa_saida`, `wa_saida_teste` e `wa_vinculo`.

A inspeção de `pg_class.relacl` confirmou, para as 13 tabelas, privilégios concedidos somente a `postgres` e `service_role`; não há grants explícitos para `anon` ou `authenticated`. Portanto, o finding INFO não indica exposição via Data API neste estado. Não criar policies artificiais apenas para remover o aviso.

### Outros findings de segurança

- `pg_net` permanece instalado em `public` (WARN). Não mover automaticamente: primeiro mapear chamadas, dependências e schema suportado para evitar quebrar jobs e triggers.
- Leaked Password Protection do Supabase Auth está desativado (WARN). A ativação é uma configuração de Auth, não uma migration SQL; requer decisão operacional, teste de cadastro/alteração/recuperação e verificação de impacto nos usuários.
- Saúde: nenhum finding reportado pelos advisors nesta consulta.

### Performance

- `backup.copias` não tem primary key e está no schema `backup`, fora do inventário de tabelas públicas. ACL consultado mostra somente `postgres`; RLS está desabilitado. Não é acessível por grants diretos a `anon`/ `authenticated` segundo o estado observado. Confirmar consumidores e retenção antes de adicionar chave.
- Sete índices foram marcados como não utilizados. Manter por enquanto: a janela de estatísticas pode não capturar jobs semanais, rotinas de recuperação ou consultas raras.

### Conclusão operacional

Os findings foram classificados sem alterações em produção. Próximas ações são: habilitar proteção contra senhas vazadas em janela controlada; mapear dependências de `pg_net`; revisar `backup.copias` e índices com plano de execução e período de observação maior. Não foram aplicadas migrations, grants, policies, alterações de Auth ou publicação de funções.


### Dependências concretas de `pg_net`

A inspeção read-only confirmou `pg_net 0.20.4` instalado em `public` e sete jobs ativos em `cron.job` que chamam `net.http_post`:

| Job | Agenda | Destino |
|---|---|---|
| `granaviva-alertas-push` | diariamente 12:00 UTC | `alertas-push` |
| `granaviva-alertas-precos` | dias úteis 21:30 UTC | `alertas-push?so=precos` |
| `granaviva-saude` | a cada 30 minutos | `alertas-push?so=saude` |
| `granaviva-radar-b3` | dias úteis, a cada 15 min entre 13:00 e 20:59 UTC | `radar-precos?so=b3` |
| `granaviva-radar-b3-fim` | dias úteis 21:00 e 21:15 UTC | `radar-precos?so=b3` |
| `granaviva-radar-cripto` | a cada hora no minuto 7 | `radar-precos?so=cripto` |
| `granaviva-wa-resumo-semanal` | segunda-feira 11:00 UTC | `whatsapp-webhook?acao=resumo-semanal` |
| `granaviva-wa-resumo-semanal-lote` | segunda-feira 11:15, 11:30 e 11:45 UTC | `whatsapp-webhook?acao=resumo-semanal` |

A consulta retornou oito jobs consumidores (incluindo o lote semanal); todos dependem de `net.http_post`. **Não mover a extensão nem renomear o schema** até planejar e testar a atualização coordenada de todos esses jobs. O segredo usado nos headers vem do Vault; seu valor não foi lido.
