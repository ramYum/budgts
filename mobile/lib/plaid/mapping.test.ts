import { describe, expect, it } from "vitest";
import { accountLabel, buildMapEntries, emptyMapRows, guessType } from "./mapping";
import type { UnmappedAccount } from "./banks-api";

const unmapped = (over: Partial<UnmappedAccount> = {}): UnmappedAccount => ({
  plaidAccountId: "pa1",
  name: "Checking",
  officialName: null,
  mask: "1234",
  type: "depository",
  subtype: "checking",
  currentBalance: 5000,
  isoCurrencyCode: "USD",
  ...over,
});

describe("guessType", () => {
  it("guesses savings, credit and defaults to checking", () => {
    expect(guessType(unmapped({ subtype: "savings" }))).toBe("savings");
    expect(guessType(unmapped({ type: "credit", subtype: "credit card" }))).toBe("credit");
    expect(guessType(unmapped({ type: "depository", subtype: "cd" }))).toBe("checking");
  });
});

describe("accountLabel", () => {
  it("prefers the name, falls back to official name, then a generic label, with the mask appended", () => {
    expect(accountLabel(unmapped())).toBe("Checking ••1234");
    expect(accountLabel(unmapped({ name: null, officialName: "Platypus Checking" }))).toBe("Platypus Checking ••1234");
    expect(accountLabel(unmapped({ name: null, officialName: null, mask: null }))).toBe("Account");
  });
});

describe("emptyMapRows / buildMapEntries", () => {
  it("defaults every row to 'new' with a guessed name and type", () => {
    const rows = emptyMapRows([unmapped(), unmapped({ plaidAccountId: "pa2", name: "Savings", subtype: "savings" })], "existing-1");
    expect(rows).toEqual([
      { mode: "new", name: "Checking ••1234", type: "checking", existingAccountId: "existing-1" },
      { mode: "new", name: "Savings ••1234", type: "savings", existingAccountId: "existing-1" },
    ]);
  });

  it("builds the wire entries for POST /api/mobile/plaid/accounts/map, one per mode", () => {
    const accounts = [unmapped(), unmapped({ plaidAccountId: "pa2" })];
    const rows = [
      { mode: "new" as const, name: " My Checking ", type: "checking" as const, existingAccountId: "" },
      { mode: "existing" as const, name: "", type: "checking" as const, existingAccountId: "acct-9" },
    ];
    expect(buildMapEntries(accounts, rows)).toEqual([
      { plaidAccountId: "pa1", mode: "new", name: "My Checking", type: "checking" },
      { plaidAccountId: "pa2", mode: "existing", existingAccountId: "acct-9" },
    ]);
  });

  it("sends only plaidAccountId + mode for 'ignore'", () => {
    expect(buildMapEntries([unmapped()], [{ mode: "ignore", name: "", type: "checking", existingAccountId: "" }])).toEqual([
      { plaidAccountId: "pa1", mode: "ignore" },
    ]);
  });
});
