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

Na primeira comparação, oito entradas divergiam. Após a reconciliação desta branch, `whatsapp-vincular` e `cotacoes` também passaram a coincidir byte a byte com produção; agora há quatro correspondências exatas (`whatsapp-vincular`, `cotacoes`, `radar-precos` e `assinatura`). As seis diferenças restantes são intencionais e descritas abaixo. Ainda assim, não se deve fazer deploy em lote: cada função precisa ser validada contra as migrations e secrets correspondentes.

### Diferenças funcionais identificadas

- **minha-conta:** a produção tinha confirmação do cancelamento no Mercado Pago antes da exclusão e remoção de envios simulados pelo telefone. Essas proteções foram portadas, junto com a lista centralizada de tabelas; a branch também verifica erros na limpeza dos envios simulados antes de prosseguir.
- **assistente:** produção ainda usava o contador diário antigo; a branch contém consumo mensal atômico de cotas. Manter a implementação versionada, mas só publicar junto das migrations correspondentes.
- **ler-comprovante:** produção tinha validação de tamanho real, MIME e bytes mágicos (5 MB), além de validação estrita do JSON da IA. Essas proteções foram portadas; o consumo mensal atômico da branch foi preservado.
- **whatsapp-webhook:** as proteções de produção (resumo semanal em lotes, reserva idempotente, validação de arquivos/áudio e consultas de saldo/fatura) foram integradas à branch. A gravação do botão de confirmação continua usando a RPC atômica da branch, que valida a cota, grava as transações e remove o pendente na mesma transação.
- **pagamento-webhook:** a branch contém recuperação de reservas de webhook abandonadas por lease condicional; produção ainda usa a versão anterior. Preservar a implementação versionada e seus testes.
- **whatsapp-vincular:** a implementação da produção que grava a preferência em `settings.whatsapp_resumo_semanal`, com fallback para a coluna antiga, foi portada e agora coincide byte a byte.
- **cotacoes:** o cache persistente e o fallback para último preço conhecido foram portados junto do helper `cache.ts`; a entrada agora coincide byte a byte com produção.
- **valida-ia:** a produção tinha sanitização de entrada para prompts, aviso explícito contra prompt injection e validação estrita do schema JSON. O helper completo foi portado e ganhou testes.
- **alertas-push:** a branch contém avisos de DARF que não estão na função implantada; a produção usa o helper `alvos.ts`. A implementação mais nova da branch foi preservada; não substituir pela versão implantada sem revisão.
- **radar-precos** e **assinatura:** correspondência exata.

Os módulos compartilhados `planos.js`, `erros.ts`, `seguro.ts`, `valida-ia.ts`, `ia-whatsapp.ts` e `resumo-semanal.ts` coincidem com as fontes de produção após a reconciliação. `cota.ts` diverge porque a branch implementa consumo mensal atômico, enquanto produção ainda usa incremento diário legado. `mercadopago.ts` inclui a função de confirmação de cancelamento recuperada da produção.

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

Foram observados jobs ativos:
- `granaviva-alertas-push`: diariamente às 12:00 UTC.
- `granaviva-alertas-precos`: dias úteis às 21:30 UTC.
- `granaviva-wa-msg-limpeza`: diariamente às 03:40 UTC.
- `granaviva-wa-resumo-semanal`: segunda às 11:00 UTC.
- `granaviva-wa-resumo-semanal-lote`: segunda às 11:15, 11:30 e 11:45 UTC.

Os dois jobs do resumo semanal parecem formar o envio inicial e as tentativas em lotes posteriores. Não foram alterados; a lógica de reserva por usuário/semana precisa ser testada junto do fluxo de falhas antes de qualquer ajuste.

## Lints de segurança e performance do Supabase

A consulta dos advisors confirmou:

- Dez tabelas têm RLS habilitada sem policies. A verificação de grants confirmou que `anon` e `authenticated` não têm SELECT/INSERT/UPDATE/DELETE nessas tabelas; `service_role` tem acesso. Isso é intencional para tabelas de backend (`erros_fn`, `pagamento_eventos`, `push_log`, `rl_uso`, tabelas WhatsApp e cache).
- A extensão `pg_net` está no schema `public`. É um aviso de organização/segurança; não mover sem revisar dependências do pg_cron e executar em janela controlada.
- A proteção do Supabase Auth contra senhas vazadas está desativada. Recomenda-se habilitar no painel Auth.
- `backup.copias` não tem chave primária.
- Três índices foram sinalizados como nunca utilizados: `wa_msg_criado`, `assinaturas_prov_idx` e `wa_vinculo_resumo`. Não remover automaticamente: `wa_msg_criado` está associado à rotina de limpeza e os outros precisam de análise de consultas/uso.
- O advisor de saúde não retornou alertas.

