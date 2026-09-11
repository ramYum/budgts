"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { TxnActionState } from "@/server/transactions";

export type AccountOption = { id: string; name: string };
export type CategoryOption = { id: string; name: string; kind: "expense" | "income" };

export type TransactionInitial = {
  id: string;
  amount: number; // minor units
  direction: "debit" | "credit";
  occurredAt: string; // ISO
  description: string;
  note: string | null;
  isTransfer: boolean;
  accountId: string;
  categoryId: string | null;
};

const field =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";
const label = "block space-y-1 text-xs font-medium text-muted";

function toDateInput(iso: string) {
  return iso.slice(0, 10);
}

export function TransactionForm({
  action,
  accounts,
  categories,
  initial,
  defaultDate,
  onDone,
  submitLabel,
  initialDirection = "debit",
}: {
  action: (prev: TxnActionState, formData: FormData) => Promise<TxnActionState>;
  accounts: AccountOption[];
  categories: CategoryOption[];
  initial?: TransactionInitial;
  defaultDate: string; // YYYY-MM-DD
  onDone: () => void;
  submitLabel: string;
  /** Direction to preselect on a brand-new (non-`initial`) entry, e.g. "credit" for an "Add income" shortcut. */
  initialDirection?: "debit" | "credit";
}) {
  const [state, formAction, pending] = useActionState<TxnActionState, FormData>(action, {});
  const router = useRouter();
  const fe = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok) {
      onDone();
      router.refresh();
    }
  }, [state.ok, onDone, router]);

  return (
    <form action={formAction} className="space-y-3">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Amount
          <input
            className={field}
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={initial ? (initial.amount / 100).toFixed(2) : ""}
            required
          />
        </label>
        <label className={label}>
          Direction
          <select className={field} name="direction" defaultValue={initial?.direction ?? initialDirection}>
            <option value="debit">Money out</option>
            <option value="credit">Money in</option>
          </select>
        </label>
      </div>
      {fe.amount ? <p className="text-xs text-neg">{fe.amount}</p> : null}

      <label className={label}>
        Account
        <select className={field} name="accountId" defaultValue={initial?.accountId ?? accounts[0]?.id} required>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      {fe.accountId ? <p className="text-xs text-neg">{fe.accountId}</p> : null}

      <label className={label}>
        Category
        <select
          className={field}
          name="categoryId"
          defaultValue={
            initial?.categoryId ??
            (initialDirection === "credit" ? (categories.find((c) => c.kind === "income")?.id ?? "") : "")
          }
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.kind === "income" ? " (income)" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className={label}>
        Date
        <input
          className={field}
          type="date"
          name="occurredAt"
          defaultValue={initial ? toDateInput(initial.occurredAt) : defaultDate}
          required
        />
      </label>
      {fe.occurredAt ? <p className="text-xs text-neg">{fe.occurredAt}</p> : null}

      <label className={label}>
        Description
        <input className={field} name="description" defaultValue={initial?.description ?? ""} maxLength={200} />
      </label>
      {fe.description ? <p className="text-xs text-neg">{fe.description}</p> : null}

      <label className={label}>
        Note (optional)
        <textarea className={field} name="note" rows={2} defaultValue={initial?.note ?? ""} maxLength={1000} />
      </label>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="isTransfer" defaultChecked={initial?.isTransfer ?? false} className="accent-[var(--volt)]" />
        Transfer between my own accounts (excluded from spend &amp; income)
      </label>

      {state.error ? <p className="text-sm text-neg">{state.error}</p> : null}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-on-primary disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
