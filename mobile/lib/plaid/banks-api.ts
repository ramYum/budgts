import { bool, int, list, obj, oneOf, optStr, str } from "../api/parse";

/**
 * The response contract of `GET /api/mobile/plaid/banks` (server: `src/lib/plaid/connected-banks-read.ts`, the read the web Connected Banks page uses). Mirrored and
 * validated at runtime, tolerating unknown fields, per the compatibility rule (spec §4A).
 */
export type BankStatus = "active" | "login_required" | "pending_expiration" | "revoked" | "error";

export type BankAccount = {
  rowId: string;
  plaidAccountId: string;
  name: string | null;
  officialName: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  linkState: "mapped" | "ignored" | "unmapped";
  mappedAccountName: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  excludedFromCalculations: boolean;
  pendingSignCheckCount: number;
};

export type UnmappedAccount = {
  plaidAccountId: string;
  name: string | null;
  officialName: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  currentBalance: number | null;
  isoCurrencyCode: string | null;
};

export type ConnectedBank = {
  id: string;
  itemId: string;
  institutionName: string | null;
  status: BankStatus;
  lastSyncedAt: string | null;
  accounts: BankAccount[];
  unmappedAccounts: UnmappedAccount[];
};

const STATUSES = ["active", "login_required", "pending_expiration", "revoked", "error"] as const;

/** One Plaid account as the mapping sheet needs it: the exchange reply's `accounts[]` and a bank's `unmappedAccounts[]` share it. */
export function parseUnmapped(v: unknown, i: number): UnmappedAccount {
  const a = obj(v, `unmappedAccounts[${i}]`);
  return {
    plaidAccountId: str(a.plaidAccountId, "plaidAccountId"),
    name: optStr(a.name, "name"),
    officialName: optStr(a.officialName, "officialName"),
    mask: optStr(a.mask, "mask"),
    type: optStr(a.type, "type"),
    subtype: optStr(a.subtype, "subtype"),
    currentBalance: a.currentBalance === null ? null : int(a.currentBalance, "currentBalance"),
    isoCurrencyCode: optStr(a.isoCurrencyCode, "isoCurrencyCode"),
  };
}

/**
 * A status this version of the app doesn't know (the server added one) shows as a connection error on that bank
 * alone, with Reconnect and Disconnect as its way out, instead of failing the whole screen. Never shown as healthy.
 */
function bankStatus(v: unknown): BankStatus {
  const s = str(v, "status");
  return (STATUSES as readonly string[]).includes(s) ? (s as BankStatus) : "error";
}

function parseAccount(v: unknown, i: number): BankAccount {
  const a = obj(v, `accounts[${i}]`);
  return {
    plaidAccountId: str(a.plaidAccountId, "plaidAccountId"),
    name: optStr(a.name, "name"),
    officialName: optStr(a.officialName, "officialName"),
    mask: optStr(a.mask, "mask"),
    type: optStr(a.type, "type"),
    subtype: optStr(a.subtype, "subtype"),
    rowId: str(a.rowId, "rowId"),
    linkState: oneOf(a.linkState, "linkState", ["mapped", "ignored", "unmapped"] as const),
    mappedAccountName: optStr(a.mappedAccountName, "mappedAccountName"),
    needsReview: bool(a.needsReview, "needsReview"),
    reviewReason: optStr(a.reviewReason, "reviewReason"),
    excludedFromCalculations: bool(a.excludedFromCalculations, "excludedFromCalculations"),
    pendingSignCheckCount: int(a.pendingSignCheckCount, "pendingSignCheckCount"),
  };
}

export type BanksData = {
  /** false when bank connections are off on this deployment (the web shows "not available yet" instead) */
  enabled: boolean;
  banks: ConnectedBank[];
  /** The banks were removed because the subscription or trial ended unpaid (server: src/lib/billing/lapse.ts).
   *  Absent from an older server, which never removes them: read as false. */
  connectionsRemovedForLapse: boolean;
};

export function parseBanks(body: unknown): BanksData {
  const b = obj(body, "banks");
  const banks = list(b.banks, "banks", (v, i) => {
    const item = obj(v, `banks[${i}]`);
    return {
      id: str(item.id, "id"),
      itemId: str(item.itemId, "itemId"),
      institutionName: optStr(item.institutionName, "institutionName"),
      status: bankStatus(item.status),
      lastSyncedAt: optStr(item.lastSyncedAt, "lastSyncedAt"),
      accounts: list(item.accounts, "accounts", parseAccount),
      unmappedAccounts: list(item.unmappedAccounts, "unmappedAccounts", parseUnmapped),
    };
  });
  return {
    enabled: bool(b.enabled, "enabled"),
    banks,
    connectionsRemovedForLapse: b.connectionsRemovedForLapse === undefined ? false : bool(b.connectionsRemovedForLapse, "connectionsRemovedForLapse"),
  };
}

/** A status the UI must surface, not hide — no silent failure states. */
export const statusNeedsAttention = (status: BankStatus): boolean => status !== "active";
