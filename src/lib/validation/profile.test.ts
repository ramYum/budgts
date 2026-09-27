import { describe, expect, it } from "vitest";
import { SUPPORTED_CURRENCIES } from "@/lib/budget/currencies";
import { currencySchema, timeZoneSchema } from "./profile";

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

describe("timeZoneSchema", () => {
  it("accepts the IANA zones devices report", () => {
    for (const tz of ["America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Kolkata", "Asia/Kathmandu", "UTC"]) {
      expect(timeZoneSchema.parse(tz), tz).toBe(tz);
    }
  });

  it("keeps an alias exactly as the device reported it, so the next comparison matches", () => {
    // Some browsers still report the legacy name. Storing a canonicalised
    // form would differ from what the device says on every visit.
    expect(timeZoneSchema.parse("Asia/Calcutta")).toBe("Asia/Calcutta");
  });

  it("rejects anything that is not a time zone", () => {
    for (const bad of ["", "Mars/Olympus", "Etc/Unknown", "America/New_York\n", "x".repeat(65)]) {
      expect(timeZoneSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
    expect(timeZoneSchema.safeParse(null).success).toBe(false);
    expect(timeZoneSchema.safeParse(-240).success).toBe(false);
  });
});
