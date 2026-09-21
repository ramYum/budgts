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
    // Foreign-key lookup indexes. Postgres does not index a referencing column, and deleting a parent
    // row runs a lookup on EVERY foreign key that points at it. Without these the lookup scans the whole
    // table once per deleted row: measured on staging, deleting a 25,000-transaction user spent ~50 s in
    // EACH of the two self-referencing triggers (the DELETE itself took ~50 ms), which timed out account
    // deletion on both paths. Partial (column is not null): most rows never set these, so the indexes stay
    // small and cost nothing on ordinary inserts. Design: docs/specs/2026-09-19-account-deletion-design.md.
    //  - transfer_pair_id / duplicate_of_id: self-references, SET NULL, hit once per deleted transaction.
    //  - recurring_stream_id: SET NULL when a recurring_series row goes (~150 ms/row at 250k rows).
    //  - plaid_account_id: SET NULL when a plaid_accounts row goes, i.e. on every bank disconnect.
    index("transactions_transfer_pair_idx")
      .on(t.transferPairId)
      .where(sql`${t.transferPairId} is not null`),
    index("transactions_duplicate_of_idx")
      .on(t.duplicateOfId)
      .where(sql`${t.duplicateOfId} is not null`),
    index("transactions_recurring_stream_idx")
      .on(t.recurringStreamId)
      .where(sql`${t.recurringStreamId} is not null`),
    index("transactions_plaid_account_idx")
      .on(t.plaidAccountId)
      .where(sql`${t.plaidAccountId} is not null`),
    // account_id is NOT NULL, so this one is a plain (not partial) index. It backs the RESTRICT lookup that
    // runs when an account row is deleted (25-100 ms per account at 250k rows, warm cache; 1.6-10 s cold) and
    // the Plaid purge, which deletes transactions by account. The existing account+fingerprint index is
    // partial (fingerprint is not null) so Postgres cannot use it for either.
    index("transactions_account_idx").on(t.accountId),
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

// Account-deletion lock (design: docs/specs/2026-09-19-account-deletion-design.md, "write guard"). A row here
// means the user's account is being — or has been — deleted, and every user-originated INSERT/UPDATE/DELETE is
// refused by a RESTRICTIVE RLS policy (migration 0019), whatever the user's JWT says. It has to be database
// state, not token state: a signed-out user's access token stays valid until it expires, and for a
// de-identified (Path B) account the auth.users row is kept, so no foreign key would refuse the write either.
//   'deleting' — started; the account is read-only. Not terminal: the deletion API is retryable.
//   'deleted'  — finished (Path B only; on Path A the row is cascaded away with the auth user).
// Server-only: deny-all RLS for every client role; written by the deletion code through a trusted connection.
export const accountDeletions = pgTable(
  "account_deletions",
  {
    // equals auth.users.id (FK, ON DELETE CASCADE, added in the migration)
    userId: uuid("user_id").primaryKey(),
    state: text("state").notNull().default("deleting"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("account_deletions_state_valid", sql`${t.state} in ('deleting','deleted')`)],
);

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

// ===========================================================================
// Monetization Ledger — Influencer Revenue Share (parallel track, schema only).
// Design: docs/specs/2026-09-18-monetization-ledger-design.md.
// Status fields stay plain text + CHECK (matching recurring_series/event_role
// precedent above), not pgEnum, so a future status doesn't need ALTER TYPE.
// auth.users FKs, RLS policies, and the immutability/append-only triggers are
// hand-appended to the migration (see docs/conventions.md -> "Building a
// feature - the layer order", step 1) — Drizzle has no trigger builder.
//
// Ownership deliberately differs from every other table in this file (design
// §3.8): most rows here are platform-owned, not user-owned, and even the
// user-scoped tables (redemptions/subscriptions/payments/revenue_allocations)
// get a read-only RLS policy with NO authenticated write policy at all —
// every write goes through a backend/service-role code path, never a client
// insert. Nothing here is a user-asserted fact.
//
// user_id FKs use `onDelete: "restrict"`, not the `cascade` used by every
// other per-user table (savings_goals, accounts, ...). Financial ledger rows
// must survive account deletion for partner-payout traceability and
// Apple/Google/RevenueCat reconciliation — cascading them away on account
// deletion would silently destroy history this design requires to be kept
// forever. This is a deliberate deviation from the rest of the schema,
// flagged rather than silently applied; the eventual account-deletion flow
// (tracked as a Mobile-Launch blocker in docs/roadmap.md) will need an
// anonymization path for these tables rather than a delete cascade.
// ===========================================================================

// Versioned platform (app-store) commission rate (design §2.4/§1.3) — the cut
// Apple/Google take before proceeds reach Budgts, NOT a Budgts-internal
// figure. Scoped per `platform`: Apple and Google set and change their store
// commission independently (and each has historically had tiered/stepped
// rates), so a single global rate would be wrong, not just under-indexed.
// Append-only: a new rate is a new row; the previously-open row for that same
// platform has its effective_to closed to the same instant by application
// code — DB-enforced by the partial unique index below (at most one row per
// platform with effective_to IS NULL) plus the hand-appended trigger that
// blocks any other mutation. Concurrency note for the later domain-logic
// phase: closing the old row and inserting the new one must happen in one
// transaction, old-row-close first — inserting the new open row before
// closing the old one would (correctly) fail the unique index, since two
// simultaneously-open rows for the same platform can never both exist. The
// illustrative 15% figure from architecture examples is deliberately NOT
// seeded here; this table starts empty and the first rate version per
// platform is an explicit operational action.
export const platformCommissionRates = pgTable(
  "platform_commission_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: text("platform").notNull(),
    // basis points out of 10000 (1500 = 15.00%) — integer, never a float
    rateBasisPoints: integer("rate_basis_points").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    // null = currently open/in-effect for this platform
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("platform_commission_rates_platform_effective_idx").on(t.platform, t.effectiveFrom),
    // at most one currently-open rate per platform — DB-enforced
    uniqueIndex("platform_commission_rates_single_open_per_platform_uq")
      .on(t.platform)
      .where(sql`${t.effectiveTo} is null`),
    check("platform_commission_rates_platform_valid", sql`${t.platform} in ('apple','google')`),
    check(
      "platform_commission_rates_rate_bounds",
      sql`${t.rateBasisPoints} >= 0 and ${t.rateBasisPoints} <= 10000`,
    ),
  ],
);

