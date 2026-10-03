import { AccountSubtype, AccountType } from "plaid";
import { describe, expect, it } from "vitest";
import { ACCOUNT_TYPES } from "./account-types";
import {
  accountLabel,
  accountHint,
  existingChoices,
  mappingStart,
  notImportedHint,
  previousAccountNote,
  suggestAccount,
  type AccountSuggestion,
} from "./account-suggestion";

const IMPORT_CHECKING: AccountSuggestion = { mode: "new", type: "checking" };
const IMPORT_SAVINGS: AccountSuggestion = { mode: "new", type: "savings" };
const IMPORT_CREDIT: AccountSuggestion = { mode: "new", type: "credit" };
// "Don't import" still carries the type a user who switches the row back to "a new Budgts account" starts from: the
// one this account would have been given before (everything not savings or credit was Checking).
const DONT_IMPORT: AccountSuggestion = { mode: "ignore", type: "checking" };

describe("suggestAccount: the mapping sheet's default for each Plaid account", () => {
  // Plaid's account taxonomy (plaid.com/docs/api/accounts/#account-type-schema), type by type.
  it.each<[string | null, string | null, AccountSuggestion]>([
    // depository
    ["depository", "checking", IMPORT_CHECKING],
    ["depository", "savings", IMPORT_SAVINGS],
    ["depository", "cd", IMPORT_SAVINGS],
    ["depository", "money market", IMPORT_SAVINGS],
    ["depository", "hsa", DONT_IMPORT],
    ["depository", "cash management", IMPORT_CHECKING],
    ["depository", "paypal", IMPORT_CHECKING],
    ["depository", "prepaid", IMPORT_CHECKING],
    ["depository", "ebt", IMPORT_CHECKING],
    ["depository", null, IMPORT_CHECKING],
    // credit
    ["credit", "credit card", IMPORT_CREDIT],
    ["credit", "paypal", IMPORT_CREDIT],
    ["credit", null, IMPORT_CREDIT],
    // loan
    ["loan", "mortgage", DONT_IMPORT],
    ["loan", "student", DONT_IMPORT],
    ["loan", "auto", DONT_IMPORT],
    ["loan", "home equity", DONT_IMPORT],
    ["loan", "line of credit", DONT_IMPORT],
    ["loan", null, DONT_IMPORT],
    // investment (and its legacy alias, brokerage)
    ["investment", "401k", DONT_IMPORT],
    ["investment", "ira", DONT_IMPORT],
    ["investment", "brokerage", DONT_IMPORT],
    ["investment", "hsa", DONT_IMPORT],
    ["investment", null, DONT_IMPORT],
    ["brokerage", "brokerage", DONT_IMPORT],
    // other, and nothing known
    ["other", "other", IMPORT_CHECKING],
    [null, null, IMPORT_CHECKING],
    [null, "savings", IMPORT_SAVINGS],
    [null, "hsa", DONT_IMPORT],
  ])("type %s, subtype %s", (type, subtype, expected) => {
    expect(suggestAccount({ type, subtype })).toEqual(expected);
  });

  it("reads Plaid's values whatever their case or padding", () => {
    expect(suggestAccount({ type: "Depository", subtype: " Money Market " })).toEqual(IMPORT_SAVINGS);
    expect(suggestAccount({ type: "LOAN", subtype: "Mortgage" })).toEqual(DONT_IMPORT);
  });

  // Every value in the Plaid SDK's own enums, so a type or subtype the table above misses still lands on a rule.
  const allTypes = Object.values(AccountType) as string[];
  const allSubtypes = Object.values(AccountSubtype) as string[];

  it("suggests Don't import for every investment, brokerage and loan account, whatever the subtype", () => {
    for (const type of ["investment", "brokerage", "loan"]) {
      expect(allTypes).toContain(type);
      for (const subtype of [...allSubtypes, null]) expect(suggestAccount({ type, subtype }), `${type}/${subtype}`).toEqual(DONT_IMPORT);
    }
  });

  it("suggests Credit for every credit account except a health savings one", () => {
    for (const subtype of allSubtypes) {
      expect(suggestAccount({ type: "credit", subtype }), subtype).toEqual(subtype === "hsa" ? DONT_IMPORT : IMPORT_CREDIT);
    }
  });

  it("for every depository and other subtype: Savings for savings, CDs and money market, Don't import for an HSA, else Checking", () => {
    for (const type of ["depository", "other"]) {
      expect(allTypes).toContain(type);
      for (const subtype of allSubtypes) {
        const expected = ["savings", "cd", "money market"].includes(subtype)
          ? IMPORT_SAVINGS
          : subtype === "hsa"
            ? DONT_IMPORT
            : IMPORT_CHECKING;
        expect(suggestAccount({ type, subtype }), `${type}/${subtype}`).toEqual(expected);
      }
    }
  });

  it("names only the subtypes Plaid actually sends", () => {
    for (const subtype of ["savings", "cd", "money market", "hsa", "credit card"]) expect(allSubtypes).toContain(subtype);
  });

  it("every suggested type is one a Budgts account can have", () => {
    for (const type of [...allTypes, null]) {
      for (const subtype of [...allSubtypes, null]) {
        expect(ACCOUNT_TYPES).toContain(suggestAccount({ type, subtype }).type);
      }
    }
  });
});

