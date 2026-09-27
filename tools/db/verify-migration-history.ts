/**
 * Read-only migration-history verifier — `npm run db:verify-history`.
 *
 * Compares the repository's migration files (source of truth) against the
 * target database's `drizzle.__drizzle_migrations` ledger (what actually
 * ran). Never writes anything, never "repairs" anything. See
 * docs/operations/database-migrations.md for the policy this enforces.
 *
 * Deliberately does NOT auto-load any .env file (unlike drizzle.config.ts) —
 * that ambiguity is exactly how this repo once pointed a migration command
 * at production by accident. You must export DIRECT_URL/DATABASE_URL
 * yourself before running this.
 *
 * Usage:
 *   DIRECT_URL=... npx tsx tools/db/verify-migration-history.ts --ref <expected-project-ref>
 *
 * `--ref` is strongly recommended but not required for this read-only tool
 * (unlike the db:migrate preflight gate, which requires it). Without it, the
 * detected target is still printed prominently so it's never silently
 * assumed.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import postgres from "postgres";
import { compareMigrationHistory, formatReport, type LocalMigrationFile } from "./migration-history";
import { identifyTarget, requireConfirmedRef } from "./target-safety";

function parseArgs(argv: string[]) {
  const args: { ref?: string; url?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--ref") args.ref = argv[++i];
    else if (argv[i] === "--url") args.url = argv[++i];
  }
  return args;
}

function loadLocalMigrationFiles(migrationsDir: string): LocalMigrationFile[] {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  return files.map((filename) => {
    const content = readFileSync(path.join(migrationsDir, filename), "utf8");
    const hash = createHash("sha256").update(content).digest("hex");
    return { filename, hash };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const url = args.url ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "No connection string. Export DIRECT_URL (or DATABASE_URL) yourself before running this — " +
        "this tool does not auto-load .env.local. Example:\n" +
        '  DIRECT_URL="postgresql://..." npx tsx tools/db/verify-migration-history.ts --ref <project-ref>',
    );
    process.exitCode = 1;
    return;
  }

  let identity;
  try {
    identity = args.ref ? requireConfirmedRef(url, args.ref) : identifyTarget(url);
  } catch (e) {
    console.error(`❌ ${(e as Error).message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Target: ${identity.maskedUrl}`);
  console.log(`Detected project ref: ${identity.ref ?? "UNKNOWN — could not parse"}`);
  console.log(`Known as: ${identity.known ? `${identity.known.label} (${identity.known.danger})` : "not in the known-projects registry (tools/db/target-safety.ts)"}`);
  if (!args.ref) {
    console.log("⚠️  No --ref confirmation supplied — proceeding read-only, but verify the above is what you intended.");
  }
  if (identity.known?.danger === "production") {
    console.log("\n🔴🔴🔴 THIS IS THE PRODUCTION PROJECT. Read-only inspection only. 🔴🔴🔴\n");
  }

  const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
  const localFiles = loadLocalMigrationFiles(migrationsDir);
  console.log(`\nRepository migration files: ${localFiles.length}`);

  const sql = postgres(url, { ssl: "require", max: 1 });
  try {
    const [{ reg }] = await sql<{ reg: string | null }[]>`select to_regclass('drizzle.__drizzle_migrations')::text as reg`;
    const ledgerRows =
      reg === null
        ? null
        : await sql<{ id: number; hash: string; createdAt: unknown }[]>`
            select id, hash, created_at as "createdAt" from drizzle.__drizzle_migrations order by id
          `;

    const result = compareMigrationHistory(localFiles, ledgerRows);
    console.log("\n" + formatReport(result));

    process.exitCode = result.clean ? 0 : 1;
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("Unexpected error:", (e as Error).message);
  process.exitCode = 1;
});
