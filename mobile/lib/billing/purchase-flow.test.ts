import { describe, expect, it, vi } from "vitest";
import type { EntitlementView } from "./contract";
import type { EntitlementLoad, RefreshResult } from "./load-entitlement";
import { createPurchaseFlow, type FlowDeps } from "./purchase-flow";
import type { Offer, PurchaseOutcome, PurchasesClient } from "./purchases";

const NONE: EntitlementView = { hasPremium: false, status: "none", isTrial: false, willRenew: false, trialEndsAt: null, accessUntil: null, productId: null, store: null, canStartTrial: true, renewal: null };
const TRIAL: EntitlementView = { ...NONE, hasPremium: true, status: "trialing", isTrial: true, willRenew: true, trialEndsAt: "2026-10-15T12:00:00.000Z", accessUntil: "2026-10-15T12:00:00.000Z", productId: "budgts_monthly", store: "apple", canStartTrial: false };

const OFFER: Offer = { productId: "budgts_monthly", priceString: "$9.99", plan: "monthly", trialDays: 14, handle: {} };

const ok = (e: EntitlementView): RefreshResult => ({ status: "ok", refresh: "refreshed", entitlement: e });
const ready = (e: EntitlementView): EntitlementLoad => ({ status: "ready", entitlement: e });

function harness(opts: { store?: Partial<PurchasesClient>; server?: () => EntitlementView | Error; outcome?: PurchaseOutcome; available?: boolean } = {}) {
  const purchase = vi.fn(async () => opts.outcome ?? ({ kind: "purchased" } as PurchaseOutcome));
  const purchases: PurchasesClient = {
    isAvailable: () => opts.available ?? true,
    configure: vi.fn(async () => {}),
    getOffers: vi.fn(async () => [OFFER]),
    purchase,
    restore: vi.fn(async () => {}),
    logOut: vi.fn(async () => {}),
    ...opts.store,
  };
  const server = opts.server ?? (() => NONE);
  const refresh = vi.fn(async (): Promise<RefreshResult> => {
    const s = server();
    return s instanceof Error ? { status: "error", kind: "network", message: "x" } : ok(s);
  });
  const fetchEntitlement = vi.fn(async (): Promise<EntitlementLoad> => {
    const s = server();
    return s instanceof Error ? { status: "error", kind: "network", message: "x" } : ready(s);
  });
  const sleep = vi.fn(async () => {});
  const deps: FlowDeps = { purchases, fetchEntitlement, refreshEntitlement: refresh, sleep, confirmAttempts: 3, confirmDelayMs: 1 };
  return { flow: createPurchaseFlow(deps), purchases, purchase, refresh, fetchEntitlement, sleep };
}

describe("the user never gets Premium from the store sheet alone", () => {
  it("the store says purchased, the SERVER confirms -> premium (and only then)", async () => {
    const h = harness({ server: () => TRIAL });
    // fetchEntitlement (pre-check) must say NOT premium so a purchase happens; then refresh says premium
    let calls = 0;
    h.fetchEntitlement.mockImplementation(async () => ready(calls++ === 0 ? NONE : TRIAL));
    const s = await h.flow.startPurchase(OFFER);
    expect(s).toEqual({ kind: "premium", entitlement: TRIAL });
    expect(h.purchase).toHaveBeenCalledOnce();
    expect(h.refresh).toHaveBeenCalled(); // it consulted the server after the purchase
  });

  it("the store says purchased but the server NEVER confirms -> not_confirmed, never premium", async () => {
    const h = harness({ server: () => NONE });
    const s = await h.flow.startPurchase(OFFER);
    expect(s.kind).toBe("not_confirmed");
    expect(s).not.toHaveProperty("entitlement.hasPremium", true);
    expect(h.refresh).toHaveBeenCalledTimes(3); // bounded retries for provider lag
    expect(h.sleep).toHaveBeenCalledTimes(2);
  });

  it("the server is briefly unreachable after the purchase, then confirms -> premium on retry", async () => {
    let n = 0;
    const h = harness({ server: () => (n++ < 2 ? new Error("offline") : TRIAL) });
    h.fetchEntitlement.mockImplementation(async () => ready(NONE));
    const s = await h.flow.startPurchase(OFFER);
    expect(s).toEqual({ kind: "premium", entitlement: TRIAL });
  });

  it("the server unreachable the whole time -> not_confirmed with no entitlement (still not premium)", async () => {
    const h = harness({ server: () => new Error("offline") });
    h.fetchEntitlement.mockImplementation(async () => ready(NONE));
    expect(await h.flow.startPurchase(OFFER)).toEqual({ kind: "not_confirmed", entitlement: null });
  });
});

