# Monetization Ledger — Influencer Revenue Share (design)

> **Update 2026-09-21 (implementation).** (1) The ledger migration described here as `0017` is now **`0021_monetization_ledger`** (the deletion-hardening work took 0017–0020); its DDL is unchanged. (2) The **free trial is 14 days** (owner decision), not the 7 days written below. (3) A trial-only user creates **no** ledger rows: `subscriptions`/`payments` are written only at the first actual paid charge; the trial lives in the separate `entitlements` table (0022). See `2026-09-21-v1-monetization-design.md`.


**Status (updated 2026-09-21):** the **schema is implemented** as migration `0021_monetization_ledger` (all ten tables, the immutability /
append-only triggers, RESTRICT foreign keys) and is applied on staging only. The provider-neutral billing domain that writes it
(`src/lib/billing/`: entitlement + reducer, RevenueCat adapter, `recordPaidCharge` for confirmed charges, reminders) is implemented per
`2026-09-21-v1-monetization-design.md`. **Only `subscriptions` and `payments` are written today**; the partner / voucher / redemption /
revenue-allocation / payout tables exist but are deliberately **inert** (no functionality invented for them). Everything below that
describes those flows is still design only. Not applied to production.

**Track:** parallel to the main V1 → V1.5 → Mobile Launch → V2 → V2+ ladder in
`docs/roadmap.md` — see "Roadmap placement" at the end of this file. This is
**not** a replacement for, or blocker on, that ladder.

**Relationship to CLAUDE.md's v1 feature set.** CLAUDE.md describes the
*budgeting* product (categories, budgets vs actual, recurring/bills, savings
goals) as single-currency, per-user, with no monetization concerns mentioned.
This document specifies a **separate concern**: how Budgts-the-business gets
paid (mobile subscriptions) and how it shares that revenue with influencer
partners. It does not change anything about how a user tracks their own
money.

**Source of truth note.** The commercial terms below were agreed in a prior
chat/report with the app owner. That chat is *not* a repository artifact and
is not authoritative going forward — **this file is now the authoritative
repository specification** for the monetization ledger. Anyone (human or
agent) implementing or changing this system reads this file, not the
original conversation.

---

## How to read this document

Every rule below is tagged with one of five categories so implementation
work never quietly promotes an engineering guess into a business decision,
or treats a locked business decision as open for re-litigation:

| Tag | Meaning | Can an implementer change it? |
| --- | --- | --- |
| **LOCKED** | Owner-decided commercial/business rule | No — bring contradictions back to the owner, don't silently reinterpret |
| **ARCHITECTURE** | Structural design that implements the locked rules, established by this spec | Only via a spec revision, not ad hoc in code |
| **IMPLEMENTATION REQUIREMENT** | A concrete technical must-do derived from the above | No — but *how* it's satisfied is normal engineering judgment |
| **OPEN ENGINEERING SPIKE** | Implementation detail genuinely undecided; needs investigation against a real Apple/Google/RevenueCat sandbox before it can be committed to | Yes — that's the point |
| **OUT OF SCOPE** | Explicitly not built in this phase | N/A |

---

## 1. LOCKED OWNER DECISIONS

These are commercial facts, not proposals. Nothing downstream re-derives or
second-guesses them.

### 1.1 Commercial model

- Monthly price: **$9.99**. Annual price: **$69**. Free trial: **7 days**.
- The **web product stays free** — no web checkout, no web customer
  subscriptions (see §5 Out of scope).
- Paid subscription exists **only in the mobile apps** (iOS/Android).
- Mobile billing rails: **Apple App Store IAP** and **Google Play Billing**.
- **RevenueCat** normalizes/manages subscription billing events across both
  platforms; Budgts' backend consumes RevenueCat's normalized event stream,
  not raw StoreKit/Play Billing payloads directly.

### 1.2 Influencer discount (customer-facing price)

- Influencer promotional discount: **20%**.
- **Monthly:** 20% off the first **3 paid monthly billing periods only**.
  After that, price reverts automatically to $9.99/month. Introductory, not
  permanent, not renewed.
- **Annual:** 20% off the **first annual purchase only**. Does not recur on
  renewal. Normal $69/year applies from the second annual period on.
- Platform-native offer configuration must use **valid Apple/Google price
  points** — if a platform's tiering doesn't allow the exact arithmetic
  discount, the nearest compliant price point is used rather than assuming
  exact-cent precision is representable on that platform. (This is a
  customer-facing-price concern; it does not change the commission math in
  §1.3, which always operates on the platform-reported `customer_paid_amount`
  for that specific transaction, whatever it actually was.)

### 1.3 Influencer commission

- Influencer commission: **35%**. Budgts share: **65%**.
- The 35/65 split applies to **commissionable proceeds**, not gross/list
  price, not raw customer-paid price:

  ```
  commissionable_proceeds = customer_paid_amount × (1 − platform_commission_rate)
  ```

- `platform_commission_rate` **must be versioned/configurable**. The 15%
  figure used in illustrative architecture examples is **not** hard-coded
  anywhere — see §2.4 (`platform_commission_rates`).
- Actual platform fees/taxes may require later reconciliation against
  Apple/Google/RevenueCat financial reports. Original allocation records are
  never mutated for this — reconciliation produces explicit adjustment
  records (§4.6).

### 1.4 Commission window

- Commission applies for the first **12 calendar months** from the
  customer's first successful paid transaction.
- Anchor: `subscription.first_paid_at`, established from whichever comes
  first:
  - the first confirmed trial-conversion paid transaction, or
  - the first confirmed non-trial initial purchase (no trial taken).
