/**
 * Subscription detection (V1.5) — a pure classification layer on top of an
 * already-detected {@link recurringSeries} row. No cadence detection, no
 * membership detection, no gap-break, no watermark logic — all of that
 * belongs exclusively to recurring-detection.ts / recurring-engine.ts /
 * recurring-store.ts and is untouched by this module. Design:
 * docs/specs/2026-09-16-subscription-detection-design.md.
 *
 * A "subscription" here means what the roadmap says: a discretionary,
 * cancellable, ongoing digital or membership-style service the user pays
 * for on a recurring basis — streaming, SaaS, memberships. It is
 * deliberately NOT the same concept as "any recurring series": rent,
 * utilities, mortgages, loans, insurance premiums, and ordinary habitual
 * purchases can all be genuinely recurring without being subscriptions in
 * this sense, and must never be classified as one merely because they
 * recur (design requirement — the bill/subscription boundary).
 *
 * Evidence sources, most to least authoritative:
 *  1. Trusted Plaid PFC `detailed` subtypes — specific enough that the
 *     subtype alone is unambiguous (mirrors category-map.ts's own
 *     TRUSTED_DETAILED precedent: specific detailed values are trusted
 *     regardless of confidence; bare primaries are not, because they mix
 *     subscription and non-subscription real-world merchants).
 *  2. Merchant-name evidence (e.g. Budgts' existing MERCHANT_KNOWLEDGE
 *     map) — INSPECTED and deliberately NOT wired as a positive-evidence
 *     source in this first implementation. See "Merchant-knowledge gap"
 *     below for exactly why, rather than silently omitting it.
 *  3. Bare `plaid_category_primary` alone — deliberately NOT used as
 *     positive evidence either, for the same reason as (2): a bare
 *     `ENTERTAINMENT` primary matches both a Netflix subscription and a
 *     one-off movie-theater visit, and this module's principle (matching
 *     the recurring detector's own) is that false positives are worse
 *     than false negatives.
 *
 * Cadence is NEVER evidence on its own (explicit design requirement) —
 * every candidate reaching this function already has a validated cadence
 * by virtue of being an ACTIVE recurring_series; that says nothing about
 * WHAT KIND of relationship it is, only that it repeats predictably.
 *
 * ## Merchant-knowledge gap (documented, not papered over)
 *
 * `src/lib/plaid/merchant-knowledge.ts`'s `MERCHANT_KNOWLEDGE` map was
 * inspected directly for this design. It maps a normalized merchant name to
 * one of a handful of COARSE category buckets ("Entertainment", "Personal
 * Care", "Housing", "Insurances", ...) — it has no field, value, or
 * structure that says "this specific merchant is a subscription business."
 * Critically, the categories that would be relevant here each mix
 * subscription and non-subscription merchants in the SAME bucket:
 *   - "Entertainment" contains both true subscriptions (netflix, spotify,
 *     hulu, disney plus, hbo max, paramount plus, peacock, apple music,
 *     audible, siriusxm, xbox game pass, playstation plus, ...) AND
 *     one-off/per-ticket venues (amc theatres, regal cinemas, cinemark,
 *     fandango, ticketmaster, stubhub, seatgeek, eventbrite, dave and
 *     busters, topgolf, chuck e cheese, bowlero, ...).
 *   - "Personal Care" contains both membership gyms (planet fitness, la
 *     fitness, equinox, orangetheory fitness, ...) AND pay-per-visit
 *     services (great clips, supercuts, sephora, european wax center,
 *     massage envy, ...).
 *   - "Housing" (all utilities/telecom) and "Insurances" (all premiums)
 *     must NEVER be subscription evidence at all (the bill/subscription
 *     boundary) — using this map for those categories would actively work
 *     against that boundary.
 * `plaid_merchant_rules` (the per-user category-correction table) has the
 * identical shape-level problem: it stores merchant → the user's own
 * category id, never "is this a subscription."
 *
 * Using either source as-is would misclassify real merchants (e.g. AMC
 * Theatres or Supercuts) as subscriptions purely because they share a
 * category bucket with genuine subscription businesses. Hand-picking a
 * subset of "the subscription ones" from within an existing bucket would
 * mean inventing a new curated judgment not present in the source data —
 * exactly what this feature's design review was told not to do. So: this
 * is a real, current gap, not an oversight. If a future need justifies it,
 * the right fix is a dedicated, explicitly-subscription-purposed merchant
 * list (or a genuinely per-merchant signal from Plaid), not a repurposing
 * of this categorization-only map.
 */
