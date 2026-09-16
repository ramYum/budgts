import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Drizzle owns table structure. RLS policies, the auth.users foreign keys,
// CHECK constraints, the handle_new_user() seed trigger, and the realtime
// publication are hand-appended to the generated migration (see
// docs/conventions.md → "Building a feature — the layer order", step 1).

export const accountType = pgEnum("account_type", ["checking", "credit", "cash", "savings"]);
// Which flow created this account. Distinct from "currently Plaid-connected"
// (that's tracked by whether a live plaid_accounts row points here) — this
// only says how the row originated, so a disconnected bank's leftover
// account row still reads 'plaid' and can be told apart from a real manual
// account. See src/lib/accounts/selectable-accounts.ts.
export const accountSource = pgEnum("account_source", ["manual", "plaid"]);
export const categoryKind = pgEnum("category_kind", ["expense", "income"]);
export const txnDirection = pgEnum("txn_direction", ["debit", "credit"]);
export const txnSource = pgEnum("txn_source", ["manual", "email", "receipt", "bank"]);
export const txnStatus = pgEnum("txn_status", ["confirmed", "pending_review"]);

// V1 — Plaid ingestion. New enums; existing enums are untouched.
export const plaidItemStatus = pgEnum("plaid_item_status", [
  "active",
  "login_required",
  "pending_expiration",
  "revoked",
  "error",
]);
export const plaidAccountLinkState = pgEnum("plaid_account_link_state", [
  "mapped",
  "ignored",
  "unmapped",
]);
export const plaidSignConvention = pgEnum("plaid_sign_convention", [
  "unknown",
  "standard",
  "inverted",
]);

