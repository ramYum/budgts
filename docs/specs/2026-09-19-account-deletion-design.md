# Account Deletion — Implementation Design

**Status:** design/audit only. No code, migration, or schema change is made
by this document. It designs the account-deletion lifecycle locked in
`docs/specs/2026-09-17-mobile-app-launch-design.md` §12.2, against the
**actual current schema** (verified directly against `schema.ts` and every
migration file, `0000`→`0017`, not assumed).

**Tagging**, consistent with the two prior specs this document depends on:

| Tag | Meaning |
| --- | --- |
| **CAN DECIDE NOW** | An engineering/architecture call this document makes, because it doesn't depend on the open legal/retention questions |
| **OPEN ENGINEERING DECISION** | Implementation detail needing investigation before it's load-bearing |
| **OPEN PRODUCT DECISION** | Business/UX call needing the owner |
| **OPEN LEGAL DECISION** | Needs legal/accounting input — not an engineering guess, not invented here |

---

## 1. Purpose

Design *how* the account-deletion lifecycle already locked in the mobile
launch spec gets built, against this repository's real schema — not a
restatement of the lifecycle itself (that's locked; see mobile-launch spec
§12.2) and not a decision on retention periods (still open; see mobile-
launch spec §12.4, restated here in §11 with no numbers filled in).

Scope: the technical design only. No code is written. No migration is
written — where a schema change will eventually be needed, it's described
as a **future migration design**, explicitly not authored here.

---

## 2. Current data model

Verified directly against `src/lib/db/schema.ts` and the FK-defining
statements in every migration file (`0000` through `0017` — grepped, not
assumed). Every per-user table's relationship to `auth.users` falls into
exactly two groups:

**`ON DELETE CASCADE` from `auth.users` (11 tables):** `profiles`,
`accounts`, `categories`, `transactions`, `budgets`, `savings_goals`,
`savings_contributions`, `plaid_items`, `plaid_accounts`,
`plaid_merchant_rules`, `recurring_series`.

**`ON DELETE RESTRICT` from `auth.users` (4 tables, migration `0017`):**
`redemptions`, `subscriptions`, `payments`, `revenue_allocations`.

**No direct `user_id` FK to `auth.users` at all:** `plaid_webhook_events`
(no `user_id` column — logged before the owning user is resolved),
`partners`, `vouchers`, `platform_commission_rates`,
`revenue_allocation_adjustments`, `payouts`, `payout_allocations`
(platform/admin-owned, per monetization spec §3.8 — not reachable from a
specific end user's deletion request at all, except indirectly via the
`user_id` denormalized onto `redemptions`/`subscriptions`/`payments`/
`revenue_allocations`).

**Consequence, stated precisely:** a direct `DELETE FROM auth.users WHERE
id = $1` (or the Supabase Admin `deleteUser` call that does the same
thing):

- **Succeeds and fully cleans up** every CASCADE table automatically, for
  a user with **no monetization history**.
- **Fails outright** (Postgres raises the FK violation and the whole
  statement aborts — nothing is deleted, not even the CASCADE tables) for
  a user with **any** row in `redemptions`/`subscriptions`/`payments`/
  `revenue_allocations`, because the RESTRICT constraint blocks it.

This is the single most important fact this audit surfaces: **account
deletion is not one code path, it's two**, branching on whether the user
has monetization history. §5 designs both.

---

## 3. Table-by-table data disposition

For every user-owned/user-adjacent table. "Ownership" = how the row
relates to the deleting user; "Cascade/Restrict" = its FK behavior to
`auth.users` today.

