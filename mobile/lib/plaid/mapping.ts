import type { UnmappedAccount } from "./banks-api";

/**
 * Pure account-mapping helpers for the native mapping screen — presentation-layer guessing (name/type defaults),
 * mirroring the web's `guessType`/`accountLabel` (`src/components/plaid/account-mapping.tsx`). Not shared server logic:
 * each client guesses sensible defaults for its own form; the server (`mapPlaidAccounts`) makes no guess of its own.
 * The account type is a plain string, not a fixed union — like `accounts-api.ts`, the server's own `accountTypes` list
 * is the source of truth (compatibility rule, spec §4A), and `guessType`'s result must be one of those values.
 */
export function guessType(a: Pick<UnmappedAccount, "type" | "subtype">): string {
  if (a.subtype === "savings") return "savings";
  if (a.type === "credit") return "credit";
  return "checking";
}

export function accountLabel(a: Pick<UnmappedAccount, "name" | "officialName" | "mask">): string {
  const base = a.name?.trim() || a.officialName?.trim() || "Account";
  return a.mask ? `${base} ••${a.mask}` : base;
}

export type MapMode = "new" | "existing" | "ignore";
export type MapRow = { mode: MapMode; name: string; type: string; existingAccountId: string };

/** One row per unmapped account, each defaulting to "a new Budgts account" with a guessed name/type. */
export function emptyMapRows(accounts: UnmappedAccount[], defaultExistingAccountId: string): MapRow[] {
  return accounts.map((a) => ({ mode: "new", name: accountLabel(a), type: guessType(a), existingAccountId: defaultExistingAccountId }));
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
