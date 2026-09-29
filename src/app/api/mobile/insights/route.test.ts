import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDashboard } from "@/lib/budget/dashboard";
import type { InsightsData } from "@/lib/insights/load-insights";
import { pickSuggestion } from "@/lib/insights/suggestion";
import { savingsRateDelta, sharesOf, spendingBreakdown, trendChange } from "@/lib/insights/figures";
import { buildMobileInsights } from "@/lib/mobile/insights";

const getBearerContext = vi.fn();
const loadInsights = vi.fn();
const profileTimeZone = vi.fn();
vi.mock("@/lib/auth/bearer-context", () => ({ getBearerContext: (...a: unknown[]) => getBearerContext(...a) }));
vi.mock("@/lib/insights/load-insights", () => ({ loadInsights: (...a: unknown[]) => loadInsights(...a) }));
vi.mock("@/lib/mobile/time-zone", () => ({ profileTimeZone: (...a: unknown[]) => profileTimeZone(...a) }));
vi.mock("@/lib/plaid/ui-flag", () => ({ plaidUiEnabled: () => true }));

import { GET } from "./route";

const CATS = [
  { id: "food", kind: "expense" as const, name: "Food / Groceries", color: "#0a0" },
  { id: "fun", kind: "expense" as const, name: "Entertainment", color: "#aa0" },
  { id: "pay", kind: "income" as const, name: "Pay", color: "#00a" },
];
const txn = (categoryId: string, amount: number, direction: "debit" | "credit", day: string) => ({
  categoryId,
  amount,
  direction,
  occurredAt: new Date(`${day}T12:00:00Z`),
  status: "confirmed" as const,
  isTransfer: false,
  duplicateOfId: null,
  eventRole: null,
  transferUserSet: false,
  accountExcluded: false,
});

function fixture(over: Partial<InsightsData> = {}): InsightsData {
  const current = buildDashboard(
    [txn("pay", 400000, "credit", "2026-09-01"), txn("food", 30000, "debit", "2026-09-03"), txn("fun", 9000, "debit", "2026-09-04")],
    CATS,
    [{ categoryId: "food", amount: 50000 }],
    "2026-09",
  );
  const previous = buildDashboard([txn("pay", 300000, "credit", "2026-08-01"), txn("food", 20000, "debit", "2026-08-03")], CATS, [], "2026-08");
  return {
    month: "2026-09",
    currency: "USD",
    current,
    previous,
    trend: [
      { month: "2026-08", spend: 20000 },
      { month: "2026-09", spend: 39000 },
    ],
    incomeSources: [{ name: "Pay", color: "#00a", amount: 400000 }],
    degraded: [],
    ...over,
  };
}

const supabase = { __as: "user-a" };
const req = (qs = "") => new Request(`https://example.test/api/mobile/insights${qs}`);

beforeEach(() => {
  getBearerContext.mockReset();
  loadInsights.mockReset();
  profileTimeZone.mockReset();
  getBearerContext.mockResolvedValue({ user: { id: "user-a" }, supabase });
  profileTimeZone.mockResolvedValue("Europe/Berlin");
  loadInsights.mockResolvedValue(fixture());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/mobile/insights", () => {
  it("prints exactly the figures the web Insights view computes from the same data", async () => {
    const data = fixture();
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    const t = data.current.tiles;
    expect(body).toMatchObject({ version: 1, month: "2026-09", currency: "USD" });
    expect(body.moneyLeft).toBe(t.netSavings);
    expect(body.income).toBe(t.income);
    expect(body.spent).toBe(t.spent);
    expect(body.savingsRate).toBe(t.savingsRate);
    // The web view's own derivations (insights-view.tsx, spending-overview.tsx), from the same shared functions:
    expect(body.savingsRateDelta).toBe(savingsRateDelta(t.savingsRate, data.previous.tiles.savingsRate));
    expect(body.suggestion).toEqual(pickSuggestion(data.current.bars, data.previous.bars, t.spent));
    expect(body.breakdown).toEqual(spendingBreakdown(data.current.bars, t.spent));
    expect(body.trendChange).toEqual(trendChange(data.trend));
    expect(body.incomeSources).toEqual([{ name: "Pay", color: "#00a", amount: 400000, share: sharesOf([400000])[0] }]);
    expect(body).toEqual(JSON.parse(JSON.stringify(buildMobileInsights(data))));
    // Money Left = income - spending, never recomputed on the wire:
    expect(body.moneyLeft).toBe(400000 - 39000);
  });

  it("reads the requested month (or the user's own current one) through the caller's client only", async () => {
    await GET(req("?month=2026-07&userId=victim"));
    expect(loadInsights).toHaveBeenCalledWith(supabase, {
      userId: "user-a",
      timeZone: "Europe/Berlin",
      month: "2026-07",
      plaidEnabled: true,
    });
    await GET(req());
    expect(loadInsights.mock.calls[1]![1]).toMatchObject({ month: undefined });
  });

  it("never serves partial numbers, and rejects bad input and missing auth without reading", async () => {
    loadInsights.mockResolvedValue(fixture({ degraded: ["budgets"] }));
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "unavailable" });
    loadInsights.mockClear();
    expect((await GET(req("?month=26-09"))).status).toBe(422);
    profileTimeZone.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(409);
    getBearerContext.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
    expect(loadInsights).not.toHaveBeenCalled();
  });
});
