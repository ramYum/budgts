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
import fs from "node:fs";
import path from "node:path";
import { createAuthUser, MIGRATIONS_DIR, migrate, newMigratedDb, newSupabaseStub, readJournal } from "./helpers/pglite-db";

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
    expect(journal.at(-1)?.tag).toBe("0024_entitlements_and_billing_events");
    // main's 0017 (sync lease) and 0018 (time zone) stay where production has them; the ported work follows.
    expect(journal.slice(17).map((e) => e.tag)).toEqual([
      "0017_thin_goblin_queen",
      "0018_profiles_time_zone",
      "0019_deletion_fk_indexes",
      "0020_transactions_account_fk_index",
      "0021_account_deletion_write_guard",
      "0022_deletion_guard_allow_bank_disconnect",
      "0023_monetization_ledger",
      "0024_entitlements_and_billing_events",
    ]);
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

  it("creates the V1 tables, the ledger, and their RLS", async () => {
    const tables = (await pg.query<{ t: string }>(
      `select tablename t from pg_tables where schemaname = 'public' and tablename in
        ('entitlements','billing_events','subscriptions','payments','redemptions','revenue_allocations','account_deletions')`,
    )).rows.map((r) => r.t).sort();
    expect(tables).toEqual(["account_deletions", "billing_events", "entitlements", "payments", "redemptions", "revenue_allocations", "subscriptions"]);
    const rls = (await pg.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname in ('entitlements','billing_events','subscriptions','payments') and relkind = 'r'`,
    )).rows;
    expect(rls.every((r) => r.relrowsecurity)).toBe(true);
    // Budgts sends no trial-end reminder (owner decision 2026-09-22), so the entitlement carries no reminder state.
    const reminderCols = (await pg.query(
      `select column_name from information_schema.columns where table_name = 'entitlements' and column_name like 'reminder%'`,
    )).rows;
    expect(reminderCols).toEqual([]);
  });

  it("entitlements is owner-read-only; billing_events is closed to every client role", async () => {
    const pol = (await pg.query<{ tablename: string; cmd: string; qual: string | null }>(
      `select tablename, cmd, qual from pg_policies where schemaname='public' and tablename in ('entitlements','billing_events')`,
    )).rows;
    expect(pol.filter((p) => p.tablename === "entitlements").map((p) => p.cmd)).toEqual(["SELECT"]); // no client write policy at all
    expect(pol.filter((p) => p.tablename === "billing_events").every((p) => p.qual === "false")).toBe(true);
  });

  it("the deletion write guard still covers every table an authenticated user can write (nothing new escapes it)", async () => {
    const writable = (await pg.query<{ tablename: string }>(
      `select distinct tablename from pg_policies where schemaname='public' and permissive='PERMISSIVE' and 'authenticated' = any(roles)
         and cmd in ('ALL','INSERT','UPDATE','DELETE') and coalesce(qual, with_check) is distinct from 'false'`,
    )).rows.map((r) => r.tablename);
    expect(writable).not.toContain("entitlements");
    expect(writable).not.toContain("billing_events");
    expect(writable).not.toContain("subscriptions");
    expect(writable).not.toContain("payments");
  });

  describe("the trial-only vs paid deletion boundary (why the entitlement is not a ledger row)", () => {
    it("a user with ONLY an entitlement and billing events can be hard-deleted (Path A stays possible)", async () => {
      const id = await createAuthUser(pg);
      await pg.query(
        `insert into entitlements (user_id, state, provider, store, product_id, trial_started_at, trial_ends_at, access_until, will_renew)
         values ($1, 'trialing', 'revenuecat', 'apple', 'budgts_monthly', now(), now() + interval '7 days', now() + interval '7 days', true)`,
        [id],
      );
      await pg.query(
        `insert into billing_events (provider, provider_event_id, event_type, user_id, app_user_id, environment, occurred_at, payload)
         values ('revenuecat', $1, 'INITIAL_PURCHASE', $2, $3, 'production', now(), '{}')`,
        [`evt-${id}`, id, id],
      );
      await pg.query(`delete from auth.users where id = $1`, [id]);
      expect((await pg.query(`select 1 from entitlements where user_id = $1`, [id])).rows).toHaveLength(0);
      expect((await pg.query(`select 1 from billing_events where user_id = $1`, [id])).rows).toHaveLength(0);
    });

    it("a user with ledger history CANNOT be hard-deleted (Path B is forced by the RESTRICT foreign key)", async () => {
      const id = await createAuthUser(pg);
      await pg.query(
        `insert into subscriptions (user_id, platform, platform_subscription_id, plan, status, first_paid_at)
         values ($1, 'apple', $2, 'monthly', 'active', now())`,
        [id, `orig-${id}`],
      );
      await expect(pg.query(`delete from auth.users where id = $1`, [id])).rejects.toThrow(/violates RESTRICT setting of foreign key constraint "subscriptions_user_id_auth_users_fk"/);
    });
  });

  describe("entitlement invariants are enforced by the database", () => {
    it("an entitled state must carry access_until, and a trial its authoritative end", async () => {
      const a = await createAuthUser(pg);
      await expect(pg.query(`insert into entitlements (user_id, state) values ($1, 'active')`, [a])).rejects.toThrow(/access_until_when_entitled/);
      const b = await createAuthUser(pg);
      await expect(pg.query(`insert into entitlements (user_id, state, access_until) values ($1, 'trialing', now())`, [b])).rejects.toThrow(/trial_ends_when_trialing/);
      const c = await createAuthUser(pg);
      await expect(pg.query(`insert into entitlements (user_id, state) values ($1, 'gold')`, [c])).rejects.toThrow(/state_valid/);
    });
  });

  describe("billing_events is an idempotent, append-only record", () => {
    it("rejects a duplicate (provider, provider_event_id)", async () => {
      const ins = () =>
        pg.query(
          `insert into billing_events (provider, provider_event_id, event_type, environment, occurred_at, payload)
           values ('revenuecat', 'evt-dup', 'RENEWAL', 'production', now(), '{}')`,
        );
      await ins();
      await expect(ins()).rejects.toThrow(/billing_events_provider_event_uq/);
    });

    it("freezes identity and payload, makes terminal outcomes final, and still lets a failed event finish", async () => {
      await pg.query(
        `insert into billing_events (provider, provider_event_id, event_type, environment, occurred_at, payload)
         values ('revenuecat', 'evt-frozen', 'RENEWAL', 'production', now(), '{"a":1}')`,
      );
      await expect(pg.query(`update billing_events set payload = '{"a":2}' where provider_event_id = 'evt-frozen'`)).rejects.toThrow(/immutable/);
      await expect(pg.query(`update billing_events set event_type = 'EXPIRATION' where provider_event_id = 'evt-frozen'`)).rejects.toThrow(/immutable/);
      await pg.query(`update billing_events set status = 'failed', error = 'boom', attempts = 1 where provider_event_id = 'evt-frozen'`);
      await pg.query(`update billing_events set status = 'processed', processed_at = now() where provider_event_id = 'evt-frozen'`); // failed -> processed is allowed
      await expect(pg.query(`update billing_events set status = 'received' where provider_event_id = 'evt-frozen'`)).rejects.toThrow(/terminal/);
    });
  });

  describe("the financial ledger keeps its guarantees", () => {
    it("payments are immutable facts, unique by external transaction id", async () => {
      const id = await createAuthUser(pg);
      const [{ sid }] = (await pg.query<{ sid: string }>(
        `insert into subscriptions (user_id, platform, platform_subscription_id, plan, status, first_paid_at)
         values ($1, 'google', $2, 'annual', 'active', now()) returning id sid`,
        [id, `orig-${id}`],
      )).rows;
      const pay = () =>
        pg.query(
          `insert into payments (subscription_id, user_id, external_transaction_id, platform, type, customer_paid_amount, currency, period_start, period_end, occurred_at)
           values ($1, $2, 'txn-1', 'google', 'initial', 6900, 'USD', now(), now() + interval '1 year', now())`,
          [sid, id],
        );
      await pay();
      await expect(pay()).rejects.toThrow(/payments_external_transaction_id_uq/);
      await expect(pg.query(`update payments set customer_paid_amount = 1 where external_transaction_id = 'txn-1'`)).rejects.toThrow(/immutable financial fact/);
      await expect(pg.query(`delete from payments where external_transaction_id = 'txn-1'`)).rejects.toThrow(/immutable financial fact/);
    });
  });
});

describe("the pre-deploy production probe (supabase/probes/0019-0024-preflight.sql)", () => {
  const probe = fs.readFileSync(path.join(MIGRATIONS_DIR, "..", "probes", "0019-0024-preflight.sql"), "utf8");

  it("passes on a database that has every migration", async () => {
    const pg = await newMigratedDb();
    try {
      const rows = (await pg.query<{ check: string; ok: boolean }>(probe)).rows;
      expect(rows.length).toBeGreaterThanOrEqual(9);
      expect(rows.filter((r) => !r.ok).map((r) => r.check)).toEqual([]);
    } finally {
      await pg.close();
    }
  }, 120_000);

  it("fails on production as it is today (0000-0018), so it would stop a deploy that came first", async () => {
    const pg = await newSupabaseStub();
    try {
      await migrate(pg, { upTo: 19 });
      const rows = (await pg.query<{ check: string; ok: boolean }>(probe)).rows;
      expect(rows.every((r) => !r.ok)).toBe(true);
    } finally {
      await pg.close();
    }
  }, 120_000);
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

  it("production today (0000-0018) receives the six ported migrations in one run", async () => {
    const pg = await newSupabaseStub();
    try {
      expect(await migrate(pg, { upTo: 19 })).toEqual({ applied: 19, skipped: 0 });
      expect(await migrate(pg)).toEqual({ applied: 6, skipped: 19 });
    } finally {
      await pg.close();
    }
  }, 120_000);

  it("the deletion release can go out WITHOUT the monetization migrations (0019-0022 only)", async () => {
    const pg = await newSupabaseStub();
    try {
      await migrate(pg, { upTo: 19 });
      expect(await migrate(pg, { upTo: 23 })).toEqual({ applied: 4, skipped: 19 });
      const t = (await pg.query<{ n: number }>(
        `select count(*)::int n from pg_tables where schemaname='public' and tablename in ('subscriptions','entitlements')`,
      )).rows[0].n;
      expect(t).toBe(0); // the ledger and entitlement tables are absent, which deletion tolerates (to_regclass check)
    } finally {
      await pg.close();
    }
  }, 120_000);
});
