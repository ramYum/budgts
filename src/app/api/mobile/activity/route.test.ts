import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const loadMobileActivityExtras = vi.fn();
const nudgeRefresh = vi.fn();
const scheduled: (() => unknown)[] = [];
const flag = vi.hoisted(() => ({ plaidOn: true }));

vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/plaid/ui-flag", () => ({ plaidUiEnabled: () => flag.plaidOn }));
vi.mock("@/lib/mobile/status", () => ({ loadMobileActivityExtras: (...a: unknown[]) => loadMobileActivityExtras(...a) }));
vi.mock("@/server/plaid/service", () => ({ nudgeRefresh: (...a: unknown[]) => nudgeRefresh(...a) }));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (cb: () => unknown) => void scheduled.push(cb),
}));

import { GET } from "./route";

const supabase = { __as: "user-a" };
const get = () => new Request("https://example.test/api/mobile/activity");

beforeEach(() => {
  getBearerContext.mockReset();
  loadMobileActivityExtras.mockReset();
  nudgeRefresh.mockReset();
  scheduled.length = 0;
  flag.plaidOn = true;
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
  loadMobileActivityExtras.mockResolvedValue({ version: 1, plaidEnabled: true, needsCategory: [], missingStandardCategories: [], limitedHistory: [] });
});

describe("GET /api/mobile/activity: the web transactions page's refresh nudge", () => {
  it("schedules the throttled nudgeRefresh for the caller after the response when bank connections are on", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(nudgeRefresh).not.toHaveBeenCalled(); // never holds up the answer
    expect(scheduled).toHaveLength(1);
    await scheduled[0]!();
    expect(nudgeRefresh).toHaveBeenCalledWith("user-a");
  });

  it("schedules nothing when bank connections are off", async () => {
    flag.plaidOn = false;
    expect((await GET(get())).status).toBe(200);
    expect(scheduled).toHaveLength(0);
    expect(nudgeRefresh).not.toHaveBeenCalled();
  });

  it("an unauthenticated request neither reads nor nudges", async () => {
    getBearerContext.mockResolvedValue(null);
    expect((await GET(get())).status).toBe(401);
    expect(loadMobileActivityExtras).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(0);
  });
});
