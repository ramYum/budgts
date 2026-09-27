/**
 * Test helper: a real (embedded, WASM) Postgres with the repo's OWN migration files applied.
 *
 * Why: the billing domain's guarantees live partly in the database (idempotency keys, immutability triggers,
 * CHECK invariants, the RESTRICT-vs-CASCADE deletion boundary). PGlite is genuine Postgres, so those are proven
 * against the real migration chain from an EMPTY database — independent of the (drifted) shared staging database.
 *
 * Supabase pieces the migrations need are stubbed minimally: the `anon`/`authenticated` roles, `auth.users`,
 * `auth.uid()`, and the `supabase_realtime` publication. Migrations are applied with drizzle's own file reader and
 * its own skip rule (`created_at` watermark), one chunk at a time through the SIMPLE protocol (`exec`), which is what
 * postgres-js does for parameterless statements in drizzle-kit migrate.
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";

export const MIGRATIONS_DIR = path.resolve(__dirname, "../../../supabase/migrations");

export interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

export function readJournal(dir = MIGRATIONS_DIR): JournalEntry[] {
  return JSON.parse(fs.readFileSync(path.join(dir, "meta", "_journal.json"), "utf8")).entries;
}

/** An empty database with the Supabase-provided pieces the migrations assume. */
export async function newSupabaseStub(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create publication supabase_realtime;`);
  return pg;
}

export interface MigrateResult {
  applied: number;
  skipped: number;
}

/**
 * Applies pending migrations from `dir` (default: the repo's), optionally only the first `upTo` journal entries.
 * Mirrors drizzle's `migrate`: a migration runs only if the last ledger row's created_at is older than its `when`.
 */
export async function migrate(pg: PGlite, opts: { dir?: string; upTo?: number } = {}): Promise<MigrateResult> {
  const dir = opts.dir ?? MIGRATIONS_DIR;
  await pg.exec(
    `create schema if not exists drizzle;
     create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`,
  );
  const last = (await pg.query<{ created_at: string }>(`select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1`))
    .rows[0];
  let applied = 0;
  let skipped = 0;
  const all = readMigrationFiles({ migrationsFolder: dir });
  const files = opts.upTo === undefined ? all : all.slice(0, opts.upTo);
  for (const m of files) {
    if (last && Number(last.created_at) >= m.folderMillis) {
      skipped++;
      continue;
    }
    await pg.exec("begin");
    try {
      for (const stmt of m.sql) await pg.exec(stmt);
      await pg.query(`insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)`, [m.hash, m.folderMillis]);
      await pg.exec("commit");
    } catch (e) {
      await pg.exec("rollback");
      throw new Error(`migration @${m.folderMillis} failed: ${(e as Error).message}`);
    }
    applied++;
  }
  return { applied, skipped };
}

/** A migrated database (the whole chain from empty). */
export async function newMigratedDb(): Promise<PGlite> {
  const pg = await newSupabaseStub();
  await migrate(pg);
  return pg;
}

/** Creates an auth user the way the app sees one (id is what every user_id FK points at). */
export async function createAuthUser(pg: PGlite, id: string = crypto.randomUUID()): Promise<string> {
  await pg.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@example.test`]);
  return id;
}
