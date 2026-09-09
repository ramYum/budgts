"use client";

import { useState } from "react";
import { createTransaction } from "@/server/transactions";
import { Overlay } from "./overlay";
import { TransactionForm, type AccountOption, type CategoryOption } from "./transaction-form";

export function AddTransaction({
  accounts,
  categories,
  defaultDate,
}: {
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
        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-on-primary"
      >
        + Add
      </button>
      {open ? (
        <Overlay title="Add transaction" onClose={() => setOpen(false)}>
          <TransactionForm
            action={createTransaction}
            accounts={accounts}
            categories={categories}
            defaultDate={defaultDate}
            onDone={() => setOpen(false)}
            submitLabel="Add"
          />
        </Overlay>
      ) : null}
    </>
  );
}
