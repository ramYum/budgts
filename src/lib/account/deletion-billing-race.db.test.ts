// @vitest-environment node
/**
 * Account deletion vs a store subscription the LOCAL records do not know about yet — on real Postgres with the real
 * migration chain (embedded PGlite). The provider is a stubbed `fetch`; `deleteAccount` and the deletion store are the
 * production code, and the Auth admin fake's hard delete is a real DELETE against auth.users.
 *
 * The race: the store has charged the customer, RevenueCat knows, but the webhook has not reached us. The local ledger
 * is empty, so a purely local check would pick Path A and hard-delete the customer's record just before the charge
 * lands. The provider check must steer this to Path B; deletion must never be BLOCKED by any of it.
 */
import type { PGlite } from "@electric-sql/pglite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { asBillingDb, createAuthUser, newMigratedDb } from "../../../tests/unit/helpers/pglite-db";
import { loadBillingConfig, type BillingConfig } from "../billing/config";
import type { Db } from "../billing/db";
import { createBillingCheck } from "../billing/deletion-check";
import { processRevenueCatEvent } from "../billing/processor";
import { conversionEvent, DAY, mapped, T0, trialEvent } from "../billing/revenuecat/fixtures";
import { loadEntitlement } from "../billing/store";

vi.mock("server-only", () => ({}));
import { deleteAccount } from "./delete-account";
import { createDeletionStore } from "./deletion-store";

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

