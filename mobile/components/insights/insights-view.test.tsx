import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { MobileInsights } from "../../lib/insights/insights-api";
import { ROLE } from "../../lib/brand/shared";
import { byTestId, flat, hosts, render, textContent, texts } from "../../test/render";
import { MonthNav } from "../kit/month-nav";
import { PageHeader } from "../kit/page-header";
import { SegmentedControl } from "../kit/segmented-control";
import { Reveal } from "../motion/reveal";
import { SpendingBreakdownCard } from "../charts/spending-breakdown-card";
import { SpendingTrendCard } from "../charts/spending-trend-card";
import { InsightsView, waffleLit } from "./insights-view";

const data = (over: Partial<MobileInsights> = {}): MobileInsights => ({
  month: "2026-09",
  currency: "USD",
  moneyLeft: 120000,
  income: 500000,
  spent: 380000,
  savingsRate: 0.24,
  savingsRateDelta: 4,
  incomeSources: [
    { name: "Salary", color: "#0f0", amount: 450000, share: 90 },
    { name: "Freelance", color: "#00f", amount: 50000, share: 10 },
  ],
  suggestion: null,
  breakdown: [],
  trend: [],
  trendChange: { total: 380000, delta: null, previousMonth: null },
  ...over,
});

function view(over: Partial<Parameters<typeof InsightsView>[0]> = {}) {
  const props: Parameters<typeof InsightsView>[0] = { data: data(), onBack: vi.fn(), onMonth: vi.fn(), onSuggestion: vi.fn(), ...over };
  return { r: render(<InsightsView {...props} />), props };
}

