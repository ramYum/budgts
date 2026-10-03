/**
 * POST /api/plaid/link-token and the bank-sync gate: a new connection AND an update-mode reconnect need a subscription
 * once billing is configured. A refused caller gets the gate's 402 and Plaid is never asked for a token.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const linkTokenCreate = vi.fn();
const accessTokenForUserItem = vi.fn();
let ctx: { user: { id: string } } | null;
const gate = vi.hoisted(() => ({ denied: null as Response | null, calls: [] as string[] }));

vi.mock("@/lib/plaid/client", () => ({ plaidClient: () => ({ linkTokenCreate }) }));
vi.mock("@/lib/plaid/config", () => ({ loadPlaidConfig: () => ({ countryCodes: ["US"], products: ["transactions"], oauthRedirectUri: null }) }));
vi.mock("@/lib/auth/request-context", () => ({ getRequestContext: async () => ctx }));
vi.mock("@/lib/account/deletion-store", () => ({ isAccountDeleting: async () => false }));
vi.mock("@/server/plaid/service", () => ({ accessTokenForUserItem: (...a: unknown[]) => accessTokenForUserItem(...a) }));
vi.mock("@/lib/billing/gate", () => ({
  requireBankSyncAccess: async (userId: string) => (gate.calls.push(userId), gate.denied),
}));

import { POST } from "./route";

const request = (body?: unknown) =>
  new Request("http://x/api/plaid/link-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const refusal = () => Response.json({ error: "premium_required", entitlement: { hasPremium: false, status: "expired" } }, { status: 402 });

beforeEach(() => {
  ctx = { user: { id: "u1" } };
  gate.denied = null;
  gate.calls.length = 0;
  linkTokenCreate.mockReset().mockResolvedValue({ data: { link_token: "link-1", expiration: "2026-10-02T13:00:00Z" } });
  accessTokenForUserItem.mockReset().mockResolvedValue("access-1");
});

describe("POST /api/plaid/link-token: the bank-sync gate", () => {
  it.each([
    ["a new connection", undefined],
    ["an update-mode reconnect", { itemId: "item-1" }],
  ])("%s without a subscription gets the gate's 402 and no Link token", async (_, body) => {
    gate.denied = refusal();
    const res = await POST(request(body));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: "premium_required", entitlement: { hasPremium: false } });
    expect(gate.calls).toEqual(["u1"]);
    expect(linkTokenCreate).not.toHaveBeenCalled();
    expect(accessTokenForUserItem).not.toHaveBeenCalled();
  });

  it.each([
    ["a new connection", undefined],
    ["an update-mode reconnect", { itemId: "item-1" }],
  ])("%s the gate allows mints the token as before", async (_, body) => {
    const res = await POST(request(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ link_token: "link-1", expiration: "2026-10-02T13:00:00Z" });
    expect(gate.calls).toEqual(["u1"]);
  });

  it("refuses an unauthenticated caller with 401 before asking the gate", async () => {
    ctx = null;
    expect((await POST(request())).status).toBe(401);
    expect(gate.calls).toEqual([]);
  });
});
