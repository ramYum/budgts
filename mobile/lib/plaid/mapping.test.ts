import { describe, expect, it } from "vitest";
import { accountLabel } from "../shared";
import { buildMapEntries, emptyMapRows, mappingChoices, parseMappingSuggestions } from "./mapping";
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

const EXISTING = [{ id: "existing-1", name: "Everyday" }];

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
      EXISTING,
      {},
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
    const rows = emptyMapRows([unmapped(), unmapped({ plaidAccountId: "pa2", name: "Savings", subtype: "savings" })], EXISTING, {});
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

describe("reconnect suggestions (owner decision 2026-10-02)", () => {
  const offered = [
    { id: "a1", name: "Everyday" },
    { id: "a2", name: "Old Chase" },
    { id: "a3", name: "Chase card" },
  ];

  it("starts a recognised account on the Budgts account its history is in; the others keep their default", () => {
    const rows = emptyMapRows([unmapped(), unmapped({ plaidAccountId: "pa2", mask: "9999" })], offered, {
      pa1: { kind: "previous", accountId: "a2", accountName: "Old Chase" },
    });
    expect(rows).toEqual([
      { mode: "existing", name: "Checking ••1234", type: "checking", existingAccountId: "a2" },
      { mode: "new", name: "Checking ••9999", type: "checking", existingAccountId: "a1" },
    ]);
  });

  it("an ambiguous match preselects nothing, but its first candidate is the existing-account default", () => {
    const rows = emptyMapRows([unmapped()], offered, { pa1: { kind: "ambiguous", accountIds: ["a3", "a2"] } });
    expect(rows).toEqual([{ mode: "new", name: "Checking ••1234", type: "checking", existingAccountId: "a3" }]);
  });

  it("a suggested account the sheet no longer offers is ignored", () => {
    const rows = emptyMapRows([unmapped()], offered, { pa1: { kind: "previous", accountId: "gone", accountName: "Gone" } });
    expect(rows[0]).toMatchObject({ mode: "new", existingAccountId: "a1" });
  });

  it("parses the server's reply, skips a kind it does not know, and refuses a malformed one", () => {
    const suggestions = {
      pa1: { kind: "previous", accountId: "a2", accountName: "Old Chase" },
      pa2: { kind: "ambiguous", accountIds: ["a3", "a2"] },
    };
    expect(parseMappingSuggestions({ version: 1, suggestions })).toEqual(suggestions);
    expect(parseMappingSuggestions({ version: 1, suggestions: { pa1: { kind: "later" } } })).toEqual({});
    expect(() => parseMappingSuggestions({ version: 1, suggestions: { pa1: { kind: "previous", accountId: 7 } } })).toThrow();
    expect(() => parseMappingSuggestions({ version: 1 })).toThrow();
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
