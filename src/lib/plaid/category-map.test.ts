import { describe, expect, it } from "vitest";
import {
  buildCategoryLookup,
  categoryKey,
  resolvePlaidCategory,
  resolveTrustedDetailed,
  suggestPlaidCategory,
  TRUSTED_DETAILED_KEYS,
  UnknownPfcPrimaryError,
} from "./category-map";

const lookup = buildCategoryLookup([
  ["Insurances", "cat-ins"],
  ["Personal Care", "cat-pc"],
  ["Housing", "cat-house"],
  ["Entertainment", "cat-ent"],
  ["Transportation", "cat-tx"],
  ["Food / Groceries", "cat-food"],
  ["Salary", "cat-sal"],
  ["Other Income", "cat-oth"],
]);

const R = (p: string | null, d: string | null = null, c: string | null = "HIGH") =>
  resolvePlaidCategory(p, d, c, lookup);

describe("categoryKey", () => {
  it("normalises spacing around slashes and case", () => {
    expect(categoryKey("Food / Groceries")).toBe("food/groceries");
    expect(categoryKey("food/groceries")).toBe("food/groceries");
    expect(categoryKey("  Personal   Care ")).toBe("personal care");
  });
});

describe("resolvePlaidCategory", () => {
  it("maps the confident, unambiguous primaries", () => {
    expect(R("ENTERTAINMENT")).toBe("cat-ent");
    expect(R("FOOD_AND_DRINK")).toBe("cat-food");
    expect(R("PERSONAL_CARE")).toBe("cat-pc");
    expect(R("TRANSPORTATION")).toBe("cat-tx");
    expect(R("TRAVEL")).toBe("cat-tx");
    expect(R("RENT_AND_UTILITIES")).toBe("cat-house");
    expect(R("HOME_IMPROVEMENT")).toBe("cat-house");
  });

  it("splits INCOME on the detailed value", () => {
    expect(R("INCOME", "INCOME_WAGES")).toBe("cat-sal");
    expect(R("INCOME", "INCOME_DIVIDENDS")).toBe("cat-oth");
    expect(R("INCOME", null)).toBe("cat-oth");
  });

  it("leaves broad / ambiguous primaries uncategorised", () => {
    for (const p of [
      "GENERAL_MERCHANDISE",
      "GENERAL_SERVICES",
      "MEDICAL",
      "BANK_FEES",
      "LOAN_PAYMENTS",
      "GOVERNMENT_AND_NON_PROFIT",
    ]) {
      expect(R(p)).toBeNull();
    }
  });

  it("never categorises transfers", () => {
    expect(R("TRANSFER_IN")).toBeNull();
    expect(R("TRANSFER_OUT")).toBeNull();
  });

  it("returns null for low / unknown confidence even on a mapped primary", () => {
    expect(R("FOOD_AND_DRINK", null, "LOW")).toBeNull();
    expect(R("FOOD_AND_DRINK", null, "UNKNOWN")).toBeNull();
    expect(R("FOOD_AND_DRINK", null, "MEDIUM")).toBe("cat-food");
  });

  it("returns null when primary is null/absent", () => {
    expect(R(null)).toBeNull();
  });

  it("throws UnknownPfcPrimaryError on a taxonomy value it does not know", () => {
    expect(() => R("CRYPTO_MOONSHOTS")).toThrow(UnknownPfcPrimaryError);
    expect(() => R("CRYPTO_MOONSHOTS")).toThrow(/CRYPTO_MOONSHOTS/);
  });

  it("returns null if the user has no matching category row", () => {
    const sparse = buildCategoryLookup([["Entertainment", "e"]]);
    expect(resolvePlaidCategory("FOOD_AND_DRINK", null, "HIGH", sparse)).toBeNull();
    expect(resolvePlaidCategory("ENTERTAINMENT", null, "HIGH", sparse)).toBe("e");
  });
});

describe("resolveTrustedDetailed", () => {
  it("resolves a trusted detailed subtype ignoring confidence", () => {
    expect(resolveTrustedDetailed("TRANSPORTATION_TAXIS_AND_RIDE_SHARES", lookup)).toBe("cat-tx");
    expect(resolveTrustedDetailed("TRANSPORTATION_GAS", lookup)).toBe("cat-tx");
    expect(resolveTrustedDetailed("FOOD_AND_DRINK_FAST_FOOD", lookup)).toBe("cat-food");
    expect(resolveTrustedDetailed("RENT_AND_UTILITIES_INTERNET_AND_CABLE", lookup)).toBe("cat-house");
    expect(resolveTrustedDetailed("ENTERTAINMENT_MUSIC_AND_AUDIO", lookup)).toBe("cat-ent");
    expect(resolveTrustedDetailed("PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", lookup)).toBe("cat-pc");
  });

  it("returns null for an unknown / untrusted detailed (never throws)", () => {
    expect(resolveTrustedDetailed("FOOD_AND_DRINK_RESTAURANT", lookup)).toBeNull(); // deliberately not trusted
    expect(resolveTrustedDetailed("RENT_AND_UTILITIES_RENT", lookup)).toBeNull();
    expect(resolveTrustedDetailed("INCOME_WAGES", lookup)).toBeNull();
    expect(resolveTrustedDetailed("SOME_NEW_TAXONOMY_VALUE", lookup)).toBeNull();
    expect(resolveTrustedDetailed(null, lookup)).toBeNull();
    expect(resolveTrustedDetailed("", lookup)).toBeNull();
  });

  it("degrades to null when the user lacks that seed category", () => {
    const sparse = buildCategoryLookup([["Transportation", "cat-tx"]]);
    expect(resolveTrustedDetailed("TRANSPORTATION_GAS", sparse)).toBe("cat-tx");
    expect(resolveTrustedDetailed("FOOD_AND_DRINK_COFFEE", sparse)).toBeNull();
  });

  it("every trusted detailed maps to a seed category name", () => {
    for (const key of TRUSTED_DETAILED_KEYS) {
      expect(resolveTrustedDetailed(key, lookup)).not.toBeNull();
    }
  });
});

describe("suggestPlaidCategory", () => {
  it("suggests a mapped primary even at LOW/UNKNOWN confidence", () => {
    expect(suggestPlaidCategory("FOOD_AND_DRINK", null, lookup)).toBe("cat-food");
    expect(suggestPlaidCategory("ENTERTAINMENT", null, lookup)).toBe("cat-ent");
  });

  it("still returns null for primaries that map to null regardless of confidence", () => {
    expect(suggestPlaidCategory("GENERAL_MERCHANDISE", null, lookup)).toBeNull();
    expect(suggestPlaidCategory("TRANSFER_IN", null, lookup)).toBeNull();
  });

  it("returns null instead of throwing for an unrecognised primary", () => {
    expect(suggestPlaidCategory("CRYPTO_MOONSHOTS", null, lookup)).toBeNull();
  });

  it("returns null when primary is null", () => {
    expect(suggestPlaidCategory(null, null, lookup)).toBeNull();
  });
});
