"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/budget/money";
import type { DashboardView as DV, DashboardCategory } from "@/lib/budget/dashboard";
import { pickSuggestion } from "@/lib/insights/suggestion";
import { setBudget } from "@/server/budgets";
import { CopyBudgets } from "./copy-budgets";
import { MonthNav } from "./month-nav";
import { Overlay } from "./overlay";
import { Icon } from "./icon";
import { PageHeader } from "./page-header";
import {
  Button,
  CategoryIcon,
  EmptyState,
  LinkButton,
  ProgressBar,
  SectionHead,
  SegmentedControl,
  Select,
  fieldClass,
  figureSize,
  labelClass,
} from "./ui";

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
    <div className="space-y-3">
      <label className={labelClass}>
        Monthly budget
        <input
          className={`${fieldClass} tnum`}
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          disabled={pending}
          data-invalid={error ? "true" : undefined}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
      </label>
      {error ? <p className="text-sm text-neg">{error}</p> : null}
      <Button onClick={save} disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function CategoryDetail({
  bar,
  prevActual,
  month,
  currency,
  startEditing,
  onClose,
}: {
  bar: DV["bars"][number];
  prevActual: number;
  month: string;
  currency: string;
  startEditing: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const trend = prevActual > 0 ? Math.round(((bar.actual - prevActual) / prevActual) * 100) : null;

  return (
    <Overlay title={bar.name} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <CategoryIcon name={bar.name} tone={bar.state === "over" ? "wash" : "gray"} />
          <div>
            <p className="t-num-lg text-ink">{formatMoney(bar.actual, currency)}</p>
            <p className="text-sm leading-5 text-muted">
              {bar.budget > 0 ? `of ${formatMoney(bar.budget, currency)} budget` : "no budget set"}
            </p>
          </div>
        </div>

        <ProgressBar pct={bar.pctUsed} tone={bar.state} />

        <dl className="px-card px-rows p-3 text-[15px] leading-6">
          <div className="flex justify-between gap-4 pb-3 last:pb-0">
            <dt className="text-muted">{bar.state === "over" ? "Over by" : "Remaining"}</dt>
            <dd className={`tnum ${bar.state === "over" && bar.budget > 0 ? "text-neg" : "text-ink"}`}>
              {bar.budget > 0 ? formatMoney(Math.abs(bar.remaining), currency) : "No budget"}
            </dd>
          </div>
          {trend !== null ? (
            <div className="flex justify-between gap-4 pt-3">
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
            }}
          />
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" icon="budgets" className="flex-1" onClick={() => setEditing(true)}>
              Change budget
            </Button>
            <LinkButton href={`/transactions?m=${month}&category=${bar.categoryId}`} className="flex-1">
              See transactions
            </LinkButton>
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
      <Overlay title="New budget" onClose={onClose}>
        <p className="text-[15px] leading-6 text-muted">Every expense category already has a budget.</p>
      </Overlay>
    );
  }
  return (
    <Overlay title="New budget" onClose={onClose}>
      <div className="space-y-4">
        <label className={labelClass}>
          Category
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <AmountForm categoryId={categoryId} month={month} initial={0} onSaved={onSaved} />
      </div>
    </Overlay>
  );
}

/** A category's card: what went out, the cells, what's left (or over) and
 * the plan it's measured against. Tapping it opens the budget. */
