import { describe, expect, it } from "vitest";
import type { BankAccount } from "./banks-api";
import { accountName, bankName, notImportedNote, resumesExisting, signCheckWords, splitAccounts, syncedLabel, whenLabel } from "./bank-view";

const acct = (over: Partial<BankAccount>): BankAccount => ({
  rowId: "r",
  plaidAccountId: "p",
  name: "Plaid Checking",
  officialName: null,
  mask: "0000",
  type: "depository",
  subtype: "checking",
  linkState: "mapped",
  mappedAccountName: "Everyday checking",
  needsReview: false,
  reviewReason: null,
  excludedFromCalculations: false,
  pendingSignCheckCount: 0,
  ...over,
});

describe("bank card wording (web connected-banks.tsx)", () => {
  it("splits a Sandbox bank's name from its flag", () => {
    expect(bankName("First Platypus Bank (Sandbox)")).toEqual({ name: "First Platypus Bank", sandbox: true });
    expect(bankName("SoFi")).toEqual({ name: "SoFi", sandbox: false });
    expect(bankName(null)).toEqual({ name: "Bank", sandbox: false });
  });

  it("words the last sync like the web", () => {
    const now = Date.parse("2026-09-30T12:00:00Z");
    expect(whenLabel("2026-09-30T11:59:40Z", now)).toBe("just now");
    expect(whenLabel("2026-09-30T11:15:00Z", now)).toBe("45 min ago");
    expect(whenLabel("2026-09-30T07:00:00Z", now)).toBe("5 hr ago");
    expect(whenLabel("2026-09-20T07:00:00Z", now)).toBe(new Date("2026-09-20T07:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    expect(syncedLabel({ lastSyncedAt: null }, now)).toBe("Not synced yet");
    expect(syncedLabel({ lastSyncedAt: "2026-09-30T11:15:00Z" }, now)).toBe("Synced 45 min ago");
  });

  it("names an account by Plaid's name and mask", () => {
    expect(accountName({ name: "Plaid Saving", mask: "1111" })).toBe("Plaid Saving ••1111");
    expect(accountName({ name: null, mask: null })).toBe("Account");
  });

  it("lists importing accounts apart from paused, skipped and not set up ones, with the right switch and note", () => {
    const on = acct({ rowId: "on" });
    const paused = acct({ rowId: "paused", linkState: "ignored", mappedAccountName: "Everyday checking" });
    const skipped = acct({ rowId: "skipped", linkState: "ignored", mappedAccountName: null });
    const fresh = acct({ rowId: "fresh", linkState: "unmapped", mappedAccountName: null });
    const { importing, notImporting } = splitAccounts([on, paused, skipped, fresh]);
    expect(importing.map((a) => a.rowId)).toEqual(["on"]);
    expect(notImporting.map((a) => a.rowId)).toEqual(["paused", "skipped", "fresh"]);
    expect(notImporting.map(resumesExisting)).toEqual([true, false, false]);
    expect(notImporting.map(notImportedNote)).toEqual(["paused · was Everyday checking", null, "not set up"]);
  });

  it("counts held transactions in words", () => {
    expect(signCheckWords(1)).toEqual({ count: "1 transaction", verb: "appears" });
    expect(signCheckWords(12)).toEqual({ count: "12 transactions", verb: "appear" });
  });
});
