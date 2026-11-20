# Plano de evolução do GranaViva

**Branch de trabalho:** `implementacao/plano-evolucao-2026-11-20`  
**Base inicial:** `main` em `c94e0f8e6bfeebc87495bc1720896a3b985efeab`  
**Regra de segurança:** nenhuma alteração direta em produção; todas as entregas passam por branch, testes e Pull Request.

## Objetivo do produto

Evoluir o GranaViva de um gestor financeiro pessoal para uma plataforma de inteligência financeira que conecte fluxo de caixa, orçamento, patrimônio, investimentos e construção de renda passiva, sem perder simplicidade, confiabilidade e transparência.

## Base funcional já existente — preservar e evoluir

O roadmap não parte de uma aplicação vazia. A auditoria do código identificou funcionalidades que já existem e devem ser reutilizadas, corrigidas e ampliadas:

- **Início:** resumo de receitas/despesas, saldo do período, saldo das contas, saldo livre, faturas, vencimentos, patrimônio líquido, renda passiva e barra de lançamento inteligente.
- **Gastos & Cartões:** extrato, categorias, orçamentos, faturas, parcelas, planejamento e importação de extratos.
- **Patrimônio:** carteira de FIIs, ações, ETFs, BDRs, renda fixa e cripto; operações de compra/venda/provento; preço médio, histórico, radar e alertas de cotação.
- **Patrimônio consolidado:** contas, investimentos, bens, passivos e dívidas.
- **Metas:** objetivos, aportes, fontes de recursos e projeções.
- **Importação:** CSV/OFX local, prévia, classificação, associação de conta/cartão e detecção de duplicidades.
- **Assistente:** cálculo local dos fatos financeiros, respostas baseadas nos dados do usuário e fallback sem IA.
- **Integrações:** WhatsApp, Mercado Pago, notificações, cotações e Edge Functions.

As fases abaixo significam **fechar lacunas e melhorar as jornadas existentes**, não duplicar telas ou reescrever regras que já estão funcionando. Toda alteração deverá primeiro localizar a regra de negócio atual e adicionar testes de regressão compatíveis.

## Princípios que não podem ser negociados

1. Integridade dos dados financeiros e preservação de lançamentos existentes.
2. Segurança por padrão: menor privilégio, RLS validado, segredos somente no backend e sem downgrade silencioso de criptografia.
3. Compatibilidade retroativa durante migrações e sincronização entre dispositivos.
4. Valores realizados sempre separados de estimativas, cenários e projeções.
5. Nenhuma alteração de produção sem testes, revisão e aprovação explícita.
6. Importações e automações devem ser idempotentes, auditáveis e reversíveis quando possível.
7. UX mobile-first, acessível e rápida; evitar adicionar telas sem resolver jornadas completas.

## Fase 0 — Fundamentos e segurança de entrega (em andamento)

- [x] Criar branch isolada de implementação.
- [x] Fazer o workflow full-stack executar em pushes da `main` e na branch de evolução.
- [x] Fazer o workflow full-stack executar em PRs direcionadas à `main`.
- [ ] Validar a execução completa do workflow na branch.
- [ ] Configurar proteção da `main` com PR obrigatório, checks obrigatórios e bloqueio de force-push/exclusão (depende das configurações administrativas do GitHub).
- [ ] Definir uma única fonte de verdade para versão do PWA e testar coerência HTML/service worker.
- [ ] Criar baseline de testes de regressão das jornadas críticas.
- [ ] Atualizar runbooks e documentação de produção.

## Fase 1 — Segurança, banco e confiabilidade operacional

- [x] Auditar RLS, policies e grants das tabelas públicas; confirmar policies por `auth.uid()` nas tabelas de usuário e ausência de grants `anon`/`authenticated` nas 13 tabelas internas sem policies. Ver [auditoria Supabase](AUDITORIA-SUPABASE-2026-11-20.md).
- [x] Tornar a criptografia local fail-closed: não gravar dados financeiros novos em texto puro quando Web Crypto/IndexedDB falhar; coberto pelo smoke test.
- [ ] Reconciliar migrations versionadas com schema e histórico reais do Supabase; 30 arquivos locais vs 18 registradas. Não marcar migrations manualmente nem aplicar arquivos antigos sem diff revisado.
- [ ] Revisar proteção contra senhas comprometidas e parâmetros de autenticação; habilitar proteção contra senhas vazadas no painel Supabase e validar em homologação.
- [ ] Avaliar a movimentação de `pg_net` para schema apropriado após verificar dependências e impacto.
- Homologar Mercado Pago ponta a ponta: checkout, webhook assinado, idempotência, renovação, cancelamento, inadimplência, reembolso e estados monotônicos.
- Adicionar observabilidade com correlação de request/evento, métricas de falha, fila e alertas sem registrar dados sensíveis.
- Atualizar documentação de cron jobs, Edge Functions, secrets e procedimentos de recuperação.

**Critério de aceite:** nenhum alerta crítico de segurança sem plano de mitigação; migrations reproduzíveis em banco vazio e em fixture de upgrade; fluxo de pagamento validado em sandbox sem ativação indevida de plano.

## Fase 2 — Qualidade de dados e importação

- Fluxo CSV/OFX em etapas: seleção, mapeamento de colunas, prévia, validação, detecção de duplicidade, confirmação e relatório.
- Chave de idempotência para cada transação importada e rastreio por lote.
- Sugestão de categoria baseada em histórico com confirmação explícita do usuário.
- Conciliação de saldo inicial/final e identificação de divergências.
- Desfazer importação por lote sem apagar transações editadas posteriormente.
- Testes para datas, moeda, sinais, estornos, transferências e arquivos grandes.

