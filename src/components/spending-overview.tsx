"use client";

import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "@/lib/budget/money";
import type { DashboardBar } from "@/lib/budget/dashboard";
import type { MonthSpend } from "@/lib/budget/spend-trend";

/** "Where your money goes" categorical colors — a fixed identity per category,
 * in the one order validated (dataviz skill's `validate_palette.js`, adjacent
 * mode) against CVD confusion: worst adjacent ΔE 9.1 light / 8.4 dark (≥8
 * target), worst adjacent normal-vision ΔE 19.6 light / 19.3 dark (≥15
 * floor). The app's own brand hues (lavender/sky in particular) fail that
 * check pairwise, so this chart deliberately uses a different, validated set
 * — rendered in this exact order so ring adjacency matches what was
 * validated. Never reorder by amount; identity, not rank, owns the color. */
const CATEGORY_CHART_COLOR: Record<string, string> = {
  Transportation: "#2a78d6",
  "Personal Care": "#eb6834",
  "Food / Groceries": "#1baf7a",
  Insurances: "#eda100",
  Entertainment: "#e87ba4",
  Housing: "#4a3aa7",
};
const CHART_ORDER = Object.keys(CATEGORY_CHART_COLOR);
// Reserve slots for any category outside the known set (custom categories),
// then fold everything past 8 total into the "Other" gray below.
const FALLBACK_COLORS = ["#008300", "#e34948"];
const OTHER_COLOR = "#9aa0ac"; // matches --gray-strong

function monthShortLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

/** "Total spending" stat tile — value + delta + a 6-month sparkline (dataviz
 * skill: past months in the de-emphasis gray, current period in the accent).
 * Every value is also in the legend/labels, so the bar-only encoding never
 * gates information behind hover. */
export function SpendingTrendCard({
  trend,
  changePct,
  currency,
}: {
  trend: MonthSpend[];
  changePct: number | null;
  currency: string;
}) {
  const total = trend.at(-1)?.spend ?? 0;
  const data = trend.map((t, i) => ({
    ...t,
    label: monthShortLabel(t.month),
    current: i === trend.length - 1,
  }));

  return (
    <section className="card space-y-3 rounded-2xl border border-hairline p-4">
      <div>
        <p className="text-xs font-medium text-muted">Total spending</p>
        <div className="flex items-baseline gap-2">
          <p className="tnum text-2xl font-bold">{formatMoney(total, currency)}</p>
          {changePct !== null ? (
            <span className={`tnum text-sm font-medium ${changePct <= 0 ? "text-pos" : "text-neg"}`}>
              {changePct <= 0 ? "↓" : "↑"} {Math.abs(Math.round(changePct))}%
            </span>
          ) : null}
        </div>
        {changePct !== null ? <p className="text-xs text-muted">vs. last month</p> : null}
      </div>
      <div className="h-28" role="img" aria-label={`Spending by month: ${data.map((d) => `${d.label} ${formatMoney(d.spend, currency)}`).join(", ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap="28%">
            <Tooltip
              cursor={false}
              formatter={(value) => [formatMoney(Number(value), currency), "Spent"]}
              labelFormatter={(_label, payload) => payload[0]?.payload.label ?? ""}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
              }}
            />
            <Bar dataKey="spend" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.month} fill={d.current ? "var(--coral)" : "var(--border)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex text-center text-xs text-muted">
        {data.map((d) => (
          <span key={d.month} className={`flex-1 ${d.current ? "font-semibold text-text" : ""}`}>
            {d.label}
          </span>
        ))}
      </div>
    </section>
  );
}

/** "Where your money goes" — a part-to-whole snapshot at a glance, ≤6
 * segments (dataviz skill: donut is the right form for exactly this job,
 * wrong for comparing close values). Every slice is also a labeled legend
 * row, so color is never the only way to read a value. */
export function SpendingBreakdownCard({
  bars,
  totalSpent,
  currency,
}: {
  bars: DashboardBar[];
  totalSpent: number;
  currency: string;
}) {
  const known = CHART_ORDER.map((name) => bars.find((b) => b.name === name))
    .filter((b): b is DashboardBar => !!b && b.actual > 0)
    .map((b) => ({ name: b.name, amount: b.actual, color: CATEGORY_CHART_COLOR[b.name]! }));

  const knownNames = new Set(known.map((k) => k.name));
  const custom = bars
    .filter((b) => b.actual > 0 && !knownNames.has(b.name))
    .sort((a, b) => b.actual - a.actual)
    .slice(0, FALLBACK_COLORS.length)
    .map((b, i) => ({ name: b.name, amount: b.actual, color: FALLBACK_COLORS[i]! }));

  const categorized = known.reduce((sum, s) => sum + s.amount, 0) + custom.reduce((sum, s) => sum + s.amount, 0);
  const other = Math.max(0, totalSpent - categorized);

  const slices = [
    ...known,
    ...custom,
    ...(other > 0 ? [{ name: "Other", amount: other, color: OTHER_COLOR }] : []),
  ];

  if (slices.length === 0 || totalSpent <= 0) {
    return null;
  }

  return (
    <section className="card space-y-3 rounded-2xl border border-hairline p-4">
      <h2 className="text-sm font-semibold">Where your money goes</h2>
      <div className="flex items-center gap-4">
        <div className="relative h-36 w-36 shrink-0" role="img" aria-label={`Spending breakdown: ${slices.map((s) => `${s.name} ${formatMoney(s.amount, currency)}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                formatter={(value, name) => [formatMoney(Number(value), currency), name]}
                wrapperStyle={{ zIndex: 10 }}
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontSize: 12,
                }}
              />
              <Pie
                data={slices}
                dataKey="amount"
                nameKey="name"
                innerRadius="68%"
                outerRadius="100%"
                paddingAngle={slices.length > 1 ? 2 : 0}
                cornerRadius={3}
                stroke="none"
                isAnimationActive={false}
              >
                {slices.map((s) => (
                  <Cell key={s.name} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center">
            <p className="tnum text-lg font-bold leading-tight">{formatMoney(totalSpent, currency)}</p>
            <p className="text-[11px] text-muted">This month</p>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2 text-sm">
          {slices.map((s) => (
            <li key={s.name} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="tnum shrink-0 text-muted">{Math.round((s.amount / totalSpent) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
