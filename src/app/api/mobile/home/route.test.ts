import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoDashboard } from "@/test-utils/demo-dashboard";

const getBearerContext = vi.fn();
const loadMonthlyDashboard = vi.fn();
const loadRecentActivity = vi.fn();

vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/budget/home-data", () => ({
  loadMonthlyDashboard: (...a: unknown[]) => loadMonthlyDashboard(...a),
  loadRecentActivity: (...a: unknown[]) => loadRecentActivity(...a),
}));
vi.mock("@/lib/plaid/ui-flag", () => ({ plaidUiEnabled: () => true }));

import { GET } from "./route";

const supabaseA = { __as: "user-a" };
const NOW = new Date();

function dash(degraded: string[] = []) {
  const d = buildDemoDashboard(NOW);
  return {
    view: d.view,
    prevView: d.prevView,
    trend: d.trend,
    savings: d.savings,
    currency: d.currency,
    categories: d.categories,
    degraded,
  };
}

function req(url = "https://example.test/api/mobile/home", headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

beforeEach(() => {
  getBearerContext.mockReset();
  loadMonthlyDashboard.mockReset();
  loadRecentActivity.mockReset();
  loadMonthlyDashboard.mockResolvedValue(dash());
  loadRecentActivity.mockResolvedValue({ items: [], failed: false });
});

describe("GET /api/mobile/home", () => {
  it("rejects an unauthenticated request with 401 and reads no data", async () => {
    getBearerContext.mockResolvedValue(null);

    const res = await GET(req());

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(loadMonthlyDashboard).not.toHaveBeenCalled();
    expect(loadRecentActivity).not.toHaveBeenCalled();
  });

  it("returns the versioned Home view-model, private and uncached", async () => {
    getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase: supabaseA });

    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(body.version).toBe(1);
    expect(body.moneyLeft).toBe(body.income - body.spent);
    expect(Object.keys(body).sort()).toEqual(
      [
        "budgeted",
        "categories",
        "currency",
        "income",
        "leftToSpend",
        "moneyLeft",
        "month",
        "recent",
        "savings",
        "savingsRate",
        "spent",
        "version",
      ].sort(),
    );
  });

  it("reads through the authenticated caller's own client and verified id — never anything in the request", async () => {
    getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase: supabaseA });

    await GET(
      req("https://example.test/api/mobile/home?userId=victim&user_id=victim&id=victim&m=2019-01", {
        "x-user-id": "victim",
      }),
    );

    const [client, userId, month] = loadMonthlyDashboard.mock.calls[0]!;
    expect(client).toBe(supabaseA);
    expect(userId).toBe("user-a");
    expect(month).not.toBe("2019-01"); // no client-chosen month either: the current month only
    expect(loadRecentActivity.mock.calls[0]![0]).toBe(supabaseA);
    expect(JSON.stringify(loadMonthlyDashboard.mock.calls)).not.toContain("victim");
  });

  it("refuses to serve partial financial numbers: a degraded load is a 503 with no data", async () => {
    getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase: supabaseA });
    loadMonthlyDashboard.mockResolvedValue(dash(["budgets"]));

    const res = await GET(req());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "home_unavailable" });
  });

  it("a failed recent-activity query is also a 503", async () => {
    getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase: supabaseA });
    loadRecentActivity.mockResolvedValue({ items: [], failed: true });

    expect((await GET(req())).status).toBe(503);
  });

  it("an unexpected error becomes a generic 503 that leaks nothing", async () => {
    getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase: supabaseA });
    loadMonthlyDashboard.mockRejectedValue(new Error("relation transactions secret detail"));

    const res = await GET(req());
    const text = await res.text();

    expect(res.status).toBe(503);
    expect(text).toBe(JSON.stringify({ error: "home_unavailable" }));
    expect(text).not.toContain("secret detail");
  });
});
