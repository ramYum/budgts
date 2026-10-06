/**
 * Held rows from a removed bank connection (design: docs/specs/2026-10-01-card-payments-design.md §5c).
 *
 * A row lands held (`pending_review` / `sign_convention_unknown`) while its Plaid account's sign convention is unknown.
 * Disconnecting the bank deletes that Plaid account, and `transactions.plaid_account_id` is `ON DELETE SET NULL`, so the
 * row is kept but detached: nothing lists it under a connected bank any more, and the per-account question (§5) can't
 * reach it. This module groups those rows for the same plain question, asked under the Budgts account they live in.
 *
 * A group is one Budgts account AND one original bank feed (Plaid's `account_id` in the immutable raw payload). Two
 * feeds mapped into one Budgts account are never pooled: each bank may report signs its own way (the same reason the
 * sync keys conventions on the Plaid account, never the Budgts account). A row whose payload lacks Plaid's
 * `account_id` is its own group, ref `row:<transaction id>` (never pooled, never dropped; Plaid account ids contain no
 * colon, so the two kinds of ref can't collide). Pure.
 */
import type { SignCheckSample } from "./connected-banks-read";
import { pickQuestionSample } from "./held-rows";

/** A held, detached, live bank row as read for the question. */
export interface DetachedHeldRow {
  id: string;
  accountId: string;
  accountName: string;
  /** Plaid's `account_id` from the row's raw payload: which bank feed it came from. Null when the payload lacks it. */
  originRef: string | null;
  description: string;
  occurredAt: string;
  /** Minor units, unsigned. */
  amount: number;
  currency: string;
  /** The immutable Plaid payload amount (`raw.amount`); null when absent or not a number. */
  rawAmount: number | null;
}

export interface DetachedHeldGroup {
  accountId: string;
  accountName: string;
  /** The group's feed ref: Plaid's `account_id`, or `row:<id>` for a row whose payload lacks it. */
  originRef: string;
  count: number;
  /** The transaction the question asks about (`pickQuestionSample`). */
  sample: SignCheckSample;
}

export const ROW_GROUP_PREFIX = "row:";

/** A row's group ref: its original feed, or the row itself when the payload doesn't say. */
export const detachedGroupRef = (originRef: string | null, transactionId: string) => originRef ?? `${ROW_GROUP_PREFIX}${transactionId}`;

export const detachedGroupKey = (accountId: string, originRef: string) => `${accountId}|${originRef}`;

export function groupDetachedHeld(rows: readonly DetachedHeldRow[]): DetachedHeldGroup[] {
  const groups = new Map<string, { accountId: string; accountName: string; originRef: string; rows: DetachedHeldRow[] }>();
  for (const r of rows) {
    const ref = detachedGroupRef(r.originRef, r.id);
    const key = detachedGroupKey(r.accountId, ref);
    const g = groups.get(key);
    if (g) g.rows.push(r);
    else groups.set(key, { accountId: r.accountId, accountName: r.accountName, originRef: ref, rows: [r] });
  }
  return [...groups.values()]
    .map((g) => ({
      accountId: g.accountId,
      accountName: g.accountName,
      originRef: g.originRef,
      count: g.rows.length,
      sample: toSample(pickQuestionSample(g.rows)!),
    }))
    .sort((a, b) => a.accountName.localeCompare(b.accountName) || a.accountId.localeCompare(b.accountId) || a.originRef.localeCompare(b.originRef));
}

const toSample = (r: DetachedHeldRow): SignCheckSample => ({
  transactionId: r.id,
  description: r.description,
  occurredAt: r.occurredAt,
  amount: r.amount,
  currency: r.currency,
});

export interface DetachedAnswerRow {
  accountId: string;
  originRef: string;
  sampleTransactionId: string | null;
  createdAt: string;
}

export interface LatestDetachedAnswer {
  accountId: string;
  originRef: string;
  sampleTransactionId: string | null;
  answeredAt: string;
}

/**
 * The newest answer per group, for "Change answer" (§5a's exit, for detached rows). A group that still has held rows
 * is asked the first question instead, so it is left out.
 */
export function latestDetachedAnswers(answers: readonly DetachedAnswerRow[], stillHeld: ReadonlySet<string>): LatestDetachedAnswer[] {
  const latest = new Map<string, DetachedAnswerRow>();
  for (const a of answers) {
    const key = detachedGroupKey(a.accountId, a.originRef);
    if (stillHeld.has(key)) continue;
    const cur = latest.get(key);
    if (!cur || a.createdAt > cur.createdAt) latest.set(key, a);
  }
  return [...latest.values()]
    .sort((a, b) => a.accountId.localeCompare(b.accountId) || a.originRef.localeCompare(b.originRef))
    .map((a) => ({ accountId: a.accountId, originRef: a.originRef, sampleTransactionId: a.sampleTransactionId, answeredAt: a.createdAt }));
}
