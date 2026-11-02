-- v10.93: o x-cron-secret do job diário do alertas-push sai do texto do job e passa a ser lido do Supabase Vault
-- (segredo 'gv_cron_secret', criado uma vez a partir do valor que já estava no job; o valor nunca aparece em arquivo).
-- A função alertas-push continua conferindo o mesmo valor em Deno.env.get("CRON_SECRET").
select cron.alter_job(
  (select jobid from cron.job where jobname = 'granaviva-alertas-push'),
  command := $cmd$
  select net.http_post(
    url:='https://hydvhpfpvhopetqqjido.supabase.co/functions/v1/alertas-push',
    headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name = 'gv_cron_secret')),
    body:='{}'::jsonb,
    timeout_milliseconds:=60000);
$cmd$);
