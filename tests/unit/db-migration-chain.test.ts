// @vitest-environment node
/**
 * The COMPLETE migration chain, proven from an EMPTY database on real (embedded) Postgres, not on the shared
 * staging database. Covers order/dependency correctness, the production-like release (an existing database
 * receives the pending migrations in one run), and the timestamp-skip trap: drizzle skips any migration whose
 * journal `when` is not newer than the last one applied, so a renumbered migration stamped too early would be
 * silently skipped on a database that is already ahead of it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createAuthUser, migrate, newMigratedDb, newSupabaseStub, readJournal } from "./helpers/pglite-db";

const journal = readJournal();

describe("migration chain from an empty database", () => {
  let pg: PGlite;
  beforeAll(async () => {
    pg = await newMigratedDb();
  }, 120_000);
  afterAll(async () => {
    await pg.close();
  });

  it("applies every journal entry, with none skipped", async () => {
    const [{ n }] = (await pg.query<{ n: number }>(`select count(*)::int n from drizzle.__drizzle_migrations`)).rows;
    expect(n).toBe(journal.length);
    journal.forEach((e, i) => expect(e.idx, e.tag).toBe(i));
  });

  it("stamps every migration from 0016 on strictly after the one before it (drizzle skips anything older)", () => {
    // 0014/0015 carry a historical 1 ms inversion in the baseline; everything from 0016 on must strictly increase,
    // otherwise a database that already holds a later migration would silently skip the older-stamped one.
    const tail = journal.filter((e) => e.idx >= 16);
    for (let i = 1; i < tail.length; i++) {
      expect(tail[i].when, `${tail[i].tag} must be stamped after ${tail[i - 1].tag}`).toBeGreaterThan(tail[i - 1].when);
    }
  });

  it("keeps the per-user time zone invariant: an onboarded profile must carry a zone", async () => {
    const id = await createAuthUser(pg);
    await pg.query(`insert into profiles (id, currency) values ($1, 'USD') on conflict (id) do nothing`, [id]);
    await expect(pg.query(`update profiles set onboarded_at = now() where id = $1`, [id])).rejects.toThrow(
      /profiles_time_zone_when_onboarded/,
    );
    await pg.query(`update profiles set onboarded_at = now(), time_zone = 'Europe/Paris' where id = $1`, [id]);
  });
});

describe("production-like release: an existing database receives the pending migrations in ONE run", () => {
  it("a database at 0016 gets everything after it, skipping none, and a re-run is a no-op", async () => {
    const pg = await newSupabaseStub();
    try {
      expect(await migrate(pg, { upTo: 17 })).toEqual({ applied: 17, skipped: 0 });
      expect(await migrate(pg)).toEqual({ applied: journal.length - 17, skipped: 17 });
      expect(await migrate(pg)).toEqual({ applied: 0, skipped: journal.length });
    } finally {
      await pg.close();
    }
  }, 120_000);
});
