# Subscription Detection — Design

Date: 2026-09-16
Status: implemented (first cut), pending staging/production verification. No
schema change, no persisted classification, no UI, no cron change.

## 1. What this is

A pure **classification layer** on top of the already-shipped, already
production-verified recurring-detection system
(`docs/specs/2026-09-16-recurring-detection-design.md`). It answers one
question for an `ACTIVE` `recurring_series` row: *is this a subscription* —
a discretionary, cancellable, ongoing digital or membership-style service
(streaming, SaaS, memberships), as opposed to a bill, a loan, or an
ordinary habitual purchase that merely happens to recur.

It is explicitly **not** a second detector. It does not touch cadence
classification, membership validation, gap-break, watermarking, or
promotion rules — none of `recurring-detection.ts`'s pure functions were
modified. It runs inside the same `plaid-recurring-scan` daily cron pass
that already exists; there is no second pipeline, no second cron, no second
table scan.

## 2. Reused recurring-series fields

All of them, wholesale: `status`, `eventRole`, `cadence`, `expectedAmount`,
etc. Nothing is recomputed or reinterpreted — classification only reads
`status` and `eventRole` (from the series) plus the latest member
transaction's `plaid_category_primary`/`plaid_category_detailed` (already
stored on every transaction, now also fetched by `loadGroupObservations`).

## 3. Candidacy rules

- `status == 'ACTIVE'` only — never `CANDIDATE`.
- `status != 'MUTED'` (a muted series is never classified, mirroring the
  final status `applySeriesUpdate` itself would persist — see §9).
- `eventRole == 'PURCHASE'` only.
- A positive category signal is required (§4) — there is no default.

## 4. Evidence sources

**Tier 1 — trusted Plaid PFC `detailed` subtypes** (the only source that
currently produces a positive classification):

```
ENTERTAINMENT_TV_AND_MOVIES
ENTERTAINMENT_MUSIC_AND_AUDIO
ENTERTAINMENT_VIDEO_GAMES
PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS
```

These mirror `category-map.ts`'s own `TRUSTED_DETAILED` philosophy — a
`detailed` subtype specific enough to trust regardless of any coarser
signal — narrowed to the subset that is also subscription-shaped. Every
other `ENTERTAINMENT`/`PERSONAL_CARE` detailed subtype (casinos, sporting
events/amusement parks/museums, hair and beauty, laundry, ...) is real but
not subscription-shaped, and is deliberately excluded.

**Tier 2 — merchant knowledge — inspected, not wired.** See §5.

**Bare `plaid_category_primary` alone is never positive evidence.** A bare
`ENTERTAINMENT` primary matches both a Netflix subscription and a one-off
movie-theater visit; using it as a signal (even a weak one) would violate
"false positives are worse than false negatives."

**Cadence is never evidence.** Every candidate reaching this function
already has a validated cadence by virtue of being an `ACTIVE`
`recurring_series` — that only proves it repeats predictably, not what kind
of relationship it is.

## 5. Merchant-knowledge gap (inspected, documented, not papered over)

`src/lib/plaid/merchant-knowledge.ts`'s `MERCHANT_KNOWLEDGE` map was read in
full for this design. It maps a normalized merchant name to one of a
handful of **coarse category buckets** — it has no field or value meaning
"this merchant is a subscription." The categories that would matter here
each mix subscription and non-subscription merchants in the same bucket:

- `"Entertainment"` contains both true subscriptions (`netflix`, `spotify`,
  `hulu`, `disney plus`, `hbo max`, `paramount plus`, `peacock`,
  `apple music`, `audible`, `siriusxm`, `xbox game pass`,
  `playstation plus`, ...) **and** one-off/per-ticket venues
  (`amc theatres`, `regal cinemas`, `cinemark`, `fandango`, `ticketmaster`,
  `stubhub`, `seatgeek`, `eventbrite`, `dave and busters`, `topgolf`,
  `chuck e cheese`, `bowlero`, ...).
- `"Personal Care"` contains both membership gyms (`planet fitness`,
  `la fitness`, `equinox`, `orangetheory fitness`, ...) **and**
  pay-per-visit services (`great clips`, `supercuts`, `sephora`,
  `european wax center`, `massage envy`, ...).
