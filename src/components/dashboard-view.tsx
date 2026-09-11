import Link from "next/link";
import { formatMoney } from "@/lib/budget/money";
import type { DashboardView as DV } from "@/lib/budget/dashboard";
import { MonthNav } from "./month-nav";
import { IncomeTile } from "./income-tile";
import { CountUp } from "./count-up";
import type { AccountOption, CategoryOption } from "./transaction-form";

function Tile({
  label,
  value,
  currency,
  strong,
}: {
  label: string;
  value: number;
  currency: string;
  strong?: boolean;
}) {
  return (
    <div className="card rounded-xl border border-hairline p-3">
      <p className="text-xs font-medium text-heading">{label}</p>
      <p
        className={`tnum font-display ${strong ? "text-xl" : "text-lg"} font-bold ${
          strong && value < 0 ? "text-neg" : "text-text"
        }`}
      >
        <CountUp value={value} format={(n) => formatMoney(n, currency)} />
      </p>
    </div>
  );
}

const FILL: Record<string, string> = {
  under: "bg-fill-under",
  near: "bg-fill-near",
  over: "bg-fill-over",
};

export function DashboardView({
  view,
  currency,
  month,
  accounts,
  categories,
  defaultDate,
}: {
  view: DV;
  currency: string;
  month: string;
  accounts: AccountOption[];
  categories: CategoryOption[];
  defaultDate: string;
}) {
  const { tiles, bars } = view;

  return (
    <div className="space-y-6 pt-1">
      <MonthNav base="/" month={month} />

      {/* the one Deep Pine card on the screen */}
      <section className="rounded-2xl bg-primary p-4 text-on-primary">
        <p className="text-xs text-on-dark-dim">Net savings</p>
        <p
          className={`tnum font-display text-[1.9rem] font-bold leading-tight ${
            tiles.netSavings < 0 ? "text-fill-over" : "text-on-primary"
          }`}
        >
          <CountUp value={tiles.netSavings} format={(n) => formatMoney(n, currency)} />
        </p>
        <p className="mt-1 text-xs text-on-dark-dim">
          {formatMoney(tiles.leftToSpend, currency)} left to spend ·{" "}
          {formatMoney(tiles.budgeted, currency)} budgeted
        </p>
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
          <Tile label="Spent" value={tiles.spent} currency={currency} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="h-4 w-1 shrink-0 rounded-full bg-tick" aria-hidden />
          Budget vs actual
        </h2>
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
    </div>
  );
}
