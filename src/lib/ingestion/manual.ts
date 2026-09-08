import {
  dateToIso,
  transactionFormSchema,
  type TransactionFormInput,
} from "@/lib/validation/transaction";
import type { IngestionAdapter, NormalizedTxn } from "./types";

/** Map an already-validated transaction form payload to a NormalizedTxn.
 * Callers that have run `transactionFormSchema` (e.g. server actions, for
 * field-level errors) pass `parsed.data` here instead of re-parsing. */
export function normalizeManual(p: TransactionFormInput): NormalizedTxn {
  return {
    accountId: p.accountId,
    categoryId: p.categoryId,
    amount: p.amount,
    direction: p.direction,
    occurredAt: dateToIso(p.occurredAt),
    description: p.description,
    note: p.note,
    isTransfer: p.isTransfer,
    source: "manual",
    sourceRef: null,
    status: "confirmed",
  };
}

/** Manual entry. `normalize` validates the form payload (throws ZodError on
 * bad input); manual entries are never deduped. */
export const ManualAdapter: IngestionAdapter = {
  source: "manual",

  normalize(raw: unknown): NormalizedTxn {
    return normalizeManual(transactionFormSchema.parse(raw));
  },

  dedupeKey() {
    return null;
  },
};
