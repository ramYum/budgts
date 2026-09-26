"use client";

import { useMemo, useState, useTransition } from "react";
import { formatMoney } from "@/lib/budget/money";
import { categorizeBankTransaction, rescanUncategorized } from "@/server/plaid/actions";
import { createCategory } from "@/server/categories";
import { CategoryForm } from "@/components/category-form";
import { Overlay } from "@/components/overlay";
import { Icon } from "@/components/icon";
import { Button, IconTile, TextButton, fieldClass } from "@/components/ui";
import type { CategoryOption } from "@/components/transaction-form";
import { groupUncategorized, type MerchantGroup, type UncategorizedTxn } from "@/lib/plaid/group-uncategorized";

export type NeedsCategoryItem = UncategorizedTxn;

const STD_PREFIX = "std:";
const NEW_CATEGORY_VALUE = "__new__";
/** Merchants shown before "Show N more" on a single-column screen; the
 * desktop side panel lists them all. */
const FIRST = 3;

/** Stored UTC calendar day — same as the Activity list, and identical on the server and in any browser time zone. */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
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
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [rescanning, startRescan] = useTransition();
  const [, startTransition] = useTransition();
  const [addingFor, setAddingFor] = useState<{ key: string; anchorId: string; label: string } | null>(null);
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState(false);

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
    });
  };

  const rescan = () =>
    startRescan(async () => {
      setError(null);
      await rescanUncategorized();
    });

  const totalTxns = visible.reduce((n, g) => n + g.count, 0);
  const hidden = expanded ? 0 : Math.max(0, visible.length - FIRST);

  return (
    <section id="needs-category" className="px-card-ink scroll-mt-20 p-3 md:p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="px-tag-bold text-neg">
          Needs a category <span aria-hidden>·</span> {totalTxns}
          <span className="sr-only">
            {" "}
            {totalTxns === 1 ? "transaction" : "transactions"} from {visible.length}{" "}
            {visible.length === 1 ? "merchant" : "merchants"}
          </span>
        </h2>
        <TextButton iconAfter="sync" onClick={rescan} disabled={rescanning} className="-my-1.5 shrink-0 text-muted">
          {rescanning ? "Re-scanning…" : "Re-scan"}
        </TextButton>
      </div>

      <p className="mt-1 text-sm leading-5 text-muted">
        Pick once and it applies to every purchase from that merchant. Missing one? Choose{" "}
        <span className="font-medium text-graphite">+ New category</span>.
      </p>

      <ul className="px-rows mt-2">
        {visible.map((group, i) => {
          const suggestedName = group.suggestedCategoryId ? categoryById.get(group.suggestedCategoryId) : null;
          const pfc = !suggestedName ? humanizePfc(group.plaidCategoryPrimary) : null;
          // Plaid's guess fits inside the select when it is short ("Other");
          // a longer one gets its own line rather than a cut-off label.
          const hintInside = pfc !== null && pfc.length <= 12;
          const first = group.transactions[0];
          return (
            <li
              key={group.key}
              className={`space-y-3 py-4 last:pb-0 ${!expanded && i >= FIRST ? "hidden xl:block" : ""}`}
            >
              <div className="flex items-center gap-3">
                <IconTile name="tag" />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[15px] font-medium leading-6 text-ink">{group.label}</p>
                  <p className="truncate text-sm leading-5 text-muted">
                    {group.count > 1
                      ? `${group.count} purchases · latest ${formatDate(first.occurred_at)}`
                      : `${formatDate(first.occurred_at)}${first.account_name ? ` · ${first.account_name}` : ""}${
                          first.pending ? " · Pending" : ""
                        }`}
                  </p>
                </div>
                <p
                  className={`tnum shrink-0 text-[15px] font-semibold leading-6 ${group.netAmount < 0 ? "text-pos" : "text-ink"}`}
                >
                  {formatNet(group.netAmount, currency)}
                </p>
              </div>

              {suggestedName ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm leading-5 text-muted">Looks like</span>
                  <button
                    type="button"
                    onClick={() => pick(group.key, group.anchorId, group.suggestedCategoryId!)}
                    className="px-chip press inline-flex h-8 items-center gap-1.5 px-2 text-[15px] font-medium leading-6 text-ink"
                  >
                    <Icon name="check" />
                    {suggestedName}
                  </button>
                </div>
              ) : null}

              <span className="relative block">
                <select
                  key={resetKeys[group.key] ?? 0}
                  className={`${fieldClass} appearance-none ${hintInside ? "pr-32" : "pr-10"}`}
                  defaultValue=""
                  aria-label={`Category for ${group.label}`}
                  onChange={(e) => choose(group, e.target.value)}
                >
                  <option value="" disabled>
                    {suggestedName ? "Choose another" : "Choose a category"}
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
                <span className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-2 text-graphite">
                  {hintInside ? <span className="text-sm leading-5 text-muted">Plaid: {pfc}</span> : null}
                  <Icon name="chevron-down" />
                </span>
              </span>

              {pfc && !hintInside ? <p className="-mt-1 text-sm leading-5 text-muted">Plaid suggests: {pfc}</p> : null}

              {group.count > 1 ? (
                <details className="text-sm leading-5 text-muted">
                  <summary className="cursor-pointer select-none hover:text-ink">
                    Show {group.count} transactions
                  </summary>
                  <ul className="mt-2 space-y-1.5 border-l-2 border-hairline pl-3">
                    {group.transactions.map((t) => (
                      <li key={t.id} className="flex items-start justify-between gap-3">
                        <span className="min-w-0 break-words">{t.description || "Transaction"}</span>
                        <span className="tnum shrink-0">
                          {formatDate(t.occurred_at)} · {t.direction === "debit" ? "−" : "+"}
                          {formatMoney(t.amount, currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>

      {hidden > 0 ? (
        <Button
          variant="secondary"
          className="mt-4 w-full xl:hidden"
          iconAfter="chevron-down"
          onClick={() => setExpanded(true)}
        >
          Show {hidden} more
        </Button>
      ) : null}

      {error ? <p className="mt-3 text-sm text-neg">{error}</p> : null}

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
