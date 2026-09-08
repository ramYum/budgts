"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/budget/money";
import { deleteTransaction, updateTransaction } from "@/server/transactions";
import { Overlay } from "./overlay";
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
  const router = useRouter();
  const [editing, setEditing] = useState<TxnListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        No transactions this month yet. Add your first with{" "}
        <span className="font-medium text-text">+ Add</span>.
      </p>
    );
  }

  const groups = new Map<string, TxnListItem[]>();
  for (const it of items) {
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
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([day, rows]) => (
        <section key={day} className="space-y-1">
          <h3 className="text-xs font-medium text-muted">{dayLabel(day)}</h3>
          <ul className="divide-y divide-border">
            {rows.map((it) => (
              <li key={it.id} className="flex items-center gap-3 py-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background: it.is_transfer
                      ? "var(--pine-4)"
                      : (it.category?.color ?? "var(--grey-5)"),
                  }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{it.description || it.category?.name || "Transaction"}</p>
                  <p className="truncate text-xs text-muted">
                    {it.is_transfer ? "Transfer" : (it.category?.name ?? "Uncategorized")} · {it.account?.name}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm tabular-nums ${
                    it.direction === "credit" ? "font-medium text-pos" : ""
                  }`}
                >
                  {it.direction === "debit" ? "−" : "+"}
                  {formatMoney(it.amount, currency)}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing(it)}
                  className="shrink-0 text-xs text-muted hover:text-text"
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

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
            className="mt-2 w-full rounded-lg border border-neg/40 px-3 py-2 text-sm text-neg disabled:opacity-50"
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
