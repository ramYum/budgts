import Link from "next/link";
import { formatMoney, formatSavingsRate } from "@/lib/budget/money";
import type { DashboardView as DV } from "@/lib/budget/dashboard";
import type { GoalsSummary } from "@/lib/budget/savings";
import { MonthNav } from "./month-nav";
import { IncomeTile } from "./income-tile";
import { CountUp } from "./count-up";
import { Mascot } from "./mascot";
import type { AccountOption, CategoryOption } from "./transaction-form";

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
  strong,
  change,
}: {
  label: string;
  value: number;
  currency: string;
  strong?: boolean;
  change?: { pct: number; goodWhenDown: boolean } | null;
}) {
  return (
    <div className="card rounded-xl border border-hairline p-3">
      <p className="text-xs font-medium text-heading">{label}</p>
      <p
        className={`tnum font-display ${strong ? "text-xl" : "text-lg"} font-bold ${
          strong && value < 0 ? "text-neg" : "text-text"
        }`}
      >
        <CountUp value={value} currency={currency} />
      </p>
      {change ? (
        <p className={`tnum text-xs font-medium ${(change.pct < 0) === change.goodWhenDown ? "text-pos" : "text-neg"}`}>
          {change.pct < 0 ? "↓" : "↑"} {Math.abs(Math.round(change.pct))}% from last month
        </p>
      ) : null}
    </div>
  );
}

