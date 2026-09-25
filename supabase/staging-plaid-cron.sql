-- ─────────────────────────────────────────────────────────────────────────────
-- budgts-staging ONLY — Plaid sync automation (workstream B).
-- NOT a schema migration: this is Supabase extension + cron-job configuration,
-- run once by hand in the staging project's SQL editor. Never run on prod.
--
-- Since 2026-09-25 this job is the RECONCILIATION SWEEP, not the sync driver:
--   Plaid webhook  →  needs_sync = true  →  the webhook itself syncs the Item
--   right after its 200 (after(), per-Item lease). The sweep only catches failed
--   syncs (retry backoff = this interval), killed runs (expired lease) and Items
--   silent for 6h (webhooks lost past Plaid's 24h retry window). Every 10 min.
--
-- Pipeline it completes:
--   Plaid webhook  →  plaid_items.needs_sync = true   (already wired: /api/plaid/webhook)
--   pg_cron (every 10 min)  →  pg_net net.http_post
--   →  POST {{DEPLOY_URL}}/api/plaid/sync-due   (Authorization: Bearer {{CRON_SECRET}})
--   →  sync engine  →  transactions updated in staging Postgres
--
-- Before running, replace:
--   {{DEPLOY_URL}}    the M9 deploy origin, e.g. https://budgts-staging.vercel.app
--   {{CRON_SECRET}}   the exact CRON_SECRET set in that Vercel project's env
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: drop a previous copy of the job before (re)scheduling.
select cron.unschedule('plaid-sync-due')
where exists (select 1 from cron.job where jobname = 'plaid-sync-due');

select cron.schedule(
  'plaid-sync-due',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := '{{DEPLOY_URL}}/api/plaid/sync-due',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer {{CRON_SECRET}}'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 290000     -- the route runs up to maxDuration (300s)
  );
  $$
);

-- ── Verify it is actually firing (not just scheduled) ───────────────────────
--   select jobid, jobname, schedule, active from cron.job;
--   select status, return_message, start_time, end_time
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'plaid-sync-due')
--    order by start_time desc limit 10;
--   select id, status_code, content, created
--     from net._http_response order by created desc limit 10;   -- expect 200 + {"ran":N,...}
--
-- End-to-end check:
--   update public.plaid_items set needs_sync = true where item_id = '<some item>';
--   -- wait up to 10 min (or POST the route by hand with the secret), then:
--   select item_id, needs_sync, last_synced_at from public.plaid_items where item_id = '<some item>';
--   -- needs_sync should be false and last_synced_at just moved.
--
-- Remove:  select cron.unschedule('plaid-sync-due');
--
-- ── Move an EXISTING job from the old 30s poll to the 10-min sweep ─────────
-- (no secret needed — keeps the job's command; only after the sweep build is
-- deployed to that environment; on production only as an owner-approved step):
--   select cron.alter_job((select jobid from cron.job where jobname = 'plaid-sync-due'),
--                         schedule := '*/10 * * * *');
--   -- the pg_net timeout lives inside the command; to raise it to 290000, re-run
--   -- the schedule block above with the secret filled in.
-- Roll back:  same call with schedule := '30 seconds'.