| Table | Ownership | FK to `auth.users` | PII | Financial history | Credentials/secrets | What happens on deletion | Engineering work needed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `auth.users` | is the user | — | email, phone, OAuth identity data | no | no (Supabase-managed) | **DELETE** (no monetization history) or **ANONYMIZE in place** (has monetization history) | Branch logic (§5); anonymization mechanism is OPEN ENGINEERING DECISION (§16) |
| `profiles` | 1:1, `id = auth.users.id` | CASCADE | no (just currency pref + timestamps) | no | no | **DELETE** (cascades automatically on path A; explicit delete on path B) | None — already correct |
| `accounts` | user-owned | CASCADE | no (account name is user-chosen, could theoretically contain PII the user typed, e.g. naming an account after a person — low risk) | no (metadata only, not the transactions) | no | **DELETE** | None — already correct |
| `categories` | user-owned | CASCADE | no | no | no | **DELETE** | None — already correct |
| `transactions` | user-owned | CASCADE | possibly (user-typed `description`/`note`, Plaid `merchant_name`) | **yes — this is the user's financial history** | no | **DELETE** — restated below, this is *personal* financial history, not the *monetization ledger*; nothing here needs to survive account deletion the way `payments`/`revenue_allocations` do | None — already correct |
| `budgets` | user-owned | CASCADE | no | no (targets, not activity) | no | **DELETE** | None — already correct |
| `savings_goals` | user-owned | CASCADE | no (`name` is user-chosen) | no | no | **DELETE** | None — already correct |
| `savings_contributions` | user-owned | CASCADE | no | no (own goal ledger, not billing) | no | **DELETE** | None — already correct |
| `plaid_items` | user-owned | CASCADE | no | no (connection metadata) | **yes — `access_token_enc`** | **DELETE**, but only *after* revoking at Plaid (§6) — deleting the row without calling `/item/remove` first leaves a live bank connection Plaid still thinks is active | Sequencing requirement, not a schema gap (§6) |
| `plaid_accounts` | user-owned (via item) | CASCADE (from `plaid_items`) | no | no (account metadata/balances) | no | **DELETE** (cascades from `plaid_items` deletion) | None — already correct |
| `plaid_webhook_events` | not user-scoped (no `user_id`) | none | Plaid `item_id` string, raw webhook `payload` (jsonb — could include institution/account metadata) | no | no | **DEPENDS ON RETENTION POLICY** — not personally identifying on its own, but is a dangling operational record once its `item_id` is disconnected/deleted | Needs a join on `item_id` (text match, not FK) to find rows belonging to a deleted user's former items — see §16 |
| `plaid_merchant_rules` | user-owned | CASCADE | no (merchant id + category choice) | no | no | **DELETE** | None — already correct |
| `recurring_series` | user-owned | CASCADE | no | no (derived prediction metadata, not ledger fact) | no | **DELETE** | None — already correct |
| `partners` | platform-owned, not user-reachable | none | influencer's own PII (not the deleting user's) | no | payout details (opaque, not raw secrets) | **N/A** — not this user's data | None |
| `vouchers` | platform-owned | none | no | no | no | **N/A** | None |
| `redemptions` | user-owned (attribution) | **RESTRICT** | no beyond `user_id` itself | **yes — attribution fact** | no | **RETAIN** (immutable, trigger-blocked from UPDATE/DELETE) | See §7 — cannot be scrubbed in place under current schema |
| `subscriptions` | user-owned | **RESTRICT** | no beyond `user_id`, `platform_subscription_id` (RevenueCat reference, not directly identifying) | **yes — billing relationship record** | no | **RETAIN** (`status`/`updated_at` remain updatable; `first_paid_at`/`attributed_*` are write-once, not full-row-immutable) | See §7 |
| `payments` | user-owned | **RESTRICT** | **possibly — `raw` jsonb is the raw RevenueCat event payload, which may include customer-identifying fields depending on what RevenueCat sends** | **yes — the financial fact itself** | no | **RETAIN** (fully immutable, trigger-blocked from UPDATE/DELETE — see §7, this is the sharpest schema tension in this design) | See §7 — schema change likely required to ever de-identify `raw` |
| `revenue_allocations` | user-owned | **RESTRICT** | no beyond `user_id` | **yes** | no | **RETAIN** (fully immutable) | See §7 |
| `revenue_allocation_adjustments` | not directly user-scoped (`revenue_allocation_id` only) | none | `reason` is free text, admin-entered — low but nonzero PII risk | yes | no | **RETAIN** | None beyond what §7 covers via its parent |
| `payouts` / `payout_allocations` | platform-owned | none | no | yes (partner-level, not user-level) | opaque payout reference | **N/A** — not scoped to the deleting user at all | None |
| `platform_commission_rates` | platform-owned | none | no | no (rate config) | no | **N/A** | None |

**Row count check against the task's requested list:** `auth.users`
(covered), `profiles` (covered), `accounts` (covered), `transactions`
(covered), `plaid_items`/`plaid_accounts`/`plaid_webhook_events` (covered),
`recurring_series` (covered), savings goals (`savings_goals` +
`savings_contributions`, covered), `budgets` (covered), `categories`
(covered), merchant rules (`plaid_merchant_rules`, covered), all migration
`0017` tables (covered). No other user-owned table exists in `schema.ts`.

---

## 4. Account deletion lifecycle (implementation view)

Restates the locked lifecycle (mobile-launch spec §12.2) as an
implementation sequence, branching where the schema actually forces a
branch (§2):

```
REQUEST (mobile or web, §9)
  │
  ▼
CONFIRM (§8)
  │
  ▼
CHECK SUBSCRIPTION STATE (RevenueCat) ──▶ communicate, never auto-cancel (§6)
  │
  ▼
REVOKE SESSIONS / PREVENT FUTURE LOGIN (§5)
  │
  ▼
DISCONNECT EVERY PLAID ITEM (reuses disconnectPlaidItem per item, §6)
  │
  ▼
DOES THIS USER HAVE ANY MONETIZATION-LEDGER ROW?
  │
  ├── NO  → hard-delete `auth.users` → every CASCADE table auto-cleans (§2)
  │
  └── YES → do NOT delete `auth.users`
            → anonymize `auth.users` in place (§5)
            → explicitly DELETE every CASCADE-table row for this user_id
              (same tables, just not via the auth.users cascade — §5)
            → monetization RESTRICT tables are RETAINED as-is (§7);
              de-identification beyond the auth.users scrub is schema-
              limited today (§7, §16)
  │
  ▼
FINALIZE — confirm to the user what was deleted vs. retained (§4, §10)
```

**CAN DECIDE NOW:** the branch condition is a single, cheap check — `EXISTS
(SELECT 1 FROM redemptions WHERE user_id = $1) OR EXISTS (... subscriptions
...) OR EXISTS (... payments ...) OR EXISTS (... revenue_allocations ...)`
— run once at the start of the deletion process, before anything
irreversible happens, so the two paths never race each other.

---

## 5. Auth/session handling

**Do not assume deleting `profiles` invalidates a Supabase Auth session —
it doesn't.** `profiles` is an application table; Supabase's session/JWT
machinery lives entirely in the `auth` schema and knows nothing about it.

### Path A — no monetization history

- `supabase.auth.admin.deleteUser(userId)` (service-role, same tier of
  privilege this repo already uses for test-user cleanup in
  `tests/e2e/helpers/test-user.ts`). This deletes the `auth.users` row,
  which:
  - Cascades every CASCADE table in §2/§3 automatically.
  - Is expected to also remove Supabase's own internal session/refresh-
    token rows for that user (Supabase manages `auth.sessions`/
    `auth.refresh_tokens` with its own FKs to `auth.users`) — **OPEN
    ENGINEERING DECISION:** confirm this against the exact behavior of the
    `@supabase/supabase-js` version already pinned in this repo
    (`^2.116.0`) rather than assuming it from general Supabase docs.
  - Also removes `auth.identities` (linked Google OAuth identity data) as
    part of the same cascade, since that table is Supabase-managed with
    its own FK to `auth.users`.

