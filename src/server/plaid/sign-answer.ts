import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { plaidAccounts, plaidItems, plaidSignAnswers, transactions } from "@/lib/db/schema";
import { planConventionChange } from "@/lib/plaid/held-rows";
import { undoTierBClassification } from "@/lib/plaid/transfer-pairing";
import { claimItemForSync, claimMissReason, releaseSyncClaim } from "@/lib/plaid/item-store";
import { conventionFromAnswer, SIGN_CONVENTION_REVIEW_MARKER, type MoneyFlowAnswer } from "@/lib/plaid/sign-convention";
import {
  createPlaidSyncStore,
  finalizeSignConventionIn,
  writeDirectionAndRole,
  type PlaidDb,
  type PlaidTx,
} from "@/lib/plaid/sync-store";

/** Why the bank's sync lease couldn't be taken: a sync is running, or the bank still awaits its account choices. */
export type LeaseMiss = { outcome: "busy" } | { outcome: "setting_up" };

export type SignAnswerOutcome =
  | { outcome: "resolved"; convention: "standard" | "inverted" }
  | { outcome: "already_resolved" }
  | LeaseMiss
  | { outcome: "not_found" };

export type ChangeAnswerOutcome =
  | { outcome: "changed"; convention: "standard" | "inverted"; changedRows: number }
  /** The answer already matches the account (a repeat, or a racing change got there first): nothing written. */
  | { outcome: "unchanged" }
  /** The account is still being checked: it takes the first answer, not a change. */
  | { outcome: "not_answered" }
  | LeaseMiss
  | { outcome: "not_found" };

type Owned = { signConvention: "unknown" | "standard" | "inverted"; accountId: string | null; itemId: string };

/** The account, only if it belongs to `userId` (derived from the session by the caller, never from the client). */
async function ownedAccount(db: PlaidDb, userId: string, plaidAccountRowId: string): Promise<Owned | null> {
  const [row] = await db
    .select({ signConvention: plaidAccounts.signConvention, accountId: plaidAccounts.accountId, itemId: plaidItems.itemId })
    .from(plaidAccounts)
    .innerJoin(plaidItems, eq(plaidItems.id, plaidAccounts.plaidItemId))
    .where(and(eq(plaidAccounts.id, plaidAccountRowId), eq(plaidAccounts.userId, userId)))
    .limit(1);
  return row ?? null;
}

/** The raw Plaid amount of one of the account's own live transactions (optionally only a held one), or null. */
async function sampleRawAmount(
  db: PlaidDb,
  userId: string,
  plaidAccountRowId: string,
  transactionId: string,
  heldOnly: boolean,
): Promise<number | null> {
  const [sample] = await db
    .select({ raw: transactions.raw })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.userId, userId),
        eq(transactions.plaidAccountId, plaidAccountRowId),
        isNull(transactions.removedAt),
        heldOnly ? eq(transactions.status, "pending_review") : undefined,
        heldOnly ? eq(transactions.pendingReason, "sign_convention_unknown") : undefined,
      ),
    )
    .limit(1);
  const rawAmount = (sample?.raw as { amount?: unknown } | null)?.amount;
  return typeof rawAmount === "number" && Number.isFinite(rawAmount) && rawAmount !== 0 ? rawAmount : null;
}

/**
 * Runs `work` while holding the bank's sync lease, so no sync lands rows under the convention being changed (a sync
 * reads the convention when it starts). When the lease can't be taken, says why (`claimMissReason`): a sync is
 * running, or the bank still awaits its account choices.
 *
 * Taking the lease sets `needs_sync`, and releasing it settles that flag. So the release passes on what was pending
 * before the claim, read atomically by the claim itself (`priorNeedsSync`): a sync a webhook had already requested
 * stays requested (otherwise it would wait for the stale sweep), and none is left behind when nothing was pending. A
 * webhook arriving after the claim is kept by the release itself (`last_webhook_at >= sync_claimed_at`).
 */
async function underSyncLease<T>(
  db: PlaidDb,
  itemId: string,
  work: () => Promise<T>,
): Promise<{ done: T } | LeaseMiss | { outcome: "not_found" }> {
  const claim = await claimItemForSync(db, itemId, { kind: "requested" });
  if (!claim) {
    const miss = await claimMissReason(db, itemId);
    if (miss.kind === "gone") return { outcome: "not_found" };
    return miss.kind === "busy" ? { outcome: "busy" } : { outcome: "setting_up" };
  }
  try {
    return { done: await work() };
  } finally {
    await releaseSyncClaim(db, itemId, claim.token, claim.priorNeedsSync);
  }
}

