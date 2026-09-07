import { dateToIso, transactionFormSchema } from "@/lib/validation/transaction";
import type { IngestionAdapter, NormalizedTxn } from "./types";

/** Manual entry. `normalize` validates the form payload (throws ZodError on
 * bad input); manual entries are never deduped. */
export const ManualAdapter: IngestionAdapter = {
  source: "manual",

  normalize(raw: unknown): NormalizedTxn {
    const p = transactionFormSchema.parse(raw);
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
  },

  dedupeKey() {
    return null;
  },
};
