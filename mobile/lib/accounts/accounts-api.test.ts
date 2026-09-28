import { describe, expect, it } from "vitest";
import { parseAccounts, type MobileAccount } from "./accounts-api";
import { parseCategories } from "../categories/categories-api";

const account = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  name: "Wallet",
  type: "cash",
  source: "manual",
  archived: false,
  selectable: true,
  ...over,
});

describe("parseAccounts", () => {
  it("accepts the server contract, including the server's list of account types", () => {
    const parsed = parseAccounts({ version: 1, accounts: [account(), account({ id: "a2", source: "plaid", selectable: false })], accountTypes: ["checking", "cash"] });
    expect(parsed.accountTypes).toEqual(["checking", "cash"]);
    expect(parsed.accounts.map((a: MobileAccount) => [a.id, a.source, a.selectable])).toEqual([
      ["a1", "manual", true],
      ["a2", "plaid", false],
    ]);
  });

  it("ignores fields it does not know", () => {
    expect(parseAccounts({ version: 1, accounts: [{ ...account(), newField: 1 }], accountTypes: ["cash"], extra: true }).accounts[0].name).toBe("Wallet");
  });

  it.each([
    ["an unknown source", { accounts: [account({ source: "bank" })] }],
    ["a non-boolean flag", { accounts: [account({ archived: "no" })] }],
    ["no account types", { accountTypes: [] }],
    ["accounts that are not a list", { accounts: 3 }],
  ])("rejects %s", (_name, over) => {
    expect(() => parseAccounts({ version: 1, accounts: [account()], accountTypes: ["cash"], ...over })).toThrow();
  });
});

describe("parseCategories", () => {
  it("accepts the server contract", () => {
    expect(parseCategories({ version: 1, categories: [{ id: "c1", name: "Groceries", kind: "expense", color: "#0f0" }] })).toEqual([
      { id: "c1", name: "Groceries", kind: "expense", color: "#0f0" },
    ]);
  });

  it("rejects an unknown kind", () => {
    expect(() => parseCategories({ version: 1, categories: [{ id: "c1", name: "x", kind: "transfer", color: "#0f0" }] })).toThrow();
  });
});
