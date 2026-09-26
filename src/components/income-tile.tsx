"use client";

import { useState } from "react";
import { createTransaction } from "@/server/transactions";
import { Icon } from "./icon";
import { Overlay } from "./overlay";
import { Button } from "./ui";
import { TransactionForm, type AccountOption, type CategoryOption } from "./transaction-form";

/**
 * Home's "add income" shortcut: it opens the same transaction form used
 * elsewhere, locked to credit (money in only, income categories only) so it
 * always lands as income (design ask: "add manually an income amount").
 * `variant="icon"` is the plus beside "Came in" on the hero; the button
 * variants are the "Add this month's income" setup step. `accounts` is
 * expected to already be narrowed to currently-selectable ones — see
 * src/lib/accounts/selectable-accounts.ts.
 */
export function AddIncome({
  accounts,
  categories,
  defaultDate,
  variant,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  defaultDate: string;
  variant: "icon" | "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Add income"
          className="press -my-1 grid h-7 w-7 place-items-center text-muted hover:text-ink"
        >
          <Icon name="plus" />
        </button>
      ) : (
        <Button variant={variant} onClick={() => setOpen(true)} className="shrink-0">
          Add
        </Button>
      )}
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
