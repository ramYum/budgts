# Bill Detection — Design

Date: 2026-09-17
Status: implemented (first cut), pending staging/production verification. No
schema change, no persisted classification, no UI, no cron change.

## 1. What this is

A pure **classification layer** on top of the already-shipped, already
production-verified recurring-detection system
(`docs/specs/2026-09-16-recurring-detection-design.md`), in the same shape
as subscription detection
(`docs/specs/2026-09-16-subscription-detection-design.md`). It answers one
question for an `ACTIVE` `recurring_series` row: *is this a bill* — a
recurring, essentially non-discretionary financial obligation (rent, a
utility connection, an insurance premium, a loan payment) where
non-payment has a real consequence, as opposed to a subscription
(discretionary, cancellable) or an ordinary recurring purchase.

It is explicitly **not** a second detector. It does not touch cadence
classification, membership validation, gap-break, watermarking, or
promotion rules — none of `recurring-detection.ts`'s pure functions were
modified. It runs inside the same `plaid-recurring-scan` daily cron pass
that already exists; there is no second pipeline, no second cron, no second
table scan.

## 2. Bill vs. subscription vs. ordinary recurring activity

Precedence, evaluated once a series is `ACTIVE`:

1. **Subscription** wins first — `classifySubscription()` (unmodified) is
   checked before `classifyBill()`. A series is never both.
2. **Bill** — see §3 for evidence.
3. **Neither** — the overwhelming majority of `recurring_series` rows.

In practice, with only Tier-1 evidence on each side, the two trusted
`detailed`-subtype sets are disjoint (subscription's
`ENTERTAINMENT_*`/`PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS` vs. bill's six
`RENT_AND_UTILITIES_*` subtypes), so no real transaction can satisfy both
classifiers today. Precedence is still enforced explicitly in
`recurring-engine.ts` as forward-looking correctness (in case evidence
sources ever expand and stop being disjoint), not because it changes any
outcome reachable today. This is stated explicitly here rather than left
implicit, since it's the kind of thing that looks like dead code until you
know why it's there.

## 3. Candidacy rules and evidence

- `status == 'ACTIVE'` only — never `CANDIDATE` or `MUTED`.
- `eventRole == 'PURCHASE'` only.
- `direction == 'debit'` only (defense-in-depth; `eventRole === 'PURCHASE'`
  already structurally implies `direction === 'debit'` per
  `event-role.ts`'s resolution table, but stated explicitly per design
  requirement).
- Positive evidence required — no default. **Trusted `detailed` subtypes**
  (the only source that currently produces a positive classification):
  ```
  RENT_AND_UTILITIES_RENT
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY
  RENT_AND_UTILITIES_INTERNET_AND_CABLE
  RENT_AND_UTILITIES_TELEPHONE
  RENT_AND_UTILITIES_WATER
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE
  ```
  All six sit under `RENT_AND_UTILITIES`, which is not excluded from
  recurring-series candidacy. Note `RENT_AND_UTILITIES_RENT` is trusted
  here even though `category-map.ts`'s own `TRUSTED_DETAILED` excludes it
  for categorization purposes (rent can include roommate splits/partial
  payments) — a deliberate, stated divergence: categorization asks "can we
  auto-file this to one category," bill classification asks "does this
  cadence-confirmed, amount-consistent series represent a recurring
  obligation." Different questions, different trust bar.
- Bare `plaid_category_primary` alone is never positive evidence, same
  rule as subscription detection.
- Cadence is never evidence — a validated cadence only proves recurrence,
  not obligation-type.

## 4. Due-state (upcoming / due / late)

A second pure function, `dueState()`, answers "is this bill on track" for a
series already classified as a bill:

```
now < nextExpectedAt                                → UPCOMING
nextExpectedAt .. nextExpectedAt + 3 calendar days   → DUE
past nextExpectedAt + 3 days, no newer observation   → LATE
newer observation exists, at any point               → DUE (never LATE)
```