export const profiles = pgTable("profiles", {
  // equals auth.users.id (FK added in the migration)
  id: uuid("id").primaryKey(),
  currency: text("currency").notNull().default("USD"),
  // null until the first-run screen completes (currency confirmed)
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  // null until the first-run tour (or its skip) completes — separate from
  // onboardedAt so an already-onboarded user can still be sent through the
  // tour once (see docs/specs/2026-09-15-first-run-tour-design.md)
  tourSeenAt: timestamp("tour_seen_at", { withTimezone: true }),
  // V1.5 recurring detection — the daily job's per-user watermark. Only
  // touched merchant groups (a candidacy-eligible transaction with
  // created_at > this value) are re-evaluated on the next run; null means
  // "never scanned," so every eligible group is evaluated once. Advanced
  // only after a run completes successfully — a crash mid-run simply
  // re-scans the same window next time (idempotent, not lossy).
  recurringLastScanAt: timestamp("recurring_last_scan_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    type: accountType("type").notNull(),
    isArchived: boolean("is_archived").notNull().default(false),
    source: accountSource("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    kind: categoryKind("kind").notNull(),
    color: text("color").notNull().default("#64748b"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("categories_user_idx").on(t.userId)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    // minor units, always > 0 (CHECK added in the migration)
    amount: integer("amount").notNull(),
    direction: txnDirection("direction").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    description: text("description").notNull().default(""),
    note: text("note"),
    source: txnSource("source").notNull().default("manual"),
    // stable id from the source, for idempotent ingestion (Phases 3-5)
    sourceRef: text("source_ref"),
    status: txnStatus("status").notNull().default("confirmed"),
    // between the user's own accounts; excluded from every rollup
    isTransfer: boolean("is_transfer").notNull().default(false),
    // ---- V1 (Plaid) additive columns. Every one is nullable or has a constant
    // default, so existing rows stay valid. See
    // docs/specs/2026-09-09-v1-plaid-transaction-ingestion-design.md §32.5.
    //
    // MUST stay `onDelete: "set null"`. Disconnecting a Plaid Item deletes the
    // plaid_items + plaid_accounts rows; SET NULL means that only clears this
    // pointer and the imported transaction (real financial history) is kept.
    // CASCADE here would silently turn every "disconnect bank" into a mass
    // delete of the user's bank transactions. Deleting bank history is a
    // separate, explicitly-confirmed path only (design §24).
    plaidAccountId: uuid("plaid_account_id").references(() => plaidAccounts.id, {
      onDelete: "set null",
    }),
    // Plaid's pending flag — distinct from `status` (imported rows are real, so
    // status stays 'confirmed').
    pending: boolean("pending").notNull().default(false),
    // the posted row records which pending transaction it replaced
    pendingPlaidTransactionId: text("pending_plaid_transaction_id"),
    merchantName: text("merchant_name"),
    // stable Plaid merchant id — the key feature for V1.5 recurring detection
    merchantEntityId: text("merchant_entity_id"),
    plaidCategoryPrimary: text("plaid_category_primary"),
    plaidCategoryDetailed: text("plaid_category_detailed"),
    plaidPfcConfidence: text("plaid_pfc_confidence"),
    // true once the user sets the category → sync never overwrites it
    userCategorized: boolean("user_categorized").notNull().default(false),
    // soft delete for Plaid `removed` (and hard-purge later)
    removedAt: timestamp("removed_at", { withTimezone: true }),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }),
    // V1.5 paired-transfer leg-linking — nullable placeholder, unpopulated in V1
    transferPairId: uuid("transfer_pair_id").references((): AnyPgColumn => transactions.id, {
      onDelete: "set null",
    }),
    // V1.5 recurring-series linkage — set only by the recurring-detection pass
    // (src/lib/plaid/recurring-detection.ts), never by sync ingestion itself.
    // SET NULL (not CASCADE): deleting the derived series metadata must never
    // touch the real transaction row, mirroring transferPairId below.
    recurringStreamId: uuid("recurring_stream_id").references((): AnyPgColumn => recurringSeries.id, {
      onDelete: "set null",
    }),
    // the raw Plaid transaction payload, for offline re-processing / debugging
    raw: jsonb("raw"),
    // sha256 of the raw Plaid payload minus transaction_id — an ANOMALY-DETECTION
    // aid only, never an identity/dedupe key (design: 2026-09-12 duplicate-feed
    // investigation). Used solely to count suspiciously repetitive content per
    // account and flag the account for review; never used to suppress, merge,
    // or exclude a transaction from financial totals.
    contentFingerprint: text("content_fingerprint"),
    // Confirmed-duplicate containment (design: 2026-09-12 Phase 15). NULL for
    // every row by default — only ever set by a one-time, human-reviewed
    // remediation script against an explicit row-id list, never by sync or by
    // any automatic rule. Points at the canonical row this one duplicates.
    // INVARIANT: any row with duplicateOfId set MUST contribute zero to every
    // financial aggregate (see qualify.ts's countsForMonth, the single choke
    // point) while still being kept forever for audit — never deleted, never
    // merged. Non-financial consumers (e.g. the "needs a category" queue)
    // must also explicitly exclude it, since they don't route through
    // countsForMonth.
    duplicateOfId: uuid("duplicate_of_id").references((): AnyPgColumn => transactions.id, {
      onDelete: "set null",
    }),
    // Why this row is pending_review, if it is — disambiguates the reason so
    // a later resolution (e.g. sign-convention finalization) only touches
    // rows it's actually responsible for, never a different pending reason
    // (design: 2026-09-12 North Star Architecture §2). Null whenever status
    // is 'confirmed'.
    pendingReason: text("pending_reason"),
    // Classification of what kind of financial event this transaction is
    // (PURCHASE, REFUND, INCOME, CARD_PAYMENT, TRANSFER, P2P_PAYMENT, FEE,
    // INTEREST, CASH_ADVANCE, ADJUSTMENT) — resolved from Plaid PFC signals,
    // never guessed; null = unresolved (design: 2026-09-12 Event Role §3/§4).
    // Plain text, no enum, same additive treatment as pendingReason above.
    eventRole: text("event_role"),
    // true only when the user explicitly set is_transfer to a value that
    // differed from what was currently stored — never set by sync or by the
    // categorize quick-action. qualify.ts treats this as an override that
    // outranks any machine-derived event_role. design: 2026-09-12
    // transfer-ownership §4.
    transferUserSet: boolean("transfer_user_set").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_user_occurred_idx").on(t.userId, t.occurredAt),
    index("transactions_category_idx").on(t.categoryId),
    uniqueIndex("transactions_source_ref_uq")
      .on(t.userId, t.source, t.sourceRef)
      .where(sql`${t.sourceRef} is not null`),
    // V1.5 recurring/subscription detection lookup
    index("transactions_merchant_entity_idx")
      .on(t.merchantEntityId)
      .where(sql`${t.merchantEntityId} is not null`),
    // anomaly-detection lookup: count same-content rows per account
    index("transactions_account_fingerprint_idx")
      .on(t.accountId, t.contentFingerprint)
      .where(sql`${t.contentFingerprint} is not null`),
    // V1.5 recurring detection — the daily job's per-(user, merchant, account,
    // direction) candidate-history lookup (design:
    // docs/specs/2026-09-16-recurring-detection-design.md). Partial on the
    // same merchant_entity_id-not-null condition candidacy already requires.
    index("transactions_recurring_candidate_idx")
      .on(t.userId, t.merchantEntityId, t.accountId, t.direction, t.occurredAt)
      .where(sql`${t.merchantEntityId} is not null`),
    // V1.5 recurring detection — supports the daily job's incremental
    // "touched since the last scan" discovery query (findCandidateGroups),
    // which filters on user_id + a created_at watermark range and does not
    // otherwise constrain merchant_entity_id/account_id/direction (those are
    // SELECTed, not filtered, at that step) — the candidate index above
    // doesn't help that query at all. Deliberately not partial: created_at
    // watermarking has no natural WHERE condition to narrow on the way
    // merchant_entity_id's nullability does for the other index.
    index("transactions_user_created_idx").on(t.userId, t.createdAt),
    // Defense-in-depth for qualify.ts's Important #2 finding (design:
    // 2026-09-12 qualify-integration final review) — event_role stays
    // plain nullable text (no enum type), but a malformed value can never
    // reach the table in the first place. countsForMonth's isEventRole
    // runtime guard is the other half: it protects rows written before
    // this constraint existed.
    check(
      "transactions_event_role_valid",
      sql`${t.eventRole} is null or ${t.eventRole} in ('PURCHASE','REFUND','INCOME','CARD_PAYMENT','TRANSFER','P2P_PAYMENT','FEE','INTEREST','CASH_ADVANCE','ADJUSTMENT')`,
    ),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    // first day of the month
    month: date("month").notNull(),
    // minor units, >= 0 (CHECK added in the migration)
    amount: integer("amount").notNull(),
  },
  (t) => [
    uniqueIndex("budgets_user_category_month_uq").on(t.userId, t.categoryId, t.month),
    index("budgets_user_month_idx").on(t.userId, t.month),
  ],
);

// Phase 2a. A named savings target with its own contribution ledger —
// deliberately decoupled from transactions, account balances and the derived
// "Net savings" tile.
export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    // minor units, > 0 (CHECK added in the migration)
    targetAmount: integer("target_amount").notNull(),
    targetDate: date("target_date"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("savings_goals_user_idx").on(t.userId)],
);

