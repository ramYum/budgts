import { bool, int, list, obj, oneOf, optStr, str } from "../api/parse";

/**
 * The response contract of `GET /api/mobile/plaid/banks` (server: `src/lib/plaid/connected-banks-read.ts`). Mirrored and
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
  currentBalance: number | null;
  isoCurrencyCode: string | null;
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

function parseUnmapped(v: unknown, i: number): UnmappedAccount {
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

function parseAccount(v: unknown, i: number): BankAccount {
  const a = obj(v, `accounts[${i}]`);
  return {
    ...parseUnmapped(v, i),
    rowId: str(a.rowId, "rowId"),
    linkState: oneOf(a.linkState, "linkState", ["mapped", "ignored", "unmapped"] as const),
    mappedAccountName: optStr(a.mappedAccountName, "mappedAccountName"),
    needsReview: bool(a.needsReview, "needsReview"),
    reviewReason: optStr(a.reviewReason, "reviewReason"),
    excludedFromCalculations: bool(a.excludedFromCalculations, "excludedFromCalculations"),
    pendingSignCheckCount: int(a.pendingSignCheckCount, "pendingSignCheckCount"),
  };
}

export function parseBanks(body: unknown): ConnectedBank[] {
  const b = obj(body, "banks");
  return list(b.banks, "banks", (v, i) => {
    const item = obj(v, `banks[${i}]`);
    return {
      id: str(item.id, "id"),
      itemId: str(item.itemId, "itemId"),
      institutionName: optStr(item.institutionName, "institutionName"),
      status: oneOf(item.status, "status", STATUSES),
      lastSyncedAt: optStr(item.lastSyncedAt, "lastSyncedAt"),
      accounts: list(item.accounts, "accounts", parseAccount),
      unmappedAccounts: list(item.unmappedAccounts, "unmappedAccounts", parseUnmapped),
    };
  });
}

/** A status the UI must surface, not hide — no silent failure states. */
export const statusNeedsAttention = (status: BankStatus): boolean => status !== "active";
