/**
 * Reconnect adoption: when a bank is connected again after its earlier connection was removed (by the user's own
 * Disconnect, or by the billing lapse sweep), the new Plaid Item re-sends history the ledger already holds.
 *
 * Disconnect keeps every imported transaction, detached (`plaid_account_id` null, design §24). Plaid gives a new Item
 * NEW `transaction_id`s, so the source-ref identity cannot recognise those rows and the overlap (up to the 60 days
 * requested at Link) would land twice: spend and income would double.
 *
 * The rule (pure, deterministic):
 *  - ADOPT: a new transaction re-attaches to a kept detached row of the SAME Budgts account with the same bank date,
 *    the same signed bank amount and the same pending state, one to one. The kept row takes the new identity
 *    (`source_ref`, `plaid_account_id`) and keeps everything else, so the user's category, note and transfer choices
 *    survive and nothing is imported twice. Rows with the same name pair first. Matching is on Plaid's own raw
 *    `date` / `amount` (both feeds come from the same bank), never on our derived direction, which depends on a sign
 *    convention the new Plaid account has not resolved yet.
 *  - SUPERSEDE: a kept PENDING row on that account, dated within the new feed's coverage, that no new pending row
 *    adopted, has since posted (the posted row is in the new feed) or was cancelled. It is soft-deleted, exactly as
 *    Plaid's own `removed` would have done had the connection stayed.
 *
 * Only a Plaid account connected AFTER a kept row was imported may adopt or supersede it. That is what a reconnect
 * is, and it keeps a second, long-connected bank that the user maps into the same Budgts account from ever touching
 * the rows a disconnected one left behind.
 *
 * Why this is not content-based deduplication (which content-fingerprint.ts rules out): it only ever pairs a NEW row
 * with a row that has NO live source identity any more, inside one account, one to one. Two real identical purchases
 * stay two, because each pairs with its own kept copy; a purchase the old feed never had stays new.
 */

/** A kept, detached bank row (`source = 'bank'`, `plaid_account_id` null, not removed), with Plaid's raw facts. */
export interface DetachedBankRow {
  id: string;
  accountId: string;
  pending: boolean;
  rawDate: string | null;
  rawAmount: number | null;
  rawName: string | null;
  /** When the row was imported (`transactions.created_at`), epoch ms. */
  importedAtMs: number;
}

/** A new transaction from the reconnected Item whose `source_ref` the ledger does not hold. */
export interface ReconnectCandidate {
  sourceRef: string;
  accountId: string;
  pending: boolean;
  rawDate: string | null;
  rawAmount: number | null;
  rawName: string | null;
  /** When its Plaid account was connected (`plaid_accounts.created_at`), epoch ms. */
  connectedAtMs: number;
}

export interface ReconnectAdoptionPlan {
  /** new `source_ref` -> the kept row that takes it. */
  adopt: Map<string, string>;
  /** kept pending rows the new feed supersedes; soft-deleted. */
  supersededPending: string[];
}

const keyOf = (r: { accountId: string; pending: boolean; rawDate: string | null; rawAmount: number | null }): string | null =>
  r.rawDate && typeof r.rawAmount === "number" && Number.isFinite(r.rawAmount) ? `${r.accountId}|${r.rawDate}|${r.rawAmount}|${r.pending}` : null;

export function planReconnectAdoption(candidates: ReconnectCandidate[], detached: DetachedBankRow[]): ReconnectAdoptionPlan {
  const adopt = new Map<string, string>();
  if (detached.length === 0 || candidates.length === 0) return { adopt, supersededPending: [] };

  const pool = new Map<string, DetachedBankRow[]>();
  for (const d of [...detached].sort((a, b) => a.id.localeCompare(b.id))) {
    const k = keyOf(d);
    if (!k) continue;
    pool.set(k, [...(pool.get(k) ?? []), d]);
  }
  const groups = new Map<string, ReconnectCandidate[]>();
  for (const c of [...candidates].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef))) {
    const k = keyOf(c);
    if (!k || !pool.has(k)) continue;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }

  for (const [k, news] of groups) {
    const olds = pool.get(k)!;
    const taken = new Set<string>();
    const left: ReconnectCandidate[] = [];
    // First pass: the same name. Second: whatever is left, in id order.
    const free = (n: ReconnectCandidate, o: DetachedBankRow) => !taken.has(o.id) && n.connectedAtMs > o.importedAtMs;
    for (const n of news) {
      const same = olds.find((o) => free(n, o) && o.rawName === n.rawName);
      if (same) {
        taken.add(same.id);
        adopt.set(n.sourceRef, same.id);
      } else left.push(n);
    }
    for (const n of left) {
      const any = olds.find((o) => free(n, o));
      if (!any) continue;
      taken.add(any.id);
      adopt.set(n.sourceRef, any.id);
    }
  }

  // A kept pending row is superseded when a Plaid account connected after it was imported now covers its date (the
  // new feed's earliest bank date on that Budgts account) without a pending row that adopted it.
  const adopted = new Set(adopt.values());
  const supersededPending = detached
    .filter((d) => d.pending && !adopted.has(d.id) && d.rawDate !== null)
    .filter((d) =>
      candidates.some((c) => c.accountId === d.accountId && c.connectedAtMs > d.importedAtMs && c.rawDate !== null && c.rawDate <= d.rawDate!),
    )
    .map((d) => d.id)
    .sort();

  return { adopt, supersededPending };
}