export const savingsContributions = pgTable(
  "savings_contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    goalId: uuid("goal_id")
      .notNull()
      .references(() => savingsGoals.id, { onDelete: "cascade" }),
    // minor units, non-zero (CHECK added in the migration). Positive = added,
    // negative = withdrawn / corrected. The sign is set by the server action,
    // never typed by the user.
    amount: integer("amount").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("savings_contributions_user_idx").on(t.userId),
    index("savings_contributions_goal_idx").on(t.goalId),
  ],
);

// ===========================================================================
// V1 — Plaid transaction ingestion.
// Design: docs/specs/2026-09-09-v1-plaid-transaction-ingestion-design.md
// Plaid is the primary ingestion path; manual entry stays the fallback.
// `access_token_enc` holds an AES-256-GCM blob and never leaves the server.
// auth.users FKs + RLS policies are hand-appended to the migration (see
// docs/conventions.md → "Building a feature — the layer order", step 1).
// ===========================================================================

export const plaidItems = pgTable(
  "plaid_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    // Plaid Item id — globally unique; the webhook handler looks up by this
    itemId: text("item_id").notNull().unique(),
    institutionId: text("institution_id"),
    institutionName: text("institution_name"),
    // AES-256-GCM: keyVersion(1B) || iv(12B) || authTag(16B) || ciphertext, base64
    accessTokenEnc: text("access_token_enc").notNull(),
    // /transactions/sync cursor; null = never synced
    transactionsCursor: text("transactions_cursor"),
    status: plaidItemStatus("status").notNull().default("active"),
    errorCode: text("error_code"),
    // set by the webhook, cleared by the poller
    needsSync: boolean("needs_sync").notNull().default(false),
    lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    // last time Budgts asked Plaid to check the institution now (design: page-open
    // refresh nudge); throttles how often /transactions/refresh gets called
    lastRefreshRequestedAt: timestamp("last_refresh_requested_at", { withTimezone: true }),
    // consecutive failures; drives backoff + the `error` status
    syncFailures: integer("sync_failures").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("plaid_items_user_idx").on(t.userId),
    // the poller scans for items that need a sync
    index("plaid_items_needs_sync_idx").on(t.needsSync).where(sql`${t.needsSync}`),
  ],
);

