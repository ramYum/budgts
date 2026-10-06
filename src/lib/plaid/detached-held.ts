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
 * sync keys conventions on the Plaid account, never the Budgts account). Pure.
 */
import type { SignCheckSample } from "./connected-banks-read";

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
}

export interface DetachedHeldGroup {
  accountId: string;
  accountName: string;
  originRef: string;
  count: number;
  /** The most recent held row: the transaction the question asks about. */
  sample: SignCheckSample;
}

export const detachedGroupKey = (accountId: string, originRef: string) => `${accountId}|${originRef}`;

export function groupDetachedHeld(rows: readonly DetachedHeldRow[]): DetachedHeldGroup[] {
  const groups = new Map<string, { group: DetachedHeldGroup; sampleRow: DetachedHeldRow }>();
  for (const r of rows) {
    if (!r.originRef) continue;
    const key = detachedGroupKey(r.accountId, r.originRef);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        group: { accountId: r.accountId, accountName: r.accountName, originRef: r.originRef, count: 1, sample: toSample(r) },
        sampleRow: r,
      });
      continue;
    }
    g.group.count++;
    // Most recent first; ties by id ascending (the live question's order).
    const s = g.sampleRow;
    if (r.occurredAt > s.occurredAt || (r.occurredAt === s.occurredAt && r.id < s.id)) {
      g.sampleRow = r;
      g.group.sample = toSample(r);
    }
  }
  return [...groups.values()]
    .map((g) => g.group)
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
