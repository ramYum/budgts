import Link from "next/link";
import { formatMoney } from "@/lib/budget/money";
import type { DashboardView as DV } from "@/lib/budget/dashboard";

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
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`tnum font-display ${strong ? "text-xl" : "text-lg"} font-bold ${
          strong && value < 0 ? "text-neg" : "text-text"
        }`}
      >
        {formatMoney(value, currency)}
      </p>
    </div>
  );
}

const FILL: Record<string, string> = {
  under: "bg-pos-fill",
  near: "bg-warn",
  over: "bg-neg",
};

export function DashboardView({
  view,
  currency,
  month,
}: {
  view: DV;
  currency: string;
  month: string;
}) {
  const { tiles, bars } = view;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-xs text-muted">so far this month</p>
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Income" value={tiles.income} currency={currency} />
          <Tile label="Spent" value={tiles.spent} currency={currency} />
          <Tile label="Net savings" value={tiles.netSavings} currency={currency} strong />
          <Tile label="Left to spend" value={tiles.leftToSpend} currency={currency} strong />
        </div>
        <p className="text-xs text-muted">
          Budgeted {formatMoney(tiles.budgeted, currency)} this month.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Budget vs actual</h2>
        {bars.length === 0 ? (
          <p className="text-sm text-muted">
            Set a budget on the <Link href="/budgets" className="text-text underline">Budgets</Link>{" "}
            screen to see how you&apos;re tracking.
          </p>
        ) : (
          <ul className="space-y-3">
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
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
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
