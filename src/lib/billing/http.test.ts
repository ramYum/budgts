import { afterEach, describe, expect, it, vi } from "vitest";

const getServerDb = vi.fn();
vi.mock("./db", () => ({ getServerDb: () => getServerDb() }));

import { handleReconcileCron, handleRevenueCatWebhook, runBillingRoute } from "./http";
import { loadBillingConfig } from "./config";

afterEach(() => vi.restoreAllMocks());

describe("billing routes fail closed", () => {
  it("a deployment without a database answers a generic 503 and logs no raw error", async () => {
    getServerDb.mockRejectedValue(new Error("DATABASE_URL is not set"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await runBillingRoute(new Request("https://example.test/api/billing/entitlement"), async () => new Response("never"));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    expect(log).toHaveBeenCalledWith("billing route failed", "/api/billing/entitlement", expect.objectContaining({ message: expect.any(String) }));
    for (const call of log.mock.calls) for (const arg of call) expect(arg).not.toBeInstanceOf(Error);
  });

  it("without RevenueCat secrets the webhook refuses (503 not_configured) and never touches the database", async () => {
    const db = { query: vi.fn(), transaction: vi.fn() };
    const res = await handleRevenueCatWebhook(
      new Request("https://example.test/api/billing/webhook/revenuecat", { method: "POST", body: "{}" }),
      { db, config: loadBillingConfig({}) },
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured" });
    expect(db.query).not.toHaveBeenCalled();
  });

  it("without CRON_SECRET the reconcile cron refuses every caller", async () => {
    const db = { query: vi.fn(), transaction: vi.fn() };
    const res = await handleReconcileCron(
      new Request("https://example.test/api/billing/reconcile/due", { method: "POST", headers: { authorization: "Bearer " } }),
      { db, config: loadBillingConfig({}) },
    );
    expect(res.status).toBe(401);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("defaults to the sandbox environment, so an unconfigured deployment never accepts real-money events", () => {
    expect(loadBillingConfig({}).environment).toBe("sandbox");
    expect(loadBillingConfig({ BILLING_ENVIRONMENT: "production" }).environment).toBe("production");
  });
});
