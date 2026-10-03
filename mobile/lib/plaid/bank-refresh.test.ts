import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authFetch = vi.fn();
vi.mock("../auth/api", async (orig) => ({
  ...(await orig<typeof import("../auth/api")>()),
  authFetch: (...a: unknown[]) => authFetch(...a),
}));

import { NotAuthenticatedError } from "../auth/api";
import { pullWithBankRefresh, requestBankRefresh } from "./bank-refresh";

const session = { access_token: "t" } as Session;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const settle = () => new Promise((r) => setTimeout(r, 0));
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  authFetch.mockReset();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("requestBankRefresh", () => {
  it("POSTs to the refresh route with the session and reads whether the server scheduled it", async () => {
    authFetch.mockResolvedValue(json(202, { scheduled: true, extra: 1 }));
    expect(await requestBankRefresh(session)).toEqual({ ok: true, data: { scheduled: true } });
    expect(authFetch).toHaveBeenCalledWith("/api/mobile/plaid/refresh", session, { method: "POST" });
  });

  it("reads the bank-sync gate's 402 (no subscription) as not scheduled: an answer, not a failure", async () => {
    authFetch.mockResolvedValue(json(402, { error: "premium_required", entitlement: { hasPremium: false } }));
    expect(await requestBankRefresh(session)).toEqual({ ok: true, data: { scheduled: false } });
  });

  it("maps a refusal to a failure, never a throw", async () => {
    authFetch.mockResolvedValue(json(503, { error: "unavailable" }));
    expect(await requestBankRefresh(session)).toMatchObject({ ok: false, kind: "unavailable", status: 503 });
  });
});

describe("pullWithBankRefresh: the pull to refresh", () => {
  it("asks the server for a bank refresh and re-reads the screen's data, without waiting on the refresh", async () => {
    authFetch.mockReturnValue(new Promise(() => {})); // a refresh request that never answers
    const refetch = vi.fn();
    pullWithBankRefresh(session, refetch);
    expect(authFetch).toHaveBeenCalledWith("/api/mobile/plaid/refresh", session, { method: "POST" });
    expect(refetch).toHaveBeenCalledOnce();
  });

  it.each([
    ["the server refuses it", () => authFetch.mockResolvedValue(json(503, { error: "unavailable" })), { kind: "unavailable", status: 503, code: "unavailable" }],
    ["the network is down", () => authFetch.mockRejectedValue(new Error("Network request failed")), { kind: "network" }],
    ["the session is gone", () => authFetch.mockRejectedValue(new NotAuthenticatedError()), { kind: "auth" }],
  ])("still re-reads the data and logs the failed refresh when %s", async (_, arrange, logged) => {
    arrange();
    const refetch = vi.fn();
    pullWithBankRefresh(session, refetch);
    expect(refetch).toHaveBeenCalledOnce();
    await settle();
    expect(warn).toHaveBeenCalledWith("[budgts] bank refresh request failed", expect.objectContaining(logged));
  });

  it("without a subscription (402) still re-reads the data and logs no warning", async () => {
    authFetch.mockResolvedValue(json(402, { error: "premium_required", entitlement: { hasPremium: false } }));
    const refetch = vi.fn();
    pullWithBankRefresh(session, refetch);
    expect(refetch).toHaveBeenCalledOnce();
    await settle();
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs nothing when the refresh was accepted", async () => {
    authFetch.mockResolvedValue(json(202, { scheduled: true }));
    pullWithBankRefresh(session, () => {});
    await settle();
    expect(warn).not.toHaveBeenCalled();
  });
});