- `"Housing"` (all utilities/telecom) and `"Insurances"` (all premiums)
  must never be subscription evidence at all — the bill/subscription
  boundary (§6) — so this map couldn't safely contribute there even if its
  granularity were finer.

`plaid_merchant_rules` (the per-user category-correction table) has the
identical shape problem: merchant → the user's own **category id**, never
"is this a subscription."

Using either source as-is would misclassify real merchants (AMC Theatres,
Supercuts) purely because they share a category bucket with genuine
subscription businesses. Hand-picking a subset of "the subscription ones"
from within an existing bucket would mean inventing a new curated judgment
not present in the source data — the thing this design was explicitly told
not to do. **Conclusion: in its current form, this data cannot safely
provide positive subscription evidence.** If a real need justifies it
later, the correct fix is a dedicated, explicitly-subscription-purposed
merchant list (or a genuine per-merchant Plaid signal), not a repurposing
of this categorization-only map.

## 6. The bill/subscription boundary

`RENT_AND_UTILITIES` is hard-excluded, not just absent from the trusted
set — even if a future change accidentally added a `RENT_AND_UTILITIES_*`
detailed subtype to the trusted set, the primary-level block still wins
(tested explicitly). `LOAN_PAYMENTS`, `GENERAL_MERCHANDISE`, and
`GENERAL_SERVICES` are blocked the same way, as defense-in-depth — none of
them can structurally reach this function today (loans never resolve an
eligible `event_role`; the latter two are already excluded from
recurring-series candidacy itself), but the boundary is stated explicitly
rather than left as an accident of upstream filtering.

## 7. Cadence, amount changes, pauses, cancellations, resumptions

No new logic for any of these — this is the strongest argument for "pure
classification, zero new lifecycle state." Every one of these questions is
already answered correctly by the existing, tested recurring-detection
design (amount recompute from the trailing window, the not-yet-wired
`isLikelyEnded()` for pauses/cancellations, gap-break's "same row continues
after going quiet" for resumptions). Subscription detection reads whatever
`recurring_series` currently says and adds nothing.

## 8. Schema

**No new column, no migration, in this first implementation** (explicit
instruction). Classification is derived fresh every run from
`recurring_series` + the latest member transaction's category fields and
is not persisted. If a future UI/query need demonstrates that
materializing it is necessary, that is a separate, later decision.

## 9. Integration with the existing pipeline

Runs inside the same `runRecurringDetectionForUser` loop
(`recurring-engine.ts`), immediately after `applySeriesUpdate` succeeds —
no new route, no new cron, no new table scan. `loadGroupObservations`
(`recurring-store.ts`) now also selects `plaid_category_primary`/
`plaid_category_detailed` — an additive change to what one existing query
fetches, not a change to cadence/membership/gap-break/watermark logic,
which are untouched.

The engine mirrors (does not modify) `applySeriesUpdate`'s own mute guard
to decide the *final* status before classifying: `existing?.status ===
"MUTED" ? "MUTED" : result.status`. This one line exists only so
classification sees the same truth the store is about to persist; it does
not change what the store persists.

Because nothing is persisted, the observable output of this phase is a
structured log line — `console.log("[plaid] subscription-detection", {...})`
— emitted only when a series classifies positively, mirroring exactly how
the recurring-detection and paired-transfer-detection features were first
observed (via logs) before any UI or further schema existed.

## 10. Visibility

Nothing user-facing in this implementation. No UI, no new API response
field for any existing route, no dashboard change. The only observable
surface is the structured log line above, for verification purposes.

## 11. Explicitly out of scope for this work

Bill Detection. A `recurring_series.isSubscription` column or any other
schema change. Any change to `recurring-detection.ts`'s pure functions.
Any change to the `plaid-recurring-scan` cron configuration. A "total
monthly subscription cost" tile or any other UI.

## 12. Known limitations (carried into the implementation report)

- The `GENERAL_MERCHANDISE`/`GENERAL_SERVICES` exclusion inherited from
  recurring detection means a real SaaS subscription Plaid categorizes
  under either primary will never even become a `recurring_series`, and so
  can never reach this classifier. Inherited, not introduced here.
- Merchant-knowledge-based evidence is a documented gap (§5), not a
  todo silently dropped — revisit only with a purpose-built data source.
- The exact allow-list in §4 is a product judgment call, not a technical
  one, and should be revisited with real usage data before broadening.
