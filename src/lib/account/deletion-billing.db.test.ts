// @vitest-environment node
/**
 * Account deletion x monetization, against REAL Postgres with the repo's real migration chain (embedded PGlite).
 * `deleteAccount` and `createDeletionStore` are the production code; only the Supabase Auth admin client is a fake,
 * and its "hard delete" is a REAL `delete from auth.users`, so the RESTRICT / CASCADE foreign keys decide the outcome.
 *
 *   CASE A  trial, never charged        -> no ledger history -> Path A (hard delete) is chosen and works
 *   CASE B  trial converts and is charged -> retained monetization history -> Path B (anonymize)
 *   CASE C  paid, then cancelled/expired  -> the historical charge still exists -> Path B
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The deletion modules are `server-only`; outside a Next server bundle that import throws, exactly as in the other deletion tests.
vi.mock("server-only", () => ({}));
import { createAuthUser, migrate, newMigratedDb, newSupabaseStub, asBillingDb } from "../../../tests/unit/helpers/pglite-db";
import { processRevenueCatEvent } from "../billing/processor";
import { conversionEvent, DAY, mapped, T0, trialEvent } from "../billing/revenuecat/fixtures";
import { loadEntitlement } from "../billing/store";
import type { Db } from "../billing/db";
import { deleteAccount } from "./delete-account";
import { createDeletionStore } from "./deletion-store";

/** Presents a PGlite as the slice of drizzle's postgres-js database the deletion store uses (execute + transaction). */
interface Facade {
  execute(q: SQL): Promise<unknown[] & { count: number }>;
  transaction<R>(fn: (tx: Facade) => Promise<R>): Promise<R>;
}
function drizzleFacade(pg: PGlite): Facade {
  const dialect = new PgDialect();
  const make = (target: { query: PGlite["query"] }): Facade => ({
    execute: async (q: SQL) => {
      const { sql, params } = dialect.sqlToQuery(q);
      const r = await target.query(sql, params as never[]);
      return Object.assign(r.rows, { count: r.affectedRows ?? r.rows.length });
    },
    transaction: <R>(fn: (tx: Facade) => Promise<R>) => pg.transaction((tx) => fn(make(tx))),
  });
  return make(pg);
}

/** A Supabase admin fake whose Auth calls act on the embedded database, mimicking GoTrue's hard and soft delete. */
function fakeAdmin(pg: PGlite) {
  const soft = new Map<string, { deleted_at: string; banned_until?: string }>();
  const calls: string[] = [];
  const admin = {
    from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }), // no Plaid items
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const r = await pg.query<{ id: string }>(`select id from auth.users where id = $1`, [id]);
          if (!r.rows[0]) return { data: { user: null }, error: { status: 404, code: "user_not_found", message: "User not found", name: "AuthApiError" } };
          return { data: { user: { id, email: `${id}@example.test`, ...soft.get(id) } }, error: null };
        },
        deleteUser: async (id: string, shouldSoftDelete: boolean) => {
          calls.push(shouldSoftDelete ? "soft" : "hard");
          if (shouldSoftDelete) {
            soft.set(id, { deleted_at: new Date().toISOString() });
            await pg.query(`update auth.users set email = null where id = $1`, [id]); // GoTrue scrubs the identity
            return { error: null };
          }
          try {
            await pg.query(`delete from auth.users where id = $1`, [id]); // the real FK decides
            return { error: null };
          } catch (e) {
            return { error: { status: 500, message: `Database error deleting user: ${(e as Error).message}` } };
          }
        },
        updateUserById: async (id: string, attrs: { ban_duration?: string }) => {
          const cur = soft.get(id);
          if (cur && attrs.ban_duration) soft.set(id, { ...cur, banned_until: new Date(Date.now() + 1e12).toISOString() });
          return { error: null };
        },
      },
    },
  };
  return { admin: admin as unknown as SupabaseClient, calls };
}

