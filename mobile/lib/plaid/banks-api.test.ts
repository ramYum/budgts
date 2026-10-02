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
    expect(data).toEqual({ enabled: true, banks: [bank()], connectionsRemovedForLapse: false });
  });

  it("reads bank connections switched off on the deployment", () => {
    expect(parseBanks({ version: 1, enabled: false, banks: [], budgtsAccounts: [] })).toEqual({ enabled: false, banks: [], connectionsRemovedForLapse: false });
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

describe("statusNeedsAttention", () => {
  it("flags every non-active status", () => {
    expect(statusNeedsAttention("active")).toBe(false);
    expect(statusNeedsAttention("login_required")).toBe(true);
    expect(statusNeedsAttention("pending_expiration")).toBe(true);
    expect(statusNeedsAttention("revoked")).toBe(true);
    expect(statusNeedsAttention("error")).toBe(true);
  });
});