No `MISSED` state in this first policy — `LATE` is terminal. The 3-day
grace window is an isolated named constant (`BILL_DUE_GRACE_DAYS`), a
product/UX threshold distinct from `isLikelyEnded()`'s existing 3x-cadence
multiplier (a much larger window answering a different question: "has this
series probably stopped existing" vs. "should the user be worried this
week").

**"Newer observation" — exact identity used, and its limitation.** The
caller must determine `hasNewerObservation` via the strongest identity the
data model already provides: does a transaction exist with
`recurring_stream_id = <this series id>` AND `occurred_at >
last_occurred_at`? `recurring_stream_id` is only ever set by
`recurring-store.ts`'s `applySeriesUpdate` for a transaction that has
already passed the full candidacy + amount-tolerance + cadence-membership
validation for that exact series — the same membership decision the
detector itself already made and persisted, not a new fuzzy-matching
heuristic invented for this purpose.

**Known limitation, stated rather than papered over:** `recurring_stream_id`
is only assigned during the nightly cron's `applySeriesUpdate` step, not
the instant a transaction lands. A bill paid earlier today will not be
visible via this identity until the next scheduled scan links it, so
`dueState()` called same-day (before that night's cron runs) may report
`LATE` for a bill already paid. This is bounded staleness (~24h, the
cron's own cadence), inherited from the existing pipeline's shape — not a
defect in `dueState()`, but a real constraint for whoever eventually
builds a caller on top of it.

`dueState()` is **not wired into the cron or any persistence** — it is a
pure function with no consumer yet, verified by unit tests only. It must
be called fresh at whatever future read time consumes it (a dashboard/API
route), never computed once during the nightly scan and cached, since its
answer depends on "now" at read time, not "now" at last-scan time.

## 5. Known blind spots (inherited, not introduced here)

- **Insurance is structurally unreachable.** Plaid places insurance
  premiums under `GENERAL_SERVICES_INSURANCE`, and `GENERAL_SERVICES` is
  excluded from recurring-series candidacy itself
  (`recurring-store.ts`'s `EXCLUDED_PRIMARIES`) — such a transaction never
  becomes a `recurring_series` row, so it can never reach this classifier.
  `merchant-knowledge.ts`'s `"Insurances"` list is genuinely clean and
  unambiguous (unlike its `"Entertainment"`/`"Personal Care"` buckets used
  for subscription detection) but is unusable while this upstream
  exclusion stands.
- **Most real loan/debt payments never resolve to an eligible `EventRole`.**
  `resolveEventRole()` only maps `LOAN_PAYMENTS` +
  `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` → `CARD_PAYMENT` (itself excluded
  from candidacy); every other `LOAN_PAYMENTS` detailed subtype (mortgage,
  auto, student, personal loan) resolves to `null` (unresolved) and is
  never candidacy-eligible.
- **Credit-card payments are correctly, permanently excluded** — this is
  the system working as designed, not a gap: paying off a card is a
  balance transfer, not a new expense (the underlying purchases already
  counted when they posted to the card).
- **Seasonal/variable-amount utilities** are exposed to recurring-
  detection's fixed amount-tolerance (7%/$3) and gap-break (3x cadence)
  thresholds, both tuned with fixed-price subscriptions in mind — a
  genuinely variable utility bill risks amount-tolerance rejection or a
  seasonal-gap reset. Inherited, not introduced by bill classification.
- **Multiple distinct obligations from one merchant** (e.g. two policies
  from the same insurer) would collapse into one `recurring_series` row if
  Plaid assigns them the same `merchant_entity_id` — an existing
  recurring-detection limitation, more likely to surface for bills than
  subscriptions.
- **Recurring income ("missed paycheck")** is bundled with bill detection
  in the roadmap's own wording but is out of scope for this work (expense
  obligations only). `dueState()`'s model generalizes to `INCOME`-role
  series with no rework, noted for a future, separate decision.

Fixing the insurance/loan reachability gaps requires touching
recurring-detection.ts's candidacy rules or event-role.ts — both
explicitly out of scope for this phase.

## 6. Schema

**No new column, no migration**, same reasoning as subscription detection:
`classifyBill()`'s output is derived from `recurring_series` fields already
present plus the latest member transaction's category fields; `dueState()`
needs no new storage either (`next_expected_at`/`last_occurred_at` already
exist, "has a newer observation" is answerable via the existing
`recurring_stream_id` link). Trade-off: recomputed on every read rather
than materialized — fine at today's per-user series counts, and the right
choice to revisit only if a future UI needs to cheaply query "all bills"
across many series at commercial scale.

## 7. Integration with the existing pipeline

Runs inside the same `runRecurringDetectionForUser` loop
(`recurring-engine.ts`), immediately after the existing subscription
classification block — no new route, no new cron, no new table scan, no
change to `loadGroupObservations` (subscription detection already added
the category fields this needs). Bill classification is skipped entirely
when subscription classification already returned `true` (§2). A positive
bill classification is logged (`console.log("[plaid] bill-detection",
{...})`), matching subscription detection's exact observability pattern.
`dueState()` is not called anywhere in this pipeline.

## 8. Testing

- `bill-detection.test.ts` — pure unit tests: all six trusted subtypes,
  bare-primary/unsupported-category/candidate/muted/non-purchase/
  non-debit negatives, subscription-shaped categories never classify as
  bills, determinism/idempotency, and `dueState()`'s UPCOMING/DUE/LATE
  states including the exact +3-day boundary, the newer-observation
  override, and calendar-day determinism.
- `recurring-engine.test.ts` — new describe block: outcome-unchanged
  regression, log-fires-correctly, no-log-without-evidence, no-log-for-
  MUTED/CANDIDATE, and explicit precedence tests in both directions
  (subscription-shaped series never logs bill; bill-shaped series never
  logs subscription).
- `tests/integration/plaid-bill-detection.test.ts` — real Postgres,
  mirroring `plaid-subscription-detection.test.ts`'s structure: positive
  bill case, precedence-holds-end-to-end case, general-category negative
  case, financial-fields-unchanged safety test, and an idempotency test
  (two scans, same classification, no duplicate series).
- Full existing recurring-detection and subscription-detection suites
  re-run unmodified, proving zero behavioral change to either.

## 9. Explicitly out of scope for this work

Insurance/loan reachability fixes. Any change to `recurring-detection.ts`
or `event-role.ts`. `dueState()` wired into the cron, any API route, or any
persistence. Bill UI. Recurring-income/paycheck detection. Any schema
change.
