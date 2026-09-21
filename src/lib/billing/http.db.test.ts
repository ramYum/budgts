// @vitest-environment node
/**
 * The billing HTTP handlers against real Postgres (embedded, real migration chain): authentication and
 * authorization of the entitlement endpoints (forged-identity attempts), the RevenueCat webhook's verification and
 * idempotency over HTTP, and the cron endpoints' shared-secret check.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { asBillingDb, createAuthUser, newMigratedDb } from "../../../tests/unit/helpers/pglite-db";
import { loadBillingConfig, type BillingConfig } from "./config";
import type { Db } from "./db";
import { handleEntitlementGet, handleEntitlementRefresh, handleReconcileCron, handleReminderCron, handleRevenueCatWebhook, type HttpDeps } from "./http";
import { rcBody, DAY, T0 } from "./revenuecat/fixtures";
import { signRevenueCatBody } from "./revenuecat/verify";
import { loadEntitlement } from "./store";

// The authenticated identity is whatever the (mocked) session resolver says — never the request body.
let currentUser: { id: string; email: string } | null = null;
vi.mock("@/lib/auth/get-request-user", () => ({ getRequestUser: async () => currentUser }));

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
  currentUser = null;
});

const SIGNING = "whsec_http_test";
const NOW = new Date(T0 + DAY);
const config = (over: Partial<BillingConfig> = {}): BillingConfig => ({
  ...loadBillingConfig({}),
  webhookSigningSecret: SIGNING,
  secretApiKey: "sk_test",
  environment: "production",
  cronSecret: "cron-secret-value",
  ...over,
});
const deps = (over: Partial<HttpDeps> = {}, cfg: Partial<BillingConfig> = {}): HttpDeps => ({ db, config: config(cfg), now: () => NOW, ...over });
const as = async () => {
  const id = await createAuthUser(pg);
  currentUser = { id, email: `${id}@example.test` };
  return id;
};
const json = async (r: Response) => (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const signed = (body: unknown, opts: { secret?: string; at?: Date; auth?: string } = {}) => {
  const raw = JSON.stringify(body);
  const t = Math.floor((opts.at ?? NOW).getTime() / 1000);
  const headers: Record<string, string> = { "content-type": "application/json", "x-revenuecat-webhook-signature": signRevenueCatBody(raw, opts.secret ?? SIGNING, t) };
  if (opts.auth) headers.authorization = opts.auth;
  return new Request("https://budgts.test/api/billing/webhook/revenuecat", { method: "POST", headers, body: raw });
};

describe("GET /api/billing/entitlement", () => {
  it("401 without an authenticated user", async () => {
    const r = await handleEntitlementGet(new Request("https://budgts.test/api/billing/entitlement"), deps());
    expect(r.status).toBe(401);
  });

  it("returns the caller's own stable view-model (no raw billing rows), uncached", async () => {
    const id = await as();
    const r = await handleEntitlementGet(new Request("https://budgts.test/api/billing/entitlement"), deps());
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const body = await json(r);
    expect(Object.keys(body)).toEqual(["entitlement"]);
    expect(body.entitlement).toMatchObject({ hasPremium: false, status: "none", canStartTrial: true });
    expect(JSON.stringify(body)).not.toContain(id); // no ids, no provider fields, no reminder bookkeeping
  });

  it("FORGED IDENTITY: another user's id in the query string, a header or a body changes nothing", async () => {
    const victim = await createAuthUser(pg);
    await pg.query(`insert into entitlements (user_id, state, access_until) values ($1, 'active', now() + interval '30 days')`, [victim]);
    await as(); // the caller is someone else, with no entitlement
    const forged = new Request(`https://budgts.test/api/billing/entitlement?userId=${victim}&user_id=${victim}`, {
      headers: { "x-user-id": victim, "x-supabase-user-id": victim },
    });
    const body = await json(await handleEntitlementGet(forged, deps({ now: () => new Date() })));
    expect(body.entitlement.hasPremium).toBe(false);
  });
});

describe("POST /api/billing/entitlement/refresh", () => {
  const provider = (over: Record<string, unknown> = {}) =>
    (async () =>
      new Response(
        JSON.stringify({ subscriber: { subscriptions: { budgts_monthly: { store: "app_store", is_sandbox: false, period_type: "normal", purchase_date: new Date(T0).toISOString(), expires_date: new Date(T0 + 30 * DAY).toISOString(), ...over } } } }),
      )) as unknown as typeof fetch;

  it("401 without an authenticated user, and the provider is never called", async () => {
    const f = vi.fn(provider());
    const r = await handleEntitlementRefresh(new Request("https://budgts.test/api/billing/entitlement/refresh", { method: "POST" }), deps({ fetchImpl: f as unknown as typeof fetch }));
    expect(r.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it("reconciles the CALLER's entitlement and ignores any user id in the body", async () => {
    const victim = await createAuthUser(pg);
    const me = await as();
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(String(url));
      return provider()(url as never);
    }) as unknown as typeof fetch;
    const req = new Request("https://budgts.test/api/billing/entitlement/refresh", { method: "POST", body: JSON.stringify({ userId: victim, user_id: victim }), headers: { "content-type": "application/json" } });
    const r = await handleEntitlementRefresh(req, deps({ fetchImpl: f }));
    const body = await json(r);
    expect(r.status).toBe(200);
    expect(body).toMatchObject({ status: "refreshed", entitlement: { hasPremium: true, status: "active" } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(me);
    expect(calls[0]).not.toContain(victim);
    expect(await loadEntitlement(db, victim)).toBeNull();
    expect((await loadEntitlement(db, me))?.state).toBe("active");
  });

  it("the client's belief about a purchase is irrelevant: a 'purchase succeeded' claim with nothing at the provider grants nothing", async () => {
    await as();
    const empty = (async () => new Response(JSON.stringify({ subscriber: { subscriptions: {} } }))) as unknown as typeof fetch;
    const body = await json(await handleEntitlementRefresh(new Request("https://budgts.test/api/billing/entitlement/refresh", { method: "POST", body: JSON.stringify({ purchased: true, hasPremium: true }) }), deps({ fetchImpl: empty })));
    expect(body.entitlement.hasPremium).toBe(false);
  });
});

describe("POST /api/billing/webhook/revenuecat", () => {
  it("refuses an unsigned or wrongly signed delivery (401) and applies nothing", async () => {
    const u = await createAuthUser(pg);
    const body = rcBody(u, { period_type: "TRIAL", price: 0, price_in_purchased_currency: 0, expiration_at_ms: T0 + 14 * DAY, event_timestamp_ms: T0 });
    const unsigned = new Request("https://budgts.test/api/billing/webhook/revenuecat", { method: "POST", body: JSON.stringify(body) });
    expect((await handleRevenueCatWebhook(unsigned, deps())).status).toBe(401);
    expect((await handleRevenueCatWebhook(signed(body, { secret: "attacker" }), deps())).status).toBe(401);
    expect(await loadEntitlement(db, u)).toBeNull();
  });

  it("refuses everything (503) when the deployment has no webhook secret configured — never accept-all", async () => {
    const u = await createAuthUser(pg);
    const r = await handleRevenueCatWebhook(signed(rcBody(u)), deps({}, { webhookSigningSecret: null, webhookAuth: null }));
    expect(r.status).toBe(503);
    expect(await loadEntitlement(db, u)).toBeNull();
  });

  it("applies a correctly signed trial start; identity is the payload's app_user_id, not the URL", async () => {
    const u = await createAuthUser(pg);
    const body = rcBody(u, { period_type: "TRIAL", price: 0, price_in_purchased_currency: 0, expiration_at_ms: T0 + 14 * DAY, event_timestamp_ms: T0, original_transaction_id: `otx-${u}` });
    const r = await handleRevenueCatWebhook(signed(body), deps());
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ status: "processed" });
    expect((await loadEntitlement(db, u))?.state).toBe("trialing");
  });

  it("a duplicate delivery is 200 and changes nothing (RevenueCat must not keep retrying)", async () => {
    const u = await createAuthUser(pg);
    const body = rcBody(u, { type: "RENEWAL", is_trial_conversion: true, original_transaction_id: `otx-${u}` });
    expect(await json(await handleRevenueCatWebhook(signed(body), deps()))).toEqual({ status: "processed" });
    expect(await json(await handleRevenueCatWebhook(signed(body), deps()))).toEqual({ status: "duplicate" });
    expect((await pg.query(`select 1 from payments where user_id = $1`, [u])).rows).toHaveLength(1);
  });

  it("a sandbox event on a production deployment is answered 200 quarantined (no retry) and applies nothing", async () => {
    const u = await createAuthUser(pg);
    const r = await handleRevenueCatWebhook(signed(rcBody(u, { environment: "SANDBOX" })), deps());
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ status: "quarantined" });
    expect(await loadEntitlement(db, u)).toBeNull();
  });

  it("a failure is 5xx so RevenueCat redelivers, and it is recorded", async () => {
    const u = await createAuthUser(pg);
    const r = await handleRevenueCatWebhook(signed(rcBody(u, { id: "evt-http-fail", type: "RENEWAL", product_id: "mystery", expiration_at_ms: T0 + 90 * DAY })), deps());
    expect(r.status).toBe(500);
    const [ev] = (await pg.query<{ status: string }>(`select status from billing_events where provider_event_id = 'evt-http-fail'`)).rows;
    expect(ev.status).toBe("failed");
  });

  it("rejects malformed JSON and non-RevenueCat payloads (400) once authenticated", async () => {
    const raw = "{not json";
    const t = Math.floor(NOW.getTime() / 1000);
    const bad = new Request("https://budgts.test/api/billing/webhook/revenuecat", { method: "POST", headers: { "x-revenuecat-webhook-signature": signRevenueCatBody(raw, SIGNING, t) }, body: raw });
    expect((await handleRevenueCatWebhook(bad, deps())).status).toBe(400);
    expect((await handleRevenueCatWebhook(signed({ hello: "world" }), deps())).status).toBe(400);
  });

  it("an Authorization value, when configured, is required in addition to the signature", async () => {
    const u = await createAuthUser(pg);
    const body = rcBody(u, { period_type: "TRIAL", price: 0, price_in_purchased_currency: 0, expiration_at_ms: T0 + 14 * DAY, event_timestamp_ms: T0 });
    const cfg = { webhookAuth: "shared-secret" };
    expect((await handleRevenueCatWebhook(signed(body), deps({}, cfg))).status).toBe(401);
    expect((await handleRevenueCatWebhook(signed(body, { auth: "shared-secret" }), deps({}, cfg))).status).toBe(200);
  });
});

describe("cron endpoints", () => {
  const req = (auth?: string) => new Request("https://budgts.test/api/billing/reminders/due", { method: "POST", headers: auth ? { authorization: auth } : {} });

  it("401 without the shared secret, with a wrong one, and when none is configured", async () => {
    for (const handler of [handleReminderCron, handleReconcileCron]) {
      expect((await handler(req(), deps())).status).toBe(401);
      expect((await handler(req("Bearer wrong"), deps())).status).toBe(401);
      expect((await handler(req("Bearer cron-secret-value"), deps({}, { cronSecret: null }))).status).toBe(401);
    }
  });

  it("with the secret: the reminder sweep reports due work WITHOUT a delivery channel and claims nothing", async () => {
    const u = await createAuthUser(pg);
    const end = new Date(NOW.getTime() + 3 * 3_600_000);
    await pg.query(`insert into entitlements (user_id, state, will_renew, trial_ends_at, access_until, product_id, store) values ($1,'trialing',true,$2,$2,'budgts_monthly','apple')`, [u, end]);
    const r = await handleReminderCron(req("Bearer cron-secret-value"), deps());
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({ delivery: "unconfigured", claimed: 0 });
    expect((await loadEntitlement(db, u))?.reminderClaimedAt).toBeNull();
  });

  it("with the secret: the reconcile sweep runs and reports", async () => {
    const r = await handleReconcileCron(req("Bearer cron-secret-value"), deps({ fetchImpl: (async () => new Response(JSON.stringify({ subscriber: { subscriptions: {} } }))) as unknown as typeof fetch }));
    expect(r.status).toBe(200);
    expect(await json(r)).toHaveProperty("checked");
  });
});
