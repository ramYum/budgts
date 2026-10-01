import { describe, expect, it } from "vitest";
import { accountLabel } from "../shared";
import { buildMapEntries, emptyMapRows, mappingChoices } from "./mapping";
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

describe("accountLabel (the web's, src/lib/accounts/account-suggestion.ts)", () => {
  it("prefers the name, falls back to official name, then a generic label, with the mask appended", () => {
    expect(accountLabel(unmapped())).toBe("Checking ••1234");
    expect(accountLabel(unmapped({ name: null, officialName: "Platypus Checking" }))).toBe("Platypus Checking ••1234");
    expect(accountLabel(unmapped({ name: null, officialName: null, mask: null }))).toBe("Account");
  });
});

describe("emptyMapRows / buildMapEntries", () => {
  it("defaults each row to the web's suggestion: CDs and money market as Savings; HSAs, investments and loans left out", () => {
    const rows = emptyMapRows(
      [
        unmapped({ plaidAccountId: "cd", name: "CD", subtype: "cd" }),
        unmapped({ plaidAccountId: "mm", name: "MM", subtype: "money market" }),
        unmapped({ plaidAccountId: "hsa", name: "HSA", subtype: "hsa" }),
        unmapped({ plaidAccountId: "inv", name: "Brokerage", type: "investment", subtype: "brokerage" }),
        unmapped({ plaidAccountId: "loan", name: "Mortgage", type: "loan", subtype: "mortgage" }),
        unmapped({ plaidAccountId: "cc", name: "Card", type: "credit", subtype: "credit card" }),
      ],
      "existing-1",
    );
    expect(rows.map((r) => [r.mode, r.type])).toEqual([
      ["new", "savings"],
      ["new", "savings"],
      ["ignore", "checking"],
      ["ignore", "checking"],
      ["ignore", "checking"],
      ["new", "credit"],
    ]);
  });

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

describe("mappingChoices", () => {
  it("offers every account that isn't archived, in the server's order, and the server's account types", () => {
    const accounts = [
      { id: "a1", name: "Everyday checking", type: "checking", source: "manual" as const, archived: false, selectable: true },
      { id: "a2", name: "Old wallet", type: "cash", source: "manual" as const, archived: true, selectable: false },
      { id: "a3", name: "Plaid Checking", type: "checking", source: "plaid" as const, archived: false, selectable: false },
    ];
    expect(mappingChoices({ accounts, accountTypes: ["checking", "cash"] })).toEqual({
      budgtsAccounts: [
        { id: "a1", name: "Everyday checking" },
        { id: "a3", name: "Plaid Checking" },
      ],
      accountTypes: ["checking", "cash"],
    });
  });
});
