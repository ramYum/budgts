-- Per-user time zone (src/lib/budget/month.ts): the user's IANA zone, from
-- their device, decides their "today" and "this month". Onboarding sets it,
-- and <TimeZoneSync> keeps it in step with the device on every visit.
-- Backfill: users who finished onboarding before this column existed get
-- America/New_York, the single zone every user had until now, so nothing they
-- see changes until their device reports its own zone on their next visit.
-- Reverse (only after rolling the app back to a build that does not read it):
--   ALTER TABLE "profiles" DROP CONSTRAINT "profiles_time_zone_when_onboarded";
--   ALTER TABLE "profiles" DROP COLUMN "time_zone";
ALTER TABLE "profiles" ADD COLUMN "time_zone" text;--> statement-breakpoint
UPDATE "profiles" SET "time_zone" = 'America/New_York' WHERE "onboarded_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_time_zone_when_onboarded" CHECK ("profiles"."onboarded_at" is null or "profiles"."time_zone" is not null);
