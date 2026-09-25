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
        className="press rounded-xl bg-primary-btn px-3.5 py-2 text-sm font-medium text-on-primary-btn"
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
