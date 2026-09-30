import type { Session } from "@supabase/supabase-js";
import { authFetch } from "../auth/api";
import { jsonInit } from "../api/request";
import { bool, int, list, obj, oneOf, optStr, str } from "../api/parse";
import { runCommand, type CommandOutcome } from "../plaid/bank-commands";

/**
 * The Accounts screen's read, `GET /api/mobile/accounts/overview` (server: `src/lib/accounts/load-accounts-overview.ts`,
 * the read the web Accounts page renders): accounts grouped under the bank that links them, then the ones added by
 * hand, then archived, each with this month's transaction count. Unknown extra fields are ignored (spec §4A).
 */
export type OverviewAccount = {
  id: string;
  name: string;
  type: string;
  isArchived: boolean;
  /** the bank's last four, for a linked account */
  mask: string | null;
  /** transactions this month (the Activity list's count for the account) */
  txnCount: number;
};

export type OverviewGroup = {
  key: string;
  title: string;
  /** a linked bank's connection state; none for the accounts added by hand */
  status: "connected" | "attention" | null;
  accounts: OverviewAccount[];
};

export type AccountsOverview = { month: string; groups: OverviewGroup[]; archived: OverviewAccount[] };

function parseAccount(v: unknown, i: number): OverviewAccount {
  const a = obj(v, `accounts[${i}]`);
  return {
    id: str(a.id, "id"),
    name: str(a.name, "name"),
    type: str(a.type, "type"),
    isArchived: bool(a.is_archived, "is_archived"),
    mask: optStr(a.mask, "mask"),
    txnCount: int(a.txnCount, "txnCount"),
  };
}

export function parseOverview(body: unknown): AccountsOverview {
  const b = obj(body, "overview");
  return {
    month: str(b.month, "month"),
    groups: list(b.groups, "groups", (v, i) => {
      const g = obj(v, `groups[${i}]`);
      return {
        key: str(g.key, "key"),
        title: str(g.title, "title"),
        status: g.status === undefined ? null : oneOf(g.status, "status", ["connected", "attention"] as const),
        accounts: list(g.accounts, "accounts", parseAccount),
      };
    }),
    archived: list(b.archived, "archived", parseAccount),
  };
}

/** The Accounts screen's writes (web `src/server/accounts.ts`), bound to the session: fixed sentences, the web's own. */
export function accountCommands(session: Session | null) {
  const m = { failed: "Something went wrong. Please try again.", missing: "That account no longer exists. Refresh and try again." };
  return {
    create: (input: { name: string; type: string }): Promise<CommandOutcome> =>
      runCommand(() => authFetch("/api/mobile/accounts", session, jsonInit("POST", input)), m),
    update: (id: string, input: { name: string; type: string }): Promise<CommandOutcome> =>
      runCommand(() => authFetch(`/api/mobile/accounts/${id}`, session, jsonInit("PATCH", input)), m),
    setArchived: (id: string, archived: boolean): Promise<CommandOutcome> =>
      runCommand(() => authFetch(`/api/mobile/accounts/${id}`, session, jsonInit("PATCH", { archived })), m),
  };
}

export type AccountCommands = ReturnType<typeof accountCommands>;
