import { describe, expect, it } from "vitest";
import { buildCategoryLookup } from "./category-map";
import { MERCHANT_KNOWLEDGE, resolveMerchantKnowledge } from "./merchant-knowledge";
import { normalizeMerchantName } from "./merchant-name";

// The 8 categories every user is seeded with (migration 0002 handle_new_user).
const SEED_NAMES = [
  "Insurances",
  "Personal Care",
  "Housing",
  "Entertainment",
  "Transportation",
  "Food / Groceries",
  "Salary",
  "Other Income",
] as const;

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

describe("MERCHANT_KNOWLEDGE table", () => {
  it("every value is a seed category name", () => {
    for (const [key, name] of MERCHANT_KNOWLEDGE) {
      expect(SEED_NAMES, `${key} → ${name}`).toContain(name);
    }
  });

  it("every key is already normalized (round-trips through normalizeMerchantName)", () => {
    for (const key of MERCHANT_KNOWLEDGE.keys()) {
      expect(normalizeMerchantName(key), key).toBe(key);
    }
  });

  it("keys are unique (no accidental override)", () => {
    // Map dedupes silently; assert the raw entry count matches the Map size.
    const raw = [...MERCHANT_KNOWLEDGE.keys()];
    expect(new Set(raw).size).toBe(raw.length);
  });

  it("does NOT include ambiguous / multi-category merchants or payment rails", () => {
    for (const banned of [
      "amazon",
      "amzn mktp",
      "walmart",
      "target",
      "costco",
      "sams club",
      "ebay",
      "etsy",
      "apple",
      "google",
      "paypal",
      "venmo",
      "cash app",
      "zelle",
      "stripe",
      "sq",
      "afterpay",
      "klarna",
      "affirm",
      "delta",
      "wm",
    ]) {
      expect(MERCHANT_KNOWLEDGE.has(banned), banned).toBe(false);
    }
  });

  it("stays within a sane size (strict inclusion bar, not a catch-all)", () => {
    expect(MERCHANT_KNOWLEDGE.size).toBeGreaterThan(60);
    expect(MERCHANT_KNOWLEDGE.size).toBeLessThan(200);
  });
});

describe("resolveMerchantKnowledge", () => {
  it("resolves known merchants to the right category id", () => {
    expect(resolveMerchantKnowledge("uber", lookup)).toBe("cat-tx");
    expect(resolveMerchantKnowledge("uber trip", lookup)).toBe("cat-tx");
    expect(resolveMerchantKnowledge("uber eats", lookup)).toBe("cat-food");
    expect(resolveMerchantKnowledge("mcdonalds", lookup)).toBe("cat-food");
    expect(resolveMerchantKnowledge("netflix", lookup)).toBe("cat-ent");
    expect(resolveMerchantKnowledge("shell", lookup)).toBe("cat-tx");
    expect(resolveMerchantKnowledge("comcast", lookup)).toBe("cat-house");
    expect(resolveMerchantKnowledge("planet fitness", lookup)).toBe("cat-pc");
    expect(resolveMerchantKnowledge("geico", lookup)).toBe("cat-ins");
  });

  it("resolves via the normalizer for real merchant strings", () => {
    expect(resolveMerchantKnowledge(normalizeMerchantName("UBER   EATS"), lookup)).toBe("cat-food");
    expect(resolveMerchantKnowledge(normalizeMerchantName("SQ *BLUE BOTTLE COFFEE"), lookup)).toBe("cat-food");
    expect(resolveMerchantKnowledge(normalizeMerchantName("NETFLIX.COM"), lookup)).toBe("cat-ent");
  });

  it("returns null for unknown / ambiguous merchants and blanks", () => {
    expect(resolveMerchantKnowledge("amazon", lookup)).toBeNull();
    expect(resolveMerchantKnowledge("walmart", lookup)).toBeNull();
    expect(resolveMerchantKnowledge("joes corner diner", lookup)).toBeNull();
    expect(resolveMerchantKnowledge("", lookup)).toBeNull();
  });

  it("degrades to null when the user has no category with that seed name", () => {
    const sparse = buildCategoryLookup([["Transportation", "cat-tx"]]);
    expect(resolveMerchantKnowledge("uber", sparse)).toBe("cat-tx");
    expect(resolveMerchantKnowledge("netflix", sparse)).toBeNull(); // no "Entertainment" category
  });
});