describe("purchase outcomes other than success grant nothing", () => {
  it.each([
    [{ kind: "cancelled" }, { kind: "cancelled" }],
    [{ kind: "pending" }, { kind: "pending" }],
    [{ kind: "failed", message: "The purchase could not be completed. You have not been charged." }, { kind: "error", message: "The purchase could not be completed. You have not been charged." }],
  ] as const)("%j", async (outcome, expected) => {
    const h = harness({ outcome: outcome as PurchaseOutcome });
    expect(await h.flow.startPurchase(OFFER)).toEqual(expected);
    expect(h.refresh).not.toHaveBeenCalled();
  });

  it("an unavailable store (no key / no products yet) does nothing and says so", async () => {
    const h = harness({ available: false });
    expect(await h.flow.startPurchase(OFFER)).toEqual({ kind: "unavailable" });
    expect(await h.flow.restore()).toEqual({ kind: "unavailable" });
    expect(h.purchase).not.toHaveBeenCalled();
  });

  it("if the server already shows Premium (bought on another device) no second purchase is started", async () => {
    const h = harness({ server: () => TRIAL });
    expect(await h.flow.startPurchase(OFFER)).toEqual({ kind: "premium", entitlement: TRIAL });
    expect(h.purchase).not.toHaveBeenCalled();
  });
});

describe("recovery and restore", () => {
  it("app closed right after a purchase: a FRESH flow on next launch recovers Premium from the server alone", async () => {
    const h = harness({ server: () => TRIAL }); // no local memory of any purchase
    expect(await h.flow.recover()).toEqual({ kind: "premium", entitlement: TRIAL });
    expect(h.purchase).not.toHaveBeenCalled();
  });

  it("recover with nothing on the server stays idle (it never invents an entitlement)", async () => {
    expect(await harness({ server: () => NONE }).flow.recover()).toEqual({ kind: "idle" });
    expect(await harness({ server: () => new Error("offline") }).flow.recover()).toEqual({ kind: "idle" });
  });

  it("a pending purchase later approved is picked up by recover()", async () => {
    let approved = false;
    const h = harness({ outcome: { kind: "pending" }, server: () => (approved ? TRIAL : NONE) });
    expect((await h.flow.startPurchase(OFFER)).kind).toBe("pending");
    approved = true;
    expect(await h.flow.recover()).toEqual({ kind: "premium", entitlement: TRIAL });
  });

  it("restore: the server decides. Premium if it confirms, otherwise nothing_to_restore", async () => {
    expect(await harness({ server: () => TRIAL }).flow.restore()).toEqual({ kind: "premium", entitlement: TRIAL });
    const none = harness({ server: () => NONE });
    expect(await none.flow.restore()).toEqual({ kind: "nothing_to_restore" });
    expect(none.purchases.restore).toHaveBeenCalledOnce();
  });

  it("a failing store restore still consults the server (the provider may already know the purchase)", async () => {
    const h = harness({ server: () => TRIAL, store: { restore: vi.fn(async () => { throw new Error("store offline"); }) } });
    expect(await h.flow.restore()).toEqual({ kind: "premium", entitlement: TRIAL });
  });
});

describe("plumbing", () => {
  it("offers come from the store and are empty (not an error) when the store fails", async () => {
    expect(await harness().flow.offers()).toEqual([OFFER]);
    expect(await harness({ store: { getOffers: vi.fn(async () => { throw new Error("x"); }) } }).flow.offers()).toEqual([]);
  });
  it("configures the SDK with OUR user id and logs out on sign-out", async () => {
    const h = harness();
    await h.flow.configure("user-1");
    await h.flow.logOut();
    expect(h.purchases.configure).toHaveBeenCalledWith("user-1");
    expect(h.purchases.logOut).toHaveBeenCalled();
  });
});
