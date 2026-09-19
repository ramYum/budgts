import { describe, expect, it } from "vitest";
import { monthKey } from "@/lib/budget/month";
import { groupUncategorized } from "@/lib/plaid/group-uncategorized";
import { buildDemoBanks, buildDemoDashboard, buildDemoNeedsCategory } from "./demo-data";

const NOW = new Date("2026-09-19T10:00:00Z");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("buildDemoDashboard", () => {
  const demo = buildDemoDashboard(NOW);

  it("runs the REAL dashboard math over synthetic rows: Money Left = income − spending", () => {
    const { income, spent, netSavings, savingsRate } = demo.view.tiles;
    expect(income).toBe(320000);
    expect(spent).toBe(174854);
    expect(netSavings).toBe(income - spent);
    expect(netSavings).toBe(145146);
    expect(savingsRate).not.toBeNull();
  });

  it("is for the current month, in USD", () => {
    expect(demo.month).toBe(monthKey(NOW));
    expect(demo.currency).toBe("USD");
  });

  it("gives the trend six months ending this month, with this month equal to the tile", () => {
    expect(demo.trend).toHaveLength(6);
    expect(demo.trend[5]!.month).toBe(demo.month);
    expect(demo.trend[5]!.spend).toBe(demo.view.tiles.spent);
  });

  it("recent activity is synthetic, newest first, and inside the month", () => {
    expect(demo.recent.length).toBeGreaterThanOrEqual(4);
    const times = demo.recent.map((r) => new Date(r.occurredAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    for (const r of demo.recent) {
      expect(r.id.startsWith("demo-")).toBe(true);
      expect(r.occurredAt.startsWith(demo.month)).toBe(true);
    }
  });

  it("never carries an id that could match a real database row", () => {
    const ids = [
      ...demo.recent.map((r) => r.id),
      ...demo.categories.map((c) => c.id),
      ...demo.accounts.map((a) => a.id),
    ];
    for (const id of ids) expect(UUID.test(id)).toBe(false);
  });
});

describe("buildDemoBanks", () => {
  const { healthy, flagged, excluded } = buildDemoBanks(NOW);

  it("a healthy bank has nothing pending review", () => {
    expect(healthy.status).toBe("active");
    expect(healthy.accounts.every((a) => !a.needsReview && !a.excludedFromCalculations)).toBe(true);
  });

  it("a flagged bank has exactly one account awaiting the owner's review, not yet excluded", () => {
    const awaiting = flagged.accounts.filter((a) => a.needsReview);
    expect(awaiting).toHaveLength(1);
    expect(awaiting[0]!.excludedFromCalculations).toBe(false);
    expect(awaiting[0]!.reviewReason).toBeTruthy();
  });

  it("an excluded account is one the owner already chose to exclude", () => {
    expect(excluded.accounts.some((a) => a.excludedFromCalculations)).toBe(true);
  });

  it("uses only synthetic ids", () => {
    for (const b of [healthy, flagged, excluded]) {
      expect(b.id.startsWith("demo-")).toBe(true);
      expect(b.itemId.startsWith("demo-")).toBe(true);
      for (const a of b.accounts) expect(a.rowId.startsWith("demo-")).toBe(true);
    }
  });
});

describe("buildDemoNeedsCategory", () => {
  const demo = buildDemoNeedsCategory(NOW);

  it("groups by merchant so one answer clears several rows", () => {
    const groups = groupUncategorized(demo.items);
    expect(groups.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...groups.map((g) => g.count))).toBeGreaterThanOrEqual(2);
  });

  it("offers real-looking categories and no missing-standard prompts", () => {
    expect(demo.categories.some((c) => c.kind === "expense")).toBe(true);
    expect(demo.missingStandard).toEqual([]);
  });
});