### Path B — has monetization history

- `auth.users` is **not** deleted (§2 forces this).
- **Prevent future login:** the account must be banned/disabled while the
  row survives for FK integrity. Supabase's Admin API exposes a ban
  mechanism (`updateUserById` with a ban duration) for exactly this case
  — **OPEN ENGINEERING DECISION:** confirm the exact field/method name
  against the pinned SDK version before relying on it; this document does
  not assert a specific method signature it hasn't verified against code.
- **Invalidate active sessions:** beyond preventing new sign-ins, existing
  refresh tokens must be revoked so an already-signed-in device can't keep
  refreshing its session. Supabase's Admin API supports revoking a user's
  sessions independently of deleting them — same verification caveat as
  above.
- **Scrub identifying fields on `auth.users` itself:** email → a
  placeholder/tombstone value, phone (if ever collected) → null, `
  raw_user_meta_data`/`raw_app_meta_data` → cleared. This is the primary
  de-identification lever available under the current schema (§7).
- **Scrub `auth.identities`:** the linked Google OAuth identity row
  contains provider-supplied profile data (Google email, name, avatar
  URL). Supabase's public Admin API is not confirmed to expose a
  direct "scrub this user's identities" call for an admin acting on
  someone else's account (its `unlinkIdentity` is a user-session
  operation) — **OPEN ENGINEERING DECISION:** whether this requires a
  direct service-role SQL statement against `auth.identities` (the same
  class of direct-Postgres operation this repo's own tooling already uses
  elsewhere for admin-level DB work) is unresolved and needs verification
  against Supabase's current schema, not assumed here.

### Magic Link vs. Google OAuth — no difference to the deletion mechanics

Both sign-in methods (mobile-launch spec §4) resolve to the same
`auth.users` row and the same session/token machinery — deletion doesn't
need method-specific handling **except** that Google's linked identity row
(`auth.identities`) only exists for users who used Google OAuth, so the
identity-scrub step above is conditional on that identity existing, not
universal.

### Deletion requested while logged in vs. from the web

- **Logged in (mobile or a hypothetical authenticated web session):** the
  request is authenticated by the caller's own session — standard
  `requireUser()`-style server-side identity verification (mobile-launch
  spec §4), never a client-supplied user id.
- **From the web, not necessarily logged in:** this is the store-required
  "web-accessible deletion-request path" (§9) — it is **not** the same
  code path as an authenticated in-app deletion, because the web path
  must securely establish identity first (typically via the same
  magic-link mechanism the app already has, not a new authentication
  scheme) before anything about the account is disclosed or acted upon.

---

## 6. Plaid handling

Traced directly against `src/server/plaid/disconnect.ts` (the only
existing Plaid-disconnection code):

- **Current behavior (bank disconnect, not account deletion):** for a
  single item — best-effort `plaidClient().itemRemove({ access_token })`
  (revokes at Plaid's side; failure is logged and non-fatal, since a
  revoked/expired Item can't be removed twice but must still disconnect
  locally), then `DELETE FROM plaid_items WHERE id = ...`, which cascades
  `plaid_accounts` and `SET NULL`s `transactions.plaid_account_id` —
  transaction history is kept, only the connection metadata is torn down.
  An explicit `purge: true` path additionally deletes that item's `bank`-
  sourced transactions — a separate, already-confirmed action, not the
  default.
- **What happens to the encrypted access token:** it never leaves the
  `plaid_items` row before that row is deleted — deleting the row deletes
  the ciphertext. No separate token store exists anywhere else to clean
  up.
- **What happens to Plaid accounts:** cascade-deleted with the item.
- **What happens to historical transactions:** kept (detached, not
  deleted) unless `purge: true`.
- **What happens to webhook events:** **nothing today** — `
  plaid_webhook_events` has no cleanup path tied to disconnect at all
  (§3).
- **Whether anything remains that could reconnect to the user:** no — once
  `/item/remove` succeeds, Plaid itself treats the Item as revoked; the
  only residual local pointer is the `plaid_webhook_events.item_id` text
  match (§3), which is inert (no code path reconnects from it).

### For account deletion specifically

**CAN DECIDE NOW:** account deletion calls `disconnectPlaidItem(...,
{ purge: false })` (or a small variant of it) for **every** Plaid item the
user has, before proceeding to §5's auth handling — reusing the existing,
already-tested function rather than writing new Plaid-revocation logic.
`purge` stays `false` here because transaction deletion is handled by the
broader account-deletion data-removal step (§4), not by Plaid disconnect's
own narrower purge flag — no need to route through two different
transaction-deletion mechanisms for the same outcome.

**Missing cleanup identified by this audit:** `plaid_webhook_events` rows
matching this user's former item(s) are never removed by disconnect, and
would still not be removed by account deletion unless explicitly added —
see §16.

---

## 7. Monetization-history handling (migration `0017` deep-dive)

**Migration `0017` is not changed by this document.**

### Exactly which relationships block hard deletion

`redemptions`, `subscriptions`, `payments`, `revenue_allocations` each
have a `user_id` FK to `auth.users` with `ON DELETE RESTRICT` (§2). Any one
of these having a row for a user is sufficient to block
`DELETE FROM auth.users`.

### Can retained monetization records be safely de-identified without breaking their guarantees?

Checked against each of the four integrity properties named in the task:

