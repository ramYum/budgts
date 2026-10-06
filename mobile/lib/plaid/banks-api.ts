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
  /** The held transaction the money-direction question asks about while `pendingSignCheckCount > 0` (card payments §5). */
  signCheckSample: SignCheckSample | null;
  /** The user answered for this account (§5a): "Money direction set. Change answer" asks again about `sample`. */
  signAnswer: { answeredAt: string; sample: SignCheckSample | null } | null;
  /** An imported account the sync resolved from evidence (§5b): "Amounts on this account look reversed?" asks about `sample`. */
  directionReview: { sample: SignCheckSample } | null;
};

/** One transaction the money-direction question shows: amount in minor units, unsigned (the sign is what is asked). */
export type SignCheckSample = {
  transactionId: string;
  description: string;
  occurredAt: string;
  amount: number;
  currency: string;
};

/** Held rows a removed bank left behind, one group per Budgts account and original bank feed (§5c). */
export type RemovedHeldGroup = { accountId: string; accountName: string; originRef: string; count: number; sample: SignCheckSample };
/** A removed-bank group already answered, for "Change answer" (§5c). */
export type RemovedAnsweredGroup = { accountId: string; accountName: string; originRef: string; answeredAt: string; sample: SignCheckSample };
export type RemovedBanksHeld = { groups: RemovedHeldGroup[]; answered: RemovedAnsweredGroup[] };

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

function parseSample(v: unknown, what: string): SignCheckSample {
  const s = obj(v, what);
  return {
    transactionId: str(s.transactionId, `${what}.transactionId`),
    description: str(s.description, `${what}.description`),
    occurredAt: str(s.occurredAt, `${what}.occurredAt`),
    amount: int(s.amount, `${what}.amount`),
    currency: str(s.currency, `${what}.currency`),
  };
}

/** Absent from a server older than the question (card payments §5): read as "nothing to ask", the old screen. */
const optSample = (v: unknown, what: string): SignCheckSample | null => (v === null || v === undefined ? null : parseSample(v, what));

function parseSignAnswer(v: unknown): BankAccount["signAnswer"] {
  if (v === null || v === undefined) return null;
  const a = obj(v, "signAnswer");
  return { answeredAt: str(a.answeredAt, "signAnswer.answeredAt"), sample: optSample(a.sample, "signAnswer.sample") };
}

function parseDirectionReview(v: unknown): BankAccount["directionReview"] {
  if (v === null || v === undefined) return null;
  return { sample: parseSample(obj(v, "directionReview").sample, "directionReview.sample") };
}

/**
 * "From removed banks" (§5c). `null`: the server couldn't read them this time (the rest of the page still loaded), and
 * the screen says so. Absent from a server older than §5c: nothing to ask.
 */
export function parseRemovedBanksHeld(v: unknown): RemovedBanksHeld | null {
  if (v === undefined) return { groups: [], answered: [] };
  if (v === null) return null;
  const r = obj(v, "removedBanksHeld");
  const base = (g: Record<string, unknown>, what: string) => ({
    accountId: str(g.accountId, `${what}.accountId`),
    accountName: str(g.accountName, `${what}.accountName`),
    originRef: str(g.originRef, `${what}.originRef`),
    sample: parseSample(g.sample, `${what}.sample`),
  });
  return {
    groups: list(r.groups, "removedBanksHeld.groups", (x, i) => {
      const g = obj(x, `groups[${i}]`);
      return { ...base(g, `groups[${i}]`), count: int(g.count, `groups[${i}].count`) };
    }),
    answered: list(r.answered, "removedBanksHeld.answered", (x, i) => {
      const g = obj(x, `answered[${i}]`);
      return { ...base(g, `answered[${i}]`), answeredAt: str(g.answeredAt, `answered[${i}].answeredAt`) };
    }),
  };
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
    signCheckSample: optSample(a.signCheckSample, "signCheckSample"),
    signAnswer: parseSignAnswer(a.signAnswer),
    directionReview: parseDirectionReview(a.directionReview),
  };
}

export type BanksData = {
  /** false when bank connections are off on this deployment (the web shows "not available yet" instead) */
  enabled: boolean;
  banks: ConnectedBank[];
  /** The banks were removed because the subscription or trial ended unpaid (server: src/lib/billing/lapse.ts).
   *  Absent from an older server, which never removes them: read as false. */
  connectionsRemovedForLapse: boolean;
  /** Held rows a disconnected bank left behind, and groups already answered (card payments §5c); null: couldn't load. */
  removedBanksHeld: RemovedBanksHeld | null;
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
    removedBanksHeld: parseRemovedBanksHeld(b.removedBanksHeld),
  };
}

/** A status the UI must surface, not hide — no silent failure states. */
export const statusNeedsAttention = (status: BankStatus): boolean => status !== "active";
