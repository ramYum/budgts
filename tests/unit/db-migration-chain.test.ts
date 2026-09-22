// @vitest-environment node
/**
 * The COMPLETE migration chain, proven from an EMPTY database on real (embedded) Postgres — not on the shared,
 * drifted staging database. Covers: order/dependency correctness, the production-like two-step release
 * (0000-0016 already applied, then 0017-0022), the timestamp-skip trap that bit the ledger's old "0017" number,
 * and the schema guarantees the monetization design relies on.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createAuthUser, migrate, newMigratedDb, newSupabaseStub, readJournal } from "./helpers/pglite-db";

const journal = readJournal();
const tagIdx = (prefix: string) => journal.findIndex((e) => e.tag.startsWith(prefix));

describe("migration chain from an empty database", () => {
  let pg: PGlite;
  beforeAll(async () => {
    pg = await newMigratedDb();
  }, 120_000);
  afterAll(async () => {
    await pg.close();
  });

  it("applies every journal entry, 0000 through the monetization migrations, with none skipped", async () => {
    const [{ n }] = (await pg.query<{ n: number }>(`select count(*)::int n from drizzle.__drizzle_migrations`)).rows;
    expect(n).toBe(journal.length);
    expect(journal.at(-1)?.tag).toBe("0022_entitlements_and_billing_events");
    expect(tagIdx("0017_deletion")).toBe(17);
    expect(tagIdx("0020_")).toBe(20);
    expect(tagIdx("0021_monetization_ledger")).toBe(21);
  });

  it("stamps the ledger and the entitlement migrations AFTER the deletion migrations (drizzle skips anything older)", () => {
    // 0014/0015 carry a historical 1 ms inversion in the baseline; everything from 0016 on must strictly increase,
    // otherwise a database that already holds 0020 would silently skip the newer migration.
    const tail = journal.filter((e) => e.idx >= 16);
    for (let i = 1; i < tail.length; i++) expect(tail[i].when, `${tail[i].tag} must be stamped after ${tail[i - 1].tag}`).toBeGreaterThan(tail[i - 1].when);
    expect(journal[21].when).toBeGreaterThan(journal[20].when);
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
         values ($1, 'trialing', 'revenuecat', 'apple', 'budgts_monthly', now(), now() + interval '14 days', now() + interval '14 days', true)`,
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

describe("production-like release: an existing database at 0016 receives the rest in ONE run", () => {
  it("applies exactly the 6 pending migrations (0017-0022), skipping none, and a re-run is a no-op", async () => {
    const pg = await newSupabaseStub();
    try {
      const first = await migrate(pg, { upTo: 17 }); // the state production is in
      expect(first).toEqual({ applied: 17, skipped: 0 });
      const release = await migrate(pg);
      expect(release).toEqual({ applied: journal.length - 17, skipped: 17 });
      expect(release.applied).toBe(6);
      expect(await migrate(pg)).toEqual({ applied: 0, skipped: journal.length });
    } finally {
      await pg.close();
    }
  }, 120_000);

  it("the deletion release can go out WITHOUT the monetization migrations (0017-0020 only)", async () => {
    const pg = await newSupabaseStub();
    try {
      await migrate(pg, { upTo: 17 });
      expect(await migrate(pg, { upTo: 21 })).toEqual({ applied: 4, skipped: 17 });
      const t = (await pg.query<{ n: number }>(`select count(*)::int n from pg_tables where schemaname='public' and tablename in ('subscriptions','entitlements')`)).rows[0].n;
      expect(t).toBe(0); // the ledger and entitlement tables are absent, which deletion tolerates (to_regclass check)
    } finally {
      await pg.close();
    }
  }, 120_000);
});
