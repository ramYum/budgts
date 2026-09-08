import { describe, expect, it } from "vitest";
import { SUPPORTED_CURRENCIES, currencySchema } from "./profile";

describe("currencySchema", () => {
  it("accepts a supported currency", () => {
    expect(currencySchema.parse({ currency: "USD" }).currency).toBe("USD");
  });

  it("rejects an unsupported code", () => {
    expect(currencySchema.safeParse({ currency: "XXX" }).success).toBe(false);
  });

  it("lists USD among the supported currencies", () => {
    expect(SUPPORTED_CURRENCIES).toContain("USD");
  });

  it("only offers currencies the money layer can represent (2 minor-unit decimals)", () => {
    // src/lib/budget/money.ts hardcodes a 2-decimal exponent. A 0- or 3-decimal
    // currency in the picker would be stored/displayed at the wrong scale.
    for (const code of SUPPORTED_CURRENCIES) {
      const digits = new Intl.NumberFormat("en", {
        style: "currency",
        currency: code,
      }).resolvedOptions().maximumFractionDigits;
      expect(digits, `${code} is not a 2-decimal currency`).toBe(2);
    }
  });
});
