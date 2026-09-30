/**
 * The parity tooling's one door to credentials: it reads `.env.staging` and nothing else, and refuses to go on unless
 * every Supabase URL / connection string in it resolves to the staging project. `.env.local` and `.env.production` point at
 * PRODUCTION and are never opened here (docs/operations/database-migrations.md, tools/db/target-safety.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import { extractProjectRef, findKnownProject } from "../db/target-safety";

/** Budgets-Staging-3, the sole staging project (tools/db/target-safety.ts KNOWN_PROJECTS). */
export const STAGING_REF = "uvowywszaiojboaxdmoz";

/** The env keys whose value names a Supabase project; each one must be staging. */
const TARGET_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL", "DIRECT_URL"] as const;

/**
 * Throws unless every target-bearing key present resolves to `STAGING_REF`. `NEXT_PUBLIC_SUPABASE_URL` is required: the
 * seed and the captures act through it. An unparseable value is a refusal, never a guess.
 */
export function assertStagingEnv(env: Record<string, string | undefined>): void {
  if (!env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("parity: NEXT_PUBLIC_SUPABASE_URL is missing from .env.staging");
  for (const key of TARGET_KEYS) {
    const value = env[key];
    if (!value) continue;
    const ref = extractProjectRef(value);
    if (ref !== STAGING_REF) {
      const known = ref ? findKnownProject(ref) : null;
      throw new Error(
        `parity: ${key} resolves to ${ref ?? "an unidentifiable project"}${known ? ` (${known.label})` : ""}, ` +
          `not staging ${STAGING_REF}. Refusing to touch it.`,
      );
    }
  }
}

/**
 * Loads `<root>/.env.staging` into `process.env` (overriding anything inherited, so a shell that happens to carry
 * production variables cannot leak through) after checking it is staging. Returns the parsed values.
 */
export function loadStagingEnv(root = process.cwd()): Record<string, string> {
  const values = parse(readFileSync(join(root, ".env.staging")));
  assertStagingEnv(values);
  Object.assign(process.env, values);
  return values;
}