describe("accountLabel", () => {
  it("prefers the name, then the official name, then 'Account', with the mask", () => {
    expect(accountLabel({ name: "Checking", officialName: "Platypus Checking", mask: "1234" })).toBe("Checking ••1234");
    expect(accountLabel({ name: "  ", officialName: "Platypus Checking", mask: "1234" })).toBe("Platypus Checking ••1234");
    expect(accountLabel({ name: null, officialName: null, mask: null })).toBe("Account");
  });
});

describe("accountHint", () => {
  it("tells the user an HSA can be imported, for an HSA only", () => {
    expect(accountHint({ type: "depository", subtype: "hsa" })).toBe("Import it if you pay for care from it.");
    expect(accountHint({ type: "investment", subtype: "HSA" })).toBe("Import it if you pay for care from it.");
    for (const subtype of [...(Object.values(AccountSubtype) as string[]), null].filter((s) => s !== "hsa")) {
      expect(accountHint({ type: "depository", subtype }), String(subtype)).toBeNull();
    }
  });

  it("uses no em-dash", () => {
    expect(accountHint({ type: "depository", subtype: "hsa" })).not.toMatch(/—/);
  });
});

describe("notImportedHint", () => {
  it("tells the user a card left out means its purchases aren't tracked", () => {
    expect(notImportedHint({ type: "credit", subtype: "credit card" })).toBe(
      "Card purchases aren't tracked unless this card is imported.",
    );
    expect(notImportedHint({ type: "Credit", subtype: null })).not.toBeNull();
  });

  it("is null for every other account type", () => {
    expect(notImportedHint({ type: "depository", subtype: "savings" })).toBeNull();
    expect(notImportedHint({ type: "loan", subtype: "mortgage" })).toBeNull();
    expect(notImportedHint({ type: null, subtype: null })).toBeNull();
  });
});


describe("reconnect suggestions in the mapping sheet (owner decision 2026-10-02)", () => {
  const accounts = [
    { id: "a1", name: "Alpha" },
    { id: "a2", name: "Beta" },
    { id: "a3", name: "Gamma" },
  ];

  it("says where the history stays, in one short line", () => {
    expect(previousAccountNote("Chase checking")).toBe("You connected this account before. Its history stays in Chase checking.");
  });

  it("a single previous account starts the row on it", () => {
    expect(mappingStart({ kind: "previous", accountId: "a2", accountName: "Beta" }, accounts)).toEqual({ mode: "existing", existingAccountId: "a2" });
  });

  it("an ambiguous match, no match, or an account no longer offered starts nothing", () => {
    expect(mappingStart({ kind: "ambiguous", accountIds: ["a1", "a3"] }, accounts)).toBeNull();
    expect(mappingStart(undefined, accounts)).toBeNull();
    expect(mappingStart({ kind: "previous", accountId: "gone", accountName: "Gone" }, accounts)).toBeNull();
  });

  it("lists the candidates first, in the server's order, then the rest as they were", () => {
    expect(existingChoices(accounts, { kind: "ambiguous", accountIds: ["a3", "a2"] }).map((a) => a.id)).toEqual(["a3", "a2", "a1"]);
    expect(existingChoices(accounts, { kind: "previous", accountId: "a3", accountName: "Gamma" }).map((a) => a.id)).toEqual(["a3", "a1", "a2"]);
    expect(existingChoices(accounts, undefined)).toBe(accounts);
  });
});
