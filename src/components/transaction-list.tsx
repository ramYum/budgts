"use client";

import { useMemo, useState, useTransition } from "react";
import { formatMoney } from "@/lib/budget/money";
import { deleteTransaction, updateTransaction } from "@/server/transactions";
import { Overlay } from "./overlay";
import { Mascot } from "./mascot";
import { CategoryIcon, SegmentedControl } from "./ui";
import { MagnifyingGlass } from "@phosphor-icons/react";
import {
  TransactionForm,
  type AccountOption,
  type CategoryOption,
  type TransactionInitial,
} from "./transaction-form";

export type TxnListItem = {
  id: string;
  amount: number;
  direction: "debit" | "credit";
  occurred_at: string;
  description: string;
  note: string | null;
  is_transfer: boolean;
  category_id: string | null;
  account_id: string;
  category: { name: string; color: string } | null;
  account: { name: string } | null;
};

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fullDateLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function TransactionList({
  items,
  currency,
  accounts,
  categories,
}: {
  items: TxnListItem[];
  currency: string;
  accounts: AccountOption[];
  categories: CategoryOption[];
}) {
  const [viewing, setViewing] = useState<TxnListItem | null>(null);
  const [editing, setEditing] = useState<TxnListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [transferPending, startTransferTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "spending" | "income" | "transfers">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (q) {
        const haystack = `${it.description} ${it.category?.name ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (kindFilter === "transfers") return it.is_transfer;
      if (kindFilter === "income") return !it.is_transfer && it.direction === "credit";
      if (kindFilter === "spending") return !it.is_transfer && it.direction === "debit";
      return true;
    });
  }, [items, search, kindFilter]);

  /** Flips `isTransfer` via the same `updateTransaction` action the edit form
   * uses — a one-tap toggle from the Detail view (design spec §22) rather than
   * requiring a full edit-form round trip for this one field. */
  const toggleTransfer = (item: TxnListItem) => {
    setTransferError(null);
    startTransferTransition(async () => {
      const fd = new FormData();
      fd.set("accountId", item.account_id);
      fd.set("categoryId", item.category_id ?? "");
      fd.set("amount", (item.amount / 100).toFixed(2));
      fd.set("direction", item.direction);
      fd.set("occurredAt", item.occurred_at.slice(0, 10));
      fd.set("description", item.description);
      fd.set("note", item.note ?? "");
      fd.set("isTransfer", item.is_transfer ? "" : "on");
      fd.set("id", item.id);
      const res = await updateTransaction({}, fd);
      if (res.error || res.fieldErrors) {
        setTransferError(res.error ?? "Could not update this transaction.");
        return;
      }
      setViewing({ ...item, is_transfer: !item.is_transfer });
    });
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-hairline px-6 py-12 text-center">
        <Mascot mood="sleepy" size={72} />
        <p className="max-w-xs text-sm text-muted">
          No transactions this month yet. Add your first with{" "}
          <span className="font-medium text-text">+ Add</span>.
        </p>
      </div>
    );
  }

  const searchBar = (
    <div className="space-y-3">
      <div className="relative">
        <MagnifyingGlass
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transactions..."
          aria-label="Search transactions"
          className="w-full rounded-xl border border-hairline bg-surface py-3 pr-3 pl-10 text-sm outline-none transition-colors focus:border-ink"
        />
      </div>
      <SegmentedControl
        value={kindFilter}
        onChange={setKindFilter}
        options={[
          { value: "all", label: "All" },
          { value: "spending", label: "Spending" },
          { value: "income", label: "Income" },
          { value: "transfers", label: "Transfers" },
        ]}
      />
    </div>
  );

  if (filtered.length === 0) {
    return (
      <div className="space-y-4">
        {searchBar}
        <p className="rounded-2xl border border-dashed border-hairline py-10 text-center text-sm text-muted">
          No matching transactions.
        </p>
      </div>
    );
  }

  const groups = new Map<string, TxnListItem[]>();
  for (const it of filtered) {
    const key = it.occurred_at.slice(0, 10);
    const bucket = groups.get(key);
    if (bucket) bucket.push(it);
    else groups.set(key, [it]);
  }

  /** Deletes, then runs `onDeleted` only if the server actually removed a row.
   * On failure the editor stays open so the message has somewhere to show. */
  const remove = (id: string, onDeleted: () => void) => {
    if (!confirm("Delete this transaction?")) return;
    startTransition(async () => {
      const result = await deleteTransaction(id);
      if (result?.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteError(null);
      onDeleted();
    });
  };

  return (
    <div className="space-y-5">
      {searchBar}
      <div className="reveal card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline" style={{ ["--i" as string]: 1 }}>
      {[...groups.entries()].map(([day, rows]) => (
        <section key={day}>
          <h3 className="bg-surface-2/60 px-4 py-2 text-xs font-semibold text-muted">{dayLabel(day)}</h3>
          <ul className="divide-y divide-hairline">
            {rows.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => setViewing(it)}
                  aria-labelledby={`txn-${it.id}-title`}
                  aria-describedby={`txn-${it.id}-meta txn-${it.id}-amount`}
                  className="press flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
                >
                  <CategoryIcon name={it.is_transfer ? "Transfer" : (it.category?.name ?? "")} size={36} />
                  <span className="min-w-0 flex-1">
                    <span id={`txn-${it.id}-title`} className="block truncate text-sm font-medium">
                      {it.description || it.category?.name || "Transaction"}
                    </span>
                    <span id={`txn-${it.id}-meta`} className="block truncate text-xs text-muted">
                      {it.is_transfer ? "Transfer" : (it.category?.name ?? "Uncategorized")}
                    </span>
                  </span>
                  <span
                    id={`txn-${it.id}-amount`}
                    className={`shrink-0 text-sm font-medium tabular-nums ${it.direction === "credit" ? "text-pos" : ""}`}
                  >
                    {it.direction === "debit" ? "−" : "+"}
                    {formatMoney(it.amount, currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      </div>

      {viewing ? (
        <Overlay title="Transaction" onClose={() => setViewing(null)}>
          <div className="flex items-center gap-3">
            <CategoryIcon name={viewing.is_transfer ? "Transfer" : (viewing.category?.name ?? "")} size={44} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {viewing.description || viewing.category?.name || "Transaction"}
              </p>
              {viewing.note ? <p className="text-xs text-muted">{viewing.note}</p> : null}
            </div>
          </div>
          <dl className="mt-4 divide-y divide-hairline rounded-xl border border-hairline text-sm [&>div]:px-3.5 [&>div]:py-2.5">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Date</dt>
              <dd className="text-right">{fullDateLabel(viewing.occurred_at)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Category</dt>
              <dd className="text-right">{viewing.is_transfer ? "Transfer" : (viewing.category?.name ?? "Uncategorized")}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Account</dt>
              <dd className="text-right">{viewing.account?.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Amount</dt>
              <dd className={`text-right tabular-nums ${viewing.direction === "credit" ? "font-medium text-pos" : ""}`}>
                {viewing.direction === "debit" ? "−" : "+"}
                {formatMoney(viewing.amount, currency)}
              </dd>
            </div>
          </dl>
          {transferError ? <p className="mt-2 text-sm text-neg">{transferError}</p> : null}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(viewing);
                setViewing(null);
              }}
              className="press flex-1 rounded-xl border border-ink bg-surface px-3 py-3 text-sm font-medium hover:bg-surface-2"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={transferPending}
              onClick={() => toggleTransfer(viewing)}
              className="press flex-1 rounded-xl border border-hairline bg-surface px-3 py-3 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
            >
              {viewing.is_transfer ? "Remove transfer" : "Mark as transfer"}
            </button>
          </div>
        </Overlay>
      ) : null}

      {editing ? (
        <Overlay
          title="Edit transaction"
          onClose={() => {
            setEditing(null);
            setDeleteError(null);
          }}
        >
          <TransactionForm
            action={updateTransaction}
            accounts={accounts}
            categories={categories}
            defaultDate={editing.occurred_at.slice(0, 10)}
            initial={toInitial(editing)}
            onDone={() => setEditing(null)}
            submitLabel="Save changes"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => remove(editing.id, () => setEditing(null))}
            className="press mt-2 w-full rounded-xl border border-neg/30 px-3 py-3 text-sm font-medium text-neg hover:bg-signal-wash disabled:opacity-50"
          >
            Delete transaction
          </button>
          {deleteError ? <p className="mt-2 text-sm text-neg">{deleteError}</p> : null}
        </Overlay>
      ) : null}
    </div>
  );
}

function toInitial(it: TxnListItem): TransactionInitial {
  return {
    id: it.id,
    amount: it.amount,
    direction: it.direction,
    occurredAt: it.occurred_at,
    description: it.description,
    note: it.note,
    isTransfer: it.is_transfer,
    accountId: it.account_id,
    categoryId: it.category_id,
  };
}
