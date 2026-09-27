/**
 * Shared target-identity helpers for database tooling (tools/db/*).
 *
 * Root cause this exists to close: `drizzle.config.ts` auto-loads
 * `.env.local` for `DIRECT_URL`/`DATABASE_URL`, and at various points in this
 * repo's history `.env.local` has pointed at the *production* Supabase
 * project — so a command that just trusted "whatever DIRECT_URL resolves to"
 * could silently operate on production. Every tool here identifies its
 * target by the Supabase project ref parsed out of the connection string
 * itself, not by which env file (or var name) supplied it — see
 * docs/operations/database-migrations.md.
 */

export type ProjectDanger = "production" | "staging-legacy" | "validation" | "staging" | "unknown";

export interface KnownProject {
  ref: string;
  label: string;
  danger: ProjectDanger;
}

/**
 * Registry of Supabase project refs this repo's tooling knows about.
 * Refs are not secrets (they're visible in every project URL) — safe to
 * commit. Update this list whenever a project is created/retired.
 */
export const KNOWN_PROJECTS: readonly KnownProject[] = [
  { ref: "wsmhstqpvbbcqpqhiqyp", label: "PRODUCTION", danger: "production" },
  { ref: "iwypmifvmtmkwtnxkfma", label: "old staging (budgts-staging, drifted, retired)", danger: "staging-legacy" },
  { ref: "imoxcyzqdbxffdumkuyf", label: "migration-validation (disposable)", danger: "validation" },
  { ref: "moxwnuiiueyxyypzvamc", label: "DELETED staging (budgts-staging-2, permanently deleted 2026-09-21; replaced by Budgets-Staging-3)", danger: "staging-legacy" },
  { ref: "uvowywszaiojboaxdmoz", label: "staging (Budgets-Staging-3, org Budgts Validation, ca-central-1) — the sole staging project", danger: "staging" },
];

export function findKnownProject(ref: string): KnownProject | null {
  return KNOWN_PROJECTS.find((p) => p.ref === ref) ?? null;
}

/**
 * Extracts a Supabase project ref from any connection string shape this repo
 * uses: the pooler host (`postgres.<ref>@aws-...pooler.supabase.com`), the
 * raw direct host (`db.<ref>.supabase.co`), or a `https://<ref>.supabase.co`
 * API URL. Returns null if no ref-shaped token is found — callers must treat
 * that as "unknown target," never as "safe to proceed."
 */
export function extractProjectRef(connectionStringOrUrl: string): string | null {
  const poolerUser = connectionStringOrUrl.match(/postgres\.([a-z0-9]{20})[:@]/i);
  if (poolerUser) return poolerUser[1];

  const dbHost = connectionStringOrUrl.match(/db\.([a-z0-9]{20})\.supabase\.co/i);
  if (dbHost) return dbHost[1];

  const apiHost = connectionStringOrUrl.match(/([a-z0-9]{20})\.supabase\.co/i);
  if (apiHost) return apiHost[1];

  return null;
}

/** Redacts credentials from a connection string for safe printing/logging. */
export function maskConnectionString(connectionString: string): string {
  return connectionString.replace(/:\/\/([^:/?#]+):([^@]+)@/, (_m, user) => `://${user}:***@`);
}

export interface TargetIdentity {
  ref: string | null;
  known: KnownProject | null;
  maskedUrl: string;
}

export function identifyTarget(connectionString: string): TargetIdentity {
  const ref = extractProjectRef(connectionString);
  return {
    ref,
    known: ref ? findKnownProject(ref) : null,
    maskedUrl: maskConnectionString(connectionString),
  };
}

/**
 * Throws with a clear, actionable message if `expectedRef` doesn't exactly
 * match the ref parsed from `connectionString`. Never silently proceeds on
 * an unparseable or mismatched target — ambiguity is a hard stop, per repo
 * policy (docs/operations/database-migrations.md).
 */
export function requireConfirmedRef(connectionString: string, expectedRef: string | undefined): TargetIdentity {
  const identity = identifyTarget(connectionString);

  if (!identity.ref) {
    throw new Error(
      `Could not identify a Supabase project ref from the connection string (${identity.maskedUrl}). ` +
        `Refusing to proceed against an unidentifiable target.`,
    );
  }

  if (!expectedRef) {
    throw new Error(
      `Target identified as ref "${identity.ref}"${identity.known ? ` (${identity.known.label})` : " (not in the known-projects registry)"}, ` +
        `but no confirmation ref was supplied. Re-run with the expected ref explicitly confirmed — see ` +
        `docs/operations/database-migrations.md. Refusing to guess.`,
    );
  }

  if (expectedRef !== identity.ref) {
    throw new Error(
      `Target ref mismatch: connection string resolves to "${identity.ref}"` +
        `${identity.known ? ` (${identity.known.label})` : ""}, but you confirmed "${expectedRef}". Stopping.`,
    );
  }

  return identity;
}
