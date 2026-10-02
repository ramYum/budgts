import { beforeEach, describe, expect, it, vi } from "vitest";

const getBearerContext = vi.fn();
const loadMobileActivityExtras = vi.fn();
const scheduled: (() => unknown)[] = [];
const flag = vi.hoisted(() => ({ plaidOn: true }));

vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/plaid/ui-flag", () => ({ plaidUiEnabled: () => flag.plaidOn }));
vi.mock("@/lib/mobile/status", () => ({ loadMobileActivityExtras: (...a: unknown[]) => loadMobileActivityExtras(...a) }));
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
  scheduled.length = 0;
  flag.plaidOn = true;
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
  loadMobileActivityExtras.mockResolvedValue({ version: 1, plaidEnabled: true, needsCategory: [], missingStandardCategories: [], limitedHistory: [] });
});

describe("GET /api/mobile/activity", () => {
  it("answers the caller's panels and never asks Plaid for a bank refresh: only the native pull does", async () => {
    for (const on of [true, false]) {
      flag.plaidOn = on;
      const res = await GET(get());
      expect(res.status).toBe(200);
      expect(loadMobileActivityExtras).toHaveBeenLastCalledWith(supabase, "user-a", on);
    }
    expect(scheduled).toHaveLength(0);
  });

  it("an unauthenticated request reads nothing", async () => {
    getBearerContext.mockResolvedValue(null);
    expect((await GET(get())).status).toBe(401);
    expect(loadMobileActivityExtras).not.toHaveBeenCalled();
  });
});
