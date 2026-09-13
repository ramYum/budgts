"use client";

import { useState } from "react";
import { createTransaction } from "@/server/transactions";
import { Overlay } from "./overlay";
import { CountUp } from "./count-up";
import { TransactionForm, type AccountOption, type CategoryOption } from "./transaction-form";

/**
 * The dashboard's "Income" tile, made interactive: tapping it opens the same
 * transaction form used elsewhere, preset to a credit so it lands as income
 * without extra steps (design ask: "add manually an income amount").
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
        className="brand-highlight-card w-full rounded-2xl border border-sun/50 p-3 text-left shadow-sm"
      >
        <p className="text-xs font-bold text-text">Income</p>
        <p className="tnum font-display text-lg font-extrabold text-text">
          <CountUp value={value} currency={currency} />
        </p>
      </button>
      {open ? (
        <Overlay title="Add income" onClose={() => setOpen(false)}>
          <TransactionForm
            action={createTransaction}
            accounts={accounts}
            categories={categories}
            defaultDate={defaultDate}
            initialDirection="credit"
            onDone={() => setOpen(false)}
            submitLabel="Add"
          />
        </Overlay>
      ) : null}
    </>
  );
}
