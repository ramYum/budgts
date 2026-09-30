import { dayOf } from "../dates";
import type { Direction, MobileTransaction } from "./transactions-api";

/**
 * The add / edit transaction form's state and its translation to the wire (`POST /api/mobile/transactions`,
 * `PATCH …/:id`). Pure. The server is the single authority on what a valid amount, date or account is — the checks here only
 * stop an obviously empty submit; every server field error is shown against its field.
 */
export type TransactionDraft = {
  accountId: string | null;
  categoryId: string | null;
  /** What the person typed: a decimal like "12.34". */
  amount: string;
  direction: Direction;
  /** `YYYY-MM-DD`. */
  date: string;
  description: string;
  note: string;
  isTransfer: boolean;
};

export function emptyDraft(today: string, accountId: string | null): TransactionDraft {
  return { accountId, categoryId: null, amount: "", direction: "debit", date: today, description: "", note: "", isTransfer: false };
}

/** Accepts a decimal comma ("12,34") when unambiguous; anything else is left for the server to accept or reject. */
export function normalizeAmountInput(raw: string): string {
  const s = raw.trim();
  return /^\d+,\d{1,2}$/.test(s) ? s.replace(",", ".") : s;
}

/** Integer minor units → the decimal a person would type (2-decimal currencies, as everywhere in Budgts v1). */
export const minorToInput = (minor: number): string => (minor / 100).toFixed(2);

export function validateDraft(d: TransactionDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!d.accountId) errors.accountId = "Choose an account";
  if (d.amount.trim() === "") errors.amount = "Enter an amount";
  return errors;
}

/** `requestId` is set only when creating: a retried create with the same id lands once. */
export function draftToPayload(d: TransactionDraft, requestId?: string) {
  return {
    accountId: d.accountId,
    categoryId: d.categoryId,
    amount: normalizeAmountInput(d.amount),
    direction: d.direction,
    occurredAt: d.date,
    description: d.description.trim(),
    note: d.note.trim(),
    isTransfer: d.isTransfer,
    ...(requestId ? { requestId } : {}),
  };
}

export function draftFromTransaction(t: MobileTransaction): TransactionDraft {
  return {
    accountId: t.account.id,
    categoryId: t.category?.id ?? null,
    amount: minorToInput(t.amount),
    direction: t.direction,
    date: dayOf(t.occurredAt),
    description: t.description,
    note: t.note ?? "",
    isTransfer: t.isTransfer,
  };
}

/** A fresh idempotency key for one create attempt (`[A-Za-z0-9-]{8,64}`, the server's format). `random` is injectable for tests. */
export function newRequestId(random: () => number = Math.random): string {
  const tail = Array.from({ length: 10 }, () => Math.floor(random() * 36).toString(36)).join("");
  return `m-${Date.now().toString(36)}-${tail}`;
}
