# Runbook de implantação — WhatsApp

> Documento de preparação. Não executar em produção sem backup verificado, projeto confirmado e janela de manutenção aprovada.

## Escopo e dependências

A cadeia funcional está dividida nas PRs #14–#18, #20 e #21. A PR #19 ficou desatualizada em relação à evolução do fencing e foi substituída pela #21, que reaplica a vinculação atômica sobre a ponta atual da cadeia.

A implantação deve ser coordenada: aplicar todas as migrations compatíveis antes de publicar a Edge Function correspondente. Não implantar uma PR isoladamente.

### Ordem operacional das migrations

A ordem abaixo consolida as dependências e os testes isolados atuais. Antes da produção, conferir o histórico real de migrations do projeto e a ausência de versões já aplicadas:

### Trilha principal do webhook (na ordem usada pelo CI)

1. `20261106_whatsapp.sql` e migrations-base de webhook já aplicadas no projeto.
2. `20261115_webhooks_idempotencia.sql` e `20261115_wa_resumo_semanal.sql`, se ainda não estiverem no histórico remoto.
3. `20261119_wa_fila_recuperavel.sql`
4. `20261119_wa_lease_fencing.sql`
5. `20261119_wa_z_fila_limite_tentativas.sql`
6. `20261119_wa_leitura_ia_idempotente.sql`
7. `20261119_wa_saida_outbox.sql`
8. `20261119_wa_saida_lease_fencing.sql`
9. `20261119_wa_vinculo_atomico.sql`

### Trilha de pendentes e cotas

- `20261118_cota_mensal_atomica.sql` deve preceder `20261119_wa_pendente_idempotente.sql`.
- A migration `20261119_wa_pendente_idempotente.sql` é validada em banco isolado separado no CI; confirmar dependências e histórico remoto antes de aplicá-la.
- Não misturar as duas trilhas sem conferir o histórico de migrations já aplicado no Supabase.

Não presumir que `supabase db push` é seguro sem conferir o mecanismo de versionamento e o histórico remoto. Os testes da cadeia de webhook aplicam as migrations da trilha principal em PostgreSQL isolado; a trilha de pendentes/cotas é validada separadamente no banco isolado de cotas. A lista acima é uma referência de dependências, não uma instrução para reaplicar migrations já registradas no projeto.

## Pré-implantação

- Confirmar backup recente e possibilidade real de restauração.
- Confirmar o projeto Supabase alvo e listar migrations pendentes, comparando-as com o histórico remoto.
- Conferir secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WA_VERIFY_TOKEN`, `WA_APP_SECRET`, `WA_TOKEN`, `WA_PHONE_ID`; no sandbox, validar também `WA_D360_KEY` e `WA_SB_TOKEN`.
- Exigir CI verde na ponta #21 e conferir os checks de cada PR dependente.
- Registrar configuração e agenda dos jobs `granaviva-wa-msg-limpeza`, `granaviva-wa-pendente-limpeza` e `granaviva-wa-saida-limpeza`.
- Conferir volume de mensagens em processamento e registros `incerta` antes da janela.

## Implantação

1. Aplicar migrations uma por vez na ordem acima, validando cada resultado antes de seguir.
2. Conferir as RPCs `wa_reserva_mensagem`, `wa_finaliza_mensagem`, `wa_conta_leitura_ia`, `wa_saida_reserva`, `wa_saida_finaliza`, `wa_vincula_codigo` e `wa_salva_pendente_com_cota`.
3. Conferir RLS e privilégios: tabelas internas sem acesso de `anon`/`authenticated`; RPCs privilegiadas executáveis apenas por `service_role`.
4. Publicar a Edge Function `whatsapp-webhook` exatamente na versão da ponta #21, junto com os helpers compartilhados.
5. Fazer teste controlado de vinculação, mensagem de texto, confirmação por botão, cancelamento, mídia e consulta financeira.
6. Repetir webhooks e callbacks de teste para confirmar que não há lançamentos ou respostas duplicados.
7. Verificar logs, fila, outbox e jobs agendados antes de liberar tráfego normal.


### Limites operacionais da fila e da outbox

- A reserva de entrada usa lease padrão de 180 segundos (permitido entre 30 e 900); a finalização exige o mesmo token e lease ainda válido. O webhook não possui renovação/heartbeat do lease. Antes de liberar tráfego, confirmar que o tempo máximo efetivo de execução da Edge Function e das etapas de IA permanece abaixo de 180 segundos; se a plataforma/projeto permitir execução mais longa, implementar heartbeat ou ajustar lease e testes antes do deploy.
- A fila de entrada registra `attempts` e `last_error` mas não impõe limite máximo de tentativas nem backoff persistente. Monitorar mensagens repetidamente falhas; definir política de dead-letter/limite e alertas antes de escalar volume.
- A outbox usa lease padrão de 90 segundos e o POST ao provedor tem timeout de 15 segundos. HTTP 429 é classificado como `falhou_segura` e pode ser tentado novamente; HTTP 5xx, timeout, crash e lease expirado são `incerta` e não podem ser reenviados automaticamente. Confirmar os estados incertos com o provedor antes de qualquer reenvio manual.
- Os registros `incerta` são mantidos para reconciliação. O job de limpeza converte leases abandonados em `incerta`; não representa uma confirmação de entrega.

## Observabilidade e reconciliação

- `wa_msg`: acompanhar `processando`, `falhou`, `concluida`, tentativas e leases.
- `wa_pendente`: acompanhar pendentes antigos e estados terminais.
- `wa_saida`: acompanhar `falhou_segura`, `falhou` e especialmente `incerta`.
- Não reenviar automaticamente registros `incerta`. Comparar horário, destinatário, logs e IDs do provedor antes de qualquer decisão manual.
- A outbox é at-most-once para resultados ambíguos; não promete exactly-once nem garante que uma mensagem incerta chegou ao destinatário.

## Reversão e contingência

- Não reverter migrations com DROP automático; preservar filas, pendentes e auditoria.
- As migrations de fencing removem assinaturas antigas de RPCs. **Não redeployar versões antigas do webhook** após aplicar fencing de entrada/saída: elas não são compatíveis com as novas assinaturas.
- Em falha após migration, preferir correção para frente (forward-fix) e manter código compatível com o schema aplicado.
- Para interromper processamento, pausar temporariamente o recebimento no provedor/roteamento e preservar `wa_msg`, `wa_pendente` e `wa_saida`.
- Qualquer rollback de código deve ser testado contra o schema já aplicado. Não apagar registros `incerta` para “limpar” a fila.

## Estado desta preparação

- PR #20: fencing da outbox de saída, CI completo aprovado.
- PR #21: vinculação atômica reaplicada sobre a ponta #20; CI integrado aprovado no SHA `88e0875c538f8942cf7b6494d3b9674592cb977c`.
- PR #19: encerrada como substituída pela #21; manter apenas como histórico, sem integração separada.
- Nenhuma migration foi aplicada no Supabase de produção; nenhuma Edge Function foi publicada; nenhuma PR foi mesclada.
