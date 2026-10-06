import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";
import { accountWritesLocked } from "@/lib/account/write-lock";
import { accountBankIdentities, accounts, detachedSignAnswers, transactions } from "@/lib/db/schema";
import { detachedGroupRef } from "@/lib/plaid/detached-held";
import { planHeldRowRelease, usableRawAmount } from "@/lib/plaid/held-rows";
import { conventionFromAnswer, type MoneyFlowAnswer } from "@/lib/plaid/sign-convention";
import { rawAmountSql, withRawNumber, writeDirectionAndRole, type PlaidDb, type PlaidTx } from "@/lib/plaid/sync-store";
import { conventionChangeColumns, reevaluateUnderConvention } from "./sign-answer";

/**
 * The exit for held rows a removed bank left behind (design: docs/specs/2026-10-01-card-payments-design.md §5c).
 *
 * Disconnecting a bank deletes its Plaid accounts and detaches their transactions (`plaid_account_id` null). A row
 * still held because its account's sign convention was unknown then had no exit: §5's question is asked per Plaid
 * account. Here the same question is asked per group of detached held rows: one Budgts account and one original bank
 * feed (Plaid's `account_id` in the immutable raw payload; detached-held.ts). The answer, compared with the raw sign
 * of the transaction asked about, gives that feed's convention (`conventionFromAnswer`), and every held row of the
 * group is released by the same `planHeldRowRelease` the sync and §5 use. A different answer later flips exactly the
 * rows the answer released (§5a's "Change answer"), through the same `reevaluateUnderConvention`.
 *
 * Server-only and Drizzle (it writes rows the user's RLS client can't flip in one pass), so ownership is checked here:
 * the transaction must belong to `userId` (from the session, never the client), be a bank row, detached and live. The
 * group comes from that row, never from client input. Concurrent answers for one group serialize on a transaction-
 * scoped advisory lock, and rows are read FOR UPDATE, so a reconnect adopting one of them (which only claims a row
 * still detached) and an answer can't both write it. Every write is recorded in `detached_sign_answers` (migration
 * 0028) with the changed rows' old values.
 *
 * The event-role resolver takes the Plaid account type, as the live adapter does (row 1b, a card's incoming payment,
 * depends on it). The Plaid account is gone, so it comes from `account_bank_identities` (migration 0027): the type when
 * every identity recorded on the Budgts account has that one type, otherwise null (never guesses a card).
 *
 * Refused while an account deletion holds the write lock (migration 0021): these writes go through Drizzle as the DB
 * owner, which the database guard doesn't see, so the lock is checked here first (`accountWritesLocked`, the guard's
 * own function, through the user's client).
 */

/** The caller's own Supabase client, used only to ask the deletion write lock (`accountWritesLocked`). */
export type WriteLockClient = Pick<SupabaseClient, "rpc">;

export type DetachedAnswerOutcome =
  | { outcome: "resolved"; convention: "standard" | "inverted"; released: number }
  /** No held rows left in the group (a racing answer, or a reconnect adopted them): nothing written. */
  | { outcome: "already_resolved" }
  /** An account deletion has started: nothing written. */
  | { outcome: "locked" }
  | { outcome: "not_found" };

export type DetachedChangeOutcome =
  | { outcome: "changed"; convention: "standard" | "inverted"; changedRows: number }
  | { outcome: "unchanged" }
  /** The group still has held rows, or was never answered: it takes the first answer instead. */
  | { outcome: "not_answered" }
  | { outcome: "locked" }
  | { outcome: "not_found" };

/** `originRef` is the group ref (detached-held.ts): Plaid's `account_id`, or `row:<id>` for a row naming no feed. */
type Sample = { accountId: string; originRef: string; rowOnly: string | null; rawAmount: number; accountType: string | null };

/** The Plaid type the Budgts account's recorded bank identities agree on, or null (none, mixed, or blank). */
async function identityType(db: PlaidDb, userId: string, accountId: string): Promise<string | null> {
  const rows = await db
    .selectDistinct({ type: accountBankIdentities.type })
    .from(accountBankIdentities)
    .where(and(eq(accountBankIdentities.userId, userId), eq(accountBankIdentities.accountId, accountId)));
  return rows.length === 1 && rows[0]!.type !== "" ? rows[0]!.type : null;
}

/** The transaction asked about, only if it is `userId`'s own live, detached bank row with a usable raw sign. */
async function ownedDetachedSample(db: PlaidDb, userId: string, transactionId: string, heldOnly: boolean): Promise<Sample | null> {
  const [row] = await db
    .select({
      accountId: transactions.accountId,
      originRef: sql<string | null>`${transactions.raw}->>'account_id'`,
      rawAmount: rawAmountSql,
    })
    .from(transactions)
    .innerJoin(accounts, and(eq(accounts.id, transactions.accountId), eq(accounts.userId, userId)))
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.userId, userId),
        eq(transactions.source, "bank"),
        isNull(transactions.plaidAccountId),
        isNull(transactions.removedAt),
        heldOnly ? eq(transactions.status, "pending_review") : undefined,
        heldOnly ? eq(transactions.pendingReason, "sign_convention_unknown") : undefined,
      ),
    )
    .limit(1);
  if (!row) return null;
  const raw = row.rawAmount == null ? null : Number(row.rawAmount);
  if (!usableRawAmount(raw)) return null;
  return {
    accountId: row.accountId,
    originRef: detachedGroupRef(row.originRef, transactionId),
    rowOnly: row.originRef ? null : transactionId,
    rawAmount: raw,
    accountType: await identityType(db, userId, row.accountId),
  };
}

