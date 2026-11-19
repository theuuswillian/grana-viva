# Runbook de implantação — WhatsApp

> Documento de preparação. Não executar em produção sem backup verificado, projeto confirmado e janela de manutenção aprovada.

## Escopo e dependências

A cadeia funcional está dividida nas PRs #14–#18, #20 e #21. A PR #19 ficou desatualizada em relação à evolução do fencing e foi substituída pela #21, que reaplica a vinculação atômica sobre a ponta atual da cadeia.

A implantação deve ser coordenada: aplicar todas as migrations compatíveis antes de publicar a Edge Function correspondente. Não implantar uma PR isoladamente.

### Ordem operacional das migrations

A ordem abaixo consolida as dependências e os testes isolados atuais. Antes da produção, conferir o histórico real de migrations do projeto e a ausência de versões já aplicadas:

1. `20261119_wa_fila_recuperavel.sql`
2. `20261119_wa_pendente_idempotente.sql`
3. `20261119_wa_lease_fencing.sql`
4. `20261119_wa_leitura_ia_idempotente.sql`
5. `20261119_wa_saida_outbox.sql`
6. `20261119_wa_saida_lease_fencing.sql`
7. `20261119_wa_vinculo_atomico.sql`

Não presumir que `supabase db push` é seguro sem conferir o mecanismo de versionamento e o histórico remoto. Os testes da cadeia de webhook aplicam fila, fencing de entrada, leitura IA, outbox, fencing de saída e vínculo em PostgreSQL isolado; a migration de pendentes/cotas também é validada no banco isolado de cotas.

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
- PR #21: vinculação atômica reaplicada sobre a ponta #20; aguardando CI integrado.
- PR #19: permanece draft e não deve ser integrada separadamente, pois sua base ficou desatualizada.
- Nenhuma migration foi aplicada no Supabase de produção; nenhuma Edge Function foi publicada; nenhuma PR foi mesclada.
