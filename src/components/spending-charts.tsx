"use client";

import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "@/lib/budget/money";

// recharts is ~340 KB of unminified-equivalent JS. These chart bodies live in
// their own module so spending-overview.tsx can load them with next/dynamic,
// keeping recharts out of Home's first-load bundle. They render into the
// fixed-size boxes their parent already reserves, so nothing shifts on load.

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
};

export function TrendBars({
  data,
  currency,
}: {
  data: { month: string; spend: number; label: string; current: boolean }[];
  currency: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap="28%">
        <Tooltip
          cursor={false}
          formatter={(value) => [formatMoney(Number(value), currency), "Spent"]}
          labelFormatter={(_label, payload) => payload[0]?.payload.label ?? ""}
          contentStyle={tooltipStyle}
        />
        <Bar dataKey="spend" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.month} fill={d.current ? "var(--coral)" : "var(--border)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BreakdownDonut({
  slices,
  currency,
}: {
  slices: { name: string; amount: number; color: string }[];
  currency: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip
          formatter={(value, name) => [formatMoney(Number(value), currency), name]}
          wrapperStyle={{ zIndex: 10 }}
          contentStyle={tooltipStyle}
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
  );
}