- **Foreign keys:** de-identifying `auth.users` (email/phone/metadata, §5)
  does **not** touch any FK — `user_id` on these tables stays the same
  UUID, satisfying every existing FK exactly as before. Safe.
- **Immutability:** this is where it breaks down for three of the four
  tables. `redemptions`, `payments`, and `revenue_allocations` each carry
  a hand-appended trigger (`monetization_ledger_immutable_fact`) that
  **unconditionally blocks UPDATE and DELETE** on the row — there is no
  carve-out for "just scrubbing a PII field." **This means, under the
  current schema, `payments.raw` (the field most likely to actually
  contain customer-identifying data from a raw RevenueCat payload) can
  never be edited once written — not by an account-deletion process, not
  by anything else.** `subscriptions` is the one exception: its trigger
  only protects `first_paid_at` and the three `attributed_*` columns,
  leaving the rest of the row (including anything that might need a
  privacy-driven update) updatable in principle — though `subscriptions`
  has no obviously-PII field beyond `user_id` itself today.
- **Revenue allocation integrity:** untouched either way — de-identifying
  `auth.users` changes nothing about `commissionable_proceeds`,
  `influencer_amount`, `budgts_amount`, or any of the CHECK-constrained
  sum invariants. Safe.
- **Payout relationships / auditability / idempotency:** untouched —
  `payout_allocations`, `platform_commission_rates` FKs, and the
  `external_transaction_id`/`payment_id` uniqueness constraints that
  provide idempotency all reference IDs, not PII. Safe.

### The actual finding

**De-identification of the retained monetization rows themselves is
schema-limited today, specifically for `payments.raw`.** The
architecturally clean version of "de-identify where possible" (mobile-
launch spec §12.2 step 8) is achievable for everything reachable through
`auth.users`/`auth.identities` (§5) — which covers the *primary* identity
data — but not for whatever a RevenueCat webhook payload happened to
include inside `payments.raw`, because that field is inside a table whose
trigger permits no UPDATE at all.

### Future migration design (not authored now)

If, once §11's legal/retention decisions are resolved, the answer requires
scrubbing `payments.raw` specifically, the schema would need one of:

1. A **narrow, explicitly-scoped exception** to the immutability trigger —
   e.g. a second trigger function that permits UPDATE **only** when the
   sole change is `raw` being set to a redacted/null value (never
   touching any financial column), keeping every financial-integrity
   guarantee intact while allowing exactly one privacy-driven operation.
2. **Never storing potentially-identifying fields in `raw` in the first
   place** — redacting the RevenueCat payload *before* insert (at
   ingestion time, in the not-yet-built webhook processor), so there's
   nothing to scrub later. This is arguably the better fix and doesn't
   touch `0017` at all — it's a decision for the webhook-processing code
   that doesn't exist yet (mobile-launch spec §9), not a schema change.

**This document does not choose between these two — that's an
implementation decision for whoever builds the RevenueCat webhook
processor, informed by exactly what RevenueCat's payload actually
contains (verify against real payloads, don't assume).** See §16.

---

## 8. Confirmation UX

**OPEN PRODUCT DECISION for every bullet below** — this document does not
invent a legal requirement or a specific mechanism; it enumerates the
choices that exist:

- **Whether password/re-authentication is needed:** Budgts has no
  password (magic link + Google only, mobile-launch spec §4), so a
  "confirm your password" pattern doesn't apply as-is.
- **Whether magic-link reauthentication is sufficient:** possible —
  require the user to complete a fresh magic-link round-trip (or a fresh
  Google OAuth round-trip for a Google-signed-in user) immediately before
  the deletion request is accepted, proving live access to the account
  right now rather than relying solely on an existing session.
- **Whether a typed confirmation phrase is appropriate:** a common pattern
  for destructive actions (e.g. "type DELETE to confirm") — a UX choice,
  not a technical requirement, and not decided here.
- **Whether deletion is immediate or scheduled** (a grace/undo window):
  not decided. This interacts with §11 (retention) — an undo window would
  itself need a defined duration, which this document does not invent.

**CAN DECIDE NOW (regardless of which UX is chosen):** whatever
confirmation mechanism is picked, the actual deletion logic (§4) must be
triggered by a single, idempotent server-side operation gated on that
confirmation — not by the confirmation UI itself performing deletion
steps client-side.

---

## 9. Web deletion request

Required for Google Play compliance (mobile-launch spec §11) — a path that
works even for a user who no longer has the app installed.

**CAN DECIDE NOW — shape of the flow, not its exact UI:**

1. A public, unauthenticated web page (e.g. `budgts.com/delete-account` or
   similar — exact path not decided) that **does not disclose or act on
   any account information without first establishing identity.**
2. Identity establishment reuses the existing magic-link mechanism: the
   user enters their email, receives a link, and only after completing
   that round-trip does the flow reach anything account-specific — this
   is the same trust primitive the app already relies on for sign-in
   (mobile-launch spec §4), not a new authentication scheme.
3. Once identity is established, the flow proceeds through the same
   confirmation (§8) and deletion (§4) logic as the in-app path — **there
   are two entry points, not two deletion implementations.**

**OPEN PRODUCT DECISION:** whether the web flow is fully self-service
(completes the deletion itself) or logs a request for a backend process to
execute — not decided; either satisfies "web-accessible," and the choice
affects §8's confirmation design (a self-service flow needs its own
confirmation step; a logged-request flow might not need the same
immediacy).

