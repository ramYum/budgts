import { describe, expect, it } from "vitest";
import { formatMoney, isMinor, parseMoney } from "./money";

describe("parseMoney", () => {
  it("parses whole amounts", () => expect(parseMoney("12")).toBe(1200));
  it("parses two decimal places", () => expect(parseMoney("12.34")).toBe(1234));
  it("parses one decimal place", () => expect(parseMoney("12.3")).toBe(1230));
  it("strips thousands separators and whitespace", () =>
    expect(parseMoney(" 1,234.50 ")).toBe(123450));
  it("handles negatives", () => expect(parseMoney("-0.99")).toBe(-99));
  it("rejects too many decimals", () => expect(() => parseMoney("12.345")).toThrow());
  it("rejects non-numeric input", () => expect(() => parseMoney("abc")).toThrow());
});

describe("formatMoney", () => {
  it("formats USD minor units", () =>
    expect(formatMoney(123450, "USD", "en-US")).toBe("$1,234.50"));
  it("formats negative amounts", () =>
    expect(formatMoney(-99, "USD", "en-US")).toBe("-$0.99"));
  it("rejects non-integer input", () => expect(() => formatMoney(12.5, "USD")).toThrow());
});

describe("isMinor", () => {
  it("accepts integers", () => expect(isMinor(100)).toBe(true));
  it("rejects floats", () => expect(isMinor(1.5)).toBe(false));
  it("rejects non-numbers", () => expect(isMinor("100")).toBe(false));
});