function BudgetCard({
  b,
  currency,
  index,
  onOpen,
}: {
  b: DV["bars"][number];
  currency: string;
  index: number;
  onOpen: () => void;
}) {
  const unplanned = b.budget <= 0 && b.actual > 0;
  const over = b.state === "over" && b.budget > 0;
  return (
    <li className="reveal" style={{ ["--i" as string]: index + 2 }}>
      <button
        type="button"
        onClick={onOpen}
        className="px-card press flex w-full items-start gap-3 p-3 text-left md:gap-4 md:p-4"
      >
        <CategoryIcon name={b.name} tone={unplanned || over ? "wash" : "gray"} />
        <span className="min-w-0 flex-1 space-y-2">
          <span className="flex items-baseline justify-between gap-3 text-[15px] leading-6">
            <span className="truncate font-medium text-ink">{b.name}</span>
            <span className="tnum shrink-0 font-semibold text-ink">{formatMoney(b.actual, currency)}</span>
          </span>
          <ProgressBar pct={b.pctUsed} tone={b.state} start={index * 2} />
          <span className="flex items-baseline justify-between gap-3 text-sm leading-5">
            {unplanned ? (
              <span className="font-medium text-neg">No budget, all unplanned</span>
            ) : over ? (
              <span className="tnum font-medium text-neg">Over by {formatMoney(b.actual - b.budget, currency)}</span>
            ) : b.budget > 0 ? (
              <span className="tnum text-ink">
                {formatMoney(b.remaining, currency)} <span className="text-muted">left</span>
              </span>
            ) : (
              <span className="text-muted">No budget set</span>
            )}
            {b.budget > 0 ? (
              <span className="tnum shrink-0 text-muted">of {formatMoney(b.budget, currency)}</span>
            ) : (
              <span className={`shrink-0 font-semibold ${unplanned ? "text-neg" : "text-ink"}`}>Set budget</span>
            )}
          </span>
        </span>
      </button>
    </li>
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
        /** a category whose budget opens straight away (`?edit=`, from Home) */
        initialEdit?: string | null;
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
  const initialEdit = props.range === "month" ? (props.initialEdit ?? null) : null;
  const [detail, setDetail] = useState<{ id: string; editing: boolean } | null>(
    initialEdit ? { id: initialEdit, editing: true } : null,
  );
  const [adding, setAdding] = useState(false);

  const setRange = (r: "month" | "all") => {
    const params = new URLSearchParams();
    params.set("m", props.month);
    if (r === "all") params.set("range", "all");
    router.push(`/budgets?${params.toString()}`);
  };

  const header = (
    <PageHeader
      title="Budgets"
      month={<MonthNav base="/budgets" month={props.month} />}
      action={
        props.range === "month" ? (
          <Button icon="plus" onClick={() => setAdding(true)} aria-label="New budget">
            <span className="md:hidden">New</span>
            <span className="hidden md:inline">New budget</span>
          </Button>
        ) : undefined
      }
    />
  );

  const toolbar = (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 md:mb-10">
      <SegmentedControl
        label="Range"
        value={props.range}
        onChange={setRange}
        options={[
          { value: "month", label: "This month" },
          { value: "all", label: "All time" },
        ]}
      />
      {props.range === "month" ? <CopyBudgets month={props.month} /> : null}
    </div>
  );

  if (props.range === "all") {
    return (
      <div>
        {header}
        {toolbar}
        {props.allTimeRows.length === 0 ? (
          <EmptyState icon="budgets" title="No spending recorded yet." />
        ) : (
          <section className="space-y-3">
            <SectionHead title="All time" count={props.allTimeRows.length} />
            <ul className="px-card px-rows p-2 md:p-4">
              {props.allTimeRows.map((r) => (
                <li key={r.categoryId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 md:gap-4">
                  <CategoryIcon name={r.name} />
                  <span className="flex-1 truncate text-[15px] font-medium leading-6 text-ink">{r.name}</span>
                  <span className="tnum text-[15px] font-semibold leading-6 text-ink">
                    {formatMoney(r.total, props.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  const { view, currency } = props;
  const { tiles } = view;
  const remaining = formatMoney(tiles.leftToSpend, currency);
  const suggestion = pickSuggestion(view.bars, props.prevView.bars, tiles.spent);
  const unplanned = suggestion?.kind === "unbudgeted" ? suggestion : null;
  const spentPct = tiles.budgeted > 0 ? (tiles.spent / tiles.budgeted) * 100 : 0;
  const heroTone = tiles.leftToSpend < 0 ? "over" : spentPct >= 85 ? "near" : "under";

  return (
    <div>
      {header}
      {toolbar}

      <section className="reveal px-card-raised p-2 md:p-6" style={{ ["--i" as string]: 1 }}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-10">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium leading-5 text-muted">Remaining</h2>
            <p className={`${figureSize(remaining)} tnum mt-3 ${tiles.leftToSpend < 0 ? "text-neg" : "text-ink"}`}>
              {remaining}
            </p>
            <p className="tnum mt-2 text-[15px] leading-6 text-muted">
              <span className="font-semibold text-ink">{formatMoney(tiles.spent, currency)}</span> spent of{" "}
              <span className="font-semibold text-ink">{formatMoney(tiles.budgeted, currency)}</span> budgeted
            </p>
            <ProgressBar className="mt-4 max-w-[480px]" pct={spentPct} tone={heroTone} cellHeight={12} />
          </div>
          {unplanned ? (
            <div className="flex flex-col items-start gap-3 lg:w-[420px]">
              <p className="px-warn flex items-start gap-2 px-2 py-1.5 text-sm leading-6 text-ink md:text-[15px]">
                <Icon name="warning" className="text-warn" />
                <span>
                  <span className="font-semibold">{unplanned.name} has no budget.</span> All{" "}
                  {formatMoney(unplanned.amount, currency)} of it counts as unplanned.
                </span>
              </p>
              <Button
                variant="secondary"
                icon="budgets"
                onClick={() => setDetail({ id: unplanned.categoryId, editing: true })}
              >
                Set {unplanned.name} budget
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-10 space-y-3">
        <SectionHead title="Categories" count={view.bars.length} />
        {view.bars.length === 0 ? (
          <EmptyState
            icon="budgets"
            title="You don't have a budget yet."
            body="Set a monthly limit per category to see how you're tracking."
            action={
              <Button icon="plus" onClick={() => setAdding(true)}>
                Build my budget
              </Button>
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            {view.bars.map((b, i) => (
              <BudgetCard
                key={b.categoryId}
                b={b}
                currency={currency}
                index={i}
                onOpen={() => setDetail({ id: b.categoryId, editing: false })}
              />
            ))}
          </ul>
        )}
      </section>

      {detail
        ? (() => {
            const bar = view.bars.find((b) => b.categoryId === detail.id);
            if (!bar) return null;
            const prevBar = props.prevView.bars.find((b) => b.categoryId === detail.id);
            return (
              <CategoryDetail
                key={`${detail.id}:${detail.editing}`}
                bar={bar}
                prevActual={prevBar?.actual ?? 0}
                month={props.month}
                currency={currency}
                startEditing={detail.editing}
                onClose={() => setDetail(null)}
              />
            );
          })()
        : null}

      {adding ? (
        <AddBudget
          categories={props.unbudgetedCategories}
          month={props.month}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
          }}
        />
      ) : null}
    </div>
  );
}