- `first_paid_at` is **immutable** once set.
- **None of the following reset or extend the window:** cancellation,
  resubscription, pause, grace period, failed payment, upgrade/downgrade.
- Resubscription **retains the original influencer attribution** and does
  **not** start a new window. If the 12-calendar-month window has already
  ended by the time of resubscription, **no commission applies** — the
  subscription continues, just without an influencer payout.

### 1.5 Boundary proration

For any transaction whose covered service period crosses the 12-calendar-
month boundary (this is realistically only the **annual** plan — a monthly
period is short enough relative to a 12-month window that it will not itself
span the boundary except in the final month, which is the same math):

```
eligible_covered_days = days of the covered period that fall on/before the boundary
total_covered_days    = full length of the covered period, in days
commission_eligible_amount = customer_paid_amount × eligible_covered_days / total_covered_days
```

Only the pre-boundary portion is commissionable. Integer minor units,
deterministic rounding (§2.5). Boundary and leap-year arithmetic must be
exact (§2.6) — explicitly tested (§6).

### 1.6 Attribution

- Multiple influencers (Partners) are supported. Multiple voucher codes per
  Partner are supported.
- A **Redemption establishes attribution only.** It grants **no**
  entitlement and creates **no** commission by itself.
- Entitlement and commission require a **confirmed Apple/Google/RevenueCat
  transaction** (a `Payment`), never a client-reported purchase.
- Historical attribution must be **immutable/snapshot-safe**: editing a
  `Partner` or `Voucher` later (renaming, deactivating, reassigning) must
  never silently change what an existing `Redemption` or `RevenueAllocation`
  meant at the time it was created.

---

## 2. ARCHITECTURE

### 2.1 Entity overview

```
Partner ──1:N── Voucher ──1:N── Redemption ──N:1── Subscription
                                                       │
                                                       │ 1:N
                                                       ▼
                                                    Payment ──1:1── RevenueAllocation ──N:1── Payout
                                                                          ▲
                                              platform_commission_rates ─┘ (snapshot FK, §2.4)
```

- A `Partner` (influencer) owns `Voucher`s (codes).
- A `Voucher` redemption produces a `Redemption` — an attribution record tied
  to a user, not yet a subscription or money.
- A `Subscription` is the durable per-user mobile subscription record. It
  carries `first_paid_at` and (at most) one attribution reference, captured
  once and never reassigned (§2.3).
- Each confirmed platform transaction event becomes one immutable `Payment`.
- Each `Payment` that is commission-eligible produces exactly one
  `RevenueAllocation` — the immutable snapshot of how that payment's proceeds
  split between Budgts and the Partner.
- `RevenueAllocation`s roll up into `Payout`s owed to a Partner.
- Refunds/chargebacks/reconciliation never rewrite a `Payment` or
  `RevenueAllocation` — they create linked adjustment rows (§4.6).

### 2.2 Money & determinism (repo conventions reused, not reinvented)

Per `docs/conventions.md` step 1 and CLAUDE.md "Conventions": every money
column across these tables is an `integer` in minor currency units. No
floats anywhere in this subsystem, including intermediate calculation state.

### 2.3 Attribution snapshot mechanics

`Redemption` rows are immutable once written (matches the repo's existing
"never mutate, never merge, keep forever" precedent used for
`transactions.duplicateOfId` and the `overriddenByUser` /
`userCategorized` non-clobber contracts in `schema.ts`).

When a `Subscription`'s `first_paid_at` is established (§1.4), the backend
resolves the applicable `Redemption` for that user (if any) **at that
moment** and copies the attribution onto the `Subscription` as a snapshot
(`subscription.attributed_partner_id`, `attributed_voucher_id`,
`attributed_redemption_id`) — not a live join to `Partner`/`Voucher`. Every
`RevenueAllocation` for that subscription further re-snapshots the partner
reference and the rate percentages actually used (§4). This two-layer
snapshot (Subscription-level + per-allocation-level) is what makes a later
`Partner` rename/deactivation or `Voucher` edit incapable of retroactively
changing what an existing `Redemption` or `RevenueAllocation` meant —
consistent with the LOCKED rule in §1.6.

🟡 **Attribution model choice not specified by the owner and treated here as
an open engineering spike, not assumed:** if a user redeems more than one
voucher (e.g., codes from two different influencers) before their first paid
transaction, which one wins — first redemption or last redemption? This spec
does not resolve it; see §6 (Open Engineering Spikes). Until resolved, the
domain logic must make exactly one deterministic, tested choice rather than
leaving it order-dependent on query results.

### 2.4 Platform commission rate — versioned, not hard-coded, per platform

New supporting table, required by the LOCKED rule in §1.3 but not one of the
seven named entities — called out explicitly so it isn't missed. **Updated
2026-09-18 (post-review):** this is the app store's own cut (Apple's or
Google's take before proceeds reach Budgts), not a Budgts-internal figure —
Apple and Google set and change their commission independently (and each has
historically run tiered/stepped rates), so the table is scoped **per
platform**, not a single global rate.

**`platform_commission_rates`**
- `id`, `platform` (`apple`/`google`, plain text + CHECK), `rate` (basis
  points or a fixed-point integer, e.g. `1500` = 15.00%, never a float),
  `effective_from` (timestamptz), `effective_to` (timestamptz, null = still
  current for that platform), `created_at`.
