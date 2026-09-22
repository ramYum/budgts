-- Scheduled billing jobs (pg_cron -> pg_net -> the app). Mirrors supabase/staging-plaid-cron.sql.
--
-- NOT a migration and NEVER run by db:migrate: it holds the deployment URL and a shared secret, which differ per
-- environment. Run it by hand in the Supabase SQL editor for the target project AFTER migrations 0021/0022 are applied
-- and the app is deployed. Replace the placeholders; the values must match that Vercel project's environment:
--
--   {{DEPLOY_URL}}    the app's base URL for THIS environment (staging or production), no trailing slash
--   {{CRON_SECRET}}   the exact CRON_SECRET set in that Vercel project (the same secret the Plaid poller uses)
--
-- One job:
--   billing-reconcile   hourly: re-check live subscriptions against the billing provider so a missed webhook cannot
--                       leave a user's access wrong for long.
--
-- Budgts does not send its own trial-end reminder (owner decision 2026-09-22, superseding the earlier plan): the
-- `billing-reminders` job this file used to schedule is intentionally gone. If a deployment already has it
-- scheduled from before, unschedule it by hand: select cron.unschedule('billing-reminders');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'billing-reconcile',
  '7 * * * *',
  $$
  select net.http_post(
    url := '{{DEPLOY_URL}}/api/billing/reconcile/due',
    headers := jsonb_build_object('Authorization', 'Bearer {{CRON_SECRET}}', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Verify:
--   select jobname, schedule from cron.job where jobname like 'billing-%';
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
