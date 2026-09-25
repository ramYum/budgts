"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney, formatSavingsRate } from "@/lib/budget/money";
import type { DashboardView as DV } from "@/lib/budget/dashboard";
import { ArrowDownRight, ArrowUpRight, CaretRight, Lightbulb } from "@phosphor-icons/react";
import { CategoryIcon, SegmentedControl } from "./ui";

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function ChangeLabel({ current, previous, goodWhenDown }: { current: number; previous: number; goodWhenDown: boolean }) {
  const change = pctChange(current, previous);
  if (change === null) return null;
  const down = change < 0;
  const good = goodWhenDown ? down : !down;
  return (
    <span className={`tnum flex items-center gap-0.5 text-[13px] ${good ? "text-pos" : "text-neg"}`}>
      {down ? <ArrowDownRight aria-hidden className="h-3.5 w-3.5" /> : <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />}
      {Math.abs(Math.round(change))}% vs. last month
    </span>
  );
}

export function InsightsView({
  month,
  currency,
  current,
  previous,
  incomeSources,
}: {
  month: string;
  currency: string;
  current: DV;
  previous: DV;
  incomeSources: { name: string; color: string; amount: number }[];
}) {
  const [tab, setTab] = useState<"spending" | "income">("spending");

  const biggestMover = [...current.bars]
    .filter((b) => b.actual > 0)
    .map((b) => {
      const prevBar = previous.bars.find((p) => p.categoryId === b.categoryId);
      const delta = b.actual - (prevBar?.actual ?? 0);
      return { ...b, delta };
    })
    .sort((a, b) => b.delta - a.delta)[0];

  return (
    <div className="space-y-5">
      <section className="reveal card grid grid-cols-2 divide-x divide-hairline rounded-2xl border border-hairline">
        <div className="p-5">
          <p className="text-[13px] text-muted">Your money story</p>
          <p className="tnum mt-2 text-[28px] font-semibold leading-none tracking-tight">
            {formatMoney(current.tiles.netSavings, currency)}
          </p>
          <p className="mt-2 text-xs text-muted">Money left</p>
        </div>
        <div className="p-5">
          <p className="text-[13px] text-muted">Savings rate</p>
          <p className="tnum mt-2 text-[28px] font-semibold leading-none tracking-tight">
            {current.tiles.savingsRate === null ? "—" : formatSavingsRate(current.tiles.savingsRate)}
          </p>
        {current.tiles.savingsRate !== null && previous.tiles.savingsRate !== null ? (
          <p className="mt-2 text-xs text-muted">
            {current.tiles.savingsRate >= previous.tiles.savingsRate ? "↑" : "↓"}{" "}
            {Math.abs(Math.round((current.tiles.savingsRate - previous.tiles.savingsRate) * 100))} pts vs. last month
          </p>
        ) : null}
        </div>
      </section>

      {biggestMover && biggestMover.delta > 0 ? (
        <Link
          href={`/transactions?m=${month}&category=${biggestMover.categoryId}`}
          aria-label="See spending"
          aria-describedby="insights-mover"
          className="reveal lift card flex items-center gap-4 rounded-2xl border border-hairline p-4"
          style={{ ["--i" as string]: 1 }}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-signal-wash text-signal">
            <Lightbulb aria-hidden weight="fill" className="h-5 w-5" />
          </span>
          <span id="insights-mover" className="min-w-0 flex-1">
            <span className="block text-[13px] text-muted">Where you could save</span>
            <span className="block text-sm font-semibold">{biggestMover.name}</span>
            <span className="tnum block text-xs text-muted">
              {formatMoney(biggestMover.actual, currency)} this month,{" "}
              <span className="text-neg">up {formatMoney(biggestMover.delta, currency)} vs. last month</span>
            </span>
          </span>
          <CaretRight aria-hidden className="h-4 w-4 shrink-0 text-silver" />
        </Link>
      ) : null}

      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { value: "spending", label: "Spending" },
          { value: "income", label: "Income" },
        ]}
      />

      {tab === "spending" ? (
        <section className="space-y-3">
          <div>
            <p className="text-[13px] text-muted">Total spending</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="tnum text-[32px] font-semibold leading-none tracking-tight">{formatMoney(current.tiles.spent, currency)}</p>
              <ChangeLabel current={current.tiles.spent} previous={previous.tiles.spent} goodWhenDown />
            </div>
          </div>
          <ul className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
            {current.bars.map((b) => (
              <li key={b.categoryId}>
                <Link
                  href={`/transactions?m=${month}&category=${b.categoryId}`}
                  className="press flex items-center gap-3 px-4 py-3 text-sm hover:bg-surface-2"
                >
                  <CategoryIcon name={b.name} size={32} />
                  <span className="min-w-0 flex-1 truncate font-medium">{b.name}</span>
                  <span className="tnum text-muted">{formatMoney(b.actual, currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="space-y-3">
          <div>
            <p className="text-[13px] text-muted">Total income</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="tnum text-[32px] font-semibold leading-none tracking-tight">{formatMoney(current.tiles.income, currency)}</p>
              <ChangeLabel current={current.tiles.income} previous={previous.tiles.income} goodWhenDown={false} />
            </div>
          </div>
          {incomeSources.length > 0 ? (
            <ul className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
              {incomeSources.map((s) => (
                <li key={s.name} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <CategoryIcon name={s.name} size={32} />
                  <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                  <span className="tnum text-muted">{formatMoney(s.amount, currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No income recorded this month yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
