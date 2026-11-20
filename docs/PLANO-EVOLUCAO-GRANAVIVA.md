# Plano de evolução do GranaViva

**Branch de trabalho:** `implementacao/plano-evolucao-2026-11-20`  
**Base inicial:** `main` em `c94e0f8e6bfeebc87495bc1720896a3b985efeab`  
**Regra de segurança:** nenhuma alteração direta em produção; todas as entregas passam por branch, testes e Pull Request.

## Objetivo do produto

Evoluir o GranaViva de um gestor financeiro pessoal para uma plataforma de inteligência financeira que conecte fluxo de caixa, orçamento, patrimônio, investimentos e construção de renda passiva, sem perder simplicidade, confiabilidade e transparência.

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

- Reconciliar migrations versionadas com schema e histórico reais do Supabase; não marcar migrations manualmente nem aplicar migrations antigas sem diff revisado.
- Auditar todas as tabelas expostas, grants, RLS, policies, views e funções SECURITY DEFINER.
- Revisar proteção contra senhas comprometidas e parâmetros de autenticação.
- Tornar a criptografia local fail-closed: não gravar dados financeiros em texto puro quando Web Crypto/IndexedDB falhar.
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

- Visão consolidada de saldo, receitas, despesas, cartões, contas e patrimônio.
- Fluxo de caixa mensal e tendência de 3/6/12 meses.
- Compromissos futuros e previsão de saldo, distinguindo previsto de realizado.
- Orçamento por categoria com ritmo de consumo e alertas configuráveis.
- Indicadores explicáveis: cada número deve permitir abrir a composição que o originou.
- Estados vazios úteis, acessibilidade, responsividade e performance mobile.

**Critério de aceite:** valores do dashboard reconciliam com lançamentos e contas; filtros de período não misturam competência e caixa.

## Fase 4 — Central de investimentos e renda passiva

- Histórico de operações, posição e preço médio por ativo.
- Proventos realizados, calendário e projeção claramente identificada.
- Renda mensal, anualizada e por ativo/classe.
- Meta de renda passiva, aporte necessário e cenários conservador/base/otimista.
- Alocação por classe, setor, ativo e concentração.
- Rentabilidade com metodologia explícita, incluindo aportes, retiradas e proventos.
- Comparação com benchmarks somente quando houver dados e metodologia consistentes.
- Importação de notas/operações e conciliação com posições existentes.

**Critério de aceite:** preço médio e posição são reproduzíveis a partir do livro de operações; projeções nunca são apresentadas como rendimento garantido.

## Fase 5 — Assistente financeiro contextual

- Responder sobre dados do próprio usuário apenas após autorização e com escopo mínimo.
- Explicar gastos e variações com links para lançamentos de origem.
- Detectar anomalias, assinaturas recorrentes e risco de orçamento.
- Simular decisões e impacto sobre objetivos.
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
