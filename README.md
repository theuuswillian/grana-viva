# GranaViva

Plataforma de gestão financeira pessoal e investimentos, com foco em fluxo de caixa, orçamento, patrimônio e construção de renda passiva.

## Produto

O GranaViva reúne:
- receitas, despesas, contas, cartões e orçamento;
- carteira de investimentos e acompanhamento de proventos;
- importação local de extratos CSV/OFX;
- assistente financeiro e automações;
- integração de pagamentos e recursos Pro.

## Arquitetura atual

- Aplicação web instalável (PWA), com HTML/CSS/JavaScript.
- Supabase Auth e PostgreSQL com Row Level Security.
- Supabase Edge Functions (Deno) para integrações e operações privilegiadas.
- Service worker para experiência offline e atualização de assets.
- GitHub Actions para validações de frontend, funções e migrations em PostgreSQL isolado.

## Desenvolvimento e validação

O repositório não depende de um bundler obrigatório para servir a aplicação. A validação automatizada usa Node.js, Deno, Python e PostgreSQL conforme o workflow em `.github/workflows/validate-full-stack.yml`.

Comandos principais (dependências conforme o workflow):

```bash
node --check app.js
python3 csp.py index.html
node testes/pwa_version.test.cjs
node testes/planos.test.cjs
npm install --no-save --no-package-lock jsdom@24
node testes/smoke_jsdom.cjs
deno test -A testes/*_test.ts
```

O workflow executa também fixtures de upgrade, testes de concorrência e type-check das Edge Functions.

## Segurança e dados

- Nunca coloque `service_role`, tokens privados ou secrets no frontend.
- Não aplique migrations diretamente em produção sem revisão do schema, histórico e plano de rollback.
- Não remova nem reescreva dados financeiros existentes para simplificar uma migração.
- Qualquer alteração de pagamentos deve preservar assinatura/verificação de webhook, idempotência e estados monotônicos.
- Mudanças devem ocorrer em branches e passar por Pull Request.

## Roadmap

Consulte [Plano de evolução do GranaViva](docs/PLANO-EVOLUCAO-GRANAVIVA.md), [Auditoria read-only do Supabase](docs/AUDITORIA-SUPABASE-2026-11-20.md) e [Auditoria do webhook Mercado Pago](docs/AUDITORIA-WEBHOOK-MERCADOPAGO-2026-11-20.md).