**Security requirement, not optional:** the unauthenticated landing page
must reveal nothing (not even "an account with this email exists or
doesn't") before the magic-link step completes — mirrors the existing
sign-in form's behavior of not distinguishing "no such account" from "link
sent" in its response.

---

## 10. Retention-policy boundary

Explicit split, per the task's requirement not to invent retention
periods:

### CAN DECIDE NOW (technical, doesn't wait on legal input)

- The branch condition (§4): does this user have monetization history,
  yes/no.
- Reusing `disconnectPlaidItem` for Plaid teardown (§6).
- The auth-layer de-identification targets: email, phone,
  `raw_user_meta_data`/`raw_app_meta_data` on `auth.users`, and the linked
  `auth.identities` row (§5) — these are the fields that exist and are
  known to carry PII, independent of *how long* anything is kept.
- The finding that `payments.raw` cannot be scrubbed under the current
  schema without a future migration (§7) — a technical fact, not a policy
  choice.
- The set of tables that are personal/operational (safe to delete
  outright) vs. financial-ledger (must survive in some form) — this split
  follows directly from the existing CASCADE/RESTRICT schema design
  (§2/§3), which the owner already locked when migration `0017` was
  written (its own comments state financial rows "must survive account
  deletion for partner-payout traceability and Apple/Google/RevenueCat
  reconciliation").

### OPEN LEGAL/PRODUCT DECISION (this document does not choose)

- **Exact retention duration** for each retained record category.
- **Which financial-record categories genuinely require retention** —
  this audit found four RESTRICT-protected tables, but "the FK prevents
  deleting the row" is not the same claim as "the row must be retained
  forever for a specific legal reason." Whether some subset could
  eventually be pruned after a defined period is a legal/accounting
  question, not resolved by the schema's current shape.
- **The legal/accounting basis for each category** — tax record-keeping,
  financial audit trail, payment-processor dispute windows, or another
  basis, and which applies to which table — jurisdiction-dependent, not
  assumed.
- **Exact de-identification requirements** — what "de-identified" must
  mean in practice (is severing the `auth.users` link sufficient, given
  `user_id` UUIDs remain on the retained rows and correlate them to each
  other even without a name/email attached?).
- **Treatment of records that cannot be safely de-identified** — per §7,
  `payments.raw` specifically, if it turns out to contain data that must
  be retained *and* cannot be de-identified under any schema change that
  preserves financial integrity.

---

## 11. Privacy/Terms requirements (factual audit only — no legal language drafted)

What the product **actually does today**, stated as fact, for whoever
drafts the legal documents to work from:

- **Plaid/bank connection:** the app connects to a user's bank via Plaid
  Link; Plaid, not Budgts, ever sees bank login credentials; Budgts
  receives and stores an encrypted access token (`plaid_items.
  access_token_enc`, AES-256-GCM, server-only) and reads transaction/
  account data through it.
- **Transaction data:** imported transactions are stored with amount,
  date, description, merchant name, and Plaid's own category/merchant
  classification fields; manually-entered transactions carry the same
  shape, source-tagged differently.
- **Categorization:** transactions are automatically assigned to a
  category using Plaid's classification plus a per-user merchant-rule
  memory (`plaid_merchant_rules`) the app builds from the user's own past
  corrections.
- **Financial calculations:** budget-vs-actual, Money Left, savings rate,
  and goal progress are all computed from the user's own transaction/
  budget/goal data — no data from other users is ever part of any user's
  calculation (RLS-enforced).
- **Account deletion:** per this document — deletes personal/operational
  data, retains a minimum of financial-ledger records tied to mobile
  billing history where the user had any, per §2/§3/§7 (exact retention
  duration: §11 above, still open — the policy text cannot state a number
  that doesn't exist yet).
- **Retained financial records:** if the user ever had a mobile
  subscription, some records of that billing/attribution history persist
  after account deletion in de-identified-where-possible form (§5, §7) —
  the policy must disclose this category exists, even before the exact
  retention period is decided.
- **Mobile subscriptions:** billed through Apple App Store / Google Play,
  not Budgts directly; a 7-day trial and an influencer discount may apply
  (mobile-launch spec §2).
- **Apple/Google billing:** Budgts never sees payment card details;
  Apple/Google process the charge and report the outcome to Budgts via
  RevenueCat.
- **RevenueCat:** a third-party subscription-management service that
  normalizes Apple/Google billing events for Budgts' backend — not yet
  integrated (mobile-launch spec §9), but its role should be disclosed
  once it is.
- **Influencer attribution:** a user who redeems an influencer's voucher
  code has that attribution recorded (`redemptions`) and, if they
  subscribe, tied to their `subscriptions`/`payments`/`revenue_allocations`
  records for commission accounting — this is Budgts-side bookkeeping
  about the referral relationship, not data shared with the influencer
  about the user's app usage.
- **Data retention:** governed by §10/§11 of this document once the open
  items resolve; the policy cannot commit to a number this document
  doesn't have.
- **Security:** RLS-scoped Postgres access, encrypted-at-rest Plaid
  tokens, no service-role credential ever reaching a client, webhook
  signature verification before processing (mobile-launch spec §8).
- **Third-party services:** Supabase (database/auth/storage), Plaid (bank
  connectivity), Vercel (hosting), and — once integrated — RevenueCat and
  Apple/Google's own billing platforms.

**This section is factual product behavior only.** Actual policy wording,
required disclosures beyond what's listed, and jurisdiction-specific legal
requirements are for legal review, not this document.

---

## 12. Security requirements

- **IMPLEMENTATION REQUIREMENT:** the deletion-execution endpoint(s) (both
  mobile and web entry points, §9) must authenticate the request
  server-side exactly as every other mutation does (mobile-launch spec
  §4/§8) — a client-supplied user id is never trusted, including on the
  web path, where identity comes only from the completed magic-link
  round-trip (§9), never a query parameter or form field naming the
  account.
- **IMPLEMENTATION REQUIREMENT:** the branch check (§4) and both deletion
  paths must run as a backend/service-role operation, not a user-session
  RLS-scoped operation — an ordinary user's own `supabase-js` session has
  no delete grant on `auth.users` and no update grant on the RESTRICT
  monetization tables' protected columns; this is intentional and must
  stay that way (mirrors monetization spec §3.8, §4.9).
- **IMPLEMENTATION REQUIREMENT:** no step in this lifecycle prints, logs,
  or exposes a service-role credential, an encrypted Plaid token, or a
  decrypted Plaid token to any client — the same rule that already
  governs every other server-only secret in this repo.
- **Voucher/enumeration-style risk does not apply here** (unlike
  redemption, which the monetization spec already rate-limits) — but the
  web deletion-request page (§9) has an analogous risk: it must not let
  an attacker probe whether a given email has a Budgts account by
  observing a timing or response difference before the magic-link step
  completes.

---

## 13. Test plan

Concrete scenarios for the eventual implementation, covering both
lifecycle branches (§4) and every category the task named:

1. **User with no monetization history** — full deletion succeeds via
   Path A; every CASCADE table for that `user_id` is empty afterward;
   `auth.users` row is gone.
2. **User with subscription history but no current active subscription**
   (e.g. cancelled) — Path B: `auth.users` anonymized not deleted;
   `subscriptions`/`payments`/`revenue_allocations` rows untouched and
   still pass every existing CHECK constraint; every CASCADE table for
   that `user_id` is empty.
3. **User with an active subscription** — same as (2), plus: verify the
   deletion flow communicates (§6 mobile-launch spec, §8 here) that the
   subscription is not cancelled by this action, and that RevenueCat/
   platform state is left alone (nothing in this deletion process calls
   any billing-cancellation API).
4. **User with a cancelled subscription already** — same as (2);
   confirms deletion doesn't error or behave differently based on
   current vs. historical subscription status, only on "does any row
   exist."
5. **User with a Plaid connection** — verify `/item/remove` is attempted
   for every item, `plaid_items`/`plaid_accounts` rows are gone (Path A)
   or explicitly deleted (Path B), and no dangling access token remains
   anywhere.
6. **User with transactions (manual and Plaid-sourced)** — verify all
   `transactions` rows for that user are gone in both paths — this is
   *personal* history, not the monetization ledger, and is never
   retained regardless of which path applies.
7. **User with goals/budgets** — verify `savings_goals`,
   `savings_contributions`, `budgets` all gone in both paths.
8. **User with recurring series** — verify `recurring_series` gone in
   both paths, and that its `SET NULL` relationship to `transactions`
   (already deleted anyway in this scenario) doesn't error.
9. **User with monetization-ledger history** — the defining test for
   Path B; verify the branch check correctly detects this user and routes
   them away from the hard-delete path.
10. **Deletion followed by attempted login** — both Path A (row gone,
    login fails as "no such account") and Path B (row banned/disabled,
    login fails as "account disabled/banned," not silently succeeding).
11. **Deletion followed by attempted Plaid access** — any lingering
    client holding an old session must not be able to reach Plaid-backed
    routes; covered by §5's session-revocation requirement, tested by
    attempting an authenticated Plaid API call with a pre-deletion token.
12. **Retained records remain valid** — after Path B, every CHECK
    constraint and FK on the retained `redemptions`/`subscriptions`/
    `payments`/`revenue_allocations` rows still holds (nothing about
    deletion should ever be able to leave these rows in a state that
    violates their own invariants).
13. **No retained credentials/secrets** — after either path, no
    `plaid_items.access_token_enc` row exists for the deleted user (Path
    A: cascaded; Path B: explicitly deleted along with the other CASCADE
    tables).
14. **No broken foreign keys** — after either path, no orphaned row
    anywhere references the deleted/anonymized user in a way the schema
    doesn't already expect (CASCADE tables are simply gone; RESTRICT
    tables still validly reference the surviving, anonymized
    `auth.users` row in Path B).
15. **No broken immutable ledger relationships** — `revenue_allocations
    .payment_id`, `.partner_id`, `.platform_commission_rate_id`, `
    .redemption_id` all still resolve; `payout_allocations` still
    resolves to its `revenue_allocation_id` if the user's allocations
    were ever part of a payout.
16. **Idempotent deletion request** — requesting deletion twice for the
    same account (e.g. a retried request) does not error destructively
    the second time — it should recognize the account is already
    deleted/anonymized and return a consistent result, not attempt the
    lifecycle again from scratch.
17. **Repeated deletion request** — same as (16), phrased as a direct
    double-submit test (e.g. a network retry resubmitting the same
    confirmed request) — must not double-charge any side effect (no
    double `/item/remove` call failure treated as fatal, since disconnect
    already treats a failed remove as non-fatal, §6).
18. **Web deletion request** — full flow via §9's unauthenticated entry
    point, confirming identity is established before any account action,
    and that the outcome matches the equivalent mobile-initiated request.
19. **Mobile deletion request** — full flow via the in-app entry point,
    confirming it reaches the same underlying deletion logic as (18), not
    a parallel implementation.

---

## 14. Required migrations/code changes

**No migration is written by this document.** For planning purposes only:

### Code (no schema change needed)

- A deletion-orchestration function/route implementing §4's branch logic,
  reusing `disconnectPlaidItem` (§6) and `supabase.auth.admin.*` (§5).
- The monetization-history existence check (§4) — four simple `EXISTS`
  queries, no new table or column.
- The web deletion-request entry point (§9) and its magic-link-based
  identity establishment — reuses existing auth infrastructure.
- Whatever confirmation UX is chosen (§8) — UI/flow work, no schema
  change.
- Privacy policy / terms content (§11) — content work, not code.

### Future migration (design only, not written now)

- **Only if** §11's legal decisions determine `payments.raw` (or another
  currently-immutable field) must be de-identifiable: a narrowly-scoped
  exception to `monetization_ledger_immutable_fact` permitting exactly
  one kind of update (redacting a named field, never a financial column)
  — see §7's two proposed directions, neither chosen here.
- **Possible, lower-priority:** a cleanup job/migration-adjacent script
  for stale `plaid_webhook_events` rows tied to disconnected items (§6,
  §16) — this is arguably ordinary operational hygiene rather than a
  schema change, and doesn't block anything else in this design.

---

## 15. Open Product Decisions

- Confirmation UX specifics (§8): re-authentication method, typed-phrase
  requirement, immediate vs. scheduled/undo-window deletion.
- Whether the web deletion-request flow (§9) is fully self-service or
  logs a request for backend execution.
- Exact wording/placement of the account-deletion entry point in the
  mobile UI (not designed here — this document covers the backend
  lifecycle, not the screen).

## 16. Open Legal Decisions

- Everything in §10's "OPEN LEGAL/PRODUCT DECISION" list: exact retention
  duration, which financial-record categories genuinely require it, the
  legal/accounting basis per category, exact de-identification
  requirements, and treatment of records that can't be safely
  de-identified.
- Whether the privacy policy needs to name RevenueCat/Apple/Google as
  data processors explicitly (a legal determination once counsel reviews
  §11's factual list, not decided here).

## 17. Open Engineering Decisions

- Exact Supabase Admin API mechanism for: banning/disabling a user
  without deleting them (Path B), revoking active sessions independently
  of deletion, and scrubbing `auth.identities` for a Google-linked
  account — all need verification against the pinned `@supabase/
  supabase-js` version, not assumed from general docs (§5).
- Whether `plaid_webhook_events` cleanup for disconnected/deleted users'
  former items is added to this flow or left as separate operational
  hygiene (§6, §14).
- The two competing designs for eventually de-identifying `payments.raw`
  (a scoped trigger exception vs. redacting at webhook-ingestion time,
  §7) — not chosen, and not urgent until §16's legal questions resolve
  enough to know if it's even needed.
- Exact retry/idempotency mechanism for the deletion-orchestration
  function itself (§13 tests 16–17) — e.g. a `deletion_requests` audit
  row vs. relying purely on "check current state, no-op if already
  handled" logic — not designed here, ordinary implementation detail.

## 18. Definition of Done (for this design phase)

- [x] Every user-owned table classified (§3).
- [x] Migration `0017`'s RESTRICT relationships traced exactly, and
      checked against FK/immutability/allocation-integrity/payout/
      auditability/idempotency (§7) — no weakening proposed or needed.
- [x] Plaid disconnect/deletion behavior traced against the real code,
      not assumed (§6).
- [x] Auth/session handling designed for both Magic Link and Google
      OAuth, both lifecycle branches (§5).
- [x] Subscription/RevenueCat interaction designed without assuming
      cancellation or implementing RevenueCat (§ mobile-launch spec §6,
      referenced not repeated).
- [x] Confirmation UX options enumerated without inventing a legal
      requirement (§8).
- [x] Web deletion-request path designed without exposing account data
      pre-authentication (§9).
- [x] Retention boundary explicitly split between decidable-now and
      legal-open, with no invented periods (§10).
- [x] Privacy/Terms factual inputs identified, no legal language drafted
      (§11).
- [x] Concrete test plan covering every scenario the task named (§13).
- [x] Required future migration described, not written (§7, §14).
- [ ] **Not part of this phase:** actual implementation of any of the
      above — this document's Definition of Done is "ready to implement,"
      not "implemented."

---

## Cross-check against the two prior specs

Reviewed against `docs/specs/2026-09-17-mobile-app-launch-design.md` and
`docs/specs/2026-09-18-monetization-ledger-design.md`:

- **No contradiction found.** This document implements exactly what
  mobile-launch spec §12.2–§12.4 locked, without changing any of it, and
  treats migration `0017` exactly as the monetization spec's own
  "Contradictions found" section already anticipated (its schema.ts
  comment block literally predicts "the eventual account-deletion flow...
  will need an anonymization path for these tables rather than a delete
  cascade" — this document is that anonymization path).
- **One refinement, not a contradiction:** the mobile-launch spec's §12.2
  described retention/de-identification at the lifecycle-step level
  ("retain the minimum," "de-identify where possible") without stating
  *which specific field* is schema-blocked from de-identification. This
  document adds that specificity (`payments.raw`, §7) — a detail
  discovered by this deeper audit, consistent with and not contradicting
  the higher-level architecture already locked.
- Web stays free, no paid checkout — untouched by this document.
- V2/V2+ — untouched, not referenced.
- Migration `0017` — not modified; every finding in §7 explicitly works
  within its existing constraints.

---

## Addendum (2026-09-21) — deletion hardening: what measurement changed

**Migration numbering.** Everywhere above, "migration `0017`" means the monetization-**ledger** migration
(`0017_superb_iron_monger`, still uncommitted WIP, hand-applied to staging only). On the release-candidate branch
the numbers `0017`–`0019` belong to the deletion-hardening migrations below. The ledger migration must be
**renumbered and re-stamped** (a journal `when` later than `0019`'s, or drizzle's timestamp-only skip logic will
never apply it anywhere that already ran `0019`) when it is integrated.

| Migration | What | Why |
| --- | --- | --- |
| `0017_deletion_fk_indexes` | partial indexes on `transactions.transfer_pair_id`, `duplicate_of_id`, `recurring_stream_id`, `plaid_account_id` | Postgres does not index FK columns; deleting a parent row runs a lookup on every FK pointing at it. Measured: a 25,000-transaction user spent ~50 s in **each** of the two self-referencing triggers (the DELETE itself: ~50 ms). PostgREST cancelled it at 8 s (57014); GoTrue's hard delete (Path A) returned 504 after ~36 s with nothing committed. |
| `0018_transactions_account_fk_index` | index on `transactions.account_id` | the RESTRICT lookup on account delete cannot use the existing partial (fingerprint) index; 25–100 ms/account warm, 1.6–10 s cold at 250k rows |
| `0019_account_deletion_write_guard` | `account_deletions` table, `account_accepts_writes()`, RESTRICTIVE policies on the 11 user-owned tables | see below |

Not indexed, on evidence: `plaid_accounts.account_id`, `recurring_series.account_id`, `budgets.category_id`,
`plaid_merchant_rules.category_id` (1–17 ms at 250k rows, small tables). Revisit `transactions` once it holds
several million rows. Known residual: `DELETE FROM plaid_items` nulls `transactions.plaid_account_id` on every row
of that account (~100 µs/row, 2.6 s at 25k rows — inherent update work, not a missing index).

**The deletion lock (the stale-JWT write window).** Revoking sessions does not stop an access token already
issued (valid until `exp`), and on Path B the `auth.users` row is kept, so no FK refuses its writes. Measured:
a token issued *before* a completed Path B deletion still inserted a row (`201 Created`). The lock is database
state: a row in `account_deletions` makes every user-originated INSERT/UPDATE/DELETE fail through RESTRICTIVE
policies (`account_accepts_writes()`, `SECURITY DEFINER`, empty `search_path`, EXECUTE only for `authenticated`).
Reads and sign-in still work. Refresh sessions are **not** revoked when the lock is taken — the user must be able
to call the endpoint again — only at completion (Path A: the user is gone; Path B: the soft delete + permanent
ban). `account_deletions.state`: `deleting` (read-only, retryable) → `deleted` (Path B, recorded after a final
sweep verifies nothing owned survives). Path A cascades the row away with the auth user.

*When the lock is taken.* After the first Plaid removal pass succeeds, not before. A Plaid failure (an Item Plaid
cannot remove) therefore leaves the account **fully usable**, as it always did, and the user's own escape hatch —
disconnecting the bank themselves, then retrying — still works. Once locked, Plaid Items are listed again and any
that appeared in the window are removed too. `DELETE` on `plaid_items` is the one write the guard does **not**
block (migration `0020`): removing a bank connection cannot create data, and a locked user must never be unable to
disconnect a bank Plaid cannot remove. `/api/plaid/link-token` and `/api/plaid/exchange` refuse for a deleting
account (409 `account_deletion_in_progress`); if the lock lands between the token exchange and the insert (42501),
the just-created Item is removed at Plaid so no live connection is orphaned.

**Path B is one transaction.** `store.deleteOwnedData` (`src/lib/account/deletion-store.ts`) deletes every owned
row in a fixed order over the server's direct connection (no 8 s PostgREST limit, real SQLSTATEs, no privileged
SQL function for a client to call), verifies zero rows remain *inside* the transaction, and rolls back completely
otherwise. Retried only for 40P01 (measured), bounded, backoff; `57014`, `55P03`, `23503` and everything else
surface as a failure. `deleteAccount` finishes with ban → sweep → `markDeleted`, and a retry on an account that is
already de-identified resumes that tail instead of assuming it completed.

**The ledger check no longer depends on a client-library quirk.** `hasMonetizationHistory` is SQL guarded by
`to_regclass`: a ledger table that does not exist yet (production before the ledger migration) means "no history",
any other failure fails closed. This is what makes it safe to release the deletion code before the ledger
migration is applied.

**Cached foreign-key plans (release-readiness gate, 2026-09-21).** The 25k-row Path B test was intermittently
41-46 s instead of 2.4-5 s. Reproduced deterministically and traced to Postgres's per-backend plan cache: deleting
a `transactions` row fires two self-referencing FK lookups (`transfer_pair_id`, `duplicate_of_id`, ON DELETE SET
NULL). After five executions on one backend Postgres may cache a *generic* plan chosen from the table's size at
that moment and it is **not** re-planned when the table grows. A pooled backend that ran a few small deletes while
`transactions` was physically about one page (a sequential scan is the cheapest plan for a table that small) keeps
that sequential-scan plan, and its next 25,000-row delete does 2 x 25,000 scans: ~20 s per trigger, ~43 s total,
the pre-index pathology returning through a stale plan. Measured on one backend with the table vacuumed to one
page: 0-2 small deletes primed -> 0.5 s; 3 or more -> 39-41 s; `DISCARD PLANS` on that backend -> 0.5 s.
Sixty back-to-back 25k runs without the priming condition never produced an outlier (4.2-7.5 s), and no lock,
IO or autovacuum wait was ever observed during a run.

*Path B:* `deleteOwnedData` runs `discard plans` first, so its cost depends on the table as it is now, not on what
the pooled connection ran before (`tests/integration/account-deletion-plan-cache.test.ts`; 42 s without it, 2.5 s
with it). *Path A:* the cascade runs on GoTrue's own backends, where this cannot be applied. With those backends
primed the same way, a 25k/50k/100k-row hard delete took 11.3/11.6/13.3 s instead of 0.8-1.5 s (CPU-bound, no
error, roughly flat in row count). It needs a physically tiny `transactions` table, so it should not arise once
production holds real data, but it is not eliminated; the structural remedy (delete the owned rows in our own
transaction first, then hard-delete `auth.users`) is a Path A design change and is left as a decision.