export const plaidAccounts = pgTable(
  "plaid_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    plaidItemId: uuid("plaid_item_id")
      .notNull()
      .references(() => plaidItems.id, { onDelete: "cascade" }),
    plaidAccountId: text("plaid_account_id").notNull(),
    // the mapped Budgts account; null = unmapped or ignored. SET NULL on delete
    // so disconnecting a bank never blocks on / cascades into account rows.
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
    linkState: plaidAccountLinkState("link_state").notNull().default("unmapped"),
    name: text("name"),
    officialName: text("official_name"),
    mask: text("mask"),
    type: text("type"),
    subtype: text("subtype"),
    isoCurrencyCode: text("iso_currency_code"),
    // minor units; MAY be negative (credit / overdraft) — no CHECK constraint
    currentBalance: integer("current_balance"),
    availableBalance: integer("available_balance"),
    balanceAsOf: timestamp("balance_as_of", { withTimezone: true }),
    // Anomaly review flag (design: 2026-09-12 duplicate-feed investigation).
    // Set when this account's Plaid feed shows extreme, byte-identical
    // transaction repetition — evidence of a broken upstream feed, not proof
    // of duplication. NEVER used to suppress, merge, or exclude transactions;
    // it only drives an owner-facing warning that totals may be unreliable
    // until reviewed. No automatic clearing — an owner action is required.
    needsReview: boolean("needs_review").notNull().default(false),
    reviewReason: text("review_reason"),
    reviewFlaggedAt: timestamp("review_flagged_at", { withTimezone: true }),
    // Explicit owner decision that this connection's data must never
    // participate in financial totals (design: 2026-09-13 Advancial
    // containment). Distinct from `needsReview` — never set automatically by
    // the anomaly detector or sync engine, only by an owner action in
    // Settings, and only ever offered while `needsReview` is true (see
    // setAccountCalculationExclusion). Raw transactions stay untouched and
    // visible everywhere; only `countsForMonth` honors this flag.
    excludedFromCalculations: boolean("excluded_from_calculations").notNull().default(false),
    // Sign-convention detection (design: 2026-09-12 North Star Architecture
    // §2). Defaults to 'unknown' for every account, including pre-existing
    // ones — never 'standard'. While 'unknown', every new transaction for
    // this account lands as pending_review (see adapter.ts) rather than
    // assuming Plaid's documented sign convention holds. Finalized by
    // runSync once enough evidence resolves it one way or the other.
    signConvention: plaidSignConvention("sign_convention").notNull().default("unknown"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("plaid_accounts_user_idx").on(t.userId),
    index("plaid_accounts_item_idx").on(t.plaidItemId),
    // Plaid account id is stable per user — dedupe + lookup key
    uniqueIndex("plaid_accounts_user_account_uq").on(t.userId, t.plaidAccountId),
  ],
);

// Raw webhook log / dead-letter. Written only by the service-role client in the
// webhook handler; not readable through the app (RLS deny-all for authenticated,
// hand-appended). No user_id: rows are logged before the owning user is
// resolved from item_id.
export const plaidWebhookEvents = pgTable("plaid_webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  verified: boolean("verified").notNull().default(false),
  webhookType: text("webhook_type"),
  webhookCode: text("webhook_code"),
  itemId: text("item_id"),
  payload: jsonb("payload"),
  handled: boolean("handled").notNull().default(false),
  error: text("error"),
});

