import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowDownRight, ArrowUpRight, CaretRight, Lightbulb } from "@phosphor-icons/react/dist/ssr";
import { formatMoney, formatSavingsRate } from "@/lib/budget/money";
import { BudgetOverAlert } from "./budget-over-alert";
import type { DashboardView as DV } from "@/lib/budget/dashboard";
import type { MonthSpend } from "@/lib/budget/spend-trend";
import type { GoalsSummary } from "@/lib/budget/savings";
import { MonthNav } from "./month-nav";
import { IncomeTile } from "./income-tile";
import { RollingAmount } from "./rolling-amount";
import { Greeting, RelativeDay } from "./local-time";
import { CrystalPerch } from "./crystal-perch";
import { Reveal } from "./reveal";
import { CategoryIcon, ProgressBar } from "./ui";
import { SpendingBreakdownCard, SpendingTrendCard } from "./spending-overview";
import type { AccountOption, CategoryOption } from "./transaction-form";

/** An entrance's start, for `.rise` / `.pop` / `.lamp` (globals.css). */
const at = (ms: number) => ({ "--at": `${ms}ms` }) as CSSProperties;

export type RecentActivityItem = {
  id: string;
  amount: number;
  direction: "debit" | "credit";
  occurredAt: string;
  description: string;
  isTransfer: boolean;
  category: { name: string; color: string } | null;
};

function Tile({
  label,
  value,
  currency,
  change,
}: {
  label: string;
  value: number;
  currency: string;
  change?: { pct: number; goodWhenDown: boolean } | null;
}) {
  const good = change ? (change.pct < 0) === change.goodWhenDown : true;
  return (
    <div className="card relative rounded-2xl border border-hairline p-4">
      <ArrowUpRight aria-hidden className="absolute right-4 top-4 h-4 w-4 text-muted" />
      <p className="text-[13px] text-muted">{label}</p>
      <p className="tnum mt-2 text-xl font-semibold tracking-tight">
        <RollingAmount value={value} currency={currency} />
      </p>
      {change ? (
        <p className={`rise tnum mt-1 flex items-center gap-0.5 text-xs ${good ? "text-pos" : "text-neg"}`} style={at(620)}>
          {change.pct < 0 ? (
            <ArrowDownRight aria-hidden className="h-3 w-3" />
          ) : (
            <ArrowUpRight aria-hidden className="h-3 w-3" />
          )}
          {Math.abs(Math.round(change.pct))}% from last month
        </p>
      ) : null}
    </div>
  );
}

