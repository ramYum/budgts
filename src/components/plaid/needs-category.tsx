"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/budget/money";
import { categorizeBankTransaction, rescanUncategorized } from "@/server/plaid/actions";
import { createCategory } from "@/server/categories";
import { CategoryForm } from "@/components/category-form";
import { Overlay } from "@/components/overlay";
import type { CategoryOption } from "@/components/transaction-form";
import { groupUncategorized, type MerchantGroup, type UncategorizedTxn } from "@/lib/plaid/group-uncategorized";

export type NeedsCategoryItem = UncategorizedTxn;

const field =
  "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent";

const STD_PREFIX = "std:";
const NEW_CATEGORY_VALUE = "__new__";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "FOOD_AND_DRINK" -> "Food and drink" — Plaid's own guess, shown as a hint. */
function humanizePfc(v: string | null): string | null {
  if (!v) return null;
  const s = v.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatNet(netAmount: number, currency: string): string {
  const sign = netAmount < 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(netAmount), currency)}`;
}

/**
 * The one prompt V1 shows for imported transactions (design §3, §18): bank
 * rows Budgts could not confidently categorise, grouped by merchant so one
 * decision clears every transaction from that merchant at once — the same
 * merchant identity the backend backfill already keys on (design §18), so
 * grouping adds no extra mis-categorization risk. A suggested category (from
 * `suggested_category_id`, resolved server-side) is offered as a one-tap chip
 * but never applied without that tap.
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
  const [addingFor, setAddingFor] = useState<{ key: string; anchorId: string; label: string } | null>(null);
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});

  const groups = useMemo(() => groupUncategorized(items), [items]);
  const visible = useMemo(() => groups.filter((g) => !done.has(g.key)), [groups, done]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  if (visible.length === 0) return null;

  const resetSelect = (key: string) => setResetKeys((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));

  const choose = (group: MerchantGroup, value: string) => {
    if (value === NEW_CATEGORY_VALUE) {
      setAddingFor({ key: group.key, anchorId: group.anchorId, label: group.label });
      return;
    }
    pick(group.key, group.anchorId, value);
  };

  const pick = (key: string, anchorId: string, value: string) => {
    if (!value) return;
    setError(null);
    setDone((prev) => new Set(prev).add(key));
    startTransition(async () => {
      const fd = new FormData();
      fd.set("transactionId", anchorId);
      if (value.startsWith(STD_PREFIX)) fd.set("standardCategoryName", value.slice(STD_PREFIX.length));
      else fd.set("categoryId", value);
      const res = await categorizeBankTransaction({}, fd);
      if (res.error) {
        setDone((prev) => {
          const next = new Set(prev);
          next.delete(key);
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

  const totalTxns = visible.reduce((n, g) => n + g.count, 0);

  return (
    <section id="needs-category" className="scroll-mt-20 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-4 w-1 shrink-0 rounded-full bg-tick" aria-hidden />
          Needs a category
          <span className="text-xs font-normal text-muted">
            ({visible.length} {visible.length === 1 ? "merchant" : "merchants"}
            {totalTxns > visible.length ? `, ${totalTxns} transactions` : ""})
          </span>
        </h2>
        <button
          type="button"
          onClick={rescan}
          disabled={rescanning}
          className="shrink-0 whitespace-nowrap rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
        >
          {rescanning ? "Re-scanning…" : "Re-scan"}
        </button>
      </div>

      <p className="text-xs text-muted">
        Pick a category once and it applies to every transaction from that merchant. Don&apos;t see the category you
        want? Choose <span className="font-medium">+ New category…</span> from the list.
      </p>

      <ul className="card divide-y divide-hairline rounded-2xl border border-hairline px-4">
        {visible.map((group) => {
          const suggestedName = group.suggestedCategoryId ? categoryById.get(group.suggestedCategoryId) : null;
          const pfc = !suggestedName ? humanizePfc(group.plaidCategoryPrimary) : null;
          return (
            <li key={group.key} className="space-y-2.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-sm font-medium">{group.label}</p>
                <p className="shrink-0 text-xs tabular-nums text-muted">
                  {group.count} {group.count === 1 ? "txn" : "txns"} · {formatNet(group.netAmount, currency)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {suggestedName ? (
                  <button
                    type="button"
                    onClick={() => pick(group.key, group.anchorId, group.suggestedCategoryId!)}
                    className="rounded-full border border-primary/30 bg-tint px-3 py-1 text-xs font-medium text-primary hover:border-primary/60"
                  >
                    {suggestedName}
                  </button>
                ) : null}
                <select
                  key={resetKeys[group.key] ?? 0}
                  className={field}
                  defaultValue=""
                  aria-label={`Category for ${group.label}`}
                  onChange={(e) => choose(group, e.target.value)}
                >
                  <option value="" disabled>
                    {suggestedName ? "Choose another…" : "Choose a category…"}
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  {missingStandard.length > 0 ? (
                    <optgroup label="Restore a default category">
                      {missingStandard.map((name) => (
                        <option key={name} value={`${STD_PREFIX}${name}`}>
                          {name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  <option value={NEW_CATEGORY_VALUE}>+ New category…</option>
                </select>
                {pfc ? <span className="text-xs text-muted">Plaid suggests: {pfc}</span> : null}
              </div>

              {group.count > 1 ? (
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer select-none hover:text-text">
                    Show {group.count} transactions
                  </summary>
                  <ul className="mt-2 space-y-1.5 border-l border-hairline pl-3">
                    {group.transactions.map((t) => (
                      <li key={t.id} className="flex items-start justify-between gap-3">
                        <span className="min-w-0 break-words">{t.description || "Transaction"}</span>
                        <span className="shrink-0 tabular-nums">
                          {formatDate(t.occurred_at)} · {t.direction === "debit" ? "−" : "+"}
                          {formatMoney(t.amount, currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <p className="truncate text-xs text-muted">
                  {formatDate(group.transactions[0].occurred_at)}
                  {group.transactions[0].account_name ? ` · ${group.transactions[0].account_name}` : ""}
                  {group.transactions[0].pending ? " · Pending" : ""}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {error ? <p className="text-sm text-neg">{error}</p> : null}

      {addingFor ? (
        <Overlay
          title={`New category for ${addingFor.label}`}
          onClose={() => {
            resetSelect(addingFor.key);
            setAddingFor(null);
          }}
        >
          <CategoryForm
            action={createCategory}
            submitLabel="Add & use"
            onDone={(created) => {
              const { key, anchorId } = addingFor;
              setAddingFor(null);
              if (created) pick(key, anchorId, created.id);
              else resetSelect(key);
            }}
          />
        </Overlay>
      ) : null}
    </section>
  );
}
