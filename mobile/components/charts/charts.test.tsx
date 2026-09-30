import { describe, expect, it } from "vitest";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { RING, ringSlices, trendColumns, formatWhole, formatSignedChange } from "../../lib/shared";
import { reducedMotion } from "../../test/native-hosts";
import { byTestId, flat, hosts, render, textContent, texts } from "../../test/render";
import { Cell } from "./cell";
import { RING_RAMP, SpendingBreakdownCard } from "./spending-breakdown-card";
import { SpendingTrendCard } from "./spending-trend-card";

const trend = [
  { month: "2026-04", spend: 100000 },
  { month: "2026-05", spend: 50000 },
  { month: "2026-06", spend: 0 },
  { month: "2026-07", spend: 75000 },
  { month: "2026-08", spend: 120000 },
  { month: "2026-09", spend: 167150 },
];
const change = { total: 167150, delta: 47150, previousMonth: "2026-08" };

describe("chart geometry (src/lib/display/charts.ts, shared with the web)", () => {
  it("lights each column in proportion to the biggest month, at least one row once anything was spent", () => {
    const cols = trendColumns(trend);
    expect(cols.map((c) => c.lit)).toEqual([8, 4, 0, 6, 10, 14]);
    expect(cols.map((c) => c.current)).toEqual([false, false, false, false, false, true]);
    expect(cols[5]!.label).toBe("Sep");
  });

  it("tags whole units, cut not rounded, and signs a change with the web's minus", () => {
    expect(formatWhole(167199, "USD", "en-US")).toBe("$1,671");
    expect(formatSignedChange(-4000, (m) => `$${m / 100}`)).toBe("−$40");
  });

  it("paints the ring clockwise by running share", () => {
    const of = ringSlices([75, 25], 100);
    expect(of[0]).toBe(0);
    expect(of[RING.length - 1]).toBe(1);
    expect(of.filter((k) => k === 0).length / RING.length).toBeCloseTo(0.75, 1);
  });
});

describe("SpendingTrendCard (web SpendingTrendCard)", () => {
  it("leads with this month and its change, then six columns of 14 segments, the shown month in the accent", () => {
    const r = render(<SpendingTrendCard trend={trend} change={change} currency="USD" />);
    expect(textContent(byTestId(r, "spending-trend-card"))).toContain("This month · +$471.50 vs August");
    const cells = r.root.findAll((n) => n.type === Cell);
    expect(cells).toHaveLength(6 * 14);
    const last = cells.slice(5 * 14);
    expect(last.filter((c) => c.props.color === COLOR.signal)).toHaveLength(14);
    expect(cells.slice(0, 14).filter((c) => c.props.color === COLOR.silver)).toHaveLength(8);
    expect(cells.slice(0, 14).filter((c) => c.props.color === ROLE.surface2)).toHaveLength(6);
    expect(texts(r)).toContain("$1,671");
  });

  it("Insights leads with the change instead", () => {
    const r = render(<SpendingTrendCard trend={trend} change={change} currency="USD" figure="change" />);
    expect(texts(r).slice(0, 2)).toEqual(["+$471.50", "vs August"]);
  });

  it("cells snap in on steps(3), bottom-up per column; still under reduced motion", () => {
    const r = render(<Cell d={4} color="#000" style={{ width: 6, height: 6 }} />);
    expect(flat(hosts(r, "Animated.View")[0]!.props.style)).toMatchObject({ animationDuration: "240ms", animationDelay: `${4 * 22 + 220}ms` });
    reducedMotion.value = true;
    try {
      expect(flat(hosts(render(<Cell d={4} color="#000" style={{}} />), "Animated.View")[0]!.props.style).animationName).toBeUndefined();
    } finally {
      reducedMotion.value = false;
    }
  });
});

describe("SpendingBreakdownCard (web SpendingBreakdownCard)", () => {
  const breakdown = [
    { name: "Housing", amount: 120000, share: 60 },
    { name: "Food / Groceries", amount: 50000, share: 25 },
    { name: "Other", amount: 30000, share: 15 },
  ];

  it("draws the ring in the accent then the neutral ramp, with the total inside and a legend naming every slice", () => {
    const r = render(<SpendingBreakdownCard breakdown={breakdown} totalSpent={200000} currency="USD" />);
    const colors = new Set(r.root.findAll((n) => n.type === Cell).map((c) => c.props.color));
    expect([...colors]).toEqual(RING_RAMP.slice(0, 3));
    const words = texts(r);
    expect(words).toEqual(expect.arrayContaining(["Total", "Housing", "$1,200.00", "60%", "Other", "15%"]));
  });

  it("shows nothing when nothing was spent", () => {
    expect(render(<SpendingBreakdownCard breakdown={[]} totalSpent={0} currency="USD" />).toJSON()).toBeNull();
  });
});
