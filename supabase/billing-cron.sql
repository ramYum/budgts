-- Scheduled billing jobs (pg_cron -> pg_net -> the app). Mirrors supabase/staging-plaid-cron.sql.
--
-- NOT a migration and NEVER run by db:migrate: it holds the deployment URL and a shared secret, which differ per
-- environment. Run it by hand in the Supabase SQL editor for the target project AFTER migrations 0021/0022 are applied
-- and the app is deployed. Replace the placeholders; the values must match that Vercel project's environment:
--
--   {{DEPLOY_URL}}    the app's base URL for THIS environment (staging or production), no trailing slash
--   {{CRON_SECRET}}   the exact CRON_SECRET set in that Vercel project (the same secret the Plaid poller uses)
--
-- Two jobs:
--   billing-reminders   every 15 minutes: find trials ending within 24 h and (once a delivery channel exists) send the
--                       "your free trial ends tomorrow" reminder. With NO channel configured it only REPORTS what is
--                       due and claims nothing, so it is safe to schedule before the notification decision is made.
--   billing-reconcile   hourly: re-check live subscriptions against the billing provider so a missed webhook cannot
--                       leave a user's access wrong for long.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'billing-reminders',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := '{{DEPLOY_URL}}/api/billing/reminders/due',
    headers := jsonb_build_object('Authorization', 'Bearer {{CRON_SECRET}}', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

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