Nenhuma dessas configurações foi alterada durante esta auditoria.

## Próximas verificações obrigatórias

1. Revisar diferenças das oito Edge Functions divergentes antes de qualquer deploy.
2. Comparar todas as versões dos módulos `_shared` usados por funções diferentes; uma mesma rota compartilhada pode ter sido implantada em momentos distintos.
3. Identificar o motivo do histórico de migrations ausente e definir um baseline controlado, sem marcar migrations como aplicadas sem comparar o schema inteiro.
4. Confirmar manualmente no painel Supabase os secrets de ambiente e revogar credenciais Pluggy no painel do fornecedor, se ainda existirem.
5. Rodar os testes da migration em PostgreSQL descartável; só depois abrir PR para revisão.

## Alterações feitas nesta branch

- Recuperação de cinco arquivos auxiliares ativos.
- Reconciliação do fluxo WhatsApp: resumo semanal, idempotência, validação de mídia e gravação atômica de pendentes.
- Recuperação de sanitização de prompts e validação estrita do JSON da IA, com testes.
- Testes da lista de tabelas de exclusão/exportação da conta.
- Reintrodução da confirmação de cancelamento do Mercado Pago e limpeza dos registros WhatsApp na exclusão de conta.
- Restauração da validação de arquivos e dos fallbacks de cotação, mantendo o consumo mensal atômico de cotas.
- Preferência de resumo semanal movida para `settings`, com fallback compatível.
- Migration aditiva para as tabelas de cache/radar e preferência semanal.
- Fixture e assertions para validar RLS, grants, constraints, default e isolamento por usuário.
- Nenhuma alteração em produção.


## Auditoria complementar do frontend (19/11/2026)

### Arquitetura e distribuição

- `app.js` tem 975.944 bytes (aprox. 0,93 MiB) e concentra o aplicativo em um único arquivo. Isso aumenta o custo de manutenção e torna regressões mais difíceis de isolar.
- `app.min.js` tem o mesmo tamanho e o mesmo blob Git de `app.js` nesta branch; portanto, atualmente não representa uma versão minificada independente.
- `index.html` carrega `app.js?v=10.167`, e o precache do service worker também lista `app.js`. Já os comentários de `bump.sh` e `sw.js` descrevem o fluxo como se `app.min.js` fosse o arquivo servido. A documentação do processo de build está inconsistente com o HTML efetivamente publicado.
- O `bump.sh` tenta gerar `app.min.js` com esbuild, mas a página não o carrega no estado inspecionado. A próxima melhoria deve alinhar, em uma única alteração testada, o arquivo gerado, a referência do HTML, o precache/offline e o smoke test. Não trocar o arquivo servido sem validar atualização do service worker e abertura offline.

### Cobertura de testes do produto

- Há smoke test com jsdom para renderização, lançamento rápido, importação local, faturas e alguns fluxos de interface.
- Há testes de planos, cotas, webhook, validação da IA, arquivos, Mercado Pago e schema PostgreSQL.
- Não foi encontrada uma suíte dedicada e isolada para as regras centrais de finanças do frontend (cálculo de saldo por conta, transferências, cartão/fatura/parcelas, recorrências, patrimônio, preço médio, dividendos/renda passiva e agregações por período). O smoke test cobre caminhos de interface, mas não substitui testes unitários de regras financeiras.
- Prioridade recomendada: extrair funções puras de cálculo para módulos pequenos e testáveis, sem reescrever a interface inteira. Criar casos de regressão com valores em centavos, virada de mês/ano, datas em fuso de Brasília, estornos, transferências entre contas, compras parceladas e lançamentos previstos versus pagos.

### Backlog priorizado

1. **Alta — consistência financeira:** mapear e extrair os cálculos de saldo, cartão, parcelas, patrimônio e renda passiva; cobrir com testes unitários antes de alterar os resultados exibidos.
2. **Alta — pipeline de assets:** alinhar `app.js`/`app.min.js`, `index.html`, `sw.js`, `bump.sh` e os testes de fumaça; validar atualização e modo offline.
3. **Média — modularização gradual:** separar domínio financeiro, persistência/sincronização, interface e integrações em módulos independentes; manter contratos e comportamento existentes.
4. **Média — testes de integração:** acrescentar testes de sincronização Supabase, isolamento multiusuário e concorrência nos fluxos que alteram lançamentos e faturas.
5. **Média — acessibilidade e UX:** complementar smoke test com navegação por teclado, foco, leitores de tela, telas pequenas e estados de erro/rede.

