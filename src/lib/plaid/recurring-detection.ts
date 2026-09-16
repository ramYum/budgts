/**
 * Recurring transaction detection (V1.5) — pure, deterministic, no AI/LLM.
 * No I/O: the caller (recurring-store.ts) loads the eligible candidate
 * history for one (user, merchant, account, direction) group and this module
 * decides the resulting series state. Design:
 * docs/specs/2026-09-16-recurring-detection-design.md.
 *
 * Recomputes fresh from the FULL current observation snapshot every run
 * (not an incremental delta) — the candidate windows this module receives
 * are small (a bounded lookback per merchant group), so a full recompute is
 * simple, idempotent, and avoids incremental-state bugs.
 *
 * This module never decides financial totals. It only ever proposes
 * `recurring_series` field values and which transaction ids to link via
 * `recurring_stream_id` — descriptive metadata, never a ledger fact.
 */

export type Cadence = "WEEKLY" | "BIWEEKLY" | "SEMIMONTHLY" | "MONTHLY" | "ANNUAL";
export type SeriesStatus = "CANDIDATE" | "ACTIVE";

/** Typical interval length per cadence, in days — used for `nextExpectedAt`
 * projection and as the gap-break threshold's base (3x this value). */
export const CADENCE_TYPICAL_DAYS: Record<Cadence, number> = {
  WEEKLY: 7,
  BIWEEKLY: 14,
  SEMIMONTHLY: 15,
  MONTHLY: 30,
  ANNUAL: 365,
};

/** A gap exceeding this multiple of the existing cadence's typical interval
 * resets the detection window instead of averaging across a long silence. */
const GAP_BREAK_MULTIPLIER = 3;

/** Minimum matching observations before a series is user-visible (2
 * confirmed intervals) — product rule, not a derived fact. */
const MIN_OBSERVATIONS_FOR_ACTIVE = 3;

export interface RecurringObservation {
  id: string;
  /** Minor units, always > 0. */
  amount: number;
  occurredAt: string;
}

export interface SeriesSnapshot {
  cadence: Cadence;
  /** Minor units, > 0. */
  expectedAmount: number;
  amountToleranceMinor: number;
  observationCount: number;
  status: SeriesStatus;
  /** When true, cadence/expectedAmount/amountToleranceMinor are frozen by a
   * user's manual edit — the caller (store layer) is responsible for not
   * overwriting them; this module still proposes fresh values so the
   * caller has something to diff against, but never reads this flag
   * itself (mirrors userCategorized's exact column-level guard pattern). */
  overriddenByUser: boolean;
}

export interface SeriesUpdate {
  cadence: Cadence;
  expectedAmount: number;
  amountToleranceMinor: number;
  lastOccurredAt: string;
  nextExpectedAt: string;
  observationCount: number;
  status: SeriesStatus;
  /** Observation ids that belong to the current window and should be
   * linked (recurring_stream_id) if not already. */
  memberIds: string[];
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function dayOfMonth(iso: string): number {
  return new Date(iso).getUTCDate();
}

/** Circular day-of-month distance, wrapping at a 30-day base — a purely
 * approximate proximity check (used only to cluster semimonthly's two
 * fixed billing days), never for elapsed-time math. Real cadence timing
 * uses actual calendar-day subtraction (`daysBetween`) instead, which
 * naturally survives month-length variance without any wraparound formula. */
function circularDayOfMonthDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 30 - diff);
}

/** True when every day-of-month in `days` clusters into exactly two groups
 * (each member within 1 day of its group's first member) — the fixed-day
 * signature of a true semimonthly bill (e.g. always ~1st and ~15th),
 * distinct from a biweekly interval that drifts through the calendar. A
 * ±1 tolerance (not wider) matters: day 29 and day 1 are only a circular
 * distance of 2 apart, and a wider tolerance would wrongly cluster a
 * drifting biweekly series' month-end/month-start dates together. */
function isSemimonthlyPattern(days: readonly number[]): boolean {
  const groups: number[][] = [];
  for (const d of days) {
    const group = groups.find((g) => circularDayOfMonthDistance(d, g[0]) <= 1);
    if (group) group.push(d);
    else groups.push([d]);
  }
  return groups.length === 2;
}

interface CadenceBand {
  cadence: Cadence;
  min: number;
  max: number;
}

