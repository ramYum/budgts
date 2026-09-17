/**
 * Bill detection (V1.5) — a pure classification layer on top of an
 * already-detected {@link recurringSeries} row, in the same shape as
 * subscription-detection.ts. No cadence detection, no membership detection,
 * no gap-break, no watermark logic — all of that belongs exclusively to
 * recurring-detection.ts / recurring-engine.ts / recurring-store.ts and is
 * untouched by this module. Design: docs/specs/2026-09-17-bill-detection-
 * design.md.
 *
 * A "bill" here means a recurring, essentially non-discretionary financial
 * obligation — rent, a utility connection, an insurance premium, a loan
 * payment — where non-payment has a real consequence (eviction, service
 * cutoff, lapsed coverage, default). This is deliberately the OPPOSITE end
 * of the spectrum from a subscription (discretionary, cancellable at will):
 * a series already classified as a subscription by {@link classifySubscription}
 * is never also evaluated as a bill (see recurring-engine.ts's explicit
 * precedence, and this module's own docstring on {@link classifyBill}).
 *
 * ## Approved V1.5 scope (conservative on purpose)
 *
 * Only the six `RENT_AND_UTILITIES_*` Plaid PFC `detailed` subtypes are
 * positive evidence. Two of the roadmap's named bill types — insurance and
 * loan/debt payments — are structurally unreachable today and are NOT
 * worked around here:
 *
 *  - Insurance premiums are Plaid `GENERAL_SERVICES_INSURANCE`, and
 *    `GENERAL_SERVICES` is excluded from recurring-series candidacy itself
 *    (recurring-store.ts's `EXCLUDED_PRIMARIES`) — a transaction shaped
 *    this way never even becomes a `recurring_series` row, so it can never
 *    reach this classifier. `merchant-knowledge.ts`'s `"Insurances"`
 *    merchant list is genuinely clean (unlike its `"Entertainment"`/
 *    `"Personal Care"` buckets) but is unusable while this upstream
 *    exclusion stands.
 *  - Real loan payments (mortgage/auto/student/personal loan) never
 *    resolve to an eligible `EventRole` at all: `resolveEventRole()`
 *    (event-role.ts) only maps `LOAN_PAYMENTS` + `LOAN_PAYMENTS_CREDIT_
 *    CARD_PAYMENT` to `CARD_PAYMENT` (itself excluded from candidacy);
 *    every other `LOAN_PAYMENTS` detailed subtype falls through every row
 *    of that resolution table and returns `null` (unresolved), which is
 *    never candidacy-eligible either.
 *
 * Fixing either requires touching recurring-detection.ts's candidacy rules
 * or event-role.ts, both explicitly out of scope for this phase. Documented
 * here rather than silently omitted, per the same discipline
 * subscription-detection.ts applied to its own merchant-knowledge gap.
 */
import type { EventRole } from "./types";

/** Mirrors the persisted `recurring_series.status` values, duplicated here
 * (not imported from subscription-detection.ts) rather than shared — same
 * "stays fully independent" reasoning subscription-detection.ts states for
 * its own copy of this type: neither classifier should depend on the
 * other's module. */
export type SeriesLifecycleStatus = "CANDIDATE" | "ACTIVE" | "MUTED";

export interface BillEvidence {
  status: SeriesLifecycleStatus;
  eventRole: EventRole;
  /** Defense-in-depth, mirroring subscription-detection.ts's treatment of
   * primaries that can't structurally reach this function today:
   * `eventRole === "PURCHASE"` already implies `direction === "debit"`
   * per event-role.ts's resolution table (row 7 only ever assigns PURCHASE
   * for a debit), so this check can never actually fire while that
   * invariant holds — stated explicitly anyway, per design requirement,
   * rather than left as an accident of upstream behavior. */
  direction: "debit" | "credit";
  plaidCategoryPrimary: string | null;
  plaidCategoryDetailed: string | null;
}

/**
 * The six Plaid PFC `detailed` subtypes trusted as positive bill evidence —
 * all under the `RENT_AND_UTILITIES` primary, which is NOT excluded from
 * recurring-series candidacy (unlike `GENERAL_MERCHANDISE`/
 * `GENERAL_SERVICES`). Note `RENT_AND_UTILITIES_RENT` is deliberately
 * trusted HERE even though category-map.ts's own `TRUSTED_DETAILED` set
 * excludes it there as "fuzzy" for categorization purposes (rent can
 * include roommate splits, partial payments, ...). That exclusion answers a
 * different question ("can we auto-file this to one category with
 * confidence") than this one ("does this cadence-confirmed, amount-
 * consistent series represent a recurring obligation") — a stated,
 * deliberate divergence, not an inconsistency.
 */
const TRUSTED_BILL_DETAILED = new Set<string>([
  "RENT_AND_UTILITIES_RENT",
  "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY",
  "RENT_AND_UTILITIES_INTERNET_AND_CABLE",
  "RENT_AND_UTILITIES_TELEPHONE",
  "RENT_AND_UTILITIES_WATER",
  "RENT_AND_UTILITIES_SEWAGE_AND_WASTE",
]);

