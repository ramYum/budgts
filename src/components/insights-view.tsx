"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney, formatSavingsRate } from "@/lib/budget/money";
import type { DashboardView as DV } from "@/lib/budget/dashboard";
import { SegmentedControl } from "./ui";

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
    <span className={`tnum text-sm font-medium ${good ? "text-pos" : "text-neg"}`}>
      {down ? "↓" : "↑"} {Math.abs(Math.round(change))}% vs. last month
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
    <div className="space-y-6">
      <section className="rounded-3xl bg-primary p-4 text-on-primary">
        <p className="text-xs text-on-dark-dim">Your money story</p>
        <p className="tnum font-display text-[1.7rem] font-bold leading-tight">
          {formatMoney(current.tiles.netSavings, currency)}
        </p>
        <p className="text-xs text-on-dark-dim">Money left</p>
        <div className="mt-3 flex items-baseline gap-2">
          <p className="tnum font-display text-lg font-bold">
            {current.tiles.savingsRate === null ? "—" : formatSavingsRate(current.tiles.savingsRate)}
          </p>
          <p className="text-xs text-on-dark-dim">savings rate</p>
        </div>
        {current.tiles.savingsRate !== null && previous.tiles.savingsRate !== null ? (
          <p className="mt-1 text-xs text-on-dark-dim">
            {current.tiles.savingsRate >= previous.tiles.savingsRate ? "↑" : "↓"}{" "}
            {Math.abs(Math.round((current.tiles.savingsRate - previous.tiles.savingsRate) * 100))} pts vs. last month
          </p>
        ) : null}
      </section>

      {biggestMover && biggestMover.delta > 0 ? (
        <section className="card space-y-1.5 rounded-2xl border border-hairline p-4">
          <p className="text-xs font-medium text-muted">Where you could save</p>
          <p className="text-base font-semibold">{biggestMover.name}</p>
          <p className="tnum text-sm">
            {formatMoney(biggestMover.actual, currency)} this month{" "}
            <span className="text-neg">↑ {formatMoney(biggestMover.delta, currency)} vs. last month</span>
          </p>
          <Link
            href={`/transactions?m=${month}&category=${biggestMover.categoryId}`}
            className="inline-block pt-1 text-sm font-medium text-primary hover:underline"
          >
            See spending
          </Link>
        </section>
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
            <p className="text-xs text-muted">Total spending</p>
            <div className="flex items-baseline gap-2">
              <p className="tnum text-2xl font-bold">{formatMoney(current.tiles.spent, currency)}</p>
              <ChangeLabel current={current.tiles.spent} previous={previous.tiles.spent} goodWhenDown />
            </div>
          </div>
          <ul className="card space-y-3 rounded-2xl border border-hairline p-4">
            {current.bars.map((b) => (
              <li key={b.categoryId}>
                <Link
                  href={`/transactions?m=${month}&category=${b.categoryId}`}
                  className="flex items-center justify-between gap-2 text-sm hover:text-primary"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: b.color }} aria-hidden />
                    {b.name}
                  </span>
                  <span className="tnum text-muted">{formatMoney(b.actual, currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="space-y-3">
          <div>
            <p className="text-xs text-muted">Total income</p>
            <div className="flex items-baseline gap-2">
              <p className="tnum text-2xl font-bold">{formatMoney(current.tiles.income, currency)}</p>
              <ChangeLabel current={current.tiles.income} previous={previous.tiles.income} goodWhenDown={false} />
            </div>
          </div>
          {incomeSources.length > 0 ? (
            <ul className="card space-y-3 rounded-2xl border border-hairline p-4">
              {incomeSources.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
                    {s.name}
                  </span>
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
