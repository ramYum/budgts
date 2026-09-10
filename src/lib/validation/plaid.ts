import { z } from "zod";
import { ACCOUNT_TYPES } from "./account";

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

export const categorizeBankTxnSchema = z.object({
  transactionId: z.string().uuid(),
  categoryId: z.string().uuid(),
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

export type AccountMapEntryInput = z.infer<typeof accountMapEntrySchema>;
export type MapAccountsInput = z.infer<typeof mapAccountsSchema>;
