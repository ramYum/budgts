"use client";

import { useState } from "react";
import { createTransaction } from "@/server/transactions";
import { Icon } from "./icon";
import { Overlay } from "./overlay";
import { Button } from "./ui";
import { TransactionForm, type AccountOption, type CategoryOption } from "./transaction-form";

/** Adds a transaction by hand. `primary`: the screen's main action ("Add
 * transaction", shortened to "Add" on a phone); `text`: a quiet inline
 * "Add one by hand" for an empty list. */
export function AddTransaction({
  accounts,
  categories,
  defaultDate,
  variant = "primary",
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  defaultDate: string;
  variant?: "primary" | "text";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "text" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="press inline-flex min-h-9 items-center gap-1.5 text-[15px] font-semibold leading-6 text-ink hover:underline"
        >
          Add one by hand
          <Icon name="plus" />
        </button>
      ) : (
        <Button icon="plus" onClick={() => setOpen(true)} aria-label="Add transaction">
          <span className="md:hidden">Add</span>
          <span className="hidden md:inline">Add transaction</span>
        </Button>
      )}
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