// Per-merchant category memory. On a user correction, (user_id, merchant_entity_id)
// → category_id; the categorizer consults this before the static PFC map.
export const plaidMerchantRules = pgTable(
  "plaid_merchant_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    merchantEntityId: text("merchant_entity_id").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("plaid_merchant_rules_user_merchant_uq").on(t.userId, t.merchantEntityId)],
);

// ===========================================================================
// V1.5 — Recurring transaction detection.
// Design: docs/specs/2026-09-16-recurring-detection-design.md.
// Descriptive metadata ONLY — never read by qualify.ts / any rollup. A row
// here is a PREDICTION (next_expected_at / expected_amount); the actual
// transactions it links to via `transactions.recurring_stream_id` are the
// only ledger facts. `cadence` and `status` stay plain text + CHECK
// (matching `transactions.event_role`'s precedent) rather than a pgEnum, so
// a future bucket/state can be added without an ALTER TYPE migration.
// ===========================================================================
export const recurringSeries = pgTable(
  "recurring_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    // Candidacy requires merchant_entity_id IS NOT NULL — see the detector.
    merchantEntityId: text("merchant_entity_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    direction: txnDirection("direction").notNull(),
    // The event_role every member transaction had at candidacy time —
    // restricted to the recurring-eligible subset (see the CHECK below).
    eventRole: text("event_role").notNull(),
    cadence: text("cadence").notNull(),
    // minor units, > 0 (CHECK added in the migration)
    expectedAmount: integer("expected_amount").notNull(),
    // minor units, >= 0 (CHECK added in the migration)
    amountToleranceMinor: integer("amount_tolerance_minor").notNull(),
    lastOccurredAt: timestamp("last_occurred_at", { withTimezone: true }).notNull(),
    nextExpectedAt: timestamp("next_expected_at", { withTimezone: true }).notNull(),
    // >= 2 (CHECK added in the migration) — a series is never created below
    // the two raw observations needed to guess a first cadence.
    observationCount: integer("observation_count").notNull(),
    // CANDIDATE (< 3 observations, never user-visible) | ACTIVE (>= 3) |
    // MUTED (durable user dismissal). "Likely ended" is deliberately NOT a
    // stored state — it's computed at read time from next_expected_at vs
    // now(), so a lapsed series needs no background job to reflect it.
    status: text("status").notNull().default("CANDIDATE"),
    // User's durable dismissal (mirrors transferUserSet's "user decision
    // outranks automation forever" precedent) — null while not muted.
    mutedAt: timestamp("muted_at", { withTimezone: true }),
    // true once a user has manually edited cadence/expectedAmount (no UI
    // yet — reserved for when one exists). While true, the automatic
    // recompute in the detector must never overwrite those two fields,
    // though observationCount/lastOccurredAt/nextExpectedAt keep advancing
    // from real matches — same non-clobber contract as userCategorized.
    overriddenByUser: boolean("overridden_by_user").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The series identity key — one row per (user, merchant, account,
    // direction); also what makes the daily job's upsert idempotent under
    // an accidental concurrent double-invocation.
    uniqueIndex("recurring_series_identity_uq").on(t.userId, t.merchantEntityId, t.accountId, t.direction),
    index("recurring_series_user_idx").on(t.userId),
    check(
      "recurring_series_event_role_valid",
      sql`${t.eventRole} in ('PURCHASE','INCOME','FEE','INTEREST')`,
    ),
    check(
      "recurring_series_cadence_valid",
      sql`${t.cadence} in ('WEEKLY','BIWEEKLY','SEMIMONTHLY','MONTHLY','ANNUAL')`,
    ),
    check("recurring_series_status_valid", sql`${t.status} in ('CANDIDATE','ACTIVE','MUTED')`),
    check("recurring_series_expected_amount_positive", sql`${t.expectedAmount} > 0`),
    check("recurring_series_tolerance_nonnegative", sql`${t.amountToleranceMinor} >= 0`),
    check("recurring_series_observation_count_min", sql`${t.observationCount} >= 2`),
  ],
);
