/**
 * The account-mapping sheet's default for each linked Plaid account (owner-approved 2026-10-01): import it as a new
 * Budgts account of a suggested type, or leave it out. One implementation for the web sheet and quick-connect switch
 * (`src/components/plaid/`) and the native ones (`mobile/lib/plaid/mapping.ts`, through Metro's shared folders).
 *
 * A suggestion only pre-fills a row the user can change before saving. It never re-types an existing account, and the
 * server (`mapPlaidAccounts`) makes no guess of its own.
 *
 * Rules, over Plaid's account taxonomy (`type`, `subtype`):
 * - a health savings account (`hsa`, depository or investment), any investment account (`investment`, or its legacy
 *   alias `brokerage`) and any loan: don't import. Their money is not day-to-day spending;
 * - credit: Credit;
 * - savings, certificates of deposit (`cd`) and money market: Savings;
 * - everything else: Checking.
 *
 * Pure TypeScript with no imports: the native app reads this folder through Metro (tests/unit/brand-purity.test.ts).
 */

/** The Budgts account types a suggestion uses; each is one of `ACCOUNT_TYPES` (src/lib/accounts/account-types.ts). */
export type SuggestedAccountType = "checking" | "savings" | "credit";

/**
 * `mode` is the row's default choice: "new" (import as a new Budgts account) or "ignore" (don't import). `type` is the
 * type the new account gets, also kept for an "ignore" row so the picker starts somewhere if the user imports it after all.
 */
export type AccountSuggestion = { mode: "new" | "ignore"; type: SuggestedAccountType };

export type SuggestableAccount = { type: string | null; subtype: string | null };

const SAVINGS_SUBTYPES = new Set(["savings", "cd", "money market"]);
const NOT_IMPORTED_TYPES = new Set(["investment", "brokerage", "loan"]);

const norm = (v: string | null) => (v ?? "").trim().toLowerCase();

export function suggestAccount(a: SuggestableAccount): AccountSuggestion {
  const type = norm(a.type);
  const subtype = norm(a.subtype);
  if (subtype === "hsa" || NOT_IMPORTED_TYPES.has(type)) return { mode: "ignore", type: "checking" };
  if (type === "credit") return { mode: "new", type: "credit" };
  if (SAVINGS_SUBTYPES.has(subtype)) return { mode: "new", type: "savings" };
  return { mode: "new", type: "checking" };
}

/**
 * The small hint under a mapping row, or `null`. Only an HSA has one (owner-approved 2026-10-01): it defaults to
 * "Don't import", but people who pay for care from it may want that spending in their budget.
 */
export function accountHint(a: SuggestableAccount): string | null {
  return norm(a.subtype) === "hsa" ? "Import it if you pay for care from it." : null;
}

/** The default name for a new Budgts account: Plaid's name, else its official name, else "Account", with the mask. */
export function accountLabel(a: { name: string | null; officialName: string | null; mask: string | null }): string {
  const base = a.name?.trim() || a.officialName?.trim() || "Account";
  return a.mask ? `${base} ••${a.mask}` : base;
}