// An influencer participating in the revenue-share program (design §3.1).
// Platform/admin-owned — no authenticated user ever reads or writes this
// table directly (§3.8). No admin write path exists yet (spec §6 item 5);
// this table has no application writer until that's designed.
export const partners = pgTable(
  "partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    contactEmail: text("contact_email"),
    status: text("status").notNull().default("active"),
    // opaque payout destination details — never a raw secret/credential;
    // treat like any other sensitive field (never sent to the client)
    payoutMethodDetails: jsonb("payout_method_details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("partners_status_valid", sql`${t.status} in ('active','inactive')`)],
);

// A redeemable code belonging to a Partner (design §3.2). `code` uniqueness
// is case-insensitive, enforced by a hand-appended expression unique index
// (lower(code)) — no citext extension precedent exists in this repo, so this
// follows the same "hand-append what Drizzle can't express" pattern as RLS.
export const vouchers = pgTable(
  "vouchers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("vouchers_partner_idx").on(t.partnerId),
    check("vouchers_status_valid", sql`${t.status} in ('active','inactive')`),
  ],
);

// Attribution only (design §3.3/§1.6) — no entitlement, no commission. The
// entire row is immutable once written (hand-appended trigger blocks UPDATE
// and DELETE unconditionally); a mistaken redemption is a support matter,
// never a row edit. `partnerId` is denormalized off `voucherId` on purpose:
// if a Voucher were ever reassigned to a different Partner later, this copy
// keeps this Redemption's historical meaning frozen (design §2.3).
export const redemptions = pgTable(
  "redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    voucherId: uuid("voucher_id")
      .notNull()
      .references(() => vouchers.id, { onDelete: "restrict" }),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "restrict" }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("redemptions_user_idx").on(t.userId),
    index("redemptions_voucher_idx").on(t.voucherId),
    index("redemptions_partner_idx").on(t.partnerId),
  ],
);

