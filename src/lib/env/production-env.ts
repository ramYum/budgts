/**
 * What a production deploy cannot run without, checked when Vercel builds for
 * production (`tools/check-production-env.ts`, npm's `prebuild`). Server
 * secrets are read on first use, so a build no longer needs any (CI and
 * Preview builds carry none). This check keeps the guarantee that gave up: a
 * production deploy missing a secret fails its build, instead of shipping and
 * quietly stopping bank sync for users.
 *
 * Relative imports only: the prebuild runs under tsx, without the `@/` alias.
 * One line per problem; empty means ready.
 */
import { loadPlaidConfig, type EnvLike } from "../plaid/config";
import { billingLive, loadBillingConfig } from "../billing/config";
import { legalRetentionYears } from "../legal/config";

export function productionEnvProblems(env: EnvLike): string[] {
  const problems: string[] = [];
  if (!env.DATABASE_URL) problems.push("DATABASE_URL is not set (the Plaid pipeline's database connection)");
  if (env.NEXT_PUBLIC_PLAID_ENABLED === "1") {
    try {
      loadPlaidConfig(env);
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e));
    }
    if (!env.CRON_SECRET) {
      problems.push("CRON_SECRET is not set (the sync sweep and recurring scan would answer every call with 401)");
    }
  }
  // The legal pages promise "deleted right away" when retention is 0. That holds only while nobody can pay: once
  // billing is live, a paying user's deletion keeps anonymized ledger rows (Path B). Refuse that combination.
  if (billingLive(loadBillingConfig(env)) && legalRetentionYears(env) === 0) {
    problems.push(
      "billing is live but LEGAL_RECORD_RETENTION_YEARS is 0, and the legal pages promise every record is deleted right " +
        "away, which Path B contradicts. Decide how long payment records are kept (and whether Path B anonymizes or " +
        "deletes them) before switching billing on",
    );
  }
  return problems;
}