/**
 * The exit for an account whose transaction format never settles (design: 2026-10-01 card payments §5). Connected
 * banks shows one of the account's held transactions and asks "Was this money going out or coming in?"; the answer
 * decides the account's sign convention and releases every held row through `finalizeSignConventionIn`, the same
 * code the sync's own evidence uses. Recorded in `plaid_sign_answers` with every released row's old values.
 *
 * Server-only and Drizzle (it writes rows the user's RLS client can't flip in one pass), so ownership is checked here
 * explicitly: the account and the sample transaction must both belong to `userId`, the transaction must be one of
 * that account's held rows, and the account must still be unresolved. The raw sign comes from the immutable Plaid
 * payload, never the editable `direction`.
 */
export async function resolveSignConventionFromAnswer(
  db: PlaidDb,
  userId: string,
  plaidAccountRowId: string,
  transactionId: string,
  answer: MoneyFlowAnswer,
): Promise<SignAnswerOutcome> {
  const account = await ownedAccount(db, userId, plaidAccountRowId);
  if (!account) return { outcome: "not_found" };
  if (account.signConvention !== "unknown") return { outcome: "already_resolved" };
  const rawAmount = await sampleRawAmount(db, userId, plaidAccountRowId, transactionId, true);
  if (rawAmount == null) return { outcome: "not_found" };
  const convention = conventionFromAnswer(rawAmount, answer);

  const result = await underSyncLease(db, account.itemId, () =>
    db.transaction(async (tx) => {
      const done = await finalizeSignConventionIn(tx, plaidAccountRowId, convention);
      if (!done) return false;
      await tx.insert(plaidSignAnswers).values({
        userId,
        plaidAccountId: plaidAccountRowId,
        kind: "answer",
        answer,
        sampleTransactionId: transactionId,
        fromConvention: "unknown",
        toConvention: convention,
        changedRows: done.released,
      });
      return true;
    }),
  );
  if (!("done" in result)) return result;
  if (!result.done) return { outcome: "already_resolved" };
  // The "can't confidently determine" review flag the sync raises for a stuck account is answered now; clear only
  // that flag (marker-gated), never one raised for another reason.
  if (account.accountId) {
    await createPlaidSyncStore(db).clearReplayReviewFlag(account.accountId, SIGN_CONVENTION_REVIEW_MARKER);
  }
  return { outcome: "resolved", convention };
}

/**
 * "Change answer" (design: 2026-10-01 card payments §5a): the user answers the question again for a resolved account
 * (one they answered for, or, from "Amounts on this account look reversed?", one the sync resolved from evidence),
 * and a different answer flips the account's convention. Every row whose direction came from
 * the old convention is re-evaluated by `planConventionChange` (corrected direction, recomputed event role); a row
 * set some other way (the user's own edit) is left alone. A re-evaluated row that was paired as a transfer is
 * unlinked from its partner, since the pair was matched on the old direction, and a leg that was only a transfer
 * because pairing classified it goes back to its own signal (`undoTierBClassification`); the next sync re-pairs a
 * pair that still matches. Every old value is recorded in `plaid_sign_answers`.
 *
 * Same ownership checks as the answer, against the session user. Idempotent: an answer that matches the account
 * changes nothing. Race-safe: it holds the bank's sync lease, and the convention flips only from the value read,
 * under the row lock of a conditional UPDATE, so of two racing changes the first wins and the second writes nothing.
 */
export async function changeSignConventionAnswer(
  db: PlaidDb,
  userId: string,
  plaidAccountRowId: string,
  transactionId: string,
  answer: MoneyFlowAnswer,
): Promise<ChangeAnswerOutcome> {
  const account = await ownedAccount(db, userId, plaidAccountRowId);
  if (!account) return { outcome: "not_found" };
  if (account.signConvention === "unknown") return { outcome: "not_answered" };
  const rawAmount = await sampleRawAmount(db, userId, plaidAccountRowId, transactionId, false);
  if (rawAmount == null) return { outcome: "not_found" };
  const from = account.signConvention;
  const to = conventionFromAnswer(rawAmount, answer);
  if (to === from) return { outcome: "unchanged" };

  const result = await underSyncLease(db, account.itemId, () =>
    db.transaction((tx) => flipConvention(tx, userId, plaidAccountRowId, transactionId, answer, from, to)),
  );
  if (!("done" in result)) return result;
  if (result.done < 0) return { outcome: "unchanged" };
  return { outcome: "changed", convention: to, changedRows: result.done };
}

/** The flip itself, in one transaction. Returns the number of re-evaluated rows, or -1 when the account no longer
 * holds `from` (a racing change won). */