// The durable per-user mobile subscription record and the home of the
// first_paid_at commission-window anchor (design §1.4, §3.4). first_paid_at
// and the three attributed_* columns are write-once — set exactly once when
// first_paid_at is established, never overwritten by any later event
// (resubscription included, design §1.4) — enforced by a hand-appended
// trigger, not just application discipline.
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    platform: text("platform").notNull(),
    // RevenueCat's stable subscriber/product reference
    platformSubscriptionId: text("platform_subscription_id").notNull(),
    plan: text("plan").notNull(),
    status: text("status").notNull(),
    // null until established (design §1.4); immutable once set
    firstPaidAt: timestamp("first_paid_at", { withTimezone: true }),
    // snapshot, not a live join — set once alongside first_paid_at (§2.3)
    attributedPartnerId: uuid("attributed_partner_id").references(() => partners.id, {
      onDelete: "restrict",
    }),
    attributedVoucherId: uuid("attributed_voucher_id").references(() => vouchers.id, {
      onDelete: "restrict",
    }),
    attributedRedemptionId: uuid("attributed_redemption_id").references(() => redemptions.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("subscriptions_user_idx").on(t.userId),
    uniqueIndex("subscriptions_platform_subscription_id_uq").on(t.platformSubscriptionId),
    index("subscriptions_attributed_partner_idx")
      .on(t.attributedPartnerId)
      .where(sql`${t.attributedPartnerId} is not null`),
    check("subscriptions_platform_valid", sql`${t.platform} in ('apple','google')`),
    check("subscriptions_plan_valid", sql`${t.plan} in ('monthly','annual')`),
    check(
      "subscriptions_status_valid",
      sql`${t.status} in ('trialing','active','paused','grace','past_due','cancelled')`,
    ),
  ],
);

// One immutable record per confirmed platform transaction event (design
// §3.5) — the financial fact, not a rollup. Entire row is immutable once
// written (hand-appended trigger). period_start/period_end is the covered
// service period, required for boundary proration (design §1.5).
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "restrict" }),
    userId: uuid("user_id").notNull(),
    // RevenueCat/platform transaction id — the webhook-replay idempotency key
    externalTransactionId: text("external_transaction_id").notNull(),
    platform: text("platform").notNull(),
    type: text("type").notNull(),
    // minor units, the actual platform-reported charge; >= 0 (a $0 trial-start
    // event is valid)
    customerPaidAmount: integer("customer_paid_amount").notNull(),
    currency: text("currency").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    // raw RevenueCat event payload, for offline reprocessing/debugging —
    // mirrors transactions.raw
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_subscription_occurred_idx").on(t.subscriptionId, t.occurredAt),
    index("payments_user_idx").on(t.userId),
    uniqueIndex("payments_external_transaction_id_uq").on(t.externalTransactionId),
    check("payments_platform_valid", sql`${t.platform} in ('apple','google')`),
    check(
      "payments_type_valid",
      sql`${t.type} in ('initial','renewal','trial_conversion')`,
    ),
    check("payments_customer_paid_amount_nonnegative", sql`${t.customerPaidAmount} >= 0`),
    check("payments_period_valid", sql`${t.periodEnd} > ${t.periodStart}`),
  ],
);

