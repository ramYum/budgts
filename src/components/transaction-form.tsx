"use client";

import { useActionState, useEffect } from "react";
import type { TxnActionState } from "@/server/transactions";
import { resolveDefaultDate } from "@/lib/local-date";
import { Button, Select, fieldClass as field, labelClass as label } from "./ui";

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
  lockDirection = false,
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
  /** When true, `initialDirection` is fixed and not user-editable, and the category list narrows to that direction's kind (e.g. the "Add income" shortcut: always money in, only income categories). Ignored when editing an existing transaction (`initial`). */
  lockDirection?: boolean;
}) {
  const [state, formAction, pending] = useActionState<TxnActionState, FormData>(action, {});
  const fe = state.fieldErrors ?? {};
  const directionLocked = lockDirection && !initial;
  const visibleCategories =
    directionLocked && initialDirection === "credit" ? categories.filter((c) => c.kind === "income") : categories;

  useEffect(() => {
    if (state.ok) {
      onDone();
    }
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
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
          {directionLocked ? (
            <>
              <p className="px-band px-2 py-1 text-base leading-6 text-graphite">
                {initialDirection === "credit" ? "Money in" : "Money out"}
              </p>
              <input type="hidden" name="direction" value={initialDirection} />
            </>
          ) : (
            <Select name="direction" defaultValue={initial?.direction ?? initialDirection}>
              <option value="debit">Money out</option>
              <option value="credit">Money in</option>
            </Select>
          )}
        </label>
      </div>
      {fe.amount ? <p className="text-sm text-neg">{fe.amount}</p> : null}

      <label className={label}>
        Account
        <Select name="accountId" defaultValue={initial?.accountId ?? accounts[0]?.id} required>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </label>
      {fe.accountId ? <p className="text-sm text-neg">{fe.accountId}</p> : null}

      <label className={label}>
        Category
        <Select
          name="categoryId"
          defaultValue={
            initial?.categoryId ??
            (initialDirection === "credit" ? (visibleCategories.find((c) => c.kind === "income")?.id ?? "") : "")
          }
        >
          <option value="">Uncategorized</option>
          {visibleCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {!directionLocked && c.kind === "income" ? " (income)" : ""}
            </option>
          ))}
        </Select>
      </label>

      <label className={label}>
        Date
        <input
          className={field}
          type="date"
          name="occurredAt"
          defaultValue={initial ? toDateInput(initial.occurredAt) : resolveDefaultDate(defaultDate)}
          required
        />
      </label>
      {fe.occurredAt ? <p className="text-sm text-neg">{fe.occurredAt}</p> : null}

      <label className={label}>
        Description
        <input className={field} name="description" defaultValue={initial?.description ?? ""} maxLength={200} />
      </label>
      {fe.description ? <p className="text-sm text-neg">{fe.description}</p> : null}

      <label className={label}>
        Note (optional)
        <textarea className={field} name="note" rows={2} defaultValue={initial?.note ?? ""} maxLength={1000} />
      </label>

      <label className="flex items-center gap-2.5 text-sm leading-5 text-graphite">
        <input type="checkbox" name="isTransfer" defaultChecked={initial?.isTransfer ?? false} className="h-4 w-4 accent-[var(--ink)]" />
        Transfer between my own accounts (excluded from spend &amp; income)
      </label>

      {state.error ? <p className="text-sm text-neg">{state.error}</p> : null}

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
