"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/budget/money";
import { categorizeBankTransaction, rescanUncategorized } from "@/server/plaid/actions";
import type { CategoryOption } from "@/components/transaction-form";

export type NeedsCategoryItem = {
  id: string;
  description: string;
  merchant_name: string | null;
  amount: number;
  direction: "debit" | "credit";
  occurred_at: string;
  account_name: string | null;
};

const field =
  "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent";

const STD_PREFIX = "std:";

/**
 * The one prompt V1 shows for imported transactions (design §3, §18): bank rows
 * Budgts could not confidently categorise. Picking one categorises the row,
 * marks it user-owned, remembers the merchant, and backfills matching rows.
 * The user can pick an existing category or add a standard one they don't have.
 */
export function NeedsCategory({
  items,
  categories,
  missingStandard,
  currency,
}: {
  items: NeedsCategoryItem[];
  categories: CategoryOption[];
  /** Standard category names the user doesn't currently have — offered as "add". */
  missingStandard: string[];
  currency: string;
}) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [rescanning, startRescan] = useTransition();
  const [, startTransition] = useTransition();

  const visible = useMemo(() => items.filter((it) => !done.has(it.id)), [items, done]);
  if (visible.length === 0) return null;

  const pick = (id: string, value: string) => {
    if (!value) return;
    setError(null);
    setDone((prev) => new Set(prev).add(id));
    startTransition(async () => {
      const fd = new FormData();
      fd.set("transactionId", id);
      if (value.startsWith(STD_PREFIX)) fd.set("standardCategoryName", value.slice(STD_PREFIX.length));
      else fd.set("categoryId", value);
      const res = await categorizeBankTransaction({}, fd);
      if (res.error) {
        setDone((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const rescan = () =>
    startRescan(async () => {
      setError(null);
      await rescanUncategorized();
      router.refresh();
    });

  return (
    <section id="needs-category" className="scroll-mt-20 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-4 w-1 shrink-0 rounded-full bg-tick" aria-hidden />
          Needs a category
          <span className="text-xs font-normal text-muted">({visible.length})</span>
        </h2>
        <button
          type="button"
          onClick={rescan}
          disabled={rescanning}
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
        >
          {rescanning ? "Re-scanning…" : "Re-scan"}
        </button>
      </div>

      <ul className="card divide-y divide-hairline rounded-2xl border border-hairline px-4">
        {visible.map((it) => (
          <li key={it.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{it.merchant_name || it.description || "Transaction"}</p>
              <p className="truncate text-xs text-muted">
                {it.direction === "debit" ? "−" : "+"}
                {formatMoney(it.amount, currency)}
                {it.account_name ? ` · ${it.account_name}` : ""}
              </p>
            </div>
            <select
              className={field}
              defaultValue=""
              aria-label={`Category for ${it.merchant_name || it.description || "transaction"}`}
              onChange={(e) => pick(it.id, e.target.value)}
            >
              <option value="" disabled>
                Choose a category…
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              {missingStandard.length > 0 ? (
                <optgroup label="Add a category">
                  {missingStandard.map((name) => (
                    <option key={name} value={`${STD_PREFIX}${name}`}>
                      {name}
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </li>
        ))}
      </ul>

      {error ? <p className="text-sm text-neg">{error}</p> : null}
    </section>
  );
}