function SectionHead({ title, href, action }: { title: string; href?: string; action?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {href && action ? (
        <Link href={href} className="press flex items-center gap-0.5 text-[13px] text-muted hover:text-text">
          {action}
          <CaretRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function DashboardView({
  view,
  prevView,
  trend,
  currency,
  month,
  accounts,
  categories,
  defaultDate,
  savings,
  recent,
  userEmail,
}: {
  view: DV;
  prevView: DV;
  trend: MonthSpend[];
  currency: string;
  month: string;
  accounts: AccountOption[];
  categories: CategoryOption[];
  defaultDate: string;
  savings: GoalsSummary;
  recent: RecentActivityItem[];
  userEmail: string;
}) {
  const { tiles, bars } = view;
  const spendChangePct = pctChange(tiles.spent, prevView.tiles.spent);
  const handle = (userEmail.split("@")[0] ?? "").split(/[+._-]/)[0] ?? "";
  const name = handle ? `${handle[0]!.toUpperCase()}${handle.slice(1)}` : "";
  const negative = tiles.netSavings < 0;

  const biggestMover = bars
    .filter((b) => b.actual > 0)
    .map((b) => {
      const prevBar = prevView.bars.find((p) => p.categoryId === b.categoryId);
      return { ...b, delta: b.actual - (prevBar?.actual ?? 0) };
    })
    .sort((a, b) => b.delta - a.delta)[0];

  // Entrance: the greeting rises word by word as Crystal flutters down beside
  // it, then each block below rises a beat after the one above (--i); blocks
  // below the fold wait and play as they scroll into view (reveal.tsx).
  let order = 1;
  const next = () => order++;

  return (
    <div className="space-y-5 pt-1">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[26px] font-semibold leading-[1.1] tracking-tight">
            <Greeting name={name} />
          </p>
          <p className="rise mt-1.5 text-[13px] text-muted" style={at(340)}>
            {tiles.savingsRate !== null && tiles.savingsRate >= 0
              ? "You're doing well this month."
              : "Let's see where things stand."}
          </p>
        </div>
        <CrystalPerch name={name} savingsRate={tiles.savingsRate} />
      </div>

      <Reveal i={next()}>
        <MonthNav base="/" month={month} />
      </Reveal>

      {tiles.budgeted > tiles.income ? (
        <Reveal i={next()}>
          <BudgetOverAlert month={month} budgeted={tiles.budgeted} income={tiles.income} currency={currency} />
        </Reveal>
      ) : null}

      {/* the hero: one number, stated plainly; its reels roll in, then the detail lines follow */}
      <Reveal i={next()}>
        <section className="card relative rounded-2xl border border-hairline p-5">
          <span
            className="pop pixel-corners absolute right-5 top-5 bg-ink px-2 py-0.5 text-[11px] font-medium text-on-primary"
            style={at(420)}
          >
            This month
          </span>
          <p className="text-[13px] text-muted">Money Left</p>
          <p
            className={`tnum mt-2 text-[40px] font-semibold leading-none tracking-[-0.03em] ${
              negative ? "text-neg" : "text-text"
            }`}
          >
            <RollingAmount value={tiles.netSavings} currency={currency} />
          </p>
          <p className="rise tnum mt-3 text-[13px] leading-snug text-muted" style={at(560)}>
            <span className="text-text">{formatMoney(tiles.leftToSpend, currency)}</span> left of{" "}
            {formatMoney(tiles.budgeted, currency)} budgeted
          </p>
          <p
            className={`rise tnum mt-1 text-[13px] leading-snug ${
              tiles.savingsRate !== null && tiles.savingsRate < 0 ? "text-neg" : "text-muted"
            }`}
            style={at(640)}
          >
            {tiles.savingsRate === null
              ? "no income this month"
              : `${formatSavingsRate(tiles.savingsRate)} saved this month`}
            {tiles.savingsRate !== null && tiles.savingsRate < 0 ? " — spent more than you earned" : null}
          </p>
          <p className="rise mt-4 border-t border-hairline pt-3 text-[11px] leading-relaxed text-muted" style={at(760)}>
            Based on income minus spending — doesn&apos;t measure savings-account balances.
          </p>
        </section>
      </Reveal>

      <Reveal i={next()} className="space-y-2">
        <p className="text-[13px] text-muted">so far this month</p>
        <div className="grid grid-cols-2 gap-3">
        <IncomeTile
          value={tiles.income}
          currency={currency}
          accounts={accounts}
          categories={categories}
          defaultDate={defaultDate}
        />
        <Tile
          label="Spending"
          value={tiles.spent}
          currency={currency}
          change={spendChangePct !== null ? { pct: spendChangePct, goodWhenDown: true } : null}
        />
        </div>
      </Reveal>

      <Reveal i={next()} className="space-y-3">
        <SectionHead title="Where it went" href={`/budgets?m=${month}`} action="See spending" />
        {bars.length === 0 ? (
          <p className="text-sm text-muted">
            Set a budget on the{" "}
            <Link href="/budgets" className="text-text underline underline-offset-2">
              Budgets
            </Link>{" "}
            screen to see how you&apos;re tracking.
          </p>
        ) : (
          <ul className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
            {bars.map((b, row) => {
              const over = b.state === "over";
              return (
                <li key={b.categoryId} className="rise" style={at(row * 60 + 240)}>
                  <Link
                    href={`/transactions?m=${month}&category=${b.categoryId}`}
                    className="press flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2"
                  >
                    <CategoryIcon name={b.name} size={36} />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{b.name}</span>
                        <span className="tnum shrink-0 text-xs text-muted">
                          {formatMoney(b.actual, currency)}
                          {b.budget > 0 ? ` / ${formatMoney(b.budget, currency)}` : ""}
                        </span>
                      </div>
                      <ProgressBar pct={b.pctUsed} tone={b.state} start={row * 3} />
                      {over ? (
                        <p className="tnum text-xs text-neg">Over by {formatMoney(b.actual - b.budget, currency)}</p>
                      ) : b.budget > 0 ? (
                        <p className="tnum text-xs text-muted">{formatMoney(b.remaining, currency)} left</p>
                      ) : (
                        <p className="text-xs text-muted">No budget set</p>
                      )}
                    </div>
                    <CaretRight aria-hidden className="h-4 w-4 shrink-0 text-silver" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Reveal>

      {biggestMover && biggestMover.delta > 0 ? (
        <Reveal i={next()}>
          <Link
            href={`/transactions?m=${month}&category=${biggestMover.categoryId}`}
            aria-label="See spending"
            aria-describedby="home-mover"
            className="lift card flex items-center gap-4 rounded-2xl border border-hairline p-4"
          >
            {/* the idea lamp switches on */}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-signal-wash text-signal">
              <Lightbulb aria-hidden weight="fill" className="lamp h-5 w-5" style={at(380)} />
            </span>
            <div id="home-mover" className="min-w-0 flex-1">
              <p className="text-[13px] text-muted">What can I change?</p>
              <p className="text-sm font-semibold">{biggestMover.name}</p>
              <p className="tnum text-xs text-muted">
                {formatMoney(biggestMover.actual, currency)} this month,{" "}
                <span className="text-neg">up {formatMoney(biggestMover.delta, currency)} vs. usual</span>
              </p>
            </div>
            <CaretRight aria-hidden className="h-4 w-4 shrink-0 text-silver" />
          </Link>
        </Reveal>
      ) : null}

      {savings.activeCount > 0 ? (
        <Reveal i={next()}>
          <section className="card space-y-3 rounded-2xl border border-hairline p-5">
            <SectionHead title="Savings" href="/goals" action="View goals" />
            <p className="tnum text-xl font-semibold tracking-tight">
              <RollingAmount value={savings.totalSaved} currency={currency} /> kept
            </p>
            <ProgressBar
              pct={savings.totalTarget > 0 ? (savings.totalSaved / savings.totalTarget) * 100 : 0}
              tone="under"
            />
            <p className="tnum text-xs text-muted">
              {formatMoney(savings.totalSaved, currency)} of {formatMoney(savings.totalTarget, currency)} toward your{" "}
              {savings.activeCount === 1 ? "goal" : "goals"}
            </p>
          </section>
        </Reveal>
      ) : null}

      <Reveal i={next()} className="space-y-3">
        <SectionHead title="Recent activity" href="/transactions" action="See all" />
        {recent.length === 0 ? (
          <p className="text-sm text-muted">Nothing recorded yet this month.</p>
        ) : (
          <ul className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
            {recent.map((r, k) => (
              <li key={r.id} className="rise flex items-center gap-3 px-4 py-3" style={at(k * 60 + 200)}>
                <CategoryIcon name={r.isTransfer ? "Transfer" : (r.category?.name ?? "")} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.description || r.category?.name || "Transaction"}</p>
                  <p className="truncate text-xs text-muted">
                    {r.isTransfer ? "Transfer" : (r.category?.name ?? "Uncategorized")} · <RelativeDay iso={r.occurredAt} />
                  </p>
                </div>
                <span className={`tnum shrink-0 text-sm font-medium ${r.direction === "credit" ? "text-pos" : ""}`}>
                  {r.direction === "debit" ? "−" : "+"}
                  {formatMoney(r.amount, currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Reveal>

      <Reveal i={next()}>
        <SpendingTrendCard trend={trend} changePct={spendChangePct} currency={currency} />
      </Reveal>
      <Reveal i={next()}>
        <SpendingBreakdownCard bars={view.bars} totalSpent={tiles.spent} currency={currency} />
      </Reveal>
    </div>
  );
}