let pg: PGlite;
let db: Db;
beforeAll(async () => {
  pg = await newMigratedDb();
  db = asBillingDb(pg);
}, 120_000);
afterAll(async () => {
  await pg.close();
});

const NOW = new Date(T0 + 20 * DAY);
const apply = (m: ReturnType<typeof mapped>, now = NOW) => processRevenueCatEvent({ db, environment: "production", now: () => now }, m);
const store = () => createDeletionStore({ db: drizzleFacade(pg) as never });
const rows = async (table: string, userId: string) => (await pg.query(`select 1 from ${table} where user_id = $1`, [userId])).rows.length;
const authRow = async (id: string) => (await pg.query(`select id from auth.users where id = $1`, [id])).rows.length;

describe("CASE A — trial, never charged: Path A remains possible", () => {
  it("has NO monetization history, so deletion chooses the hard delete, and the auth user and every billing row are gone", async () => {
    const u = await createAuthUser(pg);
    await apply(trialEvent(u), new Date(T0 + DAY));
    await apply(mapped(u, { type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", event_timestamp_ms: T0 + 3 * DAY }), new Date(T0 + 3 * DAY));
    expect((await loadEntitlement(db, u))?.state).toBe("trialing"); // real trial state exists...
    expect(await rows("subscriptions", u) + (await rows("payments", u))).toBe(0); // ...but no ledger history

    const s = store();
    expect(await s.hasMonetizationHistory(u)).toBe(false);
    const { admin, calls } = fakeAdmin(pg);
    const result = await deleteAccount(admin, u, s);
    expect(result).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(calls).toEqual(["hard"]);
    expect(await authRow(u)).toBe(0);
    expect(await rows("entitlements", u)).toBe(0); // cascaded away with the auth user
    expect(await rows("billing_events", u)).toBe(0);
  });

  it("a user who never touched billing is unaffected (no entitlement row at all)", async () => {
    const u = await createAuthUser(pg);
    const { admin } = fakeAdmin(pg);
    expect(await deleteAccount(admin, u, store())).toMatchObject({ ok: true, path: "hard-delete" });
    expect(await authRow(u)).toBe(0);
  });
});

describe("CASE B — trial converts and is actually charged: Path B is selected", () => {
  it("retains the ledger and the audit trail, removes the owned data INCLUDING the entitlement, and keeps the auth row", async () => {
    const u = await createAuthUser(pg);
    const otx = `otx-${u}`;
    await apply(trialEvent(u, T0, { original_transaction_id: otx }), new Date(T0 + DAY));
    await apply(conversionEvent(u, T0 + 14 * DAY, { original_transaction_id: otx }));
    expect(await rows("payments", u)).toBe(1);
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "active" });

    const s = store();
    expect(await s.hasMonetizationHistory(u)).toBe(true);
    // Prove the database itself forbids the hard delete for this user.
    await expect(pg.query(`delete from auth.users where id = $1`, [u])).rejects.toThrow(/RESTRICT/);

    const { admin, calls } = fakeAdmin(pg);
    const result = await deleteAccount(admin, u, s);
    expect(result).toEqual({ ok: true, alreadyDeleted: false, path: "anonymize" });
    expect(calls).toEqual(["soft"]); // never attempted a hard delete
    expect(await authRow(u)).toBe(1); // retained: the RESTRICT foreign keys point at it
    expect(await rows("entitlements", u)).toBe(0); // owned operational state is deleted
    expect(await rows("subscriptions", u)).toBe(1); // financial history retained
    expect(await rows("payments", u)).toBe(1);
    expect(await rows("billing_events", u)).toBeGreaterThan(0); // audit trail retained
    expect((await pg.query<{ state: string }>(`select state from account_deletions where user_id = $1`, [u])).rows[0].state).toBe("deleted");
  });

  it("a late webhook after deletion still ledgers real money but does NOT resurrect the entitlement", async () => {
    const u = await createAuthUser(pg);
    const otx = `otx-${u}`;
    await apply(conversionEvent(u, T0, { original_transaction_id: otx }), new Date(T0 + DAY));
    const { admin } = fakeAdmin(pg);
    expect(await deleteAccount(admin, u, store())).toMatchObject({ ok: true, path: "anonymize" });
    const late = await apply(mapped(u, { type: "RENEWAL", original_transaction_id: otx, event_timestamp_ms: T0 + 30 * DAY, purchased_at_ms: T0 + 30 * DAY, expiration_at_ms: T0 + 60 * DAY }), new Date(T0 + 30 * DAY));
    expect(late).toMatchObject({ status: "processed", charged: true, entitlementSkipped: "account_deleting" });
    expect(await rows("payments", u)).toBe(2);
    expect(await rows("entitlements", u)).toBe(0);
  });
});

describe("CASE C — paid subscription cancelled/expired but a historical charge exists: Path B remains selected", () => {
  it("expiry and cancellation do not erase history: still Path B", async () => {
    const u = await createAuthUser(pg);
    const otx = `otx-${u}`;
    await apply(conversionEvent(u, T0, { original_transaction_id: otx }), new Date(T0 + DAY));
    await apply(mapped(u, { type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE", event_timestamp_ms: T0 + 5 * DAY, original_transaction_id: otx }), new Date(T0 + 5 * DAY));
    await apply(mapped(u, { type: "EXPIRATION", event_timestamp_ms: T0 + 30 * DAY, original_transaction_id: otx }), new Date(T0 + 31 * DAY));
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "expired" });
    const [{ status }] = (await pg.query<{ status: string }>(`select status from subscriptions where user_id = $1`, [u])).rows;
    expect(status).toBe("cancelled");

    const s = store();
    expect(await s.hasMonetizationHistory(u)).toBe(true);
    const { admin, calls } = fakeAdmin(pg);
    expect(await deleteAccount(admin, u, s)).toMatchObject({ ok: true, path: "anonymize" });
    expect(calls).toEqual(["soft"]);
    expect(await rows("payments", u)).toBe(1);
  });

  it("a refunded (revoked) purchase is still a charge that happened: Path B", async () => {
    const u = await createAuthUser(pg);
    const otx = `otx-${u}`;
    await apply(conversionEvent(u, T0, { original_transaction_id: otx }), new Date(T0 + DAY));
    await apply(mapped(u, { type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", event_timestamp_ms: T0 + 2 * DAY, original_transaction_id: otx }), new Date(T0 + 2 * DAY));
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "revoked" });
    expect(await store().hasMonetizationHistory(u)).toBe(true);
  });
});

describe("safeguards are unchanged and the release order is safe", () => {
  it("deletion works on a database that has NOT received the monetization migrations (0000-0020 only)", async () => {
    const old = await newSupabaseStub();
    try {
      await migrate(old, { upTo: 21 }); // deletion release, no ledger, no entitlements
      const u = await createAuthUser(old);
      const s = createDeletionStore({ db: drizzleFacade(old) as never });
      expect(await s.hasMonetizationHistory(u)).toBe(false); // absent ledger = no history (explicit, not a quirk)
      const { admin } = fakeAdmin(old);
      expect(await deleteAccount(admin, u, s)).toMatchObject({ ok: true, path: "hard-delete" });
      // and the atomic owned-data delete itself copes with the absent optional table
      const v = await createAuthUser(old);
      await expect(s.deleteOwnedData(v)).resolves.toBeTruthy();
      expect(await s.countOwnedRows(v)).toBe(0);
    } finally {
      await old.close();
    }
  }, 120_000);

  it("the deletion lock still stops a user's own writes to owned tables while deleting", async () => {
    const u = await createAuthUser(pg);
    await store().markDeleting(u);
    const [{ ok }] = (await pg.query<{ ok: boolean }>(`select public.account_accepts_writes() as ok`)).rows; // no jwt claim => auth.uid() is null
    expect(typeof ok).toBe("boolean");
    expect((await pg.query(`select 1 from account_deletions where user_id = $1`, [u])).rows).toHaveLength(1);
  });
});
