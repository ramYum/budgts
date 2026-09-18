/**
 * `predb:migrate` — npm automatically runs this before `npm run db:migrate`
 * (npm's pre-script convention). This is the hard gate for the one command
 * in this repo that actually writes DDL to a real target.
 *
 * Root cause this closes: `drizzle.config.ts` resolves its connection URL as
 * `DIRECT_URL ?? DATABASE_URL`, auto-loading `.env.local` if those aren't
 * already set — and `.env.local` has, at various points, pointed at
 * production. Running `npm run db:migrate` with no other context could
 * silently migrate production. This script computes the exact same URL
 * drizzle-kit is about to use, identifies its project ref, and REFUSES to
 * proceed unless the operator has explicitly set MIGRATE_CONFIRM_REF to that
 * same ref — something you cannot do by accident, since it requires typing
 * the ref you believe you're targeting.
 *
 * See docs/operations/database-migrations.md.
 */
import { config as loadEnv } from "dotenv";
import { identifyTarget } from "./target-safety";

// Mirrors drizzle.config.ts's own env resolution exactly, so this script
// checks the REAL url drizzle-kit is about to connect with — not a stricter
// parallel universe that could diverge from reality.
loadEnv({ path: ".env.local" });

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
  console.error("predb:migrate: no DIRECT_URL/DATABASE_URL resolved (checked process.env and .env.local). Nothing to confirm — drizzle-kit will fail on its own.");
  process.exit(1);
}

const identity = identifyTarget(url);

console.log(`predb:migrate — about to run db:migrate against: ${identity.maskedUrl}`);
console.log(`  Detected project ref: ${identity.ref ?? "UNKNOWN — could not parse a ref from this connection string"}`);
console.log(`  Known as: ${identity.known ? `${identity.known.label} (${identity.known.danger})` : "not in the known-projects registry (tools/db/target-safety.ts)"}`);

if (identity.known?.danger === "production") {
  console.log("\n🔴🔴🔴 THIS IS THE PRODUCTION PROJECT. 🔴🔴🔴");
}
if (identity.known?.danger === "staging-legacy") {
  console.log("\n🔴 THIS IS THE OLD, RETIRED, DRIFTED STAGING PROJECT — it is not meant to receive further migrations. 🔴");
}

const confirmed = process.env.MIGRATE_CONFIRM_REF;

if (!identity.ref) {
  console.error("\npredb:migrate: could not identify a project ref from this connection string. Refusing to migrate an unidentifiable target.");
  process.exit(1);
}

if (!confirmed) {
  console.error(
    `\npredb:migrate: refusing to proceed without confirmation.\n` +
      `Re-run as:\n  MIGRATE_CONFIRM_REF=${identity.ref} npm run db:migrate\n` +
      `(Type the ref you actually intend to migrate — do not copy this one without checking it first.)`,
  );
  process.exit(1);
}

if (confirmed !== identity.ref) {
  console.error(
    `\npredb:migrate: MIGRATE_CONFIRM_REF ("${confirmed}") does not match the detected target ref ("${identity.ref}"). Stopping.`,
  );
  process.exit(1);
}

console.log(`\n✅ Confirmed — proceeding with db:migrate against ${identity.ref}.\n`);