/** Serializes every write to one group for the rest of the caller's transaction. */
async function lockGroup(tx: PlaidTx, userId: string, s: Sample): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`detached-sign:${userId}:${s.accountId}:${s.originRef}`}, 0))`);
}

/** The group's rows: this user's detached bank rows on the account, from the same original feed (or the one row). */
const inGroup = (userId: string, s: Sample) =>
  and(
    eq(transactions.userId, userId),
    eq(transactions.accountId, s.accountId),
    eq(transactions.source, "bank"),
    isNull(transactions.plaidAccountId),
    s.rowOnly
      ? and(eq(transactions.id, s.rowOnly), sql`${transactions.raw}->>'account_id' is null`)
      : sql`${transactions.raw}->>'account_id' = ${s.originRef}`,
  );

const heldInGroup = (userId: string, s: Sample) =>
  and(inGroup(userId, s), eq(transactions.status, "pending_review"), eq(transactions.pendingReason, "sign_convention_unknown"));

export async function resolveDetachedHeldFromAnswer(
  db: PlaidDb,
  writeLock: WriteLockClient,
  userId: string,
  transactionId: string,
  answer: MoneyFlowAnswer,
): Promise<DetachedAnswerOutcome> {
  if (await accountWritesLocked(writeLock)) return { outcome: "locked" };
  const sample = await ownedDetachedSample(db, userId, transactionId, true);
  if (!sample) return { outcome: "not_found" };
  const convention = conventionFromAnswer(sample.rawAmount, answer);

  return db.transaction(async (tx) => {
    await lockGroup(tx, userId, sample);
    // Removed copies are released too, as finalizeSignConvention does: they count nowhere either way.
    const held = await tx
      .select({
        id: transactions.id,
        direction: transactions.direction,
        status: transactions.status,
        pendingReason: transactions.pendingReason,
        eventRole: transactions.eventRole,
        primary: transactions.plaidCategoryPrimary,
        detailed: transactions.plaidCategoryDetailed,
        isTransfer: transactions.isTransfer,
        rawAmount: rawAmountSql,
      })
      .from(transactions)
      .where(heldInGroup(userId, sample))
      .orderBy(transactions.id)
      .for("update");
    if (held.length === 0) return { outcome: "already_resolved" } as const;

    await writeDirectionAndRole(tx, planHeldRowRelease(held.map(withRawNumber), convention, sample.accountType), true);
    await tx.insert(detachedSignAnswers).values({
      userId,
      accountId: sample.accountId,
      originAccountRef: sample.originRef,
      kind: "answer",
      answer,
      sampleTransactionId: transactionId,
      fromConvention: "unknown",
      toConvention: convention,
      changedRows: held.map((r) => ({
        id: r.id,
        direction: r.direction,
        status: r.status,
        pendingReason: r.pendingReason,
        eventRole: r.eventRole,
      })),
    });
    return { outcome: "resolved", convention, released: held.length } as const;
  });
}

export async function changeDetachedHeldAnswer(
  db: PlaidDb,
  writeLock: WriteLockClient,
  userId: string,
  transactionId: string,
  answer: MoneyFlowAnswer,
): Promise<DetachedChangeOutcome> {
  if (await accountWritesLocked(writeLock)) return { outcome: "locked" };
  const sample = await ownedDetachedSample(db, userId, transactionId, false);
  if (!sample) return { outcome: "not_found" };
  const to = conventionFromAnswer(sample.rawAmount, answer);

  return db.transaction(async (tx) => {
    await lockGroup(tx, userId, sample);
    const [stillHeld] = await tx.select({ id: transactions.id }).from(transactions).where(heldInGroup(userId, sample)).limit(1);
    if (stillHeld) return { outcome: "not_answered" } as const;
    const answers = await tx
      .select({ kind: detachedSignAnswers.kind, toConvention: detachedSignAnswers.toConvention, changedRows: detachedSignAnswers.changedRows })
      .from(detachedSignAnswers)
      .where(
        and(
          eq(detachedSignAnswers.userId, userId),
          eq(detachedSignAnswers.accountId, sample.accountId),
          eq(detachedSignAnswers.originAccountRef, sample.originRef),
        ),
      )
      .orderBy(desc(detachedSignAnswers.createdAt), desc(detachedSignAnswers.id));
    if (answers.length === 0) return { outcome: "not_answered" } as const;
    const from = answers[0]!.toConvention;
    if (from === "unknown") return { outcome: "not_answered" } as const; // unreachable: the CHECK forbids it
    if (to === from) return { outcome: "unchanged" } as const;

    // Exactly the rows the answer released: a change undoes what an answer did, never touches the account's other
    // history (rows from before conventions existed, or another way in).
    const released = [
      ...new Set(
        answers
          .filter((a) => a.kind === "answer")
          .flatMap((a) => (Array.isArray(a.changedRows) ? (a.changedRows as { id?: unknown }[]) : []))
          .map((r) => r.id)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    const rows =
      released.length === 0
        ? []
        : await tx
            .select(conventionChangeColumns)
            .from(transactions)
            .where(and(inGroup(userId, sample), isNull(transactions.removedAt), inArray(transactions.id, released)))
            .orderBy(transactions.id)
            .for("update");
    const { changed, count } = await reevaluateUnderConvention(tx, userId, rows, from, to, sample.accountType);
    await tx.insert(detachedSignAnswers).values({
      userId,
      accountId: sample.accountId,
      originAccountRef: sample.originRef,
      kind: "change",
      answer,
      sampleTransactionId: transactionId,
      fromConvention: from,
      toConvention: to,
      changedRows: changed,
    });
    return { outcome: "changed", convention: to, changedRows: count } as const;
  });
}