// The immutable snapshot of how one Payment's commissionable proceeds split
// between Budgts and the attributed Partner (design §3.6) — the entity the
// LOCKED financial-integrity rules are most directly about. Only exists for
// payments on a subscription with an attribution AND within the commission
// window (outside-window/no-attribution payments get no row at all).
//
// The entire row is immutable forever, full stop — no status column here.
// An earlier draft of this table had a pending/payable/paid/clawed_back
// status, but that field either duplicated state `payouts`/`payout_
// allocations` already own (payable/paid), or — for `clawed_back` — encoded
// a financial reversal (amount, reason, timing all implicit, none of it
// recorded) through a bare status flip, which is exactly what the adjustment
// model in revenue_allocation_adjustments (design §4.6) exists to prevent:
// "do not mutate original financial values to make the ledger appear
// current." A refund/chargeback/clawback is always a new
// revenue_allocation_adjustments row against this one, never a status change
// here. Settlement state (has this allocation been paid out yet?) is read by
// joining through payout_allocations -> payouts.status, not stored twice.
export const revenueAllocations = pgTable(
  "revenue_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    userId: uuid("user_id").notNull(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "restrict" }),
    platformCommissionRateId: uuid("platform_commission_rate_id")
      .notNull()
      .references(() => platformCommissionRates.id, { onDelete: "restrict" }),
    // attribution_reference (design §3.6) — which Redemption this traces to
    redemptionId: uuid("redemption_id")
      .notNull()
      .references(() => redemptions.id, { onDelete: "restrict" }),
    // copied from Payment so this row reads standalone (design §3.6)
    customerPaidAmount: integer("customer_paid_amount").notNull(),
    // post-proration (design §1.5); equals customer_paid_amount when no
    // boundary crossing applies
    commissionEligibleAmount: integer("commission_eligible_amount").notNull(),
    commissionableProceeds: integer("commissionable_proceeds").notNull(),
    // basis points out of 10000, snapshotted at allocation time — a future
    // rate/split change must never touch this row
    influencerPercentage: integer("influencer_percentage").notNull(),
    influencerAmount: integer("influencer_amount").notNull(),
    budgtsPercentage: integer("budgts_percentage").notNull(),
    budgtsAmount: integer("budgts_amount").notNull(),
    commissionWindowDetermination: text("commission_window_determination").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("revenue_allocations_payment_id_uq").on(t.paymentId),
    // partner-only (no status): "which allocations are unpaid" is answered by
    // anti-joining payout_allocations, not by a column here (see comment above)
    index("revenue_allocations_partner_idx").on(t.partnerId),
    index("revenue_allocations_user_idx").on(t.userId),
    check("revenue_allocations_customer_paid_amount_nonnegative", sql`${t.customerPaidAmount} >= 0`),
    check(
      "revenue_allocations_commission_eligible_bounds",
      sql`${t.commissionEligibleAmount} >= 0 and ${t.commissionEligibleAmount} <= ${t.customerPaidAmount}`,
    ),
    check(
      "revenue_allocations_commissionable_proceeds_bounds",
      sql`${t.commissionableProceeds} >= 0 and ${t.commissionableProceeds} <= ${t.commissionEligibleAmount}`,
    ),
    check(
      "revenue_allocations_influencer_percentage_bounds",
      sql`${t.influencerPercentage} >= 0 and ${t.influencerPercentage} <= 10000`,
    ),
    check(
      "revenue_allocations_budgts_percentage_bounds",
      sql`${t.budgtsPercentage} >= 0 and ${t.budgtsPercentage} <= 10000`,
    ),
    check(
      "revenue_allocations_percentages_sum_whole",
      sql`${t.influencerPercentage} + ${t.budgtsPercentage} = 10000`,
    ),
    check("revenue_allocations_influencer_amount_nonnegative", sql`${t.influencerAmount} >= 0`),
    check("revenue_allocations_budgts_amount_nonnegative", sql`${t.budgtsAmount} >= 0`),
    // deterministic-rounding invariant (design §2.5): the two shares must
    // always sum exactly to commissionable_proceeds, enforced in the DB, not
    // just by the rounding function that computes them
    check(
      "revenue_allocations_amounts_sum_to_proceeds",
      sql`${t.influencerAmount} + ${t.budgtsAmount} = ${t.commissionableProceeds}`,
    ),
    check(
      "revenue_allocations_window_determination_valid",
      sql`${t.commissionWindowDetermination} in ('within_window','outside_window','prorated_boundary')`,
    ),
  ],
);