async function flipConvention(
  tx: PlaidTx,
  userId: string,
  plaidAccountRowId: string,
  transactionId: string,
  answer: MoneyFlowAnswer,
  from: "standard" | "inverted",
  to: "standard" | "inverted",
): Promise<number> {
  const [acct] = await tx
    .update(plaidAccounts)
    .set({ signConvention: to, updatedAt: sql`now()` })
    .where(
      and(eq(plaidAccounts.id, plaidAccountRowId), eq(plaidAccounts.userId, userId), eq(plaidAccounts.signConvention, from)),
    )
    .returning({ type: plaidAccounts.type });
  if (!acct) return -1;

  const rows = await tx
    .select({
      id: transactions.id,
      direction: transactions.direction,
      status: transactions.status,
      pendingReason: transactions.pendingReason,
      eventRole: transactions.eventRole,
      primary: transactions.plaidCategoryPrimary,
      detailed: transactions.plaidCategoryDetailed,
      isTransfer: transactions.isTransfer,
      transferPairId: transactions.transferPairId,
      transferUserSet: transactions.transferUserSet,
      rawAmount: sql<number | null>`case when jsonb_typeof(${transactions.raw}->'amount') = 'number'
        then (${transactions.raw}->>'amount')::float8 end`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.plaidAccountId, plaidAccountRowId),
        eq(transactions.userId, userId),
        eq(transactions.source, "bank"),
        isNull(transactions.removedAt),
      ),
    );
  const planned = planConventionChange(
    rows.map((r) => ({ ...r, rawAmount: r.rawAmount == null ? null : Number(r.rawAmount) })),
    from,
    to,
    acct.type ?? null,
  );
  await writeDirectionAndRole(tx, planned, false);

  const plannedIds = new Set(planned.map((p) => p.id));
  const newById = new Map(planned.map((p) => [p.id, p]));
  const changed = rows.filter((r) => plannedIds.has(r.id));

  // A pair was matched on the old direction: unlink both legs (the next sync re-pairs a pair that still matches),
  // and return a leg that was only a transfer because pairing classified it to its own signal.
  const pairedIds = changed.filter((r) => r.transferPairId != null).map((r) => r.id);
  const restored: Record<string, unknown>[] = [];
  if (pairedIds.length > 0) {
    const partners = await tx
      .select({
        id: transactions.id,
        direction: transactions.direction,
        eventRole: transactions.eventRole,
        isTransfer: transactions.isTransfer,
        primary: transactions.plaidCategoryPrimary,
        detailed: transactions.plaidCategoryDetailed,
        transferUserSet: transactions.transferUserSet,
        transferPairId: transactions.transferPairId,
        accountType: plaidAccounts.type,
      })
      .from(transactions)
      .leftJoin(plaidAccounts, eq(plaidAccounts.id, transactions.plaidAccountId))
      .where(and(eq(transactions.userId, userId), inArray(transactions.transferPairId, pairedIds)));
    const legs = [
      ...changed
        .filter((r) => r.transferPairId != null)
        .map((r) => ({ ...r, direction: newById.get(r.id)!.direction, accountType: acct.type ?? null, partner: false })),
      ...partners.map((p) => ({ ...p, partner: true })),
    ];
    for (const leg of legs) {
      const undo = undoTierBClassification(leg, leg.accountType ?? null);
      await tx
        .update(transactions)
        .set(undo ? { transferPairId: null, isTransfer: false, eventRole: undo.eventRole } : { transferPairId: null })
        .where(and(eq(transactions.id, leg.id), eq(transactions.userId, userId)));
      if (leg.partner) {
        // A partner keeps its direction; its link (and a pairing-only transfer) is all that changes.
        restored.push({
          id: leg.id,
          transferPairId: leg.transferPairId,
          ...(undo ? { isTransfer: leg.isTransfer, eventRole: leg.eventRole } : {}),
          partnerUnlinked: true,
        });
      } else if (undo) {
        restored.push({ id: leg.id, isTransfer: leg.isTransfer, tierBUndone: true });
      }
    }
  }

  await tx.insert(plaidSignAnswers).values({
    userId,
    plaidAccountId: plaidAccountRowId,
    kind: "change",
    answer,
    sampleTransactionId: transactionId,
    fromConvention: from,
    toConvention: to,
    changedRows: [
      ...changed.map((r) => ({
        id: r.id,
        direction: r.direction,
        status: r.status,
        pendingReason: r.pendingReason,
        eventRole: r.eventRole,
        transferPairId: r.transferPairId,
      })),
      // Partners (old link, and old transfer fields when pairing had classified them), and re-evaluated legs whose
      // pairing-only transfer was undone (their old is_transfer; old role and link are in their entry above).
      ...restored,
    ],
  });
  return planned.length;
}
