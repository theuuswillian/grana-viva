# Pagamentos do GranaViva (v10.82): como ligar

Status: estrutura pronta e publicada, **desligada**. Integração com o Mercado Pago construída a partir da documentação oficial
(nov/2026) e testada com um Mercado Pago falso; **ainda não exercitada contra uma conta Mercado Pago real**. Enquanto o secret
`MP_ACCESS_TOKEN` não existir, o app mostra "Pagamento em breve" e nenhuma cobrança é possível.

## Como funciona
- `planos.js` (raiz) é a fonte única: preços, o que cada plano libera, limites de IA, teste de 14 dias.
- Tabela `assinaturas` (uma linha por pessoa). A pessoa só lê a própria linha (RLS); só o servidor escreve.
  Contas que existiam em 01/11/2026 = Pro `fundador`, sem fim. Conta nova = Pro `teste` por 14 dias (gatilho no banco), depois Grátis.
- Função `assinatura` (com login): `status`, `checkout` (cria a assinatura pendente no MP e devolve o link de pagamento) e `cancelar`.
  Não ativa plano.
- Função `pagamento-webhook` (sem login): a ÚNICA que ativa/renova/encerra plano pago. Para cada aviso: confere `x-signature`
  quando vier (inválida = 401), guarda o evento em `pagamento_eventos` (repetido = ignorado), busca o objeto na API do MP com o
  token do servidor (`/preapproval/{id}`, `/authorized_payments/{id}`, `/v1/payments/{id}`) e só então grava. Confere moeda, valor
  e frequência contra `planos.js`. Falha temporária do MP = 500 (o MP reenvia a cada 15 min).
- Excluir a conta cancela antes a assinatura no MP.

## O que o Matheus precisa fazer para ligar
1. Criar uma conta de vendedor no Mercado Pago (se ainda não tiver) e uma aplicação em https://www.mercadopago.com.br/developers/panel/app
   (produto: Assinaturas).
2. Pegar o **Access Token de produção** (Credenciais de produção). Para testar antes, usar as credenciais de teste com usuários de teste.
3. No Supabase (projeto grana-viva) > Edge Functions > Secrets, criar:
   - `MP_ACCESS_TOKEN` = o access token (obrigatório; é ele que liga o botão "Assinar").
   - `MP_WEBHOOK_SECRET` = a "assinatura secreta" de Webhooks da aplicação, se o painel mostrar uma (opcional: a doc diz que a
     configuração por "Suas integrações" não vale para Assinaturas; o webhook funciona sem ela, porque confere tudo na API).
   - `APP_URL` = `https://theuuswillian.github.io/grana-viva/` (opcional; já é o padrão).
4. URL do webhook (já vai automaticamente em cada assinatura criada, no campo `notification_url`; se o painel pedir, use a mesma):
   `https://hydvhpfpvhopetqqjido.supabase.co/functions/v1/pagamento-webhook?provedor=mercadopago`
   Tópicos: Planos e assinaturas (`subscription_preapproval`, `subscription_authorized_payment`) e Pagamentos (`payment`).
5. Fazer uma assinatura de teste com usuário de teste do MP e conferir que a linha em `assinaturas` vira `ativo`.

## Pontos a confirmar no primeiro teste real
- Se o MP respeita `notification_url` no `POST /preapproval` (a referência da API não lista o campo; a página de webhooks diz que
  para Assinaturas a URL vai na criação). Se os avisos não chegarem, cadastrar a URL acima no painel.
- O pagador precisa pagar com o mesmo e-mail enviado em `payer_email` (e-mail da conta GranaViva)? A referência diz que o e-mail é
  validado no pagamento de assinaturas sem plano.
- Onde o objeto `payment` traz o id da assinatura (o código tenta `metadata.preapproval_id` e
  `point_of_interaction.transaction_data.subscription_id`; se nenhum vier, o aviso é só registrado; os avisos de `preapproval`
  e `authorized_payment` já bastam).
- Pix aparece como meio de pagamento no link (a visão geral de Assinaturas lista Pix, cartão, saldo e boleto).

## Documentação usada
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments
- https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/create-preapproval/post
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-preapproval/get
- https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-authorized-payment/get
- SDK oficial npm `mercadopago` 3.6.1, `dist/utils/webhook/index.js` (validação de assinatura portada sem mudar a regra)

## v10.161: Grátis e Pro (mensal/anual)
- À venda: `pro` R$ 24,90/mês e `pro_anual` R$ 179,00/ano (≈ R$ 14,90/mês). O `plus` não é mais vendido (a função `assinatura` recusa);
  quem já tem linha `plus` vale como Pro. O webhook ainda aceita os preços antigos (`legado` em planos.js: Pro R$ 29,90, Pro anual R$ 299)
  para assinaturas criadas antes da mudança.
- Cotas do Grátis por mês (America/Sao_Paulo), contadas em `ia_uso` com `k` = `frase` (15), `comprovante` (3), `whatsapp` (5);
  conferidas antes de chamar a IA e registradas só quando dá certo (`supabase/functions/_shared/cota.ts`). Resposta: HTTP 402
  `{"erro":"LIMITE_PLANO","recurso":...,"limite":...,"mensagem":...}`; o app abre o aviso do Pro.
- Para valer no servidor, publique: `python3 deploy-fn.py ler-comprovante`, `assistente`, `whatsapp-webhook`, `assinatura`,
  `pagamento-webhook`, `alertas-push`, `whatsapp-vincular`. Não há migração nova (a coluna `k` de `ia_uso` não tem CHECK).
- Testes: `node testes/planos.test.cjs` e `deno test --allow-env testes/cota_test.ts`.
