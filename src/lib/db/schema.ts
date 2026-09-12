import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
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
    // V1.5 recurring-stream linkage — plain uuid, no FK (recurring_streams is V1.5)
    recurringStreamId: uuid("recurring_stream_id"),
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
