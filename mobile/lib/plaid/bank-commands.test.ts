import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock("../auth/api", () => ({ authFetch: api.authFetch, NotAuthenticatedError: class NotAuthenticatedError extends Error {} }));

import { bankCommands, linkPorts } from "./bank-commands";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const lastCall = () => {
  const [path, , init] = api.authFetch.mock.calls.at(-1)! as [string, unknown, RequestInit];
  return { path, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined };
};

describe("bankCommands", () => {
  beforeEach(() => {
    api.authFetch.mockReset();
  });
  const c = bankCommands(null);

  it("sends each command to the server's own Plaid command with the web's body", async () => {
    api.authFetch.mockResolvedValue(json(200, { ok: true }));
    await c.mapAccounts("item-row", [{ plaidAccountId: "pa1", mode: "ignore" }]);
    expect(lastCall()).toEqual({ path: "/api/mobile/plaid/accounts/map", method: "POST", body: { plaidItemId: "item-row", entries: [{ plaidAccountId: "pa1", mode: "ignore" }] } });
    await c.setImporting("row-1", false);
    expect(lastCall()).toEqual({ path: "/api/mobile/plaid/accounts/row-1/importing", method: "PATCH", body: { importing: false } });
    await c.setExcluded("row-1", true);
    expect(lastCall()).toEqual({ path: "/api/mobile/plaid/accounts/row-1/exclude", method: "PATCH", body: { excluded: true } });
    await c.clearReview("row-1");
    expect(lastCall()).toEqual({ path: "/api/mobile/plaid/accounts/row-1/review", method: "DELETE", body: undefined });
    await c.sync("plaid-item");
    expect(lastCall()).toEqual({ path: "/api/mobile/plaid/sync", method: "POST", body: { itemId: "plaid-item" } });
    await c.disconnect("plaid-item", true);
    expect(lastCall()).toEqual({ path: "/api/plaid/item", method: "DELETE", body: { itemId: "plaid-item", purge: true } });
  });

  it("passes a success warning through: the work succeeded, a sync did not finish", async () => {
    api.authFetch.mockResolvedValue(json(200, { ok: true, warning: "Connected, but the first sync didn't finish. It'll retry shortly." }));
    expect(await c.mapAccounts("i", [])).toEqual({ status: "ok", warning: "Connected, but the first sync didn't finish. It'll retry shortly." });
    api.authFetch.mockResolvedValue(json(200, { ok: true }));
    expect(await c.sync("i")).toEqual({ status: "ok" });
  });

  it("marks only the server's refusals over out-of-date data as stale: 404s, 409s and the mapping's `refused`", async () => {
    api.authFetch.mockResolvedValue(json(422, { error: "refused", message: "That account is already imported. Refresh to see where it goes." }));
    expect(await c.mapAccounts("i", [])).toEqual({ status: "error", message: "That account is already imported. Refresh to see where it goes.", stale: true });
    // the server's own 404 sentence: which thing is gone, never a generic "connection" line
    api.authFetch.mockResolvedValue(json(404, { error: "not_found", message: "That bank account no longer exists. Try connecting again." }));
    expect(await c.mapAccounts("i", [])).toEqual({ status: "error", message: "That bank account no longer exists. Try connecting again.", stale: true });
    api.authFetch.mockResolvedValue(json(409, { error: "needs_review_required" }));
    expect(await c.setExcluded("r", true)).toMatchObject({ stale: true });
    api.authFetch.mockResolvedValue(json(503, { error: "unavailable" }));
    expect(await c.mapAccounts("i", [])).toEqual({ status: "error", message: "Could not save the account mapping. Try again." });
  });

  it("an input-validation 422 shows its sentence but is never stale (Refresh would close the sheet and drop the edits)", async () => {
    api.authFetch.mockResolvedValue(json(422, { error: "invalid", fieldErrors: { form: "Choose which Budgts account to import into first." } }));
    expect(await c.mapAccounts("i", [])).toEqual({ status: "error", message: "Choose which Budgts account to import into first." });
    api.authFetch.mockResolvedValue(json(422, { error: "invalid", fieldErrors: { form: "Choose which Budgts account to import into first." } }));
    expect(await c.setImporting("r", true)).toEqual({ status: "error", message: "Choose which Budgts account to import into first." });
  });

  it("turns every failure into a fixed sentence, the web's own where the server sends one", async () => {
    api.authFetch.mockResolvedValue(json(409, { error: "needs_review_required" }));
    expect(await c.setExcluded("r", true)).toEqual({ status: "error", message: "Only an account currently flagged for review can be excluded from totals.", stale: true });
    // a 404 without a sentence (the web's disconnect route): the command's own
    api.authFetch.mockResolvedValue(json(404, { error: "unknown item" }));
    expect(await c.disconnect("i", false)).toEqual({ status: "error", message: "That bank is already disconnected.", stale: true });
    api.authFetch.mockResolvedValue(json(404, { error: "not_found", message: "That account no longer exists." }));
    expect(await c.clearReview("r")).toEqual({ status: "error", message: "That account no longer exists.", stale: true });
    api.authFetch.mockResolvedValue(json(423, { error: "account_locked" }));
    expect(await c.clearReview("r")).toEqual({ status: "error", message: "Your account is being deleted, so changes are paused." });
    api.authFetch.mockResolvedValue(json(500, { error: "could not disconnect" }));
    expect(await c.disconnect("i", true)).toEqual({ status: "error", message: "Couldn't disconnect this bank. Try again." });
  });
});