// Fixed precedence order, first band whose gaps ALL fit wins. SEMIMONTHLY is
// checked before BIWEEKLY deliberately: their numeric gap ranges overlap
// (~13-16 days), and the more specific, calendar-anchored pattern
// (semimonthly's fixed two-days-a-month signature) must win the tie rather
// than leaving the outcome to whichever band happens to be checked first.
const BANDS: readonly CadenceBand[] = [
  { cadence: "WEEKLY", min: 5, max: 9 },
  { cadence: "SEMIMONTHLY", min: 12, max: 18 },
  { cadence: "BIWEEKLY", min: 11, max: 17 },
  { cadence: "MONTHLY", min: 24, max: 35 },
  { cadence: "ANNUAL", min: 350, max: 380 },
];

/**
 * Classifies the cadence from the trailing 3 observations (2 gaps) of an
 * ascending-by-date list — using only 2 gaps uniformly (not a larger
 * window) is what makes this the SAME mechanism for both an initial
 * cadence guess and a later cadence-CHANGE: a single coincidental gap can
 * never flip an established cadence, because one gap alone is never enough
 * to fill a 2-gap trailing window on its own; a genuine change needs two
 * consecutive confirming intervals, matching the product's "no promotion
 * on a single occurrence" rule. Returns `null` when fewer than 2
 * observations exist, or when no band's range fits every gap in the window.
 */
export function classifyCadence(observations: readonly RecurringObservation[]): Cadence | null {
  if (observations.length < 2) return null;
  const window = observations.slice(-3);
  const gaps: number[] = [];
  for (let i = 1; i < window.length; i++) gaps.push(daysBetween(window[i - 1].occurredAt, window[i].occurredAt));

  for (const band of BANDS) {
    if (!gaps.every((g) => g >= band.min && g <= band.max)) continue;
    if (band.cadence === "SEMIMONTHLY" && !isSemimonthlyPattern(window.map((o) => dayOfMonth(o.occurredAt)))) {
      continue;
    }
    return band.cadence;
  }
  return null;
}

/**
 * Fixed, stateless formula — deliberately NOT derived from observed
 * deviation across history (a self-referential recompute could let a
 * series' tolerance quietly widen run over run). The larger of a 7%
 * relative band and a $3 absolute floor, so small subscriptions don't get
 * an unreasonably tight cents-level tolerance.
 */
export function computeAmountToleranceMinor(amount: number): number {
  return Math.max(Math.round(amount * 0.07), 300);
}

function withinTolerance(amount: number, expected: number, toleranceMinor: number): boolean {
  return Math.abs(amount - expected) <= toleranceMinor;
}

/**
 * Walks the full eligible history in ascending date order, keeping only
 * observations whose amount is within tolerance of the CURRENT running
 * expected amount (which itself advances to each accepted member's amount).
 * An out-of-tolerance transaction is simply excluded as a member — it
 * neither joins nor resets the series (design: "a transaction outside
 * tolerance remains a completely normal, independent ledger row").
 */
function filterAmountConsistentMembers(observations: readonly RecurringObservation[]): RecurringObservation[] {
  const members: RecurringObservation[] = [];
  let expected: number | null = null;
  let tolerance = 0;
  for (const o of observations) {
    if (expected === null || withinTolerance(o.amount, expected, tolerance)) {
      members.push(o);
      expected = o.amount;
      tolerance = computeAmountToleranceMinor(o.amount);
    }
  }
  return members;
}

/**
 * A gap since the existing series' known cadence exceeding
 * `GAP_BREAK_MULTIPLIER`x its typical interval resets the window: everything
 * before the break is historical only, and the promotion gate re-runs from
 * the post-break observations alone. Without an existing series there is
 * nothing to break FROM, so this is a no-op on the very first promotion —
 * genuinely inconsistent older history is instead caught afterward by
 * {@link truncateToCadenceValidatedSuffix}, which runs regardless of
 * whether a prior series existed.
 */
function truncateAfterGapBreak(
  observations: readonly RecurringObservation[],
  existingCadence: Cadence | null,
): RecurringObservation[] {
  if (!existingCadence || observations.length < 2) return [...observations];
  const threshold = CADENCE_TYPICAL_DAYS[existingCadence] * GAP_BREAK_MULTIPLIER;
  let breakIndex = 0;
  for (let i = 1; i < observations.length; i++) {
    if (daysBetween(observations[i - 1].occurredAt, observations[i].occurredAt) > threshold) breakIndex = i;
  }
  return observations.slice(breakIndex);
}

