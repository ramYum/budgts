/**
 * Detects when a Plaid connection's initial transaction backfill fell short
 * of the historical window Budgts requested at Link time (60 days —
 * `days_requested` in `/api/plaid/link-token`). `days_requested` is a
 * request, not a guarantee: Plaid's own docs note actual depth varies by
 * institution, and some institutions only return transactions from the
 * connection date forward. That's silent otherwise — the account just looks
 * like it has less spending than it really does for dates before connection.
 * Design: 2026-09-14 investigation (production SoFi connection returned zero
 * pre-connection history while Capital One/Advancial on the same account
 * backfilled correctly).
 */

/** ISO 8601 timestamp's calendar-date portion (`YYYY-MM-DD`), UTC. Postgres's
 * ISO output is always zero-padded, so lexicographic and calendar-date
 * comparison agree — no `Date` parsing/timezone pitfalls needed. */
function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * True when `earliestTxnAt` lands on or after the calendar day the item was
 * connected — i.e. nothing came back for any date before connection, which
 * is the signature of a short-changed historical backfill rather than a
 * genuinely new account (a real backfill would show at least some days
 * before the connection date, even if fewer than the 60 requested).
 */
export function hasLimitedHistory(connectedAt: string, earliestTxnAt: string | null): boolean {
  if (!earliestTxnAt) return false;
  return dateOnly(earliestTxnAt) >= dateOnly(connectedAt);
}

function formatDate(iso: string): string {
  return new Date(`${dateOnly(iso)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export interface HistoryCoverageInput {
  institutionName: string | null;
  connectedAt: string;
  earliestTxnAt: string | null;
}

/** One advisory string per flagged connection, in input order. */
export function buildLimitedHistoryMessages(inputs: HistoryCoverageInput[]): string[] {
  return inputs
    .filter((i) => hasLimitedHistory(i.connectedAt, i.earliestTxnAt))
    .map((i) => {
      const name = i.institutionName ?? "this connection";
      const date = formatDate(i.earliestTxnAt!);
      return `Limited history from ${name}. Transactions only go back to ${date} — spending before that won't appear in your budgets for this account.`;
    });
}