/**
 * Deterministic, no I/O, no ML. Conservative by construction, same posture
 * as {@link classifySubscription}: the only way to return `true` is a
 * positive hit on {@link TRUSTED_BILL_DETAILED}; a bare `RENT_AND_UTILITIES`
 * primary with no (or an untrusted) detailed subtype, or any other
 * primary, resolves to `false`. Cadence is never evidence — every candidate
 * reaching this function already has a validated cadence by virtue of
 * being an `ACTIVE` `recurring_series`, which proves only that it repeats,
 * not what kind of relationship it is. Never mutates or reads anything;
 * calling it twice with identical evidence always returns the identical
 * result.
 *
 * Callers MUST apply subscription-before-bill precedence themselves (see
 * recurring-engine.ts) — this function does not know about subscription
 * classification and never will, per this module's "stays fully
 * independent" design.
 */
export function classifyBill(evidence: BillEvidence): boolean {
  if (evidence.status !== "ACTIVE") return false;
  if (evidence.eventRole !== "PURCHASE") return false;
  if (evidence.direction !== "debit") return false;
  if (evidence.plaidCategoryDetailed && TRUSTED_BILL_DETAILED.has(evidence.plaidCategoryDetailed)) {
    return true;
  }
  return false;
}

export type DueState = "UPCOMING" | "DUE" | "LATE";

/**
 * Calendar-day grace window after `nextExpectedAt` during which a bill with
 * no newer linked observation is still `DUE` rather than `LATE`. Isolated
 * as its own named constant (not derived from cadence, unlike
 * recurring-detection.ts's `GAP_BREAK_MULTIPLIER`) so it can be retuned
 * later without touching recurring-detection.ts or bill classification
 * itself — this is a UX/product threshold, not a detection one.
 */
export const BILL_DUE_GRACE_DAYS = 3;

export interface DueStateInput {
  /** The series' current `next_expected_at`, as already computed and
   * persisted by recurring-detection.ts — never recomputed here. */
  nextExpectedAt: string;
  /**
   * Whether a transaction genuinely belonging to this exact series has
   * landed after the series' `last_occurred_at`. The caller MUST compute
   * this via the strongest identity the data model already provides —
   * `transactions.recurring_stream_id = <this series id>` AND
   * `occurred_at > last_occurred_at` — never a fuzzy amount/date proximity
   * guess. `recurring_stream_id` is only ever set by recurring-store.ts's
   * `applySeriesUpdate` for a transaction that has ALREADY passed the full
   * candidacy + amount-tolerance + cadence-membership validation for this
   * exact series (recurring-detection.ts's `filterAmountConsistentMembers`
   * / `truncateToCadenceValidatedSuffix`), so this is the same membership
   * decision the detector itself already made and persisted, not a new
   * matching heuristic invented here.
   *
   * KNOWN LIMITATION: `recurring_stream_id` is only assigned during the
   * nightly `plaid-recurring-scan` cron's `applySeriesUpdate` step, not the
   * instant a transaction lands. A bill payment that posted earlier today
   * will NOT be visible via this identity until the next scheduled scan
   * links it — so `dueState()` called same-day, before that night's cron
   * has run, may report `LATE` (or a not-yet-satisfied `DUE`) for a bill
   * that has, in fact, already been paid. This is bounded staleness
   * (at most ~24h, the cron's own cadence) inherited from the existing
   * pipeline's design, not a defect in `dueState()` — documented here
   * rather than papered over, for whoever builds a caller on top of this.
   */
  hasNewerObservation: boolean;
}

function addCalendarDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * Pure, read-time-only due-state classification for a series already
 * confirmed to be a bill — never called from the cron, never persisted,
 * never caches anything (mirrors recurring-detection.ts's `isLikelyEnded`:
 * "read fresh, decide fresh," no background job required for the answer to
 * change as time passes). Does not query the database itself; the caller
 * supplies {@link DueStateInput.hasNewerObservation} (see its docstring for
 * exactly how that must be computed).
 *
 * No `MISSED` state yet (explicit product decision) — `LATE` is the
 * terminal state in this first policy. A newer observation for this series
 * always suppresses `LATE`, regardless of how far past the grace window
 * `now` is — "do not report the bill as late/missed once it has actually
 * been paid" holds even for a bill that paid unusually late.
 */
export function dueState(input: DueStateInput, now: Date = new Date()): DueState {
  const nowMs = now.getTime();
  const dueMs = new Date(input.nextExpectedAt).getTime();

  if (nowMs < dueMs) return "UPCOMING";
  if (input.hasNewerObservation) return "DUE";

  const graceDeadlineMs = new Date(addCalendarDaysIso(input.nextExpectedAt, BILL_DUE_GRACE_DAYS)).getTime();
  if (nowMs <= graceDeadlineMs) return "DUE";
  return "LATE";
}
