// @vitest-environment node
/**
 * The permanent manual grant against REAL Postgres with the repo's real migration chain (embedded PGlite): it passes
 * the 0024 CHECK constraints, it is Premium with no end, it is audited, re-granting is a no-op, and no webhook,
 * refresh, reconcile or lapse sweep can override it.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asBillingDb, createAuthUser, newMigratedDb } from "../../../tests/unit/helpers/pglite-db";
import { loadBillingConfig, type BillingConfig } from "./config";
import type { Db } from "./db";
import { MANUAL_GRANT_ACCESS_UNTIL, hasPremium } from "./entitlement";
import { getPremiumDecision } from "./gate";
import { removeLapsedBankConnections } from "./lapse";
import { applyManualGrant, inspectGrantTargets, planGrant, revokeManualGrant, type GrantAudit } from "./manual-grant";
import { processRevenueCatEvent } from "./processor";
import { conversionEvent, DAY, T0, trialEvent } from "./revenuecat/fixtures";
import { reconcileStale, refreshEntitlement } from "./service";
import { loadEntitlement } from "./store";

let pg: PGlite;
let db: Db;
beforeAll(async () => {
  pg = await newMigratedDb();
  db = asBillingDb(pg);
}, 120_000);
afterAll(async () => {
  await pg.close();
});
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const NOW = new Date(T0 + DAY);
const auditAt = (now = NOW): GrantAudit => ({ reason: "owner account, launch spec §9", grantedBy: "owner", environment: "sandbox", now });
const events = async (userId: string) =>
  (await pg.query<{ provider: string; event_type: string; status: string; payload: Record<string, unknown> }>(
    `select provider, event_type, status, payload from billing_events where user_id = $1 and provider = 'manual' order by received_at`,
    [userId],
  )).rows;

async function granted(): Promise<string> {
  const u = await createAuthUser(pg);
  expect(await applyManualGrant(db, u, auditAt())).toEqual({ outcome: "granted" });
  return u;
}

describe("applyManualGrant", () => {
  it("writes an active, never-ending manual entitlement that passes the 0024 constraints, with its audit row", async () => {
    const u = await granted();
    const e = await loadEntitlement(db, u);
    expect(e).toMatchObject({ state: "active", provider: "manual", store: null, productId: null, willRenew: false, accessUntil: MANUAL_GRANT_ACCESS_UNTIL });
    expect(hasPremium(e, NOW)).toBe(true);
    expect(hasPremium(e, new Date("9000-01-01T00:00:00Z"))).toBe(true);
    expect(await events(u)).toEqual([
      {
        provider: "manual",
        event_type: "MANUAL_GRANT",
        status: "processed",
        payload: { reason: "owner account, launch spec §9", granted_by: "owner", access_until: MANUAL_GRANT_ACCESS_UNTIL.toISOString(), previous: null },
      },
    ]);
  });

  it("is idempotent: re-granting changes nothing and writes no second audit row", async () => {
    const u = await granted();
    const before = await loadEntitlement(db, u);
    expect(await applyManualGrant(db, u, auditAt(new Date(NOW.getTime() + DAY)))).toEqual({ outcome: "already_granted" });
    expect(await loadEntitlement(db, u)).toEqual(before);
    expect(await events(u)).toHaveLength(1);
  });

  it("upgrades an ended store entitlement, recording what it replaced", async () => {
    const u = await createAuthUser(pg);
    await pg.query(`insert into entitlements (user_id, state, provider, store, product_id, access_until) values ($1, 'expired', 'revenuecat', 'apple', 'budgts_monthly', $2)`, [u, new Date(T0)]);
    expect(await applyManualGrant(db, u, auditAt())).toEqual({ outcome: "granted" });
    expect(await loadEntitlement(db, u)).toMatchObject({ state: "active", provider: "manual", store: null, productId: null });
    expect((await events(u))[0].payload.previous).toEqual({ state: "expired", provider: "revenuecat", access_until: new Date(T0).toISOString() });
  });

  it("refuses to overwrite a live store subscription, and writes nothing", async () => {
    const u = await createAuthUser(pg);
    await processRevenueCatEvent({ db, environment: "production", now: () => NOW }, trialEvent(u));
    const before = await loadEntitlement(db, u);
    expect(await applyManualGrant(db, u, auditAt())).toMatchObject({ outcome: "refused" });
    expect(await loadEntitlement(db, u)).toEqual(before);
    expect(await events(u)).toEqual([]);
  });

  it("refuses an account whose deletion has started, and creates no row", async () => {
    const u = await createAuthUser(pg);
    await pg.query(`insert into account_deletions (user_id) values ($1)`, [u]);
    expect(await applyManualGrant(db, u, auditAt())).toMatchObject({ outcome: "refused" });
    expect(await loadEntitlement(db, u)).toBeNull();
  });
});

describe("inspectGrantTargets and planGrant (the dry run reads only)", () => {
  it("resolves emails case-insensitively, reports unknown ones, and plans without writing", async () => {
    const u = await createAuthUser(pg);
    const [found, missing] = await inspectGrantTargets(db, [`${u}@EXAMPLE.test`, "nobody@example.test"]);
    expect(found).toMatchObject({ userId: u, ambiguous: false, deleting: false, current: null });
    expect(missing).toMatchObject({ userId: null, ambiguous: false });
    expect(planGrant(found.current, NOW)).toMatchObject({ kind: "grant", next: { state: "active", provider: "manual" } });
    expect(await loadEntitlement(db, u)).toBeNull();
  });
});

describe("nothing a provider does can override a grant", () => {
  it("webhooks: an expiration, a refund and a billing issue leave it untouched and are logged as such", async () => {
    const u = await granted();
    const before = await loadEntitlement(db, u);
    const later = () => new Date(T0 + 50 * DAY);
    await processRevenueCatEvent({ db, environment: "production", now: later }, trialEvent(u));
    await processRevenueCatEvent({ db, environment: "production", now: later }, conversionEvent(u, T0 + 7 * DAY, { original_transaction_id: `otx-${u}` }));
    expect(await loadEntitlement(db, u)).toEqual(before);
    expect(hasPremium(await loadEntitlement(db, u), later())).toBe(true);
    const logged = (await pg.query<{ error: string | null }>(`select error from billing_events where user_id = $1 and provider = 'revenuecat'`, [u])).rows;
    expect(logged.length).toBeGreaterThan(0);
    for (const l of logged) expect(l.error).toBe("manual grant: entitlement not changed");
  });

  const config = (): BillingConfig => ({ ...loadBillingConfig({}), secretApiKey: "sk_test_secret", environment: "production" });
  const expiredSubscriber = () =>
    new Response(
      JSON.stringify({
        subscriber: { subscriptions: { budgts_monthly: { store: "app_store", is_sandbox: false, period_type: "normal", purchase_date: new Date(T0).toISOString(), expires_date: new Date(T0 + DAY / 2).toISOString() } } },
      }),
    );

  it("refresh: the provider's snapshot saying 'expired' does not end it", async () => {
    const u = await granted();
    const before = await loadEntitlement(db, u);
    const r = await refreshEntitlement({ db, config: config(), now: () => new Date(T0 + 10 * DAY), fetchImpl: (async () => expiredSubscriber()) as unknown as typeof fetch }, u);
    expect(r.view).toMatchObject({ hasPremium: true, status: "active" });
    expect(await loadEntitlement(db, u)).toMatchObject({ state: before!.state, provider: "manual", accessUntil: MANUAL_GRANT_ACCESS_UNTIL });
  });

  it("reconcile: the scheduled sweep never selects a grant", async () => {
    const u = await granted();
    const calls: string[] = [];
    await reconcileStale(
      { db, config: config(), now: () => new Date(T0 + 10 * DAY), fetchImpl: (async (url: string) => (calls.push(String(url)), expiredSubscriber())) as unknown as typeof fetch },
      { limit: 500 },
    );
    expect(calls.some((c) => c.includes(u))).toBe(false);
  });

  it("the lapse sweep never selects a grant, even one whose dates say it ended long ago", async () => {
    const u = await granted();
    const v = await createAuthUser(pg);
    // A manual row with a past access window cannot come from the tool; the sweep must still leave it alone.
    await pg.query(`insert into entitlements (user_id, state, provider, access_until) values ($1, 'expired', 'manual', $2)`, [v, new Date(T0 - 30 * DAY)]);
    for (const user of [u, v]) await pg.query(`insert into plaid_items (user_id, item_id, access_token_enc) values ($1, $2, 'enc')`, [user, `item-${user}`]);
    const removeItem = vi.fn(async () => ({ ok: true as const }));
    await removeLapsedBankConnections({ db, now: () => new Date(T0 + 400 * DAY), removeItem }, { limit: 500 });
    expect(removeItem.mock.calls.map((c) => (c as unknown[])[0])).not.toContain(u);
    expect(removeItem.mock.calls.map((c) => (c as unknown[])[0])).not.toContain(v);
  });

  it("is Premium for the gate decision", async () => {
    const u = await granted();
    expect(await getPremiumDecision(db, u, new Date(T0 + 1000 * DAY))).toMatchObject({ hasPremium: true, view: { status: "active", willRenew: false } });
  });
});

describe("revokeManualGrant", () => {
  it("ends access now, hands the row back to the providers, and audits it; a second revoke changes nothing", async () => {
    const u = await granted();
    const at = new Date(T0 + 3 * DAY);
    expect(await revokeManualGrant(db, u, auditAt(at))).toEqual({ outcome: "revoked" });
    const e = await loadEntitlement(db, u);
    expect(e).toMatchObject({ state: "expired", provider: null, accessUntil: at });
    expect(hasPremium(e, at)).toBe(false);
    expect((await events(u)).map((x) => x.event_type)).toEqual(["MANUAL_GRANT", "MANUAL_GRANT_REVOKED"]);
    expect(await revokeManualGrant(db, u, auditAt(new Date(at.getTime() + DAY)))).toEqual({ outcome: "not_granted" });
    expect(await events(u)).toHaveLength(2);
  });

  it("never touches a user without a grant (and creates no row)", async () => {
    const u = await createAuthUser(pg);
    expect(await revokeManualGrant(db, u, auditAt())).toEqual({ outcome: "not_granted" });
    expect(await loadEntitlement(db, u)).toBeNull();
  });
});
