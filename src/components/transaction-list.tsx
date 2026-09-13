"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/budget/money";
import { deleteTransaction, updateTransaction } from "@/server/transactions";
import { Overlay } from "./overlay";
import { Mascot } from "./mascot";
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
  const router = useRouter();
  const [viewing, setViewing] = useState<TxnListItem | null>(null);
  const [editing, setEditing] = useState<TxnListItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Mascot mood="sleepy" size={64} />
        <p className="text-sm text-muted">
          No transactions this month yet. Add your first with{" "}
          <span className="font-medium text-text">+ Add</span>.
        </p>
      </div>
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
      <div className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
        {[...groups.entries()].map(([day, rows]) => (
          <section key={day} className="space-y-1 px-4 py-3">
            <h3 className="text-xs font-medium text-muted">{dayLabel(day)}</h3>
            <ul className="divide-y divide-hairline">
              {rows.map((it) => {
                const pillColor = it.is_transfer ? "var(--muted)" : (it.category?.color ?? "var(--border)");
                return (
                <li key={it.id} className="py-2">
                  <button
                    type="button"
                    onClick={() => setViewing(it)}
                    className="block w-full truncate text-left text-sm hover:text-primary"
                  >
                    {it.description || it.category?.name || "Transaction"}
                  </button>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 max-w-[65%] items-center gap-1.5 truncate rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: pillColor }} aria-hidden />
                      <span className="truncate">
                        {it.is_transfer ? "Transfer" : (it.category?.name ?? "Uncategorized")}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 text-sm tabular-nums ${
                        it.direction === "credit" ? "font-medium text-pos" : ""
                      }`}
                    >
                      {it.direction === "debit" ? "−" : "+"}
                      {formatMoney(it.amount, currency)}
                    </span>
                  </div>
                </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {viewing ? (
        <Overlay title="Transaction" onClose={() => setViewing(null)}>
          <p className="text-sm">{viewing.description || viewing.category?.name || "Transaction"}</p>
          {viewing.note ? <p className="mt-1 text-sm text-muted">{viewing.note}</p> : null}
          <dl className="mt-3 space-y-1.5 text-sm">
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
          <button
            type="button"
            onClick={() => {
              setEditing(viewing);
              setViewing(null);
            }}
            className="mt-4 w-full rounded-full border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
          >
            Edit
          </button>
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
