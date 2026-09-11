"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/budget/money";
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
        className="card w-full rounded-xl border border-hairline p-3 text-left"
      >
        <p className="text-xs font-medium text-heading">Income</p>
        <p className="tnum font-display text-lg font-bold text-text">
          <CountUp value={value} format={(n) => formatMoney(n, currency)} />
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
