# Auditoria do webhook Mercado Pago — 20/11/2026

## Escopo

Análise read-only dos logs e do código da função `pagamento-webhook` em produção, seguida de correção e testes na branch de implementação. Nenhuma Edge Function foi publicada e nenhum segredo foi consultado ou exibido.

## Evidência de produção

- A Edge Function ativa era a versão 22, com `verify_jwt=false` (o endpoint é um webhook público; a autenticação do evento é tratada pelo código).
- Nos logs das últimas 48 horas foi encontrado um único POST com HTTP 401 e erro sanitizado `SignatureMismatch`, em 19/11/2026 às 18:20:42 UTC.
- A notificação trazia o tópico `subscription_preapproval_plan`.
- Também houve um GET com HTTP 405 em 20/11/2026 às 11:49:11 UTC. O handler aceita apenas POST; o GET não altera estado.

Não foi encontrada evidência de falhas repetidas em notificações dos tópicos de assinatura que efetivamente atualizam o plano do usuário. O único 401 identificado estava associado a um evento de plano.

## Causa funcional identificada

O checkout do GranaViva cria assinaturas sem plano associado usando o recurso `/preapproval`, com `external_reference` vinculando usuário e plano. Os tópicos relevantes para esse fluxo são:

- `subscription_preapproval`: criação/atualização da assinatura;
- `subscription_authorized_payment`: cobrança recorrente autorizada;
- `payment`: pagamento que pode estar vinculado a uma assinatura.

Já `subscription_preapproval_plan` informa alteração de um **plano de assinatura**, não da assinatura individual. O código do GranaViva não cria nem associa planos do Mercado Pago. A documentação do provedor também direciona esse tópico ao recurso `preapproval_plan`, distinto de `preapproval`.

Antes da correção, o handler tentava validar a assinatura HMAC e reservar o evento antes de perceber que o tópico não era suportado. Assim, uma notificação de plano irrelevante podia gerar 401 e novas tentativas do provedor.

## Correção na branch de implementação

O handler agora reconhece os tópicos efetivamente utilizados. Tópicos não suportados são confirmados com HTTP 200 e resultado `topico_ignorado`, sem:

- exigir `MP_WEBHOOK_SECRET`;
- reservar evento no banco;
- chamar a API do Mercado Pago;
- alterar a assinatura de qualquer usuário.

Para os tópicos suportados, a validação HMAC é obrigatória em todo webhook externo. Se `MP_WEBHOOK_SECRET` estiver ausente, a função agora falha fechada com HTTP 503 e não reserva o evento. Se o segredo estiver configurado, assinatura ausente ou inválida é recusada com HTTP 401. A única exceção é a sincronização iniciada pela Edge Function `assinatura`, autenticada por HMAC interno com a chave service-role, escopo `mp-sync`, timestamp limitado e `data.id` vinculado. A confirmação do plano continua baseada na consulta autenticada à API do Mercado Pago, nunca no conteúdo não confiável do webhook.

## Testes adicionados

- Vetor HMAC-SHA256 fixo e independente para assinatura válida.
- Alteração de `x-request-id`, `data.id` ou segredo deve invalidar o HMAC.
- Fluxo completo de webhook com assinatura válida chega à consulta do provedor.
- `subscription_preapproval_plan` retorna 200 sem reservar evento nem alterar assinatura.

A suíte Deno do CI concluiu com sucesso após a inclusão desses testes. O restante da validação full-stack estava em execução no momento desta atualização.

## Limites e próxima validação

- O log não permite determinar se o segredo configurado divergia da chave esperada pelo Mercado Pago; nenhum valor secreto foi lido.
- O evento observado era de plano, não prova falha de uma notificação de assinatura individual.
- A documentação oficial atual do Mercado Pago para Assinaturas descreve o header `x-signature` e a validação HMAC; a implementação não deve aceitar webhook externo sem segredo configurado. A ausência do segredo é uma falha de configuração, não um modo degradado seguro.
- A correção e os testes estão apenas na branch e na PR #27. A versão 22 em produção não foi substituída.
- Antes de publicar, realizar um ciclo sandbox de criação de assinatura, autorização, renovação, cancelamento e reenvio do mesmo webhook. Confirmar no painel do Mercado Pago os tópicos e URLs realmente enviados.
- Não remover nem relaxar a verificação HMAC dos tópicos suportados sem validar a configuração oficial do provedor.

## Referências do provedor

- Webhooks de assinaturas (inclui exemplo de `x-signature` e HMAC): https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks
- Webhooks de assinaturas: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks
- A documentação diferencia `subscription_preapproval`, `subscription_authorized_payment` e `subscription_preapproval_plan`, e aponta endpoints distintos para assinatura e plano.
