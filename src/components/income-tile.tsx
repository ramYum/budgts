"use client";

import { useState } from "react";
import { Plus } from "@phosphor-icons/react";
import { createTransaction } from "@/server/transactions";
import { Overlay } from "./overlay";
import { CountUp } from "./count-up";
import { TransactionForm, type AccountOption, type CategoryOption } from "./transaction-form";

/**
 * The dashboard's "Income" tile, made interactive: tapping it opens the same
 * transaction form used elsewhere, locked to credit (money in only, income
 * categories only) so it always lands as income (design ask: "add manually
 * an income amount"). `accounts` is expected to already be narrowed to
 * currently-selectable ones — see src/lib/accounts/selectable-accounts.ts.
 */
export function IncomeTile({
  value,
  currency,
  accounts,
  categories,
  defaultDate,
}: {
  value: number;
  currency: string;
  accounts: AccountOption[];
  categories: CategoryOption[];
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press lift card relative w-full rounded-2xl border border-hairline p-4 text-left"
      >
        <span className="absolute right-4 top-4 flex h-5 w-5 items-center justify-center rounded-md bg-ink text-on-primary">
          <Plus aria-hidden weight="bold" className="h-3 w-3" />
        </span>
        <span className="block text-[13px] text-muted">Income</span>
        <span className="tnum mt-2 block text-xl font-semibold tracking-tight">
          <CountUp value={value} currency={currency} />
        </span>
        <span className="mt-1 block text-xs text-muted">Tap to add income</span>
      </button>
      {open ? (
        <Overlay title="Add income" onClose={() => setOpen(false)}>
          <TransactionForm
            action={createTransaction}
            accounts={accounts}
            categories={categories}
            defaultDate={defaultDate}
            initialDirection="credit"
            lockDirection
            onDone={() => setOpen(false)}
            submitLabel="Add"
          />
        </Overlay>
      ) : null}
    </>
  );
}
