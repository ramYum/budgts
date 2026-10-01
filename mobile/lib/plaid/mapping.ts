import type { UnmappedAccount } from "./banks-api";

import { accountLabel, suggestAccount } from "../shared";

/**
 * The native mapping sheet's rows and wire body. Each row's default (import as a new account of a suggested type, or
 * leave it out) and its name come from the web's own `suggestAccount`/`accountLabel`
 * (src/lib/accounts/account-suggestion.ts, through Metro's shared folders): one implementation for both apps. A
 * suggestion only pre-fills a row the user can change; the server (`mapPlaidAccounts`) makes no guess of its own.
 */
export type MapMode = "new" | "existing" | "ignore";
export type MapRow = { mode: MapMode; name: string; type: string; existingAccountId: string };

/** One row per unmapped account, each defaulting to the web's suggestion: a new Budgts account of the suggested type, or "Don't import". */
export function emptyMapRows(accounts: UnmappedAccount[], defaultExistingAccountId: string): MapRow[] {
  return accounts.map((a) => {
    const { mode, type } = suggestAccount(a);
    return { mode, name: accountLabel(a), type, existingAccountId: defaultExistingAccountId };
  });
}

export type MapEntry =
  | { plaidAccountId: string; mode: "new"; name: string; type: string }
  | { plaidAccountId: string; mode: "existing"; existingAccountId: string }
  | { plaidAccountId: string; mode: "ignore" };

/** The wire body for `POST /api/mobile/plaid/accounts/map`'s `entries`. */
export function buildMapEntries(accounts: UnmappedAccount[], rows: MapRow[]): MapEntry[] {
  return accounts.map((a, i) => {
    const r = rows[i];
    if (r.mode === "new") return { plaidAccountId: a.plaidAccountId, mode: "new", name: r.name.trim(), type: r.type };
    if (r.mode === "existing") return { plaidAccountId: a.plaidAccountId, mode: "existing", existingAccountId: r.existingAccountId };
    return { plaidAccountId: a.plaidAccountId, mode: "ignore" };
  });
}

/** What the mapping sheet offers: the Budgts accounts a Plaid account can feed, and the types a new one can take. */
export type MappingChoices = { budgtsAccounts: { id: string; name: string }[]; accountTypes: string[] };

/**
 * From `GET /api/mobile/accounts` (ordered by name, like the web's list): every account that isn't archived is a
 * choice, as on the web (`loadConnectedBanks`' `budgtsAccounts`), and the server's own type list.
 */
export function mappingChoices(data: { accounts: { id: string; name: string; archived: boolean }[]; accountTypes: string[] }): MappingChoices {
  return { budgtsAccounts: data.accounts.filter((a) => !a.archived).map(({ id, name }) => ({ id, name })), accountTypes: data.accountTypes };
}
