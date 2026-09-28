import { bool, list, obj, oneOf, str } from "../api/parse";

/**
 * The response contract of `GET /api/mobile/accounts` (server: `src/lib/mobile/reads.ts`). `accountTypes` is the server's own
 * list, so the type picker can never offer a value the server would reject. Unknown extra fields are ignored.
 */
export type MobileAccount = {
  id: string;
  name: string;
  type: string;
  source: "manual" | "plaid";
  archived: boolean;
  /** May a manual transaction be entered against it? */
  selectable: boolean;
};

export type AccountsData = { accounts: MobileAccount[]; accountTypes: string[] };

function parseAccount(v: unknown, i: number): MobileAccount {
  const a = obj(v, `accounts[${i}]`);
  return {
    id: str(a.id, "id"),
    name: str(a.name, "name"),
    type: str(a.type, "type"),
    source: oneOf(a.source, "source", ["manual", "plaid"] as const),
    archived: bool(a.archived, "archived"),
    selectable: bool(a.selectable, "selectable"),
  };
}

export function parseAccounts(body: unknown): AccountsData {
  const b = obj(body, "accounts");
  const accountTypes = list(b.accountTypes, "accountTypes", (t) => str(t, "accountType"));
  if (accountTypes.length === 0) throw new Error("accountTypes: empty");
  return { accounts: list(b.accounts, "accounts", parseAccount), accountTypes };
}