describe("bankCommands offline", () => {
  it("reports an unreachable server as the connection sentence", async () => {
    const c = bankCommands(null);
    api.authFetch.mockImplementation(async () => {
      throw new TypeError("Network request failed");
    });
    expect(await c.sync("i")).toEqual({ status: "error", message: "Couldn't reach Budgts. Check your connection and try again." });
  });
});

describe("linkPorts", () => {
  beforeEach(() => {
    api.authFetch.mockReset();
  });
  const ports = linkPorts(null);

  it("mints a link token, update mode when an item is named", async () => {
    api.authFetch.mockResolvedValue(json(200, { link_token: "link-1" }));
    expect(await ports.fetchLinkToken({ platform: "android", itemId: "plaid-item" })).toEqual({ status: "ok", linkToken: "link-1" });
    expect(lastCall().body).toEqual({ platform: "android", itemId: "plaid-item" });
    api.authFetch.mockResolvedValue(json(500, {}));
    expect(await ports.fetchLinkToken({ platform: "android" })).toEqual({ status: "error", message: "Couldn't start the bank connection. Try again." });
    expect(await ports.fetchLinkToken({ itemId: "x" })).toEqual({ status: "error", message: "Couldn't start the reconnect. Try again." });
  });

  it("exchanges and returns the new accounts as the mapping sheet needs them", async () => {
    const account = { plaidAccountId: "pa1", name: "Plaid Checking", officialName: null, mask: "0000", type: "depository", subtype: "checking", currentBalance: 11000, isoCurrencyCode: "USD" };
    api.authFetch.mockResolvedValue(json(200, { plaidItemId: "row-1", accounts: [account] }));
    expect(await ports.exchange("public-1", { id: "ins_1", name: "First Platypus Bank" })).toEqual({ status: "ok", plaidItemId: "row-1", accounts: [account] });
    expect(lastCall().body).toEqual({ public_token: "public-1", institution: { institution_id: "ins_1", name: "First Platypus Bank" } });
  });

  it("tells the bank-sync gate's 402 apart from a failure, for the link token (new and reconnect) and the exchange", async () => {
    api.authFetch.mockResolvedValue(json(402, { error: "premium_required", entitlement: { hasPremium: false } }));
    expect(await ports.fetchLinkToken({ platform: "android" })).toEqual({ status: "subscription_required" });
    expect(await ports.fetchLinkToken({ itemId: "x" })).toEqual({ status: "subscription_required" });
    expect(await ports.exchange("public-1", null)).toEqual({ status: "subscription_required" });
  });

  it("tells an already connected bank apart from a failure", async () => {
    api.authFetch.mockResolvedValue(json(409, { error: "already-linked", itemId: "p", plaidItemId: "r" }));
    expect(await ports.exchange("public-1", null)).toEqual({ status: "already_linked" });
    api.authFetch.mockResolvedValue(json(502, { error: "could not connect the bank" }));
    expect(await ports.exchange("public-1", null)).toEqual({ status: "error", message: "Couldn't finish connecting the bank. Try again." });
  });
});
