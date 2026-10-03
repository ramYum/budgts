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

/**
 * The small hint under a card on Connected banks while it isn't imported, or `null` (owner-approved 2026-10-01, design:
 * 2026-10-01 card payments §6). A payment to a card from an imported checking account is never counted as spending, so
 * a card's purchases only reach the budget when the card itself is imported.
 */
export function notImportedHint(a: SuggestableAccount): string | null {
  return norm(a.type) === "credit" ? "Card purchases aren't tracked unless this card is imported." : null;
}

/** The default name for a new Budgts account: Plaid's name, else its official name, else "Account", with the mask. */
export function accountLabel(a: { name: string | null; officialName: string | null; mask: string | null }): string {
  const base = a.name?.trim() || a.officialName?.trim() || "Account";
  return a.mask ? `${base} ••${a.mask}` : base;
}

/**
 * What the server recognised about a newly linked Plaid account (src/lib/plaid/reconnect-match.ts, owner decision
 * 2026-10-02): the same bank account fed one Budgts account before (`previous`), or several (`ambiguous`, ids in the
 * order to list them). Reconnect adoption only re-attaches a reconnected bank's history to the account it was in, so
 * the mapping sheet starts the row on that account; the user can still choose anything else.
 */
export type MappingSuggestion =
  | { kind: "previous"; accountId: string; accountName: string }
  | { kind: "ambiguous"; accountIds: string[] };

/** The line under a mapping row the server recognised. */
export function previousAccountNote(accountName: string): string {
  return `You connected this account before. Its history stays in ${accountName}.`;
}

/**
 * The row's starting choice from a suggestion: the previous account, when the sheet still offers it. Ambiguous or no
 * match: null, and the row keeps `suggestAccount`'s default.
 */
export function mappingStart(
  suggestion: MappingSuggestion | undefined,
  offered: readonly { id: string }[],
): { mode: "existing"; existingAccountId: string } | null {
  if (suggestion?.kind !== "previous" || !offered.some((a) => a.id === suggestion.accountId)) return null;
  return { mode: "existing", existingAccountId: suggestion.accountId };
}

/** The "existing account" choices for a row: the suggestion's accounts first, in its order, then the rest unchanged. */
export function existingChoices<T extends { id: string }>(offered: T[], suggestion: MappingSuggestion | undefined): T[] {
  if (!suggestion) return offered;
  const first = suggestion.kind === "previous" ? [suggestion.accountId] : suggestion.accountIds;
  const rank = new Map(first.map((id, i) => [id, i]));
  const top = offered.filter((a) => rank.has(a.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...top, ...offered.filter((a) => !rank.has(a.id))];
}