/**
 * Review fix (B2): `classifyCadence` only inspects the trailing 2 gaps, so
 * without this step, older amount-consistent-but-irregularly-spaced
 * observations could ride along into `memberIds`/`observationCount` merely
 * because the trailing 2 gaps happened to fit a band — even on a group's
 * very first run, where `truncateAfterGapBreak` above is a no-op (nothing
 * to break FROM). This walks backward from the most recent observation and
 * keeps only the maximal suffix whose EVERY consecutive gap independently
 * fits the classified cadence's band — so `memberIds`/`observationCount`
 * represent observations actually validated against that cadence, not
 * merely "amount-consistent and old enough to still be in the lookback
 * window." Guaranteed to keep at least the 2 observations (3 elements)
 * `classifyCadence` itself already verified, since those are exactly the
 * last two gaps this walk checks first.
 */
function truncateToCadenceValidatedSuffix(
  observations: readonly RecurringObservation[],
  cadence: Cadence,
): RecurringObservation[] {
  const band = BANDS.find((b) => b.cadence === cadence);
  /* istanbul ignore next -- cadence always comes from BANDS itself */
  if (!band) return [...observations];

  let start = observations.length - 1;
  for (let i = observations.length - 2; i >= 0; i--) {
    const gap = daysBetween(observations[i].occurredAt, observations[i + 1].occurredAt);
    if (gap < band.min || gap > band.max) break;
    start = i;
  }
  const suffix = observations.slice(start);

  // SEMIMONTHLY's extra day-of-month signature must also hold across the
  // full validated suffix, not just the trailing pair the gap walk alone
  // checked -- a longer run can pass the numeric gap band while its
  // day-of-month values have drifted (e.g. weekend/holiday shifts) enough
  // to no longer show the fixed-two-days pattern. Falling back to the
  // minimal trailing-3 window is safe: classifyCadence already proved that
  // exact window valid.
  if (cadence === "SEMIMONTHLY" && suffix.length > 3) {
    const days = suffix.map((o) => dayOfMonth(o.occurredAt));
    if (!isSemimonthlyPattern(days)) return observations.slice(-3);
  }

  return suffix;
}

/**
 * The main entry point. `observations` must already be candidacy-filtered
 * (source='bank', confirmed, non-pending, not removed/duplicate,
 * merchant_entity_id present, an eligible event_role, not a GENERAL_
 * MERCHANDISE/GENERAL_SERVICES primary — see recurring-store.ts) and sorted
 * ascending by `occurredAt`; this module trusts that and only decides
 * cadence/membership/lifecycle within that already-eligible set.
 *
 * Returns `null` when no series can currently be formed (fewer than 2
 * validated members, or no cadence band fits) — the caller must leave any
 * existing series row untouched in that case, never delete it: "likely
 * ended" is rendered lazily elsewhere from `next_expected_at`, not decided
 * here.
 */
export function detectRecurringSeries(
  observations: readonly RecurringObservation[],
  existing: SeriesSnapshot | null,
): SeriesUpdate | null {
  const sorted = [...observations].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  const amountConsistent = filterAmountConsistentMembers(sorted);
  const gapBroken = truncateAfterGapBreak(amountConsistent, existing?.cadence ?? null);
  if (gapBroken.length < 2) return null;

  const cadence = classifyCadence(gapBroken);
  if (!cadence) return null;

  // B2 fix: validate every consecutive gap in the surviving window against
  // the classified cadence -- not just the trailing 2 `classifyCadence`
  // itself checked -- so membership/observationCount reflect observations
  // actually confirmed to fit, on a first run exactly as much as a later one.
  const validated = truncateToCadenceValidatedSuffix(gapBroken, cadence);
  if (validated.length < 2) return null;

  const last = validated[validated.length - 1];
  return {
    cadence,
    expectedAmount: last.amount,
    amountToleranceMinor: computeAmountToleranceMinor(last.amount),
    lastOccurredAt: last.occurredAt,
    nextExpectedAt: addDaysIso(last.occurredAt, CADENCE_TYPICAL_DAYS[cadence]),
    observationCount: validated.length,
    status: validated.length >= MIN_OBSERVATIONS_FOR_ACTIVE ? "ACTIVE" : "CANDIDATE",
    memberIds: validated.map((o) => o.id),
  };
}

/**
 * Read-time-only classification of whether an ACTIVE series looks lapsed —
 * never persisted, never flips `status` in the database (design: no
 * background job needed for a series to stop looking active). Past
 * `GAP_BREAK_MULTIPLIER`x the cadence's typical interval with zero new
 * match, render as "likely ended" rather than "overdue" forever.
 */
export function isLikelyEnded(series: { cadence: Cadence; nextExpectedAt: string }, now: Date = new Date()): boolean {
  const graceDays = CADENCE_TYPICAL_DAYS[series.cadence] * GAP_BREAK_MULTIPLIER;
  return daysBetween(series.nextExpectedAt, now.toISOString()) > graceDays && now > new Date(series.nextExpectedAt);
}
