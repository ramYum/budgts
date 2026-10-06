import { describe, expect, it } from "vitest";
import { parseBanks, statusNeedsAttention } from "./banks-api";

const bank = (over: Record<string, unknown> = {}) => ({
  id: "item-1",
  itemId: "plaid-item-1",
  institutionName: "SoFi",
  status: "active",
  lastSyncedAt: "2026-09-20T00:00:00Z",
  accounts: [],
  unmappedAccounts: [],
  ...over,
});

describe("parseBanks", () => {
  it("accepts the server contract, tolerating fields it does not know", () => {
    const data = parseBanks({ version: 1, enabled: true, banks: [{ ...bank(), newField: true }], budgtsAccounts: [{ id: "a1", name: "Everyday", extra: 1 }], extra: 1 });
    expect(data).toEqual({ enabled: true, banks: [bank()], connectionsRemovedForLapse: false, removedBanksHeld: { groups: [], answered: [] } });
  });

  it("reads bank connections switched off on the deployment", () => {
    expect(parseBanks({ version: 1, enabled: false, banks: [], budgtsAccounts: [] })).toEqual({
      enabled: false,
      banks: [],
      connectionsRemovedForLapse: false,
      removedBanksHeld: { groups: [], answered: [] },
    });
  });

  it("reads the lapse removal flag, and refuses a malformed one", () => {
    expect(parseBanks({ version: 1, enabled: true, banks: [], budgtsAccounts: [], connectionsRemovedForLapse: true }).connectionsRemovedForLapse).toBe(true);
    expect(() => parseBanks({ version: 1, enabled: true, banks: [], budgtsAccounts: [], connectionsRemovedForLapse: "yes" })).toThrow();
  });

  it("keeps account rows and unmapped accounts with their own fields", () => {
    const { banks } = parseBanks({
      version: 1,
      enabled: true,
      budgtsAccounts: [],
      banks: [
        bank({
          accounts: [
            {
              rowId: "row-1",
              plaidAccountId: "pa1",
              name: "Checking",
              officialName: null,
              mask: "1234",
              type: "depository",
              subtype: "checking",
              currentBalance: 5000,
              isoCurrencyCode: "USD",
              linkState: "mapped",
              mappedAccountName: "Everyday Checking",
              needsReview: true,
              reviewReason: "duplicate_feed",
              excludedFromCalculations: false,
              pendingSignCheckCount: 2,
            },
          ],
          unmappedAccounts: [{ plaidAccountId: "pa2", name: "Savings", officialName: null, mask: "9999", type: "depository", subtype: "savings", currentBalance: 100, isoCurrencyCode: "USD" }],
        }),
      ],
    });
    expect(banks[0].accounts[0].needsReview).toBe(true);
    expect(banks[0].accounts[0].pendingSignCheckCount).toBe(2);
    expect(banks[0].unmappedAccounts[0].name).toBe("Savings");
  });

  it("shows a status it doesn't know as a connection error on that bank only, never failing the screen or reading as healthy", () => {
    const { banks } = parseBanks({ version: 1, enabled: true, budgtsAccounts: [], banks: [bank({ status: "mystery" }), bank({ id: "item-2" })] });
    expect(banks.map((b) => b.status)).toEqual(["error", "active"]);
  });

  it.each([
    ["a status that isn't text", { status: 7 }],
    ["a non-boolean needsReview", { accounts: [{ rowId: "r", plaidAccountId: "p", name: null, officialName: null, mask: null, type: null, subtype: null, currentBalance: null, isoCurrencyCode: null, linkState: "mapped", mappedAccountName: null, needsReview: "yes", reviewReason: null, excludedFromCalculations: false, pendingSignCheckCount: 0 }] }],
    ["banks that are not a list", "nope"],
  ])("rejects %s", (_name, over) => {
    if (typeof over === "string") {
      expect(() => parseBanks({ version: 1, enabled: true, budgtsAccounts: [], banks: over })).toThrow();
    } else {
      expect(() => parseBanks({ version: 1, enabled: true, budgtsAccounts: [], banks: [bank(over)] })).toThrow();
    }
  });

  it("rejects a reply without the enabled flag", () => {
    expect(() => parseBanks({ version: 1, budgtsAccounts: [], banks: [] })).toThrow();
  });
});

describe("parseBanks: the money-direction question (card payments §5, §5a, §5b, §5c)", () => {
  const sample = { transactionId: "t1", description: "GOOGLE", occurredAt: "2026-09-05T12:00:00Z", amount: 4600, currency: "USD" };
  const account = (over: Record<string, unknown> = {}) => ({
    rowId: "row-1",
    plaidAccountId: "pa1",
    name: "Checking",
    officialName: null,
    mask: "1234",
    type: "depository",
    subtype: "checking",
    linkState: "mapped",
    mappedAccountName: "Everyday",
    needsReview: false,
    reviewReason: null,
    excludedFromCalculations: false,
    pendingSignCheckCount: 2,
    ...over,
  });
  const parse = (over: Record<string, unknown> = {}, top: Record<string, unknown> = {}) =>
    parseBanks({ version: 1, enabled: true, budgtsAccounts: [], banks: [bank({ accounts: [account(over)] })], ...top });

  it("reads the held sample, an answer and a direction review", () => {
    const a = parse({ signCheckSample: sample, signAnswer: { answeredAt: "2026-10-01T00:00:00Z", sample: null }, directionReview: { sample } }).banks[0]!.accounts[0]!;
    expect(a.signCheckSample).toEqual(sample);
    expect(a.signAnswer).toEqual({ answeredAt: "2026-10-01T00:00:00Z", sample: null });
    expect(a.directionReview).toEqual({ sample });
  });

  it("reads them as absent from a server older than the question (nothing to ask, the old screen)", () => {
    const a = parse().banks[0]!.accounts[0]!;
    expect([a.signCheckSample, a.signAnswer, a.directionReview]).toEqual([null, null, null]);
  });

  it("reads removed banks' held groups and answered groups", () => {
    const held = { groups: [{ accountId: "acc", accountName: "Everyday", originRef: "o1", count: 3, sample }], answered: [{ accountId: "acc2", accountName: "Card", originRef: "o2", answeredAt: "2026-10-02T00:00:00Z", sample }] };
    expect(parse({}, { removedBanksHeld: held }).removedBanksHeld).toEqual(held);
  });

  it("reads removed banks the server couldn't load as null, so the screen can say so", () => {
    expect(parse({}, { removedBanksHeld: null }).removedBanksHeld).toBeNull();
  });

  it.each([
    ["a fractional sample amount", { signCheckSample: { ...sample, amount: 46.5 } }, {}],
    ["a sample without its transaction", { signCheckSample: { ...sample, transactionId: undefined } }, {}],
    ["an answer without its time", { signAnswer: { sample } }, {}],
    ["removed banks without groups", {}, { removedBanksHeld: { answered: [] } }],
  ])("rejects %s", (_name, over, top) => {
    expect(() => parse(over, top)).toThrow();
  });
});

describe("statusNeedsAttention", () => {
  it("flags every non-active status", () => {
    expect(statusNeedsAttention("active")).toBe(false);
    expect(statusNeedsAttention("login_required")).toBe(true);
    expect(statusNeedsAttention("pending_expiration")).toBe(true);
    expect(statusNeedsAttention("revoked")).toBe(true);
    expect(statusNeedsAttention("error")).toBe(true);
  });
});
