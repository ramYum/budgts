import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const refreshBankItems = vi.fn();
const scheduled: (() => unknown)[] = [];
const flag = vi.hoisted(() => ({ plaidOn: true }));

vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/plaid/ui-flag", () => ({ plaidUiEnabled: () => flag.plaidOn }));
vi.mock("@/server/plaid/service", () => ({ refreshBankItems: (...a: unknown[]) => refreshBankItems(...a) }));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (cb: () => unknown) => void scheduled.push(cb),
}));

import { POST } from "./route";

const supabase = { __as: "user-a" };
const post = (body?: unknown) =>
  new Request("https://example.test/api/mobile/plaid/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  getBearerContext.mockReset();
  refreshBankItems.mockReset();
  scheduled.length = 0;
  flag.plaidOn = true;
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
});

describe("POST /api/mobile/plaid/refresh: the native pull's bank refresh", () => {
  it("answers at once and asks for the refresh after the response, for the verified caller only", async () => {
    // a refresh that never settles must not hold the answer (or the pull spinner)
    refreshBankItems.mockReturnValue(new Promise(() => {}));
    const res = await POST(post({ userId: "victim" }));
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ scheduled: true });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(refreshBankItems).not.toHaveBeenCalled(); // scheduled, not awaited
    expect(scheduled).toHaveLength(1);
    void scheduled[0]!();
    expect(refreshBankItems).toHaveBeenCalledExactlyOnceWith("user-a");
  });

  it("schedules nothing while bank connections are switched off", async () => {
    flag.plaidOn = false;
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scheduled: false });
    expect(scheduled).toHaveLength(0);
  });

  it("refuses an unauthenticated request with 401 and schedules nothing", async () => {
    getBearerContext.mockResolvedValue(null);
    const res = await POST(post());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(scheduled).toHaveLength(0);
    expect(refreshBankItems).not.toHaveBeenCalled();
  });
});