Esses itens são achados e recomendações; nenhum cálculo financeiro do frontend foi alterado nesta etapa, para evitar mudar resultados de usuários sem uma matriz de comportamento esperada e testes de regressão.


### Retirada de referências legadas da cópia local (19/11/2026)

A revisão complementar encontrou um risco que não era coberto pela migration isoladamente: se o navegador mantivesse uma cópia antiga e o snapshot de sincronização estivesse ausente, a rotina de mesclagem podia tratar registros antigos como dados locais novos e enviá-los novamente à nuvem.

Correções adicionadas nesta branch:

- O saneamento da cópia local descarta lançamentos com o identificador legado da integração e posições de investimento marcadas como importadas por ela, antes de qualquer mesclagem/envio.
- O saneamento remove referências antigas aninhadas em `tx.par`, remove a lista antiga de identificadores em `cfg` e preserva lançamentos manuais e importações locais.
- O código de conciliação de extratos passa a usar os marcadores genéricos `importado`/`impId`, sem depender do identificador antigo.
- A migration também limpa as chaves legadas dentro de `settings.data.cfg`, preservando as demais preferências.
- O smoke test cobre a cópia local sem snapshot, registros manuais, posição manual e limpeza das referências aninhadas; os testes SQL verificam a limpeza de `settings.cfg` e a preservação de configurações não relacionadas.

A migration continua preservando dados manuais, extratos CSV/OFX e cadastros de contas/cartões. A validação CI da alteração precisa concluir antes da revisão final.


### Correção do saldo livre e faturas de cartão (19/11/2026)

O cálculo anterior usava apenas o estado resumido do cartão e deixava de descontar faturas já fechadas, mesmo quando ainda havia saldo pendente. Também não consolidava corretamente múltiplas faturas em atraso.

A função agora percorre as faturas do cartão e desconta o saldo restante de todas as faturas abertas, fechadas, vencidas ou parciais; faturas pagas, excluídas e parcelas futuras ficam fora do cálculo. O saldo das contas não é alterado.

O smoke test cobre duas faturas antigas (uma parcialmente paga e outra vencida), a fatura do ciclo atual e a exclusão de parcelas futuras. Resultado esperado e validado: saldo bancário de R$ 2.000,00, obrigações correntes de R$ 1.100,00 e saldo livre de R$ 900,00.

### Validação após as correções (19/11/2026)

No commit `38d3048`, os dois workflows passaram:
- validação de remoção e limpeza dos dados legados;
- smoke tests jsdom, incluindo cache local e saldo livre;
- testes unitários Deno;
- migrations PostgreSQL de remoção, cotas, idempotência e reconciliação de schema;
- verificação de tipos de todas as Edge Functions.


### Correção do yield on cost (19/11/2026)

Foi identificado que `rpPorCota` usava a quantidade atual como fallback sempre que o histórico de cotas na data do provento resultava em zero. Isso podia atribuir dividendos recebidos antes da primeira compra (ou quando a posição estava zerada) à posição atual, inflando o yield on cost e a projeção.

Agora:
- quando há histórico de compras/vendas/posição inicial, a quantidade efetiva na data é obrigatória; zero cotas significa zero provento atribuível à posição;
- a quantidade atual só é usada no modo de compatibilidade de posições manuais sem histórico de operações;
- o yield on cost exclui proventos anteriores à entrada na carteira.

O smoke test cobre provento anterior à compra, provento durante a posição, posição manual sem histórico e o total recebido considerado no yield on cost. Os workflows completos passaram no commit `49bcf29`.


A mesma revisão encontrou que a reconstrução de cotas históricas percorria as operações na ordem em que foram cadastradas, não pela data efetiva. Uma compra retroativa adicionada depois de uma venda podia alterar a quantidade histórica usada no cálculo dos proventos. A rotina agora ordena as operações cronologicamente, seguindo a mesma regra do cálculo da posição atual; o smoke test cobre esse cenário.

Os testes de yield on cost também confirmam que posições manuais sem histórico continuam usando a quantidade atual como fallback, enquanto carteiras com histórico respeitam a quantidade efetivamente detida em cada data.

Os workflows completos passaram no commit `6dcf85b`.
