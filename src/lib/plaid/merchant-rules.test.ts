import { describe, expect, it } from "vitest";
import { buildCategoryLookup } from "./category-map";
import { buildResolveCategory } from "./merchant-rules";

const categoryLookup = buildCategoryLookup([
  ["Food / Groceries", "cat-food"],
  ["Entertainment", "cat-ent"],
]);

describe("buildResolveCategory", () => {
  it("uses a remembered merchant rule ahead of the PFC map", () => {
    const resolve = buildResolveCategory({
      merchantRules: new Map([["ent-netflix", "cat-ent"]]),
      categoryLookup,
    });
    expect(
      resolve({ merchantEntityId: "ent-netflix", primary: "FOOD_AND_DRINK", detailed: null, confidence: "HIGH" }),
    ).toBe("cat-ent");
  });

  it("falls back to the PFC map when there is no rule for the merchant", () => {
    const resolve = buildResolveCategory({ merchantRules: new Map(), categoryLookup });
    expect(
      resolve({ merchantEntityId: "ent-unknown", primary: "FOOD_AND_DRINK", detailed: null, confidence: "HIGH" }),
    ).toBe("cat-food");
  });

  it("falls back to the PFC map when merchantEntityId is null", () => {
    const resolve = buildResolveCategory({
      merchantRules: new Map([["ent-x", "cat-ent"]]),
      categoryLookup,
    });
    expect(resolve({ merchantEntityId: null, primary: "FOOD_AND_DRINK", detailed: null, confidence: "HIGH" })).toBe(
      "cat-food",
    );
  });

  it("still returns null when neither memory nor the map matches", () => {
    const resolve = buildResolveCategory({ merchantRules: new Map(), categoryLookup });
    expect(resolve({ merchantEntityId: "e", primary: "GENERAL_MERCHANDISE", detailed: null, confidence: "HIGH" })).toBeNull();
  });

  it("propagates the UnknownPfcPrimaryError from the map when there is no rule", () => {
    const resolve = buildResolveCategory({ merchantRules: new Map(), categoryLookup });
    expect(() => resolve({ merchantEntityId: null, primary: "NEW_THING", detailed: null, confidence: "HIGH" })).toThrow();
  });
});