const FILL: Record<string, string> = {
  under: "bg-fill-under",
  near: "bg-fill-near",
  over: "bg-fill-over",
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function relativeDay(iso: string): string {
  const d = new Date(iso).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (d === today) return "Today";
  if (d === yesterday) return "Yesterday";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function DashboardView({
  view,
  prevView,
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
  const name = (userEmail.split("@")[0] ?? "").split(/[+._-]/)[0];
  const mood = tiles.savingsRate !== null && tiles.savingsRate < 0 ? "curious" : "happy";

  const biggestMover = bars
    .filter((b) => b.actual > 0)
    .map((b) => {
      const prevBar = prevView.bars.find((p) => p.categoryId === b.categoryId);
      return { ...b, delta: b.actual - (prevBar?.actual ?? 0) };
    })
    .sort((a, b) => b.delta - a.delta)[0];

  return (
    <div className="space-y-6 pt-1">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-bold">
            {greeting()}
            {name ? `, ${name[0]!.toUpperCase()}${name.slice(1)}` : ""}.
          </p>
          <p className="text-sm text-muted">
            {tiles.savingsRate !== null && tiles.savingsRate >= 0
              ? "You're doing well this month."
              : "Let's see where things stand."}
          </p>
        </div>
        <Link href="/more" aria-label="More" className="shrink-0">
          <Mascot mood={mood} size={44} />
        </Link>
      </div>

      <MonthNav base="/" month={month} />

      {/* the one solid-primary (ink-black) card on the screen — no mascot here,
          its black silhouette disappears against this background */}
      <section className="relative overflow-hidden rounded-3xl bg-primary p-4 text-on-primary">
        <div className="relative max-w-[78%]">
        <p className="text-xs text-on-dark-dim">Money Left</p>
        <p
          className={`tnum font-display text-[1.9rem] font-bold leading-tight ${
            tiles.netSavings < 0 ? "text-fill-over" : "text-on-primary"
          }`}
        >
          <CountUp value={tiles.netSavings} currency={currency} />
        </p>
        <p className="mt-1 text-xs text-on-dark-dim">
          {formatMoney(tiles.leftToSpend, currency)} left to spend ·{" "}
          {formatMoney(tiles.budgeted, currency)} budgeted
        </p>
        <p className="mt-3 text-xs text-on-dark-dim">Savings rate</p>
        <p
          className={`tnum font-display text-lg font-bold ${
            tiles.savingsRate !== null && tiles.savingsRate < 0 ? "text-fill-over" : "text-on-primary"
          }`}
        >
          {tiles.savingsRate === null
            ? "No income this month"
            : formatSavingsRate(tiles.savingsRate)}
          {tiles.savingsRate !== null && tiles.savingsRate < 0 ? (
            <span className="ml-1 text-xs font-medium">— spent more than you earned</span>
          ) : null}
        </p>
        <p className="mt-2 text-xs text-on-dark-dim">
          Based on income minus spending — doesn&apos;t measure savings-account balances.
        </p>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-xs text-muted">so far this month</p>
        <div className="grid grid-cols-2 gap-2">
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
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <span className="h-4 w-1 shrink-0 rounded-full bg-tick" aria-hidden />
            Where it went
          </h2>
          <Link href={`/budgets?m=${month}`} className="text-xs font-medium text-primary hover:underline">
            See spending
          </Link>
        </div>
        {bars.length === 0 ? (
          <p className="text-sm text-muted">
            Set a budget on the <Link href="/budgets" className="text-text underline">Budgets</Link>{" "}
            screen to see how you&apos;re tracking.
          </p>
        ) : (
          <ul className="card space-y-3.5 rounded-2xl border border-hairline p-4">
            {bars.map((b) => {
              const pct = Math.min(100, Math.max(0, b.pctUsed));
              const over = b.state === "over";
              return (
                <li key={b.categoryId} className={over ? "border-l-2 border-neg pl-2" : "pl-2"}>
                  <Link
                    href={`/transactions?m=${month}&category=${b.categoryId}`}
                    className="block space-y-1"
                  >
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: b.color }}
                          aria-hidden
                        />
                        {b.name}
                      </span>
                      <span className="tnum text-muted">
                        {formatMoney(b.actual, currency)}
                        {b.budget > 0 ? ` / ${formatMoney(b.budget, currency)}` : ""}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-track">
                      <div
                        className={`h-full rounded-full ${FILL[b.state]}`}
                        style={{ width: `${over ? 100 : pct}%` }}
                      />
                    </div>
                    {over ? (
                      <p className="tnum text-xs text-neg">
                        Over by {formatMoney(b.actual - b.budget, currency)}
                      </p>
                    ) : b.budget > 0 ? (
                      <p className="tnum text-xs text-muted">
                        {formatMoney(b.remaining, currency)} left
                      </p>
                    ) : (
                      <p className="text-xs text-muted">No budget set</p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {biggestMover && biggestMover.delta > 0 ? (
        <section className="card space-y-1.5 rounded-2xl border border-hairline p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted">What can I change?</p>
              <p className="text-base font-semibold">{biggestMover.name}</p>
              <p className="tnum text-sm text-muted">
                {formatMoney(biggestMover.actual, currency)} this month ·{" "}
                <span className="text-neg">↑ {formatMoney(biggestMover.delta, currency)} vs. usual</span>
              </p>
            </div>
            <Mascot mood="curious" size={44} className="shrink-0" />
          </div>
          <Link
            href={`/transactions?m=${month}&category=${biggestMover.categoryId}`}
            className="inline-block pt-1 text-sm font-medium text-primary hover:underline"
          >
            See spending
          </Link>
        </section>
      ) : null}

      {savings.activeCount > 0 ? (
        <section className="card space-y-2 rounded-2xl border border-hairline p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Savings</h2>
            <Link href="/goals" className="text-xs font-medium text-primary hover:underline">
              View goals
            </Link>
          </div>
          <p className="tnum text-lg font-bold">{formatMoney(savings.totalSaved, currency)} kept</p>
          <div className="h-2 overflow-hidden rounded-full bg-track">
            <div
              className="h-full rounded-full bg-fill-under"
              style={{
                width: `${savings.totalTarget > 0 ? Math.min(100, (savings.totalSaved / savings.totalTarget) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="tnum text-xs text-muted">
            {formatMoney(savings.totalSaved, currency)} of {formatMoney(savings.totalTarget, currency)} toward your{" "}
            {savings.activeCount === 1 ? "goal" : "goals"}
          </p>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          <Link href="/transactions" className="text-xs font-medium text-primary hover:underline">
            See all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">Nothing recorded yet this month.</p>
        ) : (
          <ul className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{r.description || r.category?.name || "Transaction"}</p>
                  <p className="truncate text-xs text-muted">
                    {relativeDay(r.occurredAt)} · {r.isTransfer ? "Transfer" : (r.category?.name ?? "Uncategorized")}
                  </p>
                </div>
                <span className={`tnum shrink-0 text-sm ${r.direction === "credit" ? "font-medium text-pos" : ""}`}>
                  {r.direction === "debit" ? "−" : "+"}
                  {formatMoney(r.amount, currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