- Append-only, per platform. A new rate for a platform is a new row with
  `effective_from` set; the previously-open row **for that same platform**
  gets its `effective_to` closed at the same instant. Rows are never edited
  or deleted once superseded.
- **"At most one open row per platform" is DB-enforced** — a partial unique
  index on `platform` where `effective_to IS NULL` (this turned out to be a
  plain partial unique index, no special expression-index trick needed, once
  the table was scoped per platform — see §6, this closes what was
  previously an open engineering spike).
- Concurrency note for the domain-logic phase that will write to this table:
  close-then-insert, in one transaction. Closing the old open row for a
  platform and inserting the new one must happen together; inserting the new
  open row *before* closing the old one would (correctly) fail the unique
  index, since two simultaneously-open rows for the same platform can never
  both exist.
- `RevenueAllocation.platform_commission_rate_id` is a hard FK snapshot —
  which version (and which platform) applied to that specific payment is
  fixed forever at allocation time, regardless of later rate changes. Since
  `Payment.platform` already records which store processed the charge, the
  future domain-logic layer resolves the correct currently-open row by
  `(platform, effective_to IS NULL)`.

### 2.5 Deterministic rounding

🟡 **The owner locked *that* rounding must be deterministic; the exact
rounding mode was not specified and is proposed here as an implementation
default, not a business decision** — flag for owner sign-off, change is
cheap before any code exists, expensive after:

1. `commissionable_proceeds = round(customer_paid_amount × (1 − rate))` —
   round-half-up to the nearest minor unit.
2. `influencer_amount = round(commissionable_proceeds × 0.35)` — same
   rounding rule.
3. `budgts_amount = commissionable_proceeds − influencer_amount` — **never**
   independently rounded. This guarantees `influencer_amount + budgts_amount
   == commissionable_proceeds` exactly, every time, by construction rather
   than by hoping two independent roundings happen to agree.

Same pattern for boundary proration (§1.5): round the
`commission_eligible_amount` once; the non-commissionable remainder is
`customer_paid_amount − commission_eligible_amount`, never separately
rounded.

### 2.6 Calendar-month/leap-year arithmetic

🟡 Also an engineering default proposed for sign-off, not an owner decision:
"12 calendar months from `first_paid_at`" is ambiguous exactly at month-end
anchors (e.g. `first_paid_at` on Jan 31 — the 12th month later has no day
31 in some months; a Feb 29 anchor in a leap year has no Feb 29 twelve
months later). Proposed deterministic rule, matching common billing-system
practice: advance the calendar month by 12 keeping the same day-of-month,
and if that day doesn't exist in the target month, **clamp to the last day
of the target month**. This rule must be a single pure, unit-tested function
(§6) — never inlined arithmetic at each call site — precisely because this
is the kind of logic that's easy to get subtly wrong once and never notice
until a boundary case ships.

### 2.7 Apple (StoreKit)

- Apple cannot represent "7-day trial → 3 discounted paid periods → normal
  price" as a single Introductory Offer object.
- Architecture: a standard **7-day Introductory Offer** for the trial, plus
  a **Promotional Offer** for the influencer discount, applied separately.
  - Monthly Promotional Offer: 20% off, 3 months.
  - Annual Promotional Offer: 20% off, 1 annual period.
- Promotional Offers are **server-authorized/signed** (Apple requires the
  backend to sign the offer request — this is not a client-only flow).
- 🟡 Exact StoreKit purchase-flow sequencing for applying the Promotional
  Offer while moving out of the trial is an **OPEN ENGINEERING SPIKE**
  (§6) — it needs a real Apple developer/sandbox environment to verify, not
  a business decision.

### 2.8 Google (Play Billing)

- Google **can** represent the trial + discounted phase as a single
  multi-phase subscription offer:
  - Monthly: 7-day trial → 20% off for 3 billing cycles → normal price.
  - Annual: 7-day trial → 20% off for 1 billing cycle → normal price.
- This is architecturally simpler than Apple's split-offer requirement; no
  open spike is anticipated here, but the actual Play Console offer
  configuration should still be verified against a sandbox purchase before
  relying on it (§6, lower-severity than the Apple spike).

### 2.9 RevenueCat integration boundary

- RevenueCat is the **normalized mobile subscription event source** for both
  platforms.
- Budgts' backend processes **confirmed RevenueCat/platform events only**
  (webhook), matching the existing Plaid pattern: verify → log raw →
  process → mark handled (see `plaid_webhook_events` / `webhook-verify.ts` /
  `api/plaid/webhook/route.ts` for the precedent this reuses, §3.4).
- RevenueCat event data supplies the actual charged amount and the
  subscription period/event type the ledger needs — Budgts does not
  independently recompute what the customer was charged.
- The **backend**, never the mobile client, determines entitlement/commission
  accounting from verified events. A client-reported "purchase succeeded" is
  never sufficient (matches LOCKED §1.6 and Security §4.9).
- **Supabase user ID is the RevenueCat `app_user_id`.** No separate identity
  mapping table is needed.
- Web has no customer subscription checkout (§1.1, §5).

---

## 3. FINANCIAL ENTITIES

For each entity: purpose, key fields, ownership, immutable vs mutable,
uniqueness/idempotency, relationships, financial-integrity notes. Every
table gets RLS per `docs/conventions.md` step 1 — see §3.8 for the ownership
model, since these rows are not purely user-owned the way `transactions` is.

### 3.1 Partner

**Purpose.** An influencer participating in the revenue-share program.