**Critério de aceite:** importar o mesmo arquivo duas vezes não duplica lançamentos; o usuário consegue revisar e desfazer o lote com segurança.

## Fase 3 — Dashboard financeiro unificado

A tela Início já mostra receitas, despesas, saldo do período, saldo livre, faturas, vencimentos, alertas, patrimônio e renda passiva. A evolução deve conectar esses blocos e tornar a leitura mais acionável:

- Unificar fluxo de caixa realizado e previsto, sem somar compras no cartão e pagamento da fatura duas vezes.
- Exibir tendências comparáveis em 3/6/12 meses e explicar variações relevantes.
- Conectar orçamento, contas fixas, parcelas futuras e projeção de saldo.
- Relacionar decisões de gastos às metas e à evolução do patrimônio.
- Permitir abrir a composição de cada indicador e chegar aos lançamentos de origem.
- Refinar estados vazios, acessibilidade, responsividade e performance mobile.

**Critério de aceite:** valores do dashboard reconciliam com lançamentos e contas; filtros de período não misturam competência e caixa; previsto e realizado ficam visualmente distintos.

## Fase 4 — Central de investimentos e renda passiva

A carteira já possui ativos por classe, operações de compra/venda/provento, histórico cronológico, preço médio, radar de preços, proventos mensais, projeção de curto prazo e Yield on Cost para FIIs, ações, ETFs e BDRs. O trabalho é ampliar a precisão e a cobertura:

- Revisar o livro de operações como fonte única para posição, custo e preço médio; testar eventos fora de ordem, bonificações, desdobramentos, amortizações e vendas parciais.
- Estender a visão de renda realizada e projetada à renda fixa, sem misturar estimativas de CDI com pagamentos efetivamente recebidos.
- Criar calendário de proventos e separar data-com, data de pagamento, valor anunciado e valor recebido quando a fonte fornecer esses campos.
- [x] Adicionar meta mensal de renda passiva, progresso no Início e em Investimentos, valor restante e edição sincronizada; progresso usa proventos realizados, sem misturar projeções.
- [x] Estimar capital-alvo e aporte mensal linear com base no yield realizado dos últimos 12 meses e no prazo escolhido; informar que não considera valorização, reinvestimento, impostos ou taxas.
- [ ] Adicionar cenários conservador/base/otimista com premissas editáveis e transparência.
- Exibir alocação, concentração, exposição por classe e risco de concentração; não classificar risco apenas pelo ticker.
- Calcular retorno total com aportes, retiradas, proventos e eventos corporativos, informando a metodologia (TWR/MWR quando aplicável).
- Comparar benchmarks apenas quando períodos, moedas e metodologias forem compatíveis.
- Importar operações e conciliar com posições já existentes sem duplicar ativos.

**Critério de aceite:** posição e custo são reproduzíveis a partir do livro de operações; retorno total reconcilia com os fluxos; projeções nunca são apresentadas como rendimento garantido.

## Fase 5 — Assistente financeiro contextual

O assistente já calcula fatos localmente, envia à IA somente os totais necessários e possui fallback determinístico. A evolução deve preservar esse modelo e ampliar a utilidade:

- Explicar gastos e variações com links para lançamentos de origem.
- Detectar anomalias, recorrências e risco de orçamento sem afirmar causalidade sem evidência.
- Simular decisões e impacto sobre objetivos e renda passiva.
- Criar rascunhos de lançamentos para confirmação; não executar ações financeiras irreversíveis sem confirmação.
- Mostrar fontes, período analisado, premissas e grau de incerteza.
- Guardrails contra instruções maliciosas em descrições/importações e contra vazamento entre usuários.

**Critério de aceite:** recomendações rastreáveis aos dados, sem alucinar saldos, sem misturar usuários e sem executar operações sem consentimento.

## Fase 6 — Modularização e experiência

- Extrair módulos por domínio: transações, contas/cartões, orçamento, investimentos, importação, IA, autenticação e sincronização.
- Definir contratos entre módulos e testes unitários.
- Reduzir dependência de estado global e manipulação direta de DOM.
- Adotar design tokens e componentes acessíveis consistentes.
- Testes E2E nas jornadas principais em viewport mobile e desktop.
- Medir performance (LCP, INP, CLS), erros de frontend e taxa de sucesso por jornada.

**Critério de aceite:** cada módulo pode ser alterado e testado sem quebrar domínios não relacionados; regressões críticas bloqueiam PR.

## Fase 7 — Lançamento comercial e crescimento

- Onboarding guiado e importação inicial assistida.
- Paywall transparente, gestão de assinatura e portal de cancelamento.
- Testes de sandbox e checklist de produção para pagamentos.
- Termos, privacidade, retenção e exclusão/exportação de dados.
- Suporte, status page e processo de incidentes.
- Métricas de ativação, retenção, conversão e custo por usuário sem coletar conteúdo financeiro desnecessário.

## Ordem de execução

1. Fundamentos de CI/PWA e proteção de dados.
2. Segurança e reconciliação Supabase.
3. Homologação de pagamentos e automações.
4. Importação e integridade financeira.
5. Dashboard unificado.
6. Central de investimentos/renda passiva.
7. Assistente contextual.
8. Modularização e otimização.
9. Preparação comercial e lançamento.

## Definition of Done

Uma entrega só é considerada concluída quando:
- código e migração (se houver) estão em branch;
- testes unitários, integração e regressão relevantes passam;
- comportamento mobile e acessibilidade foram verificados;
- riscos, rollback e impacto nos dados estão documentados;
- PR descreve alterações, evidências e limitações;
- não há deploy ou alteração de produção sem aprovação.