function fakeAdmin(pg: PGlite) {
  const soft = new Map<string, { deleted_at: string; banned_until?: string }>();
  const calls: string[] = [];
  const admin = {
    from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const r = await pg.query(`select id from auth.users where id = $1`, [id]);
          if (!r.rows[0]) return { data: { user: null }, error: { status: 404, code: "user_not_found", message: "User not found", name: "AuthApiError" } };
          return { data: { user: { id, email: `${id}@example.test`, ...soft.get(id) } }, error: null };
        },
        deleteUser: async (id: string, soft_: boolean) => {
          calls.push(soft_ ? "soft" : "hard");
          if (soft_) {
            soft.set(id, { deleted_at: new Date().toISOString() });
            await pg.query(`update auth.users set email = null where id = $1`, [id]);
            return { error: null };
          }
          try {
            await pg.query(`delete from auth.users where id = $1`, [id]);
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
const cfg = (over: Partial<BillingConfig> = {}): BillingConfig => ({ ...loadBillingConfig({}), secretApiKey: "sk_test", environment: "production", ...over });
const apply = (m: ReturnType<typeof mapped>, now = NOW) => processRevenueCatEvent({ db, environment: "production", now: () => now }, m);
const store = () => createDeletionStore({ db: drizzleFacade(pg) as never });
const rows = async (table: string, id: string) => (await pg.query(`select 1 from ${table} where user_id = $1`, [id])).rows.length;
const authRow = async (id: string) => (await pg.query(`select 1 from auth.users where id = $1`, [id])).rows.length;

/** A documented-shape RevenueCat subscriber response. */
const subscriber = (over: Record<string, unknown> = {}) => ({
  subscriber: { subscriptions: { budgts_monthly: { store: "app_store", is_sandbox: false, period_type: "normal", purchase_date: new Date(T0 + 14 * DAY).toISOString(), expires_date: new Date(T0 + 44 * DAY).toISOString(), ...over } } },
});
const provider = (respond: () => { status?: number; body?: unknown } | Error) =>
  (async () => {
    const r = respond();
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
const check = (f: typeof fetch, config = cfg()) => createBillingCheck({ db, config, now: () => NOW, fetchImpl: f });

describe("THE RACE: the store says paid, the webhook has not been processed, deletion is requested", () => {
  it("does NOT hard-delete: the provider's paid period forces Path B, the row is retained, and the late charge lands in the ledger", async () => {
    const u = await createAuthUser(pg);
    const otx = `otx-${u}`;
    // Local truth is STALE: only the trial was ever processed; the conversion webhook is still in flight.
    await apply(trialEvent(u, T0, { original_transaction_id: otx }), new Date(T0 + DAY));
    expect(await rows("payments", u)).toBe(0);
    const s = store();
    expect(await s.hasMonetizationHistory(u)).toBe(false); // a local-only decision would now pick Path A

    const { admin, calls } = fakeAdmin(pg);
    const result = await deleteAccount(admin, u, s, check(provider(() => ({ body: subscriber() }))));
    expect(result).toEqual({ ok: true, alreadyDeleted: false, path: "anonymize", storeSubscriptionMayBeActive: true });
    expect(calls).toEqual(["soft"]); // never attempted the hard delete
    expect(await authRow(u)).toBe(1); // retained, so the charge can still be recorded against it
    expect(await rows("entitlements", u)).toBe(0); // owned operational data is still deleted

    // The delayed webhook now arrives: the money is ledgered even though the account is gone.
    const late = await apply(conversionEvent(u, T0 + 14 * DAY, { original_transaction_id: otx }), NOW);
    expect(late).toMatchObject({ status: "processed", charged: true, entitlementSkipped: "account_deleting" });
    expect(await rows("payments", u)).toBe(1);
    expect(await rows("entitlements", u)).toBe(0);
  });

  it("CONTROL: the provider shows only a free trial (no charge) -> Path A hard delete, as before", async () => {
    const u = await createAuthUser(pg);
    await apply(trialEvent(u, T0, { original_transaction_id: `otx-${u}` }), new Date(T0 + DAY));
    const { admin, calls } = fakeAdmin(pg);
    const trialOnly = subscriber({ period_type: "trial", expires_date: new Date(T0 + 24 * DAY).toISOString() });
    const result = await deleteAccount(admin, u, store(), check(provider(() => ({ body: trialOnly }))));
    expect(result).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete", storeSubscriptionMayBeActive: true }); // trial still running: tell them
    expect(calls).toEqual(["hard"]);
    expect(await authRow(u)).toBe(0);
  });

  it("paid, then cancelled and expired at the provider (nothing local yet): the historical charge still forces Path B, with no store warning", async () => {
    const u = await createAuthUser(pg);
    const { admin } = fakeAdmin(pg);
    const expired = subscriber({ expires_date: new Date(T0 + 15 * DAY).toISOString(), unsubscribe_detected_at: new Date(T0 + 10 * DAY).toISOString() });
    const result = await deleteAccount(admin, u, store(), check(provider(() => ({ body: expired }))));
    expect(result).toEqual({ ok: true, alreadyDeleted: false, path: "anonymize" }); // no flag: nothing left running
    expect(await authRow(u)).toBe(1);
  });

  it("a sandbox subscription is ignored by a production deployment (it cannot force Path B)", async () => {
    const u = await createAuthUser(pg);
    const { admin } = fakeAdmin(pg);
    const result = await deleteAccount(admin, u, store(), check(provider(() => ({ body: subscriber({ is_sandbox: true }) }))));
    expect(result).toMatchObject({ ok: true, path: "hard-delete" });
    expect(await authRow(u)).toBe(0);
  });
});

describe("when the provider cannot be asked, the answer is conservative — and deletion is never blocked", () => {
  const down = () => provider(() => new Error("network down"));

  it("an account that ever had a store subscription locally is presumed to have been charged: Path B", async () => {
    const u = await createAuthUser(pg);
    await apply(trialEvent(u, T0, { original_transaction_id: `otx-${u}` }), new Date(T0 + DAY));
    const { admin, calls } = fakeAdmin(pg);
    const r = await deleteAccount(admin, u, store(), check(down()));
    expect(r).toMatchObject({ ok: true, path: "anonymize", storeSubscriptionMayBeActive: true });
    expect(calls).toEqual(["soft"]);
  });

  it("an account that never touched billing is unaffected by an unreachable provider: Path A", async () => {
    const u = await createAuthUser(pg);
    const { admin } = fakeAdmin(pg);
    expect(await deleteAccount(admin, u, store(), check(down()))).toEqual({ ok: true, alreadyDeleted: false, path: "hard-delete" });
    expect(await authRow(u)).toBe(0);
  });

  it("a provider 5xx or a malformed answer is treated as unreachable, not as 'no charge'", async () => {
    for (const f of [provider(() => ({ status: 500 })), provider(() => ({ body: { nope: true } }))]) {
      const u = await createAuthUser(pg);
      await apply(trialEvent(u, T0, { original_transaction_id: `otx-${u}` }), new Date(T0 + DAY));
      const { admin } = fakeAdmin(pg);
      expect(await deleteAccount(admin, u, store(), check(f))).toMatchObject({ ok: true, path: "anonymize" });
    }
  });

  it("no billing key configured: the local ledger alone decides, exactly as before", async () => {
    const u = await createAuthUser(pg);
    const { admin } = fakeAdmin(pg);
    const f = vi.fn(provider(() => ({ body: subscriber() })));
    const r = await deleteAccount(admin, u, store(), check(f as unknown as typeof fetch, cfg({ secretApiKey: null })));
    expect(r).toMatchObject({ ok: true, path: "hard-delete" });
    expect(f).not.toHaveBeenCalled();
  });

  it("a check that itself throws never blocks or misdirects deletion", async () => {
    const u = await createAuthUser(pg);
    const { admin } = fakeAdmin(pg);
    const boom = async () => {
      throw new Error("billing wiring exploded");
    };
    expect(await deleteAccount(admin, u, store(), boom)).toMatchObject({ ok: true, path: "hard-delete" });
  });
});

describe("local history still decides on its own, and a stale local entitlement cannot mask a provider charge", () => {
  it("ledger history without any provider check (the pre-existing behaviour) is still Path B", async () => {
    const u = await createAuthUser(pg);
    await apply(conversionEvent(u, T0, { original_transaction_id: `otx-${u}` }), new Date(T0 + DAY));
    const { admin, calls } = fakeAdmin(pg);
    expect(await deleteAccount(admin, u, store())).toMatchObject({ ok: true, path: "anonymize" });
    expect(calls).toEqual(["soft"]);
    expect((await loadEntitlement(db, u))).toBeNull();
  });
});
