"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney, formatSavingsRate } from "@/lib/budget/money";
import type { DashboardView as DV } from "@/lib/budget/dashboard";
import type { MonthSpend } from "@/lib/budget/spend-trend";
import { pickSuggestion } from "@/lib/insights/suggestion";
import { SpendingBreakdownCard, SpendingTrendCard, sharesOf } from "./spending-overview";
import { CategoryIcon, Chevron, IconTile, SegmentedControl, figureSize } from "./ui";

/** Savings rate as a 10×10 waffle: one cell per percent, filled from the
 * bottom-left, row by row. The figure beside it is the real number; the
 * waffle is its picture (a negative month shows no cells). */
function Waffle({ rate }: { rate: number | null }) {
  const lit = rate === null ? 0 : Math.max(0, Math.min(100, Math.round(rate * 100)));
  return (
    <div className="grid shrink-0 grid-cols-10 gap-0.5" style={{ width: 78 }} aria-hidden>
      {Array.from({ length: 100 }, (_, i) => {
        const fill = (9 - Math.floor(i / 10)) * 10 + (i % 10);
        return (
          <span
            key={i}
            className={`cell h-1.5 w-1.5 ${fill < lit ? "bg-ink" : "bg-surface-2"}`}
            style={{ ["--d" as string]: Math.floor(fill / 10) }}
          />
        );
      })}
    </div>
  );
}

export function InsightsView({
  month,
  currency,
  current,
  previous,
  trend,
  incomeSources,
}: {
  month: string;
  currency: string;
  current: DV;
  previous: DV;
  trend: MonthSpend[];
  incomeSources: { name: string; color: string; amount: number }[];
}) {
  const [tab, setTab] = useState<"spending" | "income">("spending");
  const { tiles } = current;
  const suggestion = pickSuggestion(current.bars, previous.bars, tiles.spent);
  const moneyLeft = formatMoney(tiles.netSavings, currency);
  const rateDelta =
    tiles.savingsRate !== null && previous.tiles.savingsRate !== null
      ? Math.round((tiles.savingsRate - previous.tiles.savingsRate) * 100)
      : null;
  const incomeShares = sharesOf(incomeSources.map((s) => s.amount));

  const breakdownHeader = (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-medium leading-5 text-muted">{tab === "spending" ? "Total spending" : "Total income"}</h2>
        <p className="t-num-lg mt-1 text-ink">
          {formatMoney(tab === "spending" ? tiles.spent : tiles.income, currency)}
        </p>
      </div>
      <SegmentedControl
        label="Show"
        value={tab}
        onChange={setTab}
        options={[
          { value: "spending", label: "Spending" },
          { value: "income", label: "Income" },
        ]}
      />
    </div>
  );

  return (
    <div className="space-y-6 md:space-y-10">
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="reveal px-card-raised p-2 md:p-6" style={{ ["--i" as string]: 1 }}>
          <h2 className="text-sm font-medium leading-5 text-muted">Money left</h2>
          <p className={`${figureSize(moneyLeft)} tnum mt-3 ${tiles.netSavings < 0 ? "text-neg" : "text-ink"}`}>
            {moneyLeft}
          </p>
          <p className="mt-2 text-[15px] leading-6 text-muted">Income minus spending, this month.</p>
        </section>

        <section className="reveal px-card-raised flex items-center gap-6 p-2 md:p-6" style={{ ["--i" as string]: 2 }}>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium leading-5 text-muted">Savings rate</h2>
            <p
              className={`t-num-xl mt-2 ${tiles.savingsRate !== null && tiles.savingsRate < 0 ? "text-neg" : "text-ink"}`}
            >
              {tiles.savingsRate === null ? "No income" : formatSavingsRate(tiles.savingsRate)}
            </p>
            <p className="mt-2 text-[15px] leading-6 text-muted">
              {tiles.savingsRate === null ? "No income this month yet" : "of income kept"}
            </p>
            {rateDelta !== null ? (
              <p className="tnum text-sm leading-5 text-muted">
                {rateDelta >= 0 ? "↑" : "↓"} {Math.abs(rateDelta)} pts vs. last month
              </p>
            ) : null}
            <p className="whitespace-nowrap text-sm leading-5 text-muted">1 cell = 1%</p>
          </div>
          <Waffle rate={tiles.savingsRate} />
        </section>
      </div>

      {suggestion ? (
        <Link
          href={
            suggestion.kind === "unbudgeted"
              ? `/budgets?m=${month}&edit=${suggestion.categoryId}`
              : `/transactions?m=${month}&category=${suggestion.categoryId}`
          }
          className="reveal px-wash press flex items-center gap-4 p-4"
          style={{ ["--i" as string]: 3 }}
        >
          <IconTile name="idea" tone="accent" />
          <span className="min-w-0 flex-1">
            <span className="t-label-strong block text-signal-ink">Where you could save</span>
            {suggestion.kind === "unbudgeted" ? (
              <>
                <span className="block text-[15px] font-medium leading-6 text-ink">
                  {suggestion.name} is {suggestion.share}% of your spending
                </span>
                <span className="tnum block text-sm leading-5 text-graphite">
                  {formatMoney(suggestion.amount, currency)} with no budget. Setting one makes the plan real.
                </span>
              </>
            ) : (
              <>
                <span className="block text-[15px] font-medium leading-6 text-ink">{suggestion.name}</span>
                <span className="tnum block text-sm leading-5 text-graphite">
                  {formatMoney(suggestion.amount, currency)} this month,{" "}
                  <span className="text-neg">up {formatMoney(suggestion.delta, currency)} vs. last month</span>
                </span>
              </>
            )}
          </span>
          <Chevron />
        </Link>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="reveal" style={{ ["--i" as string]: 4 }}>
          {tab === "spending" && tiles.spent > 0 ? (
            <SpendingBreakdownCard
              bars={current.bars}
              totalSpent={tiles.spent}
              currency={currency}
              layout="row"
              header={breakdownHeader}
            />
          ) : (
            <section className="px-card p-2 md:p-4">
              {breakdownHeader}
              {tab === "spending" ? (
                <p className="text-[15px] leading-6 text-muted">No spending recorded this month yet.</p>
              ) : incomeSources.length > 0 ? (
                <ul className="px-rows">
                  {incomeSources.map((s, i) => (
                    <li key={s.name} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <CategoryIcon name={s.name} />
                      <span className="min-w-0 flex-1 truncate text-[15px] leading-6 text-ink">{s.name}</span>
                      <span className="tnum text-[15px] leading-6 text-ink">{formatMoney(s.amount, currency)}</span>
                      <span className="t-label tnum w-9 text-right text-muted">{incomeShares[i]}%</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[15px] leading-6 text-muted">No income recorded this month yet.</p>
              )}
            </section>
          )}
        </div>
        <div className="reveal" style={{ ["--i" as string]: 5 }}>
          <SpendingTrendCard trend={trend} currency={currency} figure="change" title="Spending · 6 months" />
        </div>
      </div>
    </div>
  );
}
