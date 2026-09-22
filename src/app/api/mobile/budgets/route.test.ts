import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoDashboard } from "@/test-utils/demo-dashboard";

const getBearerContext = vi.fn();
const loadMonthlyDashboard = vi.fn();
const setBudget = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/plaid/ui-flag", () => ({ plaidUiEnabled: () => true }));
vi.mock("@/lib/budget/home-data", () => ({ loadMonthlyDashboard: (...a: unknown[]) => loadMonthlyDashboard(...a) }));
vi.mock("@/lib/budget/commands", () => ({ setBudget: (...a: unknown[]) => setBudget(...a) }));

import { GET, PUT } from "./route";

const CATEGORY = "44444444-4444-4444-8444-444444444444";
const supabase = { __as: "user-a" };
const get = (qs = "") => new Request(`https://example.test/api/mobile/budgets${qs}`);
const put = (body: unknown, raw = false) =>
  new Request("https://example.test/api/mobile/budgets", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

function dash(degraded: string[] = []) {
  const d = buildDemoDashboard(new Date("2026-09-15T12:00:00Z"));
  return { view: d.view, prevView: d.prevView, trend: d.trend, savings: d.savings, currency: d.currency, categories: d.categories, degraded };
}

beforeEach(() => {
  getBearerContext.mockReset();
  loadMonthlyDashboard.mockReset();
  setBudget.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
  loadMonthlyDashboard.mockResolvedValue(dash());
});

describe("GET /api/mobile/budgets", () => {
  it("serves the dashboard's budget-vs-actual for the month via the caller's own client", async () => {
    const res = await GET(get("?month=2026-08"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ version: 1, month: "2026-08" });
    expect(Array.isArray(body.categories)).toBe(true);
    expect(loadMonthlyDashboard).toHaveBeenCalledWith(supabase, "user-a", "2026-08", true);
  });

  it("never serves partial numbers", async () => {
    loadMonthlyDashboard.mockResolvedValue(dash(["budgets"]));
    const res = await GET(get("?month=2026-08"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });

  it("rejects a malformed month and an unauthenticated caller without reading", async () => {
    expect((await GET(get("?month=2026-13"))).status).toBe(422);
    getBearerContext.mockResolvedValue(null);
    expect((await GET(get())).status).toBe(401);
    expect(loadMonthlyDashboard).not.toHaveBeenCalled();
  });
});

describe("PUT /api/mobile/budgets", () => {
  it("sets one category's month for the verified user", async () => {
    setBudget.mockResolvedValue({ ok: true });
    const body = { categoryId: CATEGORY, month: "2026-09", amount: "400" };
    const res = await PUT(put(body));
    expect(res.status).toBe(200);
    expect(setBudget).toHaveBeenCalledWith(supabase, "user-a", body);
  });

  it("maps validation failures and bad bodies, and requires authentication", async () => {
    setBudget.mockResolvedValue({ ok: false, error: "invalid", fieldErrors: { amount: "A budget can't be negative" } });
    const res = await PUT(put({ categoryId: CATEGORY, month: "2026-09", amount: "-5" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "invalid", fieldErrors: { amount: "A budget can't be negative" } });
    expect((await PUT(put("nope", true))).status).toBe(400);
    getBearerContext.mockResolvedValue(null);
    expect((await PUT(put({}))).status).toBe(401);
  });
});
