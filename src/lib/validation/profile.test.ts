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
});
