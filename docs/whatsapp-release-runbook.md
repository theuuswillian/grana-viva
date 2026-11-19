# Runbook de implantação — WhatsApp

> Documento de preparação. Não executar em produção sem autorização explícita e janela de manutenção aprovada.

## Escopo e dependências

A cadeia de alterações está dividida nas PRs #14–#19. A implantação precisa ser coordenada: migrations primeiro, Edge Function depois. Não implantar apenas uma PR isolada.

### Ordem das migrations

Aplicar e validar nesta ordem lógica, respeitando as dependências do código:

1. `20261119_wa_fila_recuperavel.sql`
2. `20261119_wa_pendente_idempotente.sql`
3. `20261119_wa_leitura_ia_idempotente.sql`
4. `20261119_wa_saida_outbox.sql`
5. `20261119_wa_lease_fencing.sql`
6. `20261119_wa_vinculo_atomico.sql`

Antes de aplicar, conferir o mecanismo de versionamento/histórico de migrations atualmente usado no projeto e confirmar que os arquivos com prefixo de data `20261119` serão reconhecidos sem colisão. Não presumir que `supabase db push` é seguro sem essa conferência.

## Pré-implantação

- Confirmar backup recente e possibilidade de restauração do banco.
- Conferir que o projeto Supabase alvo é o correto e que não há migrations pendentes fora desta cadeia.
- Conferir secrets do webhook: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WA_VERIFY_TOKEN`, `WA_APP_SECRET`, `WA_TOKEN`, `WA_PHONE_ID`; no sandbox, validar também `WA_D360_KEY` e `WA_SB_TOKEN`.
- Confirmar que o CI da ponta da cadeia está verde.
- Registrar os valores atuais de configuração dos jobs `granaviva-wa-msg-limpeza`, `granaviva-wa-pendente-limpeza` e `granaviva-wa-saida-limpeza`.

## Implantação

1. Aplicar uma migration por vez na ordem acima, verificando o resultado antes de seguir.
2. Conferir existência das RPCs `wa_reserva_mensagem`, `wa_finaliza_mensagem`, `wa_conta_leitura_ia`, `wa_saida_reserva`, `wa_saida_finaliza` e `wa_vincula_codigo`.
3. Conferir RLS e privilégios: tabelas internas sem acesso de `anon`/`authenticated`; RPCs privilegiadas executáveis somente por `service_role`.
4. Implantar a Edge Function `whatsapp-webhook` da ponta da cadeia.
5. Fazer teste controlado: vincular número com código válido, enviar mensagem de teste, confirmar resposta e verificar o registro em `wa_msg`, `wa_pendente` e `wa_saida`.
6. Verificar que uma repetição do mesmo webhook não cria outro lançamento nem envia resposta duplicada.
7. Verificar logs e jobs agendados antes de liberar tráfego normal.

## Observabilidade e reconciliação

- `wa_msg`: acompanhar estados `processando`, `falhou` e `concluida`, tentativas e leases.
- `wa_pendente`: acompanhar pendentes antigos e estados terminais.
- `wa_saida`: acompanhar `falhou_segura`, `falhou` e principalmente `incerta`.
- Um registro `incerta` não deve ser reenviado automaticamente. Comparar horário, destinatário e logs/IDs do provedor antes de decidir qualquer ação manual.
- A semântica da outbox é at-most-once para resultados ambíguos; não promete exactly-once nem garante que uma mensagem incerta chegou ao destinatário.

## Reversão e contingência

- As migrations são aditivas e não devem ser revertidas com DROP automático; preservar tabelas e registros de auditoria.
- A migration de lease fencing substitui as assinaturas antigas das RPCs de fila. Portanto, **não redeployar uma versão antiga do `whatsapp-webhook` anterior à PR #18** depois de aplicar essa migration: ela chama assinaturas que deixam de existir.
- Se houver falha após a migration de fencing, preferir correção para frente (forward-fix) e manter a função na versão compatível com as novas RPCs.
- Se for necessário interromper o processamento, desabilitar temporariamente a entrada do webhook no provedor/roteamento e preservar a fila para reconciliação; não apagar `wa_msg`, `wa_pendente` ou `wa_saida`.
- Qualquer rollback de código precisa ser previamente testado contra as RPCs e o schema já aplicados.

## Estado atual

- PRs #14–#19 permanecem abertas e em draft.
- CI completo da ponta da cadeia (PR #19) passou em PostgreSQL isolado, Deno, smoke tests e type-check.
- Nenhuma migration foi aplicada no Supabase de produção.
- Nenhuma Edge Function foi implantada em produção.
- Nenhuma PR foi mesclada.
