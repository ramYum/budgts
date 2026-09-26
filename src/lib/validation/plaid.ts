import { z } from "zod";
import { STANDARD_CATEGORY_NAMES } from "@/lib/categories/standard";
import { ACCOUNT_TYPES } from "@/lib/accounts/account-types";

/**
 * Shared validation for the Plaid UI server actions (design §11, §18, §24).
 * The client sends a *reference* (an id) plus the user's choice — the action
 * re-reads everything else from a trusted source, RLS-scoped (`server-actions`
 * security guide).
 */

/** One row of the account-mapping screen: what to do with a linked Plaid account. */
export const accountMapEntrySchema = z
  .object({
    plaidAccountId: z.string().min(1),
    mode: z.enum(["new", "existing", "ignore"]),
    /** mode "existing" — the Budgts account to point at. */
    existingAccountId: z.string().uuid().optional(),
    /** mode "new" — name + type for the account we create. */
    name: z.string().trim().min(1).max(40).optional(),
    type: z.enum(ACCOUNT_TYPES).optional(),
  })
  .refine((v) => v.mode !== "existing" || !!v.existingAccountId, {
    message: "Pick an account to map to",
    path: ["existingAccountId"],
  })
  .refine((v) => v.mode !== "new" || !!v.name, {
    message: "Name the new account",
    path: ["name"],
  });

export const mapAccountsSchema = z.object({
  /** `plaid_items.id` (row uuid) — scopes the `plaid_accounts` updates. */
  plaidItemId: z.string().uuid(),
  entries: z.array(accountMapEntrySchema).min(1),
});

/**
 * Categorize a bank transaction. The user picks EITHER one of their existing
 * categories (`categoryId`) OR a standard category they don't currently have
 * (`standardCategoryName` — Budgts re-adds it). Exactly one.
 */
export const categorizeBankTxnSchema = z
  .object({
    transactionId: z.string().uuid(),
    categoryId: z.string().uuid().optional(),
    standardCategoryName: z.enum(STANDARD_CATEGORY_NAMES).optional(),
  })
  .refine((v) => !!v.categoryId !== !!v.standardCategoryName, {
    message: "Pick a category",
    path: ["categoryId"],
  });

export const disconnectBankSchema = z.object({
  /** Plaid `item_id` (text) — the connection to tear down. */
  itemId: z.string().min(1),
  /**
   * `true` = the separate, destructive "also delete imported transactions"
   * path (design §24.2). Default `false` keeps every imported row as history.
   */
  purge: z.boolean().optional().default(false),
});

/** Clear an account's anomaly-review flag (design: 2026-09-12) — owner action only. */
export const clearAccountReviewSchema = z.object({
  /** `plaid_accounts.id` (row uuid). */
  plaidAccountRowId: z.string().uuid(),
});

/**
 * Exclude/re-include a Plaid account's data from financial calculations
 * (design: 2026-09-13 Advancial containment) — owner action only.
 */
export const setAccountCalculationExclusionSchema = z.object({
  /** `plaid_accounts.id` (row uuid). */
  plaidAccountRowId: z.string().uuid(),
  excluded: z.boolean(),
});

/**
 * Turn importing on/off for one already-linked Plaid account without
 * re-running account mapping (design 2026-09-15 — the prior "Stop
 * importing" flow nulled the account_id, making resume a fresh mapping
 * decision every time; this path preserves it, so the switch is reversible).
 */
export const setAccountImportingSchema = z.object({
  /** `plaid_accounts.id` (row uuid). */
  plaidAccountRowId: z.string().uuid(),
  importing: z.boolean(),
});

export type AccountMapEntryInput = z.infer<typeof accountMapEntrySchema>;
export type MapAccountsInput = z.infer<typeof mapAccountsSchema>;