describe("Insights (web insights-view.tsx)", () => {
  it("heads the page with a back arrow and the month", () => {
    const { r, props } = view();
    const header = r.root.findByType(PageHeader);
    expect(header.props.title).toBe("Insights");
    header.props.onBack();
    expect(props.onBack).toHaveBeenCalled();
    r.root.findByType(MonthNav).props.onChange("2026-08");
    expect(props.onMonth).toHaveBeenCalledWith("2026-08");
  });

  it("shows Money left, red when negative", () => {
    expect(textContent(byTestId(view().r, "insights-money-left"))).toBe("Money left$1,200.00Income minus spending, this month.");
    const neg = view({ data: data({ moneyLeft: -5000 }) }).r;
    const figure = hosts(byTestId(neg, "insights-money-left"), "Text").find((t) => textContent(t) === "-$50.00")!;
    expect(flat(figure.props.style).color).toBe(ROLE.neg);
  });

  it("prints the savings rate, its change and the waffle's key", () => {
    expect(texts(byTestId(view().r, "insights-savings-rate"))).toEqual(["Savings rate", "24%", "of income kept", "↑ 4 pts vs. last month", "1 cell = 1%"]);
    const down = view({ data: data({ savingsRateDelta: -3 }) }).r;
    expect(texts(byTestId(down, "insights-savings-rate"))).toContain("↓ 3 pts vs. last month");
    const none = view({ data: data({ savingsRate: null, savingsRateDelta: null }) }).r;
    expect(texts(byTestId(none, "insights-savings-rate"))).toEqual(["Savings rate", "No income", "No income this month yet", "1 cell = 1%"]);
  });

  it("lights one waffle cell per whole percent, bottom-left first, none for a negative month", () => {
    expect([waffleLit(null), waffleLit(-0.2), waffleLit(0.244), waffleLit(0.245), waffleLit(1.4)]).toEqual([0, 0, 24, 25, 100]);
    const cells = byTestId(view().r, "insights-waffle").children as unknown as { props: { style: unknown } }[];
    const lit = cells.map((c) => flat(c.props.style).backgroundColor === ROLE.ink);
    expect(lit.filter(Boolean)).toHaveLength(24);
    expect(lit.slice(90, 100).every(Boolean)).toBe(true); // the bottom row
    expect(lit.slice(80, 90).every(Boolean)).toBe(true); // the row above
    expect(lit.slice(70, 74)).toEqual([true, true, true, true]); // 21% to 24%, from the left
    expect(lit[74]).toBe(false);
    expect(lit[0]).toBe(false);
  });

  it("names where to save and goes there", () => {
    const unbudgeted = { kind: "unbudgeted" as const, categoryId: "c", name: "Dining", amount: 13000, share: 34 };
    const { r, props } = view({ data: data({ suggestion: unbudgeted }) });
    expect(textContent(byTestId(r, "insights-suggestion"))).toBe(
      "Where you could saveDining is 34% of your spending$130.00 with no budget. Setting one makes the plan real.",
    );
    byTestId(r, "insights-suggestion").props.onPress();
    expect(props.onSuggestion).toHaveBeenCalledWith(unbudgeted);

    const mover = { kind: "mover" as const, categoryId: "c", name: "Dining", amount: 13000, delta: 3000 };
    expect(textContent(byTestId(view({ data: data({ suggestion: mover }) }).r, "insights-suggestion"))).toBe(
      "Where you could saveDining$130.00 this month, up $30.00 vs. last month",
    );
    expect(view().r.root.findAll((n) => n.props.testID === "insights-suggestion")).toHaveLength(0);
  });

  it("switches the breakdown between spending and income by source", () => {
    const { r } = view();
    expect(texts(byTestId(r, "insights-breakdown")).slice(0, 2)).toEqual(["Total spending", "$3,800.00"]);
    act(() => r.root.findByType(SegmentedControl).props.onChange("income"));
    const rows = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "insights-income-row");
    expect(rows.map((row) => texts(row))).toEqual([
      ["Salary", "$4,500.00", "90%"],
      ["Freelance", "$500.00", "10%"],
    ]);
    expect(texts(byTestId(r, "insights-breakdown")).slice(0, 2)).toEqual(["Total income", "$5,000.00"]);
  });

  it("says so when the month has no spending or no income", () => {
    const { r } = view({ data: data({ spent: 0, incomeSources: [] }) });
    expect(texts(byTestId(r, "insights-breakdown"))).toContain("No spending recorded this month yet.");
    act(() => r.root.findByType(SegmentedControl).props.onChange("income"));
    expect(texts(byTestId(r, "insights-breakdown"))).toContain("No income recorded this month yet.");
  });

  it("rises in the web's order", () => {
    const suggestion = { kind: "mover" as const, categoryId: "c", name: "Dining", amount: 13000, delta: 3000 };
    expect(view({ data: data({ suggestion }) }).r.root.findAllByType(Reveal).map((n) => n.props.i)).toEqual([1, 2, 3, 4, 5]);
  });

  it("draws the spending ring (F7) under the same header, and the six-month trend", () => {
    const breakdown = [{ name: "Housing", amount: 200000, share: 53 }, { name: "Other", amount: 180000, share: 47 }];
    const trend = [{ month: "2026-08", spend: 350000 }, { month: "2026-09", spend: 380000 }];
    const trendChange = { total: 380000, delta: 30000, previousMonth: "2026-08" };
    const { r } = view({ data: data({ breakdown, trend, trendChange }) });
    const ring = r.root.findByType(SpendingBreakdownCard);
    expect(ring.props).toMatchObject({ breakdown, totalSpent: 380000, currency: "USD" });
    expect(texts(ring).slice(0, 2)).toEqual(["Total spending", "$3,800.00"]);
    expect(r.root.findAll((n) => n.props.testID === "insights-breakdown")).toHaveLength(0);
    expect(r.root.findByType(SpendingTrendCard).props).toMatchObject({ trend, change: trendChange, figure: "change", title: "Spending · 6 months" });
    act(() => r.root.findByType(SegmentedControl).props.onChange("income"));
    expect(r.root.findAllByType(SpendingBreakdownCard)).toHaveLength(0);
    expect(texts(byTestId(r, "insights-breakdown")).slice(0, 2)).toEqual(["Total income", "$5,000.00"]);
  });
});
