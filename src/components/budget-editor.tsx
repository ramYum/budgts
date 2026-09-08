"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/budget/money";
import { setBudget } from "@/server/budgets";

export type BudgetRow = { categoryId: string; name: string; color: string; amount: number };

function toInput(minor: number) {
  return minor > 0 ? (minor / 100).toFixed(2) : "";
}

function Row({
  row,
  month,
  onSaved,
}: {
  row: BudgetRow;
  month: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(toInput(row.amount));
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const original = toInput(row.amount);

  const save = () => {
    if (value.trim() === original.trim()) return;
    setError(undefined);
    start(async () => {
      const fd = new FormData();
      fd.set("categoryId", row.categoryId);
      fd.set("month", month);
      fd.set("amount", value);
      const res = await setBudget({}, fd);
      if (res.fieldError || res.error) setError(res.fieldError ?? res.error);
      else onSaved();
    });
  };

  return (
    <li className="flex items-center gap-3 py-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
      <div className="flex items-center gap-2">
        <input
          className="tnum w-24 rounded-lg border border-border bg-surface px-2 py-1 text-right text-sm outline-none focus:border-accent"
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label={`${row.name} budget`}
        />
      </div>
      {error ? <span className="text-xs text-neg">{error}</span> : null}
    </li>
  );
}

export function BudgetEditor({
  rows,
  month,
  currency,
}: {
  rows: BudgetRow[];
  month: string;
  currency: string;
}) {
  const router = useRouter();
  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <Row key={r.categoryId} row={r} month={month} onSaved={() => router.refresh()} />
        ))}
      </ul>
      <p className="tnum pt-3 text-sm text-muted">
        Budgeted <span className="font-medium text-text">{formatMoney(total, currency)}</span> this month
      </p>
    </div>
  );
}
