import { describe, expect, it } from "vitest";
import { buildCategoryLookup, UnknownPfcPrimaryError } from "./category-map";
import { buildResolveCategory, type MerchantRuleMap } from "./merchant-rules";

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

const build = (merchantRules: MerchantRuleMap = new Map()) =>
  buildResolveCategory({ merchantRules, categoryLookup: lookup });

const args = (over: Partial<Parameters<ReturnType<typeof build>>[0]> = {}) => ({
  merchantEntityId: null,
  merchantName: null,
  description: null,
  primary: null,
  detailed: null,
  confidence: null,
  ...over,
});

describe("buildResolveCategory — evidence chain", () => {
  it("R1: a user merchant rule wins over everything, incl. an unusual choice", () => {
    const resolve = build(new Map([["ent-uber", "cat-food"]])); // user filed Uber as Groceries
    expect(
      resolve(
        args({
          merchantEntityId: "ent-uber",
          merchantName: "Uber",
          detailed: "TRANSPORTATION_TAXIS_AND_RIDE_SHARES",
          primary: "TRANSPORTATION",
          confidence: "HIGH",
        }),
      ),
    ).toBe("cat-food");
  });

  it("R2: Budgts merchant knowledge categorises an obvious merchant at LOW confidence", () => {
    const resolve = build();
    expect(
      resolve(args({ merchantName: "UBER   *TRIP", primary: "TRANSPORTATION", confidence: "LOW" })),
    ).toBe("cat-tx");
    expect(resolve(args({ merchantName: "Netflix", primary: null, confidence: null }))).toBe("cat-ent");
  });

  it("R2: uses `description` (raw name) when `merchantName` is absent", () => {
    const resolve = build();
    expect(resolve(args({ merchantName: null, description: "MCDONALDS #1234", confidence: "LOW" }))).toBe(
      "cat-food",
    );
  });

  it("R2: 'uber' and 'uber eats' resolve to different categories", () => {
    const resolve = build();
    expect(resolve(args({ merchantName: "Uber" }))).toBe("cat-tx");
    expect(resolve(args({ merchantName: "Uber Eats" }))).toBe("cat-food");
  });

  it("R2 beats R3 when both could fire", () => {
    // "spotify" is in MERCHANT_KNOWLEDGE (Entertainment); the detailed here is a
    // trusted TRANSPORTATION subtype. R2 must win.
    const resolve = build();
    expect(
      resolve(
        args({
          merchantName: "Spotify",
          detailed: "TRANSPORTATION_GAS",
          primary: "TRANSPORTATION",
          confidence: "LOW",
        }),
      ),
    ).toBe("cat-ent");
  });

  it("R3: a trusted PFC detailed subtype categorises at LOW confidence", () => {
    const resolve = build();
    expect(
      resolve(
        args({
          merchantName: "Joe's Corner Store", // not in knowledge
          detailed: "FOOD_AND_DRINK_COFFEE",
          primary: "FOOD_AND_DRINK",
          confidence: "LOW",
        }),
      ),
    ).toBe("cat-food");
  });

  it("R4: gated PFC primary categorises at HIGH confidence", () => {
    const resolve = build();
    expect(
      resolve(
        args({
          merchantName: "Some Local Diner",
          detailed: "FOOD_AND_DRINK_RESTAURANT", // NOT trusted
          primary: "FOOD_AND_DRINK",
          confidence: "HIGH",
        }),
      ),
    ).toBe("cat-food");
  });

  it("R4: keeps the LOW/UNKNOWN gate — nothing else fires → null", () => {
    const resolve = build();
    expect(
      resolve(
        args({
          merchantName: "Some Local Diner",
          detailed: "FOOD_AND_DRINK_RESTAURANT",
          primary: "FOOD_AND_DRINK",
          confidence: "LOW",
        }),
      ),
    ).toBeNull();
  });

  it("returns null when no resolver fires (genuine ambiguity)", () => {
    const resolve = build();
    expect(
      resolve(args({ merchantName: "Amazon", primary: "GENERAL_MERCHANDISE", confidence: "HIGH" })),
    ).toBeNull();
  });

  it("still throws UnknownPfcPrimaryError from R4 on an unknown primary", () => {
    const resolve = build();
    expect(() =>
      resolve(args({ merchantName: "Mystery Co", primary: "CRYPTO_MOONSHOTS", confidence: "HIGH" })),
    ).toThrow(UnknownPfcPrimaryError);
  });

  it("is pure — same inputs, same output, repeatable", () => {
    const resolve = build();
    const a = args({ merchantName: "Chevron", primary: "TRANSPORTATION", confidence: "LOW" });
    expect(resolve(a)).toBe("cat-tx");
    expect(resolve(a)).toBe("cat-tx");
    expect(resolve({ ...a })).toBe("cat-tx");
  });
});