- **Key fields:** `id`, `name`, `contact_email`, `status`
  (`active`/`inactive`, plain text + CHECK per the `recurring_series.status`
  precedent — not a pgEnum, so a future status doesn't need an `ALTER TYPE`),
  `payout_method_details` (opaque — see §4.9 on credential protection),
  `created_at`, `updated_at`.
- **Ownership:** platform-owned (admin-managed), not a row any end-user
  `auth.uid()` should read or write. See §3.8.
- **Mutable:** `name`, `contact_email`, `status`, `payout_method_details`,
  `updated_at`. Mutating these must never change the meaning of past
  `Redemption`/`RevenueAllocation` rows (§2.3).
- **Immutable:** `id`, `created_at`.
- **Uniqueness:** none required beyond `id`; `contact_email` uniqueness is a
  product nicety, not a financial-integrity requirement.
- **Relationships:** 1:N → `Voucher`.

### 3.2 Voucher

**Purpose.** A redeemable code belonging to a `Partner`.

- **Key fields:** `id`, `partner_id`, `code` (the string the customer
  enters), `status` (`active`/`inactive`, plain text + CHECK), `created_at`,
  `updated_at`.
- **Ownership:** platform-owned/admin-managed.
- **Mutable:** `status`, `updated_at`. `code` should be treated as
  effectively immutable in practice (changing a live code breaks
  in-market promo material) even if not DB-enforced immutable.
- **Immutable:** `id`, `partner_id`, `created_at`.
- **Uniqueness/idempotency:** `code` unique **case-insensitively** across
  the whole table (a `citext` unique index or a `lower(code)` unique index —
  match whichever the repo's Postgres extension availability supports; this
  is an implementation detail, not new policy).
- **Relationships:** N:1 → `Partner`; 1:N → `Redemption`.

### 3.3 Redemption

**Purpose.** Records that a specific user entered a specific voucher code —
**attribution only** (§1.6). No entitlement, no commission.

- **Key fields:** `id`, `user_id` (references `profiles.id`, i.e.
  `auth.uid()`), `voucher_id`, `partner_id` (denormalized copy at redemption
  time — see below), `redeemed_at`, `created_at`.
- **Ownership:** the redeeming user's row for RLS purposes (`user_id`
  scoped, matching the repo's standard RLS pattern) — but see §3.8: writes
  to this table happen through a server action that also validates the
  voucher, not raw client insert.
- **Immutable:** the entire row, once written. No update path at all —
  matches the `duplicateOfId` / signed-ledger precedent of "append an
  adjustment, never edit history." If a redemption was a mistake, that's a
  product-support conversation, not a row edit.
- **Why `partner_id` is denormalized onto Redemption too, not just reached
  via `voucher_id → Voucher.partner_id`:** a `Voucher` could theoretically be
  reassigned to a different `Partner` in the admin UI later (unlikely, but
  not structurally prevented) — denormalizing `partner_id` at redemption
  time makes `Redemption` self-contained and immune to that edit, which is
  exactly the guarantee §1.6 requires.
- **Uniqueness/idempotency:** no uniqueness constraint on `(user_id,
  voucher_id)` is imposed by this spec — redeeming the same code twice
  should be a no-op at the domain-logic layer (not an error, not a duplicate
  attribution), but that's a UI/domain concern, not a data-integrity one,
  since a Redemption doesn't itself cause any financial effect.
- **Relationships:** N:1 → `Voucher`, N:1 → `Partner` (denormalized), N:1 →
  `profiles` (user).

### 3.4 Subscription

**Purpose.** The durable per-user mobile subscription record and the home of
the `first_paid_at` anchor (§1.4).

- **Key fields:** `id`, `user_id`, `platform` (`apple`/`google`, plain text +
  CHECK), `platform_subscription_id` (RevenueCat's stable subscriber/product
  reference), `plan` (`monthly`/`annual`, plain text + CHECK), `status`
  (`trialing`/`active`/`paused`/`grace`/`past_due`/`cancelled`, plain text +
  CHECK — mirrors RevenueCat's own status vocabulary so mapping stays
  simple), `first_paid_at` (nullable until established), `attributed_
  partner_id`, `attributed_voucher_id`, `attributed_redemption_id` (all
  nullable — no attribution is the common case), `created_at`, `updated_at`.
- **Ownership:** the user's row (`user_id` scoped RLS), written only by the
  backend webhook processor (§3.8), read-only to the owning user.
- **Immutable once set:** `first_paid_at` and the three `attributed_*`
  fields — set exactly once, at the moment `first_paid_at` is established
  (§1.4, §2.3), never overwritten by any later event including
  resubscription (§1.4).
- **Mutable:** `status`, `updated_at`, and non-financial metadata as
  RevenueCat events arrive (pause, resume, cancel, grace, past_due).
- **Uniqueness/idempotency:** unique on `platform_subscription_id` — the
  stable identity RevenueCat provides, mirrors the `plaid_items.item_id
  .unique()` precedent.
- **Relationships:** N:1 → `profiles`; 1:N → `Payment`.

### 3.5 Payment

**Purpose.** One immutable record per confirmed platform transaction event
(a charge). The financial fact, not a rollup.

- **Key fields:** `id`, `subscription_id`, `user_id` (denormalized for
  query convenience, same pattern as `Redemption.partner_id`), `external_
  transaction_id` (the RevenueCat/platform transaction id — the idempotency
  key, see below), `platform`, `type` (`initial`/`renewal`/`trial_
  conversion`, plain text + CHECK), `customer_paid_amount` (integer minor
  units, the actual platform-reported charge), `currency`, `period_start`,
  `period_end` (the covered service period — required for §1.5 proration),
  `occurred_at` (when the platform reports the charge happened), `raw`
  (jsonb, the raw RevenueCat event payload — mirrors `transactions.raw` for
  offline reprocessing/debugging), `created_at`.
- **Ownership:** backend-written only, from verified webhook events.
- **Immutable:** the entire row, forever, once written. A refund/chargeback
  against this payment is a separate linked row (§4.6), never a mutation
  here — this is the core "immutable historical payment fact" requirement.
- **Uniqueness/idempotency:** unique on `external_transaction_id`. This is
  the idempotency guard for webhook replay/redelivery — same pattern as
  `transactions_source_ref_uq` (`(user_id, source, source_ref)` partial
  unique index, on-conflict-no-op). A duplicate-delivered RevenueCat event
  for a transaction already recorded is a no-op, not a duplicate Payment.
- **Relationships:** N:1 → `Subscription`; 1:1 → `RevenueAllocation` (when
  commission-eligible — see §3.6, not every Payment necessarily produces
  one, e.g. a $0 trial-start event).

### 3.6 RevenueAllocation

**Purpose.** The immutable snapshot of how one `Payment`'s commissionable
proceeds split between Budgts and the attributed Partner. This is the entity
the LOCKED financial-integrity rules in §1 are most directly about.

**Updated 2026-09-18 (post-review) — no `status` column.** An earlier draft
of this section listed a `status` (`pending`/`payable`/`paid`/`clawed_back`)
field here, sourced from the original entity brief's field list, and
described the whole row as "immutable forever" in the same breath — an
internal contradiction, caught on review rather than left to implementation.
Resolving it required asking what the field actually represented:

- `pending` → `payable` → `paid` is settlement progress — state `Payout`
  already owns (its own `status`) together with the `payout_allocations`
  join (§3.7). A duplicate status column here would be a second source of
  truth that can drift from the real one; "has this allocation been paid
  out" is answered by joining `payout_allocations → payouts.status`, not by
  a stored column on this row.
- `clawed_back` is not bookkeeping at all — flipping this row to
  `clawed_back` with no attached amount, reason, or timestamp is exactly the
  kind of implicit financial-value mutation §4.6 exists to prevent
  ("Refunds/chargebacks create explicit adjustment/clawback records... do
  not mutate original financial values"). A clawback is always a new
  `RevenueAllocationAdjustment` row against this one.

So the resolution is the second option this spec always allowed for: **the
original allocation is fully immutable, and settlement/reversal state lives
in the structures that already exist for it** (`Payout`/`payout_allocations`
for settlement, `RevenueAllocationAdjustment` for reversal) rather than on
this row. No schema field was kept "just because immutable sounds stricter"
— the fields below are exactly the ones needed to reconstruct the original
economics, nothing more.

- **Key fields** — every one of these is required by §1.3's LOCKED rule that
  the snapshot be self-contained (the "Every original RevenueAllocation must
  snapshot, at minimum" list from the brief, mapped 1:1 to columns):
  - `id`
  - `payment_id` (source payment/transaction — FK, unique, see below)
  - `user_id`
  - `partner_id` (partner attribution — snapshot copy, not a live join)
  - `platform_commission_rate_id` (FK into `platform_commission_rates`,
    §2.4 — the exact version, and platform, applied)
  - `customer_paid_amount` (copied from Payment, so this row reads
    standalone without joining back)
  - `commission_eligible_amount` (post-proration, §1.5 — equals
    `customer_paid_amount` when no boundary crossing applies)
  - `commissionable_proceeds` (§1.3 formula, computed from
    `commission_eligible_amount`)
  - `influencer_percentage` (35% at allocation time — stored, not just
    assumed from "current" config, so a future rate change never touches
    old rows)
  - `influencer_amount`
  - `budgts_percentage` (65% at allocation time)
  - `budgts_amount`
  - `commission_window_determination` (an explicit record of *why* this
    payment was/wasn't commissionable: `within_window` /
    `outside_window` / `prorated_boundary` — not left implicit in the
    amount alone, so an auditor can see the reasoning, not just the result)
  - `redemption_id` — the attribution reference this traces back to
  - `created_at`
- **Ownership:** backend-written only, one-time, at Payment-processing time.
- **Immutable:** the **entire row**, forever, no exceptions — DB-enforced by
  a hard trigger blocking every `UPDATE`/`DELETE`, the same trigger used on
  `Payment`/`Redemption`/`RevenueAllocationAdjustment`. This is explicit in
  the brief: "Historical allocation facts are never rewritten."
  Refunds/chargebacks produce separate adjustment rows referencing this one
  (§4.6); settlement is tracked by `Payout`/`payout_allocations` (§3.7),
  never by editing this row.
- **Uniqueness/idempotency:** unique on `payment_id` — at most one original
  allocation per payment, which combined with `Payment`'s own
  `external_transaction_id` uniqueness makes the whole chain idempotent
  under webhook replay.
- **Relationships:** 1:1 → `Payment`; N:1 → `Partner`; N:1 →
  `platform_commission_rates`; N:1 → `Redemption`; referenced by
  `RevenueAllocationAdjustment` (§4.6) and by `payout_allocations` (§3.7).

### 3.7 Payout

**Purpose.** Amounts owed/paid to a Partner. No automated processing in this
phase (§5) — this is the auditable ledger a human executes against.

- **Key fields:** `id`, `partner_id`, `status`
  (`payable`/`paid`/`clawed_back`, plain text + CHECK), `amount` (sum of the
  `RevenueAllocation`s it covers, net of any adjustments), `period_covered`
  (start/end, for statement-style grouping), `paid_at` (nullable),
  `paid_reference` (opaque — bank transfer id, manual note; no payment-rail
  integration in this phase), `created_at`, `updated_at`.
- **Ownership:** backend/admin-written only (§3.8, §4.9).
- **Immutable:** once `status = paid`, the `amount`/`paid_at`/
  `paid_reference` become effectively historical fact — a mistake here is
  corrected the same way as everywhere else in this spec: a clawback
  adjustment, not an edit.
- **Relationships:** a join table `payout_allocations (payout_id,
  revenue_allocation_id)` (or `RevenueAllocation.payout_id` nullable FK, if
  a strict "one allocation belongs to at most one payout" rule is
  acceptable — this spec recommends the join table so a mis-grouped
  allocation can be moved between payouts before the payout is marked paid,
  without ever needing to edit a `RevenueAllocation`) preserves full
  traceability from a payout amount back to the individual allocations it
  covers, as required.
- **Financial-integrity note:** a `Payout` is a **rollup view with its own
  durable state**, not a cache — once `paid`, it's a permanent record even
  if the underlying allocations are later adjusted (the adjustment produces
  a new payable/clawed-back amount for a *future* payout, never edits a
  paid one).

### 3.8 Ownership / RLS model for this subsystem

Unlike every existing table in this repo (`transactions`, `budgets`,
`savings_goals`, …), most of these rows are **not** rows an end user should
read or write directly:

- `Partner`, `Voucher`, `platform_commission_rates`, `Payout`: **no
  authenticated-user access at all.** Admin-only (§4.9) — RLS deny-all for
  the `authenticated` role, same posture as `plaid_webhook_events`, access
  only via the service-role client from backend/admin code paths.
- `Redemption`, `Subscription`, `Payment`, `RevenueAllocation`: RLS scoped
  to `user_id = auth.uid()` for **read-only** access (a user should be able
  to see their own subscription/payment history), with **no** authenticated
  `INSERT`/`UPDATE`/`DELETE` policy at all — every write goes through a
  backend code path using the service-role client (webhook processor,
  redemption server action with server-side voucher validation), never a
  direct client insert the way `transactions` allows. This is a deliberate
  deviation from the repo's normal "RLS `WITH CHECK` on user inserts"
  pattern (`docs/conventions.md` step 4), because unlike a manually-entered
  transaction, nothing in this subsystem should ever be a user-asserted
  fact — every row here must trace back to a verified platform event.

---

## 4. IMPLEMENTATION REQUIREMENTS

Concrete musts derived from §1–§3, restated here as a checklist so nothing
gets lost in prose:

1. All money columns: `integer`, minor units, never float — no exception,
   including every intermediate value inside domain-logic functions (§2.2).
2. Deterministic rounding per §2.5 — implemented as pure, unit-tested
   functions, never inlined per call site.
3. Deterministic calendar-month/leap-year math per §2.6 — one pure function,
   unit-tested independently of the allocation logic that calls it.
4. `Payment` and `RevenueAllocation` rows are append-only at the DB level —
   no `UPDATE` grant to any role that could reach them outside the
   originating backend code path. (Whether this is enforced by a Postgres
   trigger/rule in addition to RLS, or by code discipline alone matching the
   existing `duplicateOfId` precedent, is an implementation choice — but the
   *intent* is a hard requirement.)
5. Idempotent webhook handling: verify → log raw (dead-letter table,
   mirroring `plaid_webhook_events`) → process → mark handled, with the
   `Payment.external_transaction_id` unique index as the final backstop
   against double-processing on redelivery (§2.9, §3.5).
6. Adjustments (§4.6) are new rows referencing the original immutable row,
   never `UPDATE`s to `Payment`/`RevenueAllocation`.
7. `first_paid_at` and `Subscription.attributed_*` fields are write-once at
   the code level, not just "expected" to be write-once — the server action/
   webhook processor must reject or ignore any attempt to set them a second
   time.
8. `platform_commission_rates` is append-only (§2.4); every
   `RevenueAllocation` stores the FK to the version actually used.
9. Credentials — Apple/Google/RevenueCat signing keys and API credentials —
   live in `.env` / Vercel project settings only, per CLAUDE.md's existing
   rule, and per the `plaid_items.access_token_enc` precedent, anything
   long-lived stored in the DB (if any such credential ever needs to be) is
   encrypted at rest, never in plaintext, never sent to the client.

### 4.6 Refunds / chargebacks — adjustment model

- A refund or chargeback event from RevenueCat/the platform produces a new
  `RevenueAllocationAdjustment` row: `id`, `revenue_allocation_id` (FK to
  the original, immutable), `type` (`refund`/`chargeback`/`reconciliation`,
  plain text + CHECK), `amount_delta` (signed integer minor units — negative
  for money taken back, matching the `savings_contributions` signed-ledger
  precedent), `reason`, `external_reference_id` (idempotency key for the
  adjustment event itself, same pattern as `Payment`), `created_at`.
- The original `Payment` and `RevenueAllocation` rows are **never** touched.
  Any "current net amount" is a computed sum (original + adjustments) at
  read time, never a stored/mutated total on the original row.
- Refunds/chargebacks **do not** reset or extend `first_paid_at` or the
  commission window (§1.4) — an adjustment changes money, never attribution
  or timing.
- A clawback against an already-`paid` `Payout` doesn't rewrite that payout
  either — it produces a negative balance to net against a *future* payout
  to the same partner, consistent with §3.7's "permanent record once paid."

### 4.9 Security / admin

- **Webhook verification.** RevenueCat/Apple/Google webhook signatures
  verified before any processing, mirroring
  `src/lib/plaid/webhook-verify.ts`'s pattern (signed payload, hash/signature
  check, timestamp freshness to reject replay). RevenueCat provides its own
  webhook signing scheme (`Authorization` header shared secret, or signed
  payload depending on integration mode) — the specific verification
  mechanics are an implementation detail (§6), the *requirement* that
  verification happens before any DB write is not.
- **Replay/idempotency protection.** Covered structurally by
  `Payment.external_transaction_id` uniqueness (§3.5) and the webhook
  dead-letter log (§2.9, item 5 above) — a redelivered event is a safe
  no-op, never a duplicate financial fact.
- **Voucher enumeration/rate limiting.** The redemption endpoint (wherever a
  user enters a code) must rate-limit by user/IP and must not leak whether a
  guessed code exists via response-timing or distinguishable error messages
  beyond "invalid or expired code" — this prevents scripted enumeration of
  active voucher codes.
- **No entitlement from client-reported purchase success.** Restated from
  §1.6/§2.9 because it's a security property, not just a business rule: a
  mobile client telling the backend "I just bought this" is never
  sufficient on its own; entitlement is granted from the verified webhook
  event.
- **Explicit admin authorization boundary — 🟡 gap, not a decision made by
  this spec.** This repository currently has **no admin-role concept at
  all** (confirmed: no `admin`/`service_role`/role-check code anywhere in
  `src/`). `Partner`/`Voucher`/reporting operations need an admin-only
  surface (§3.8), but *how* "admin" is established — a `role` column on
  `profiles`, a separate allowlist table, Supabase custom JWT claims, or
  simply "no in-app admin UI yet, operate via the service-role client from
  a trusted script/console only" — is undecided and out of this spec's
  authority to invent. See §6.
- **Credential protection.** Per §4 item 9 and CLAUDE.md's existing
  environment-variable rules — no new pattern needed, just applied here.
- **No historical mutation by ordinary application paths.** Restates §4
  item 4 as a security property: even a compromised or buggy ordinary
  request-scoped code path (running as the *user's* session, not
  service-role) has no `UPDATE`/`DELETE` grant on `Payment` or
  `RevenueAllocation` under any circumstance.

---

## 5. OUT OF SCOPE (this phase)

Explicitly not built now — restated here so nothing downstream infers
permission to start on them:

- Apple/Google billing integration code (StoreKit/Play Billing SDK work)
- RevenueCat SDK/API integration code
- Web checkout / Stripe customer subscriptions
- Automated influencer payout processing (bank transfer, etc.)
- Influencer self-service portal
- A general/extensible affiliate platform beyond this specific program
- Safe-to-spend, cash-flow forecasting, net worth (existing V2 items,
  unrelated to this track)
- Receipt/email ingestion (existing V2 item, unrelated)
- AI financial assistant (existing V2+ item, unrelated)
- Any other roadmap item not explicitly named in this document

This phase is: **spec now** (this document); schema/migration → Zod →
domain logic → TDD → server action → UI for the seven core entities comes
in a later, separate pass once this spec is reviewed.

---

## 6. OPEN ENGINEERING SPIKES

Genuinely undecided implementation details — not business decisions, and
none of them block writing the schema for the entities themselves, but each
should be resolved (or explicitly deferred with a stub) before the code path
that depends on it ships:

1. **StoreKit Promotional Offer sequencing** (§2.7) — needs a real Apple
   developer/sandbox environment to verify how the client requests a signed
   Promotional Offer at the moment the trial ends, and confirm it can't be
   pre-authorized incorrectly. Highest-uncertainty spike in this document.
2. **Rounding mode sign-off** (§2.5) — round-half-up is proposed as the
   default; needs a one-line owner confirmation (or override) before it's
   load-bearing in tested code.
3. **Calendar-month clamp rule sign-off** (§2.6) — the "clamp to last day of
   target month" rule is proposed as the default; same ask.
4. **Multi-voucher attribution precedence** (§2.3) — first-touch vs.
   last-touch when a user redeems more than one code before their first
   paid transaction. Needs an owner call, not an engineering guess, since
   it directly affects which influencer gets paid.
5. **Admin authorization boundary** (§4.9) — no admin-role concept exists in
   this repo today. Needs its own small design decision (likely a short
   addendum to `docs/conventions.md`, not a whole spec) before any
   admin-only server action can be written, even though the underlying
   `Partner`/`Voucher` tables can be created without it (they just have no
   in-app write path until this is resolved).
6. **RevenueCat webhook signature verification mechanics** (§4.9) — the
   specific header/signature scheme depends on which RevenueCat integration
   mode is used; needs a look at current RevenueCat docs at implementation
   time rather than being guessed here.
7. **Play Console multi-phase offer configuration** (§2.8) — architecturally
   sound per RevenueCat/Google docs, but the actual Play Console setup
   should be verified against a sandbox purchase before being relied on;
   lower uncertainty than the Apple spike.

None of these are 🔴 blockers to landing the spec itself — they're scoped
exactly to the phases this document already says are Out of Scope (§5).

**Resolved 2026-09-18 (was going to be item 8, "single-open-rate
enforcement"):** once `platform_commission_rates` was correctly scoped per
platform (§2.4 update), "at most one open row" became a plain partial unique
index (`UNIQUE (platform) WHERE effective_to IS NULL`) — no expression-index
trick needed, and it's now DB-enforced in migration `0017`. What remains
open is only the *transaction/locking discipline* the domain-logic layer
must follow when writing to this table (close-then-insert, one transaction —
documented in §2.4), which is ordinary application code, not a schema
question.

---

## 7. TEST PLAN (for the eventual TDD pass, listed here for spec completeness)

Not implemented yet — recorded so the later TDD pass has a checklist that
traces back to the LOCKED rules, per `docs/conventions.md`'s "tests first"
convention:

- Commissionable proceeds computation (§1.3, §2.5), including the
  remainder-based rounding property (`influencer_amount + budgts_amount ==
  commissionable_proceeds`, always, across a range of amounts/rates).
- 35/65 allocation on a range of `customer_paid_amount` values, including
  amounts that don't divide evenly.
- Monthly introductory (discounted) payments — first 3 periods.
- Normal monthly payments — 4th period onward, full price.
- Annual payment — full price, first-year discount case, and renewal case.
- Exact commission-window boundaries: a transaction exactly at the 12-month
  mark, one day before, one day after.
- Calendar-month/leap-year behavior (§2.6): Jan 31 anchor, Feb 29 anchor in
  a leap year evaluated in a non-leap target year, and a handful of
  ordinary anchors, all against the clamp rule.
- Cancellation/resubscription: window does not reset; attribution is
  retained; resubscription after window-end produces no commission.
- Failed payment/pause/grace: none of these move `first_paid_at` or the
  window boundary.
- Upgrade/downgrade boundary proration (§1.5): a covered period that spans
  the boundary produces the correct pre-/post-boundary split; an
  upgrade/downgrade that does *not* cross the boundary is unaffected.
- Refunds/chargebacks as adjustments (§4.6): original rows unchanged,
  adjustment row correctly signed, computed "net" reads correctly, does not
  touch `first_paid_at`.
- Idempotency: replayed webhook event (same `external_transaction_id`)
  produces no duplicate `Payment`/`RevenueAllocation`.
- Immutable attribution snapshots (§2.3): editing a `Partner`'s name or a
  `Voucher`'s status after the fact does not change any existing
  `Redemption` or `RevenueAllocation`'s recorded values.

---

## Roadmap placement

`docs/roadmap.md` already has a precedent for exactly this shape of addition
— a "Delivery track (parallel)" section that runs alongside the main ladder
without being part of it (see "Scale & Infrastructure" and the superseded
"Native apps" track at the end of that file). The recommended addition
follows that same pattern and is proposed separately (not applied to
`roadmap.md` in this pass) so it can be reviewed on its own:

```markdown
## Delivery track (parallel) — Monetization / Influencer Revenue Share

Not a capability tier — runs alongside the main ladder without blocking it.
Spec: `docs/specs/2026-09-18-monetization-ledger-design.md`.

Mobile-only paid subscriptions ($9.99/mo, $69/yr, 7-day trial) via Apple/
Google IAP + RevenueCat, with a 35/65 influencer revenue-share program
(20% customer discount, 12-calendar-month commission window per
subscription). Web stays free — no checkout changes to the existing
product.

- **Spec** ................................................... ✅ this file
- **Schema + migration** (Partner/Voucher/Redemption/Subscription/
  Payment/RevenueAllocation/Payout + platform_commission_rates) ... ⏳ not started
- **Zod / domain logic / TDD** ................................ ⏳ not started
- **Server actions** (redemption, webhook processor) .......... ⏳ not started
- **Admin surface** (blocked on the admin-authorization-boundary
  open spike, spec §6 item 5) ................................. ⏳ not started
- **Apple StoreKit / Google Play Billing / RevenueCat
  integration** ................................................ ⏳ not started, explicitly out of scope until
                                                                       the schema/domain layers above exist
```

This does not remove, rewrite, or reorder any existing V1/V1.5/Mobile
Launch/V2/V2+ content.

---

## Contradictions found against existing repo architecture

None that rise to 🔴 (financial-correctness, data-integrity, security,
destructive, or architecture-contradiction level). One 🟡 structural
deviation, called out rather than silently applied:

- **RLS write posture differs from the repo's norm for four of the seven
  tables** (§3.8): `Redemption`, `Subscription`, `Payment`,
  `RevenueAllocation` are read-only to the owning user with no authenticated
  `INSERT`/`UPDATE` policy at all, unlike every existing table (`transactions`,
  `budgets`, `savings_goals`, …) which allows the user's own `supabase`
  client to write with RLS `WITH CHECK` as the guard. This is a deliberate,
  reasoned deviation (§3.8 explains why: nothing in this subsystem should
  ever be a user-asserted fact), not an oversight — flagged here explicitly
  so it's reviewed as a conscious choice rather than merge unnoticed.
- **No admin-role concept exists yet** (§4.9, §6 item 5) — genuinely missing
  from the repo, not a contradiction with anything existing, just a
  dependency this track will need before its admin surface can be built.

**Self-contradiction caught and fixed before `0017` was applied anywhere
(2026-09-18):** this spec's first draft gave `RevenueAllocation` both a
`status` field *and* an "immutable forever" description in the same
section — an internal inconsistency, not a repo-architecture one. Resolved
in §3.6: the row is fully immutable, `status` was removed, and its intended
meanings were redistributed to where they already belonged (`Payout`/
`payout_allocations` for settlement, `RevenueAllocationAdjustment` for
reversal). Schema/migration updated to match; see `0017`'s current form.
