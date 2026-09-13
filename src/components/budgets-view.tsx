"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/budget/money";
import type { DashboardView as DV, DashboardCategory } from "@/lib/budget/dashboard";
import { setBudget } from "@/server/budgets";
import { CopyBudgets } from "./copy-budgets";
import { MonthNav } from "./month-nav";
import { Overlay } from "./overlay";
import { CategoryIcon, EmptyState, ProgressBar, SegmentedControl } from "./ui";

export type AllTimeRow = { categoryId: string; name: string; color: string; total: number };

function toInput(minor: number) {
  return minor > 0 ? (minor / 100).toFixed(2) : "";
}

function AmountForm({
  categoryId,
  month,
  initial,
  onSaved,
}: {
  categoryId: string;
  month: string;
  initial: number;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(toInput(initial));
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  const save = () => {
    setError(undefined);
    start(async () => {
      const fd = new FormData();
      fd.set("categoryId", categoryId);
      fd.set("month", month);
      fd.set("amount", value || "0");
      const res = await setBudget({}, fd);
      if (res.fieldError || res.error) setError(res.fieldError ?? res.error);
      else onSaved();
    });
  };

  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-xs font-medium text-muted">
        Monthly budget
        <input
          className="tnum w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
      </label>
      {error ? <p className="text-sm text-neg">{error}</p> : null}
      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="w-full rounded-full bg-primary px-3 py-2 text-sm font-medium text-on-primary disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function CategoryDetail({
  bar,
  prevActual,
  month,
  currency,
  onClose,
}: {
  bar: DV["bars"][number];
  prevActual: number;
  month: string;
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const trend = prevActual > 0 ? Math.round(((bar.actual - prevActual) / prevActual) * 100) : null;

  return (
    <Overlay title={bar.name} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <CategoryIcon name={bar.name} color={bar.color} size={44} />
          <div>
            <p className="tnum text-2xl font-bold">{formatMoney(bar.actual, currency)}</p>
            <p className="text-xs text-muted">
              {bar.budget > 0 ? `of ${formatMoney(bar.budget, currency)} budget` : "no budget set"}
            </p>
          </div>
        </div>

        <ProgressBar pct={bar.pctUsed} tone={bar.state} />

        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">{bar.state === "over" ? "Over by" : "Remaining"}</dt>
            <dd className="tnum">
              {bar.budget > 0 ? formatMoney(Math.abs(bar.remaining), currency) : "—"}
            </dd>
          </div>
          {trend !== null ? (
            <div className="flex justify-between">
              <dt className="text-muted">vs. last month</dt>
              <dd className={`tnum ${trend > 0 ? "text-neg" : "text-pos"}`}>
                {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%
              </dd>
            </div>
          ) : null}
        </dl>

        {editing ? (
          <AmountForm
            categoryId={bar.categoryId}
            month={month}
            initial={bar.budget}
            onSaved={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex-1 rounded-full border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
            >
              Change budget
            </button>
            <Link
              href={`/transactions?m=${month}&category=${bar.categoryId}`}
              className="flex-1 rounded-full bg-primary px-3 py-2 text-center text-sm font-medium text-on-primary"
            >
              See transactions
            </Link>
          </div>
        )}
      </div>
    </Overlay>
  );
}

function AddBudget({
  categories,
  month,
  onClose,
  onSaved,
}: {
  categories: DashboardCategory[];
  month: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  if (categories.length === 0) {
    return (
      <Overlay title="Add budget" onClose={onClose}>
        <p className="text-sm text-muted">Every expense category already has a budget.</p>
      </Overlay>
    );
  }
  return (
    <Overlay title="Add budget" onClose={onClose}>
      <div className="space-y-3">
        <label className="block space-y-1 text-xs font-medium text-muted">
          Category
          <select
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <AmountForm categoryId={categoryId} month={month} initial={0} onSaved={onSaved} />
      </div>
    </Overlay>
  );
}

export function BudgetsView(
  props:
    | {
        range: "month";
        month: string;
        currency: string;
        view: DV;
        prevView: DV;
        categories: DashboardCategory[];
        unbudgetedCategories: DashboardCategory[];
      }
    | {
        range: "all";
        month: string;
        currency: string;
        allTimeRows: AllTimeRow[];
        categories: DashboardCategory[];
      },
) {
  const router = useRouter();
  const [detail, setDetail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const setRange = (r: "month" | "all") => {
    const params = new URLSearchParams();
    params.set("m", props.month);
    if (r === "all") params.set("range", "all");
    router.push(`/budgets?${params.toString()}`);
  };

  const totalSpent = props.range === "month" ? props.view.tiles.spent : 0;
  const totalRemaining = props.range === "month" ? props.view.tiles.leftToSpend : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <MonthNav base="/budgets" month={props.month} />
        {props.range === "month" ? <CopyBudgets month={props.month} /> : null}
      </div>

      {props.range === "month" ? (
        <p className="tnum text-sm text-muted">
          {formatMoney(totalSpent, props.currency)} spent · {formatMoney(totalRemaining, props.currency)} remaining
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <SegmentedControl
          value={props.range}
          onChange={setRange}
          options={[
            { value: "month", label: "This month" },
            { value: "all", label: "All time" },
          ]}
        />
        {props.range === "month" ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add budget"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-lg font-semibold text-accent-ink"
          >
            +
          </button>
        ) : null}
      </div>

      {props.range === "month" ? (
        props.view.bars.length === 0 ? (
          <EmptyState
            title="You don't have a budget yet."
            body="Set a monthly limit per category to see how you're tracking."
            action={
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary"
              >
                Build my budget
              </button>
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {props.view.bars.map((b) => (
              <li key={b.categoryId}>
                <button
                  type="button"
                  onClick={() => setDetail(b.categoryId)}
                  className="card flex w-full items-center gap-3 rounded-2xl border border-hairline p-4 text-left"
                >
                  <CategoryIcon name={b.name} color={b.color} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{b.name}</span>
                      <span className="tnum shrink-0 text-xs text-muted">
                        {formatMoney(b.actual, props.currency)}
                        {b.budget > 0 ? ` / ${formatMoney(b.budget, props.currency)}` : ""}
                      </span>
                    </div>
                    <ProgressBar pct={b.pctUsed} tone={b.state} className="mt-2" />
                    <p className="tnum mt-1 text-xs text-muted">
                      {b.budget === 0
                        ? "No budget set"
                        : b.state === "over"
                          ? `Over by ${formatMoney(b.actual - b.budget, props.currency)}`
                          : `${formatMoney(b.remaining, props.currency)} left`}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : props.allTimeRows.length === 0 ? (
        <EmptyState title="No spending recorded yet." />
      ) : (
        <ul className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
          {props.allTimeRows.map((r) => (
            <li key={r.categoryId} className="flex items-center gap-3 px-4 py-3">
              <CategoryIcon name={r.name} color={r.color} size={36} />
              <span className="flex-1 truncate text-sm">{r.name}</span>
              <span className="tnum text-sm text-muted">{formatMoney(r.total, props.currency)}</span>
            </li>
          ))}
        </ul>
      )}

      {props.range === "month" && detail
        ? (() => {
            const bar = props.view.bars.find((b) => b.categoryId === detail);
            if (!bar) return null;
            const prevBar = props.prevView.bars.find((b) => b.categoryId === detail);
            return (
              <CategoryDetail
                bar={bar}
                prevActual={prevBar?.actual ?? 0}
                month={props.month}
                currency={props.currency}
                onClose={() => setDetail(null)}
              />
            );
          })()
        : null}

      {props.range === "month" && adding ? (
        <AddBudget
          categories={props.unbudgetedCategories}
          month={props.month}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
