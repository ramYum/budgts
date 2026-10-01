import { beforeEach, describe, expect, it, vi } from "vitest";
import { testHome } from "@/lib/mobile/test-home";

const getBearerContext = vi.fn();
const loadHome = vi.fn();
const profileTimeZone = vi.fn();

vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/home/load-home", () => ({ loadHome: (...a: unknown[]) => loadHome(...a) }));
vi.mock("@/lib/mobile/time-zone", () => ({ profileTimeZone: (...a: unknown[]) => profileTimeZone(...a) }));
const flag = vi.hoisted(() => ({ plaid: true }));
const after = vi.hoisted(() => vi.fn());
const nudgeRefresh = vi.hoisted(() => vi.fn());
vi.mock("@/lib/plaid/ui-flag", () => ({ plaidUiEnabled: () => flag.plaid }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => after(fn) }));
vi.mock("@/server/plaid/service", () => ({ nudgeRefresh: (...a: unknown[]) => nudgeRefresh(...a) }));

import { GET } from "./route";

const supabaseA = { __as: "user-a" };

function req(url = "https://example.test/api/mobile/home", headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

beforeEach(() => {
  flag.plaid = true;
  after.mockReset();
  nudgeRefresh.mockReset();
  getBearerContext.mockReset();
  loadHome.mockReset();
  profileTimeZone.mockReset();
  loadHome.mockResolvedValue(testHome());
  profileTimeZone.mockResolvedValue("America/Denver");
  getBearerContext.mockResolvedValue({ user: { id: "user-a", email: "a@example.test" }, supabase: supabaseA });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/mobile/home", () => {
  it("nudges the caller's bank sync after answering, as the web Home does (throttled in nudgeRefresh)", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(after).toHaveBeenCalledTimes(1);
    expect(nudgeRefresh).not.toHaveBeenCalled(); // scheduled, not awaited
    await after.mock.calls[0]![0]();
    expect(nudgeRefresh).toHaveBeenCalledWith("user-a");
  });

  it("does not nudge while bank connections are switched off", async () => {
    flag.plaid = false;
    await GET(req());
    expect(after).not.toHaveBeenCalled();
  });

  it("does not nudge for a request it refuses", async () => {
    getBearerContext.mockResolvedValue(null);
    await GET(req());
    expect(after).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request with 401 and reads no data", async () => {
    getBearerContext.mockResolvedValue(null);

    const res = await GET(req());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(loadHome).not.toHaveBeenCalled();
  });

  it("returns the versioned Home view-model, private and uncached", async () => {
    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(body.version).toBe(1);
    expect(body.moneyLeft).toBe(body.income - body.spent);
    expect(body.month).toBe("2026-09");
    expect(body.today).toBe("2026-09-19");
  });

  it("loads the user's current month in their stored time zone, through their own client and verified id only", async () => {
    await GET(
      req("https://example.test/api/mobile/home?userId=victim&user_id=victim&m=2019-01", {
        "x-user-id": "victim",
      }),
    );

    expect(profileTimeZone).toHaveBeenCalledWith(supabaseA, "user-a");
    const [client, input] = loadHome.mock.calls[0]!;
    expect(client).toBe(supabaseA);
    // No month asked for (the web's `m` is not this API's parameter): loadHome picks the user's current month from the zone.
    expect(input).toEqual({ userId: "user-a", timeZone: "America/Denver", month: undefined, plaidEnabled: true });
    expect(JSON.stringify(loadHome.mock.calls)).not.toContain("victim");
  });

  it("browses another month like the web Home's month switcher, and rejects a malformed one without reading", async () => {
    await GET(req("https://example.test/api/mobile/home?month=2026-07"));
    expect(loadHome.mock.calls[0]![1]).toMatchObject({ month: "2026-07", timeZone: "America/Denver" });
    loadHome.mockClear();
    const bad = await GET(req("https://example.test/api/mobile/home?month=2026-13"));
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ error: "invalid_month" });
    expect(loadHome).not.toHaveBeenCalled();
  });

  it("answers not_onboarded (409) when the user has no time zone yet, without reading", async () => {
    profileTimeZone.mockResolvedValue(null);
    const res = await GET(req());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "not_onboarded" });
    expect(loadHome).not.toHaveBeenCalled();
  });

  it("refuses to serve partial financial numbers: a degraded load is a 503 with no data", async () => {
    loadHome.mockResolvedValue(testHome({ degraded: ["budgets"] }));

    const res = await GET(req());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });

  it("an unexpected error becomes a generic 503 that leaks nothing", async () => {
    loadHome.mockRejectedValue(new Error("relation transactions secret detail"));

    const res = await GET(req());
    const text = await res.text();

    expect(res.status).toBe(503);
    expect(text).toBe(JSON.stringify({ error: "unavailable" }));
    expect(text).not.toContain("secret detail");
  });
});
