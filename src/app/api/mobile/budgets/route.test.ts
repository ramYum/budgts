import { beforeEach, describe, expect, it, vi } from "vitest";
import { testHome } from "@/lib/mobile/test-home";

const getBearerContext = vi.fn();
const loadBudgets = vi.fn();
const profileTimeZone = vi.fn();
const setBudget = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/plaid/ui-flag", () => ({ plaidUiEnabled: () => true }));
vi.mock("@/lib/budgets/load-budgets", () => ({ loadBudgets: (...a: unknown[]) => loadBudgets(...a) }));
vi.mock("@/lib/mobile/time-zone", () => ({ profileTimeZone: (...a: unknown[]) => profileTimeZone(...a) }));
vi.mock("@/lib/budgets/commands", () => ({ setBudget: (...a: unknown[]) => setBudget(...a) }));

import { GET, PUT } from "./route";

const CATEGORY = "44444444-4444-4444-8444-444444444444";
const supabase = { __as: "user-a" };

/** The loader's month shape, built by the real dashboard math (the test-home fixture). */
function monthData(month: string, degraded: string[] = []) {
  const h = testHome({ month });
  const unbudgeted = h.categories.filter((c) => c.kind === "expense" && !h.view.bars.some((b) => b.categoryId === c.id && b.budget > 0));
  return { range: "month", month, currency: h.currency, categories: h.categories, view: h.view, prevView: h.prevView, unbudgeted, degraded };
}
function allTime(month: string) {
  return {
    range: "all",
    month,
    currency: "USD",
    categories: [],
    allTimeRows: [{ categoryId: "cat-rent", name: "Rent", color: "#5B6CF0", total: 360000 }],
    degraded: [],
  };
}
const get = (qs = "") => new Request(`https://example.test/api/mobile/budgets${qs}`);
const put = (body: unknown, raw = false) =>
  new Request("https://example.test/api/mobile/budgets", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });

beforeEach(() => {
  getBearerContext.mockReset();
  loadBudgets.mockReset();
  profileTimeZone.mockReset();
  setBudget.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
  profileTimeZone.mockResolvedValue("Europe/Berlin");
  loadBudgets.mockImplementation(async (_c: unknown, input: { month?: string; range: "month" | "all" }) =>
    input.range === "all" ? allTime(input.month ?? "2026-09") : monthData(input.month ?? "2026-09"),
  );
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/mobile/budgets", () => {
  it("serves budget-vs-actual for the requested month via the caller's own client", async () => {
    const res = await GET(get("?month=2026-08"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ version: 1, range: "month", month: "2026-08" });
    expect(Array.isArray(body.categories)).toBe(true);
    expect(loadBudgets).toHaveBeenCalledWith(supabase, {
      userId: "user-a",
      timeZone: "Europe/Berlin",
      month: "2026-08",
      range: "month",
      plaidEnabled: true,
    });
  });

  it("defaults to the user's current month (loadBudgets picks it from their time zone)", async () => {
    await GET(get());
    expect(loadBudgets.mock.calls[0][1]).toMatchObject({ timeZone: "Europe/Berlin", month: undefined, range: "month" });
  });

  it("serves the all-time view for range=all, and rejects any other range", async () => {
    const res = await GET(get("?range=all"));
    expect(await res.json()).toEqual({
      version: 1,
      range: "all",
      month: "2026-09",
      currency: "USD",
      allTime: [{ categoryId: "cat-rent", name: "Rent", color: "#5B6CF0", total: 360000 }],
    });
    expect((await GET(get("?range=year"))).status).toBe(422);
  });

  it("never serves partial numbers", async () => {
    loadBudgets.mockResolvedValue(monthData("2026-08", ["budgets"]));
    const res = await GET(get("?month=2026-08"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
  });

  it("rejects a malformed month, a not-yet-onboarded user, and an unauthenticated caller without reading", async () => {
    expect((await GET(get("?month=2026-13"))).status).toBe(422);
    profileTimeZone.mockResolvedValue(null);
    expect((await GET(get())).status).toBe(409);
    getBearerContext.mockResolvedValue(null);
    expect((await GET(get())).status).toBe(401);
    expect(loadBudgets).not.toHaveBeenCalled();
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