import type { EventRole } from "./types";

/** Mirrors the persisted `recurring_series.status` values (see
 * recurring-engine.ts's `ExistingSeriesRow`) — imported by value here
 * rather than by type-only reference so this module stays fully
 * independent of recurring-detection's own types, per the "classification
 * layer only" boundary. */
export type SeriesLifecycleStatus = "CANDIDATE" | "ACTIVE" | "MUTED";

export interface SubscriptionEvidence {
  status: SeriesLifecycleStatus;
  eventRole: EventRole;
  plaidCategoryPrimary: string | null;
  plaidCategoryDetailed: string | null;
}

/**
 * Plaid PFC `detailed` subtypes specific enough to trust as subscription
 * evidence on their own — the exact subset of category-map.ts's own
 * TRUSTED_DETAILED philosophy that is also subscription-shaped. Every
 * other ENTERTAINMENT/PERSONAL_CARE detailed subtype (casinos, sporting
 * events/amusement parks/museums, hair and beauty, laundry, ...) describes
 * a real but non-subscription use of that merchant category and is
 * deliberately excluded.
 */
const TRUSTED_SUBSCRIPTION_DETAILED = new Set<string>([
  "ENTERTAINMENT_TV_AND_MOVIES",
  "ENTERTAINMENT_MUSIC_AND_AUDIO",
  "ENTERTAINMENT_VIDEO_GAMES",
  "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS",
]);

/**
 * Primaries that must NEVER be treated as subscription evidence, regardless
 * of any other signal — the bill/subscription boundary, enforced as a hard
 * block rather than left as an absence of a positive match. RENT_AND_
 * UTILITIES is the one that matters most in practice (recurring, monthly,
 * yet explicitly a bill, not a subscription); the rest are defense-in-depth
 * against a future change elsewhere ever routing them here, since none of
 * them can structurally reach this function today (LOAN_PAYMENTS never
 * resolves an eligible event_role; GENERAL_MERCHANDISE/GENERAL_SERVICES are
 * already excluded from recurring-series candidacy itself).
 */
const NEVER_SUBSCRIPTION_PRIMARIES = new Set<string>([
  "RENT_AND_UTILITIES",
  "LOAN_PAYMENTS",
  "GENERAL_MERCHANDISE",
  "GENERAL_SERVICES",
]);

/**
 * Deterministic, no I/O, no ML. Conservative by construction: the only way
 * to return `true` is a positive hit on {@link TRUSTED_SUBSCRIPTION_DETAILED};
 * everything else — including a merchant/category signal this module simply
 * doesn't recognize — resolves to `false`. Never mutates or reads anything;
 * calling it twice with identical evidence always returns the identical
 * result.
 */
export function classifySubscription(evidence: SubscriptionEvidence): boolean {
  if (evidence.status !== "ACTIVE") return false;
  if (evidence.eventRole !== "PURCHASE") return false;
  if (evidence.plaidCategoryPrimary && NEVER_SUBSCRIPTION_PRIMARIES.has(evidence.plaidCategoryPrimary)) {
    return false;
  }
  if (evidence.plaidCategoryDetailed && TRUSTED_SUBSCRIPTION_DETAILED.has(evidence.plaidCategoryDetailed)) {
    return true;
  }
  return false;
}