// Refund/chargeback/reconciliation adjustments (design §4.6). The original
// Payment/RevenueAllocation are never mutated — this is the append-only
// "corrective fact" row instead, mirroring the signed-ledger precedent of
// savings_contributions (positive/negative amount, set by server logic, never
// typed directly by a user). Entire row is immutable once written (hand-
// appended trigger, same as payments/redemptions).
export const revenueAllocationAdjustments = pgTable(
  "revenue_allocation_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revenueAllocationId: uuid("revenue_allocation_id")
      .notNull()
      .references(() => revenueAllocations.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    // minor units, signed, non-zero — negative = money taken back
    amountDelta: integer("amount_delta").notNull(),
    reason: text("reason"),
    // idempotency key for the adjustment event itself; null for a manual
    // reconciliation entry with no external event to dedupe against
    externalReferenceId: text("external_reference_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("revenue_allocation_adjustments_allocation_idx").on(t.revenueAllocationId),
    uniqueIndex("revenue_allocation_adjustments_external_ref_uq")
      .on(t.externalReferenceId)
      .where(sql`${t.externalReferenceId} is not null`),
    check(
      "revenue_allocation_adjustments_type_valid",
      sql`${t.type} in ('refund','chargeback','reconciliation')`,
    ),
    check("revenue_allocation_adjustments_amount_delta_nonzero", sql`${t.amountDelta} <> 0`),
  ],
);

// Amounts owed/paid to a Partner (design §3.7). No automated payout
// processing in this phase — this is the auditable ledger a human executes
// against. Not trigger-protected like the tables above: while `payable`, a
// Payout is expected to be assembled/adjusted via payout_allocations before
// it's marked paid; once `paid` it becomes historical fact by process
// discipline (a mistake is a clawback adjustment, not an edit) rather than a
// hard DB block, matching design §3.7's own framing of this as narrower than
// the "entire row immutable forever" guarantee on payments/revenue_allocations.
export const payouts = pgTable(
  "payouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("payable"),
    // minor units — sum of covered revenue_allocations net of adjustments
    amount: integer("amount").notNull(),
    periodCoveredStart: date("period_covered_start"),
    periodCoveredEnd: date("period_covered_end"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    // opaque — bank transfer id, manual note; no payment-rail integration yet
    paidReference: text("paid_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payouts_partner_idx").on(t.partnerId),
    index("payouts_status_idx").on(t.status),
    check("payouts_amount_nonnegative", sql`${t.amount} >= 0`),
    check("payouts_status_valid", sql`${t.status} in ('payable','paid','clawed_back')`),
  ],
);

// Join table preserving traceability from a Payout amount back to the
// individual RevenueAllocations it covers (design §3.7). A join table
// (rather than a payout_id FK directly on revenue_allocations) so a
// mis-grouped allocation can be moved between payouts before the payout is
// marked paid, without ever needing to edit a RevenueAllocation row. The
// unique index on revenue_allocation_id means an allocation belongs to at
// most one payout at a time.
export const payoutAllocations = pgTable(
  "payout_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payoutId: uuid("payout_id")
      .notNull()
      .references(() => payouts.id, { onDelete: "cascade" }),
    revenueAllocationId: uuid("revenue_allocation_id")
      .notNull()
      .references(() => revenueAllocations.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payout_allocations_revenue_allocation_id_uq").on(t.revenueAllocationId),
    index("payout_allocations_payout_idx").on(t.payoutId),
  ],
);

// ---------------------------------------------------------------------------
// V1 subscription ENTITLEMENT + provider BILLING EVENTS (monetization, migration 0022).
//
// The entitlement is the ONE authoritative current-state row per user that the server consults for "does this
// user have Premium?" (`hasPremium`, src/lib/billing/entitlement.ts). It is provider-neutral: RevenueCat (V1) is
// only an adapter that produces internal domain events; nothing outside src/lib/billing/revenuecat/ knows a
// provider's event vocabulary. A future web provider plugs in through the same reducer.
//
// It is DELIBERATELY not part of the financial ledger above: a trial that was never charged creates NO ledger row
// (subscriptions/payments are written only at the first actual paid charge, see src/lib/billing/ledger.ts), so a
// trial-only user still qualifies for Path A hard deletion. The user FK is ON DELETE CASCADE for exactly that reason.
// Written only by the server (direct DB connection / service role); the owner may read their own row.
export const entitlements = pgTable(
  "entitlements",
  {
    // equals auth.users.id (FK, ON DELETE CASCADE, added in the migration)
    userId: uuid("user_id").primaryKey(),
    // none | trialing | active | grace | expired | revoked (CHECK in the migration)
    state: text("state").notNull().default("none"),
    // provider-neutral: 'revenuecat' today; a later web provider adds its own value
    provider: text("provider"),
    // apple | google (the store behind the provider), null while no purchase exists
    store: text("store"),
    productId: text("product_id"),
    // the provider's own customer id where it differs from our user id (RevenueCat: app_user_id = user id, so null)
    providerCustomerId: text("provider_customer_id"),
    willRenew: boolean("will_renew").notNull().default(false),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    // the AUTHORITATIVE trial expiration the reminder is derived from
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    // Premium is granted while state is trialing/active/grace AND access_until is in the future
    accessUntil: timestamp("access_until", { withTimezone: true }),
    // ordering guard: an event older than this never moves the entitlement backward
    lastProviderEventAt: timestamp("last_provider_event_at", { withTimezone: true }),
    lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
    // what renewal will cost, minor units + ISO 4217, when the provider reported it (null = unknown; never invented)
    renewalPriceAmount: integer("renewal_price_amount"),
    renewalPriceCurrency: text("renewal_price_currency"),
    // Trial-end reminder state. `reminderForTrialEndsAt` records WHICH trial the claim belongs to, so a later trial
    // (or an extended one) can be reminded again while the same trial is never reminded twice.
    reminderForTrialEndsAt: timestamp("reminder_for_trial_ends_at", { withTimezone: true }),
    reminderClaimedAt: timestamp("reminder_claimed_at", { withTimezone: true }),
    // set by a delivery adapter once a message actually went out (no adapter exists yet; see docs)
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("entitlements_state_valid", sql`${t.state} in ('none','trialing','active','grace','expired','revoked')`),
    check("entitlements_store_valid", sql`${t.store} is null or ${t.store} in ('apple','google')`),
    check("entitlements_currency_valid", sql`${t.renewalPriceCurrency} is null or ${t.renewalPriceCurrency} ~ '^[A-Z]{3}$'`),
    check("entitlements_price_nonnegative", sql`${t.renewalPriceAmount} is null or ${t.renewalPriceAmount} >= 0`),
    // An entitled state must say until when; a trial must carry its authoritative end.
    check(
      "entitlements_access_until_when_entitled",
      sql`${t.state} not in ('trialing','active','grace') or ${t.accessUntil} is not null`,
    ),
    check("entitlements_trial_ends_when_trialing", sql`${t.state} <> 'trialing' or ${t.trialEndsAt} is not null`),
    // Reminder scan: live trials by their authoritative end. Whether one is still claimable (never claimed, or a
    // stale lease) is decided atomically in the claim statement, not by this index.
    index("entitlements_trial_reminder_idx")
      .on(t.trialEndsAt)
      .where(sql`${t.state} = 'trialing'`),
    // Reconciliation scan: entitled rows ordered by how long since they were last checked against the provider.
    index("entitlements_reconcile_idx")
      .on(t.lastReconciledAt)
      .where(sql`${t.state} in ('trialing','active','grace')`),
  ],
);

// Append-only, idempotent record of every provider webhook delivery: dedupe (unique provider event id), audit,
// ordering and reconciliation. The identity/payload columns are frozen by a hand-appended trigger; only the
// processing bookkeeping (status, processed_at, error, attempts, internal_type) changes. `payload` is stored
// REDACTED (no subscriber attributes / aliases: the deletion design forbids keeping provider PII).
// Server-only: deny-all RLS for every client role.
export const billingEvents = pgTable(
  "billing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    // the provider-neutral event this mapped to (null until processed / when ignored)
    internalType: text("internal_type"),
    // resolved owner; null when the event names no known user (anonymous id, deleted account, test event)
    userId: uuid("user_id"),
    appUserId: text("app_user_id"),
    environment: text("environment").notNull(),
    // the provider's own event time (NOT our receipt time): the ordering key
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    // received | processed | ignored | quarantined | failed (CHECK in the migration)
    status: text("status").notNull().default("received"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    payload: jsonb("payload").notNull(),
  },
  (t) => [
    uniqueIndex("billing_events_provider_event_uq").on(t.provider, t.providerEventId),
    index("billing_events_user_idx")
      .on(t.userId, t.occurredAt)
      .where(sql`${t.userId} is not null`),
    index("billing_events_pending_idx")
      .on(t.receivedAt)
      .where(sql`${t.status} in ('received','failed')`),
    check("billing_events_environment_valid", sql`${t.environment} in ('production','sandbox')`),
    check(
      "billing_events_status_valid",
      sql`${t.status} in ('received','processed','ignored','quarantined','failed')`,
    ),
  ],
);
