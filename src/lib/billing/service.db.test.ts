// @vitest-environment node
/**
 * Refresh / reconcile services, and the Premium decision — against REAL Postgres with the repo's real migration
 * chain (embedded PGlite). The provider is a stubbed `fetch` returning documented-shape RevenueCat subscriber
 * objects; no network is touched.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asBillingDb, createAuthUser, newMigratedDb } from "../../../tests/unit/helpers/pglite-db";
import { loadBillingConfig, type BillingConfig } from "./config";
import type { Db } from "./db";
import { hasPremium } from "./entitlement";
import { getPremiumDecision } from "./gate";
import { conversionEvent, DAY, T0, trialEvent } from "./revenuecat/fixtures";
import { processRevenueCatEvent } from "./processor";
import { getEntitlementView, reconcileStale, refreshEntitlement, type RefreshDeps } from "./service";
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

const HOUR = 3_600_000;
const config = (over: Partial<BillingConfig> = {}): BillingConfig => ({ ...loadBillingConfig({}), secretApiKey: "sk_test_secret", environment: "production", ...over });

/** Inserts an entitlement row directly. */
async function seedEntitlement(userId: string, o: Partial<Record<string, unknown>> = {}) {
  const trialEnds = (o.trial_ends_at as Date | undefined) ?? new Date(T0 + 14 * DAY);
  const row: Record<string, unknown> = { state: "trialing", will_renew: true, trial_ends_at: trialEnds, access_until: trialEnds, product_id: "budgts_monthly", store: "apple", trial_started_at: new Date(T0), ...o };
  await pg.query(
    `insert into entitlements (user_id, state, provider, store, product_id, will_renew, trial_started_at, trial_ends_at, access_until, renewal_price_amount, renewal_price_currency,
       reminder_for_trial_ends_at, reminder_claimed_at, reminder_sent_at, last_reconciled_at)
     values ($1,$2,'revenuecat',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [userId, row.state, row.store, row.product_id, row.will_renew, row.trial_started_at, row.trial_ends_at, row.access_until, row.renewal_price_amount ?? null, row.renewal_price_currency ?? null, row.reminder_for_trial_ends_at ?? null, row.reminder_claimed_at ?? null, row.reminder_sent_at ?? null, row.last_reconciled_at ?? null],
  );
}

// ---------------------------------------------------------------------------------------------------------------------

/** A documented-shape RevenueCat subscriber response. */
const subscriber = (over: Record<string, unknown> = {}) => ({
  subscriber: { subscriptions: { budgts_monthly: { store: "app_store", is_sandbox: false, period_type: "normal", purchase_date: new Date(T0 + 14 * DAY).toISOString(), expires_date: new Date(T0 + 44 * DAY).toISOString(), unsubscribe_detected_at: null, billing_issues_detected_at: null, grace_period_expires_date: null, ...over } } },
});
const fakeFetch = (respond: () => { status?: number; body?: unknown } | Error) => {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(String(url));
    const r = respond();
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
};
const depsAt = (now: Date, f: typeof fetch, cfg: Partial<BillingConfig> = {}): RefreshDeps => ({ db, config: config(cfg), now: () => now, fetchImpl: f });

describe("refresh / restore from the provider", () => {
  const NOW = new Date(T0 + 20 * DAY);

  it("REPAIRS a missed webhook: local state says trialing after the trial ended, the provider says active", async () => {
    const u = await createAuthUser(pg);
    await processRevenueCatEvent({ db, environment: "production", now: () => new Date(T0 + DAY) }, trialEvent(u));
    expect((await loadEntitlement(db, u))?.state).toBe("trialing"); // the conversion webhook never arrived
    const f = fakeFetch(() => ({ body: subscriber() }));
    const r = await refreshEntitlement(depsAt(NOW, f.impl), u);
    expect(r.status).toBe("refreshed");
    expect(r.view).toMatchObject({ hasPremium: true, status: "active" });
    expect(f.calls[0]).toContain(`/v1/subscribers/${u}`);
    const ev = (await pg.query<{ event_type: string; status: string }>(`select event_type, status from billing_events where user_id = $1 and event_type = 'RECONCILE_SNAPSHOT'`, [u])).rows;
    expect(ev).toEqual([{ event_type: "RECONCILE_SNAPSHOT", status: "processed" }]);
  });

  it("RESTORE on a new device: a user we hold no row for is rebuilt from the provider", async () => {
    const u = await createAuthUser(pg);
    expect(await loadEntitlement(db, u)).toBeNull();
    const r = await refreshEntitlement(depsAt(NOW, fakeFetch(() => ({ body: subscriber() })).impl), u);
    expect(r.view.hasPremium).toBe(true);
    expect(hasPremium(await loadEntitlement(db, u), NOW)).toBe(true);
  });

  it("is throttled: the provider is not called again within the minimum interval", async () => {
    const u = await createAuthUser(pg);
    const f = fakeFetch(() => ({ body: subscriber() }));
    await refreshEntitlement(depsAt(NOW, f.impl), u);
    const again = await refreshEntitlement(depsAt(new Date(NOW.getTime() + 5000), f.impl), u);
    expect(again.status).toBe("throttled");
    expect(f.calls).toHaveLength(1);
    const later = await refreshEntitlement(depsAt(new Date(NOW.getTime() + 60_000), f.impl), u);
    expect(later.status).toBe("refreshed");
  });

  it("forged identity: refresh acts ONLY on the id it is given and never touches another user's entitlement", async () => {
    const a = await createAuthUser(pg);
    const b = await createAuthUser(pg);
    await seedEntitlement(b, { state: "expired", trial_ends_at: new Date(T0), access_until: new Date(T0) });
    const f = fakeFetch(() => ({ body: subscriber() }));
    await refreshEntitlement(depsAt(NOW, f.impl), a);
    expect(f.calls.every((c) => c.includes(a) && !c.includes(b))).toBe(true);
    expect((await loadEntitlement(db, b))?.state).toBe("expired");
  });

  it("degrades safely: no key configured, provider down, malformed answer, no purchase, wrong environment, deleting account", async () => {
    const u = await createAuthUser(pg);
    expect((await refreshEntitlement(depsAt(NOW, fakeFetch(() => ({})).impl, { secretApiKey: null }), u)).status).toBe("unavailable");
    expect((await refreshEntitlement(depsAt(NOW, fakeFetch(() => ({ status: 500 })).impl), u)).status).toBe("provider_error");
    expect((await refreshEntitlement(depsAt(NOW, fakeFetch(() => new Error("network")).impl), u)).status).toBe("provider_error");
    expect((await refreshEntitlement(depsAt(NOW, fakeFetch(() => ({ body: { nope: 1 } })).impl), u)).status).toBe("provider_error");
    expect((await refreshEntitlement(depsAt(NOW, fakeFetch(() => ({ body: { subscriber: { subscriptions: {} } } })).impl), u)).status).toBe("no_provider_record");
    const mismatch = await refreshEntitlement(depsAt(NOW, fakeFetch(() => ({ body: subscriber({ is_sandbox: true }) })).impl), u);
    expect(mismatch.status).toBe("environment_mismatch");
    expect(mismatch.view.hasPremium).toBe(false); // a sandbox subscriber can never grant production access
    expect(await loadEntitlement(db, u)).toBeNull();
    const d = await createAuthUser(pg);
    await pg.query(`insert into account_deletions (user_id, state) values ($1, 'deleting')`, [d]);
    const f = fakeFetch(() => ({ body: subscriber() }));
    expect((await refreshEntitlement(depsAt(NOW, f.impl), d)).status).toBe("account_deleting");
    expect(f.calls).toHaveLength(0);
    expect(await loadEntitlement(db, d)).toBeNull();
  });

  it("a provider that says the subscription ended clears entitlement", async () => {
    const u = await createAuthUser(pg);
    await processRevenueCatEvent({ db, environment: "production", now: () => new Date(T0 + 15 * DAY) }, conversionEvent(u, T0 + 14 * DAY, { original_transaction_id: `otx-${u}` }));
    expect((await loadEntitlement(db, u))?.state).toBe("active");
    const after = new Date(T0 + 60 * DAY);
    const r = await refreshEntitlement(depsAt(after, fakeFetch(() => ({ body: subscriber({ expires_date: new Date(T0 + 44 * DAY).toISOString() }) })).impl), u);
    expect(r.view).toMatchObject({ hasPremium: false, status: "expired" });
  });
});

describe("scheduled reconciliation", () => {
  const NOW = new Date(T0 + 20 * DAY);
  it("re-checks only live entitlements that have not been reconciled recently, oldest first, bounded", async () => {
    const stale = await createAuthUser(pg);
    await seedEntitlement(stale, { state: "active", trial_ends_at: null, access_until: new Date(T0 + 44 * DAY), last_reconciled_at: new Date(NOW.getTime() - 24 * HOUR) });
    const fresh = await createAuthUser(pg);
    await seedEntitlement(fresh, { state: "active", trial_ends_at: null, access_until: new Date(T0 + 44 * DAY), last_reconciled_at: new Date(NOW.getTime() - HOUR) });
    const dead = await createAuthUser(pg);
    await seedEntitlement(dead, { state: "expired", trial_ends_at: null, access_until: new Date(T0), last_reconciled_at: null });
    const f = fakeFetch(() => ({ body: subscriber() }));
    const r = await reconcileStale(depsAt(NOW, f.impl), { limit: 500 });
    expect(r.checked).toBeGreaterThanOrEqual(1);
    expect(f.calls.some((c) => c.includes(stale))).toBe(true);
    expect(f.calls.some((c) => c.includes(fresh))).toBe(false);
    expect(f.calls.some((c) => c.includes(dead))).toBe(false);
    expect((await loadEntitlement(db, stale))?.lastReconciledAt?.getTime()).toBe(NOW.getTime());
  });
});

describe("the Premium decision", () => {
  it("is derived from the entitlement row only: a user with no row, an expired user, a trial and a paid user", async () => {
    const NOW = new Date(T0 + DAY);
    const none = await createAuthUser(pg);
    expect((await getPremiumDecision(db, none, NOW)).hasPremium).toBe(false);
    const trial = await createAuthUser(pg);
    await processRevenueCatEvent({ db, environment: "production", now: () => NOW }, trialEvent(trial));
    expect(await getPremiumDecision(db, trial, NOW)).toMatchObject({ hasPremium: true, view: { status: "trialing", isTrial: true } });
    expect((await getPremiumDecision(db, trial, new Date(T0 + 15 * DAY))).hasPremium).toBe(false); // no webhook needed for it to lapse
    expect((await getEntitlementView(db, none, NOW)).canStartTrial).toBe(true);
    expect((await getEntitlementView(db, trial, NOW)).canStartTrial).toBe(false);
  });
});
