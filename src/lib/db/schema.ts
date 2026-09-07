import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactions_user_occurred_idx").on(t.userId, t.occurredAt),
    index("transactions_category_idx").on(t.categoryId),
    uniqueIndex("transactions_source_ref_uq")
      .on(t.userId, t.source, t.sourceRef)
      .where(sql`${t.sourceRef} is not null`),
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
