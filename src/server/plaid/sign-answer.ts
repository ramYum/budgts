import "server-only";
import { and, eq } from "drizzle-orm";
import { plaidAccounts, transactions } from "@/lib/db/schema";
import { conventionFromAnswer, SIGN_CONVENTION_REVIEW_MARKER, type MoneyFlowAnswer } from "@/lib/plaid/sign-convention";
import { createPlaidSyncStore, type PlaidDb } from "@/lib/plaid/sync-store";

export type SignAnswerOutcome =
  | { outcome: "resolved"; convention: "standard" | "inverted" }
  | { outcome: "already_resolved" }
  | { outcome: "not_found" };

/**
 * The exit for an account whose transaction format never settles (design: 2026-10-01 card payments §5). Connected
 * banks shows one of the account's held transactions and asks "Was this money going out or coming in?"; the answer
 * decides the account's sign convention and releases every held row through the same `finalizeSignConvention` the
 * sync's own evidence uses, so both paths resolve rows identically.
 *
 * Server-only and Drizzle (it writes held rows the user's RLS client can't flip in one pass), so ownership is checked
 * here explicitly: the account and the sample transaction must both belong to `userId` (derived from the session by
 * the caller, never from the client), the transaction must be one of that account's held rows, and the account must
 * still be unresolved. The raw sign comes from the immutable Plaid payload, never the editable `direction`.
 */
export async function resolveSignConventionFromAnswer(
  db: PlaidDb,
  userId: string,
  plaidAccountRowId: string,
  transactionId: string,
  answer: MoneyFlowAnswer,
): Promise<SignAnswerOutcome> {
  const [account] = await db
    .select({ signConvention: plaidAccounts.signConvention, accountId: plaidAccounts.accountId })
    .from(plaidAccounts)
    .where(and(eq(plaidAccounts.id, plaidAccountRowId), eq(plaidAccounts.userId, userId)))
    .limit(1);
  if (!account) return { outcome: "not_found" };
  if (account.signConvention !== "unknown") return { outcome: "already_resolved" };

  const [sample] = await db
    .select({ raw: transactions.raw })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.userId, userId),
        eq(transactions.plaidAccountId, plaidAccountRowId),
        eq(transactions.status, "pending_review"),
        eq(transactions.pendingReason, "sign_convention_unknown"),
      ),
    )
    .limit(1);
  const rawAmount = (sample?.raw as { amount?: unknown } | null)?.amount;
  if (typeof rawAmount !== "number" || rawAmount === 0) return { outcome: "not_found" };

  const convention = conventionFromAnswer(rawAmount, answer);
  const store = createPlaidSyncStore(db);
  const resolved = await store.finalizeSignConvention(plaidAccountRowId, convention);
  if (!resolved) return { outcome: "already_resolved" };
  // The "can't confidently determine" review flag the sync raises for a stuck account is answered now; clear only
  // that flag (marker-gated), never one raised for another reason.
  if (account.accountId) await store.clearReplayReviewFlag(account.accountId, SIGN_CONVENTION_REVIEW_MARKER);
  return { outcome: "resolved", convention };
}
