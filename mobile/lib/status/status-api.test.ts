import { describe, expect, it } from "vitest";
import { bellLabel, parseHub, parseStatus, plural } from "./status-api";

describe("parseStatus", () => {
  it("reads the server contract and ignores fields it does not know", () => {
    expect(
      parseStatus({ version: 1, needsCategoryCount: 3, review: { advisory: "A feed looks duplicated.", excluded: null }, deletionInProgress: false, extra: 1 }),
    ).toEqual({ needsCategoryCount: 3, review: { advisory: "A feed looks duplicated.", excluded: null }, deletionInProgress: false });
  });

  it("keeps a null count (bank connections off) distinct from zero", () => {
    expect(parseStatus({ needsCategoryCount: null, review: { advisory: null, excluded: null }, deletionInProgress: true }).needsCategoryCount).toBeNull();
  });

  it.each([
    ["a fractional count", { needsCategoryCount: 1.5 }],
    ["a negative count", { needsCategoryCount: -1 }],
    ["a missing lock flag", { deletionInProgress: undefined }],
    ["no review", { review: undefined }],
  ])("rejects %s", (_, over) => {
    expect(() => parseStatus({ needsCategoryCount: 0, review: { advisory: null, excluded: null }, deletionInProgress: false, ...over })).toThrow();
  });
});

describe("parseHub", () => {
  it("reads the counts; banks may be null when bank connections are off", () => {
    expect(parseHub({ version: 1, goals: 2, accounts: 3, banks: null, categories: 12, budgets: 6 })).toEqual({
      goals: 2,
      accounts: 3,
      banks: null,
      categories: 12,
      budgets: 6,
    });
  });
});

describe("the web's words", () => {
  it("plural", () => {
    expect([plural(1, "goal", "goals"), plural(0, "goal", "goals"), plural(2, "bank", "banks")]).toEqual(["1 goal", "0 goals", "2 banks"]);
  });

  it("the bell (web needs-category-bell.tsx)", () => {
    expect(bellLabel(0)).toEqual({ label: "Categories up to date", badge: null });
    expect(bellLabel(1)).toEqual({ label: "1 transaction needs a category", badge: "1" });
    expect(bellLabel(12)).toEqual({ label: "12 transactions need a category", badge: "9+" });
  });
});
