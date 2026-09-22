import { describe, expect, it } from "vitest";
import { formatActivityDay, formatMoney, formatMonthLabel, formatSavingsRate } from "./format";

describe("formatMoney (mirrors the web formatMoney: integer minor units, 2 decimals)", () => {
  it("formats minor units as localized currency", () => {
    expect(formatMoney(123450, "USD", "en-US")).toBe("$1,234.50");
    expect(formatMoney(0, "USD", "en-US")).toBe("$0.00");
    expect(formatMoney(5, "USD", "en-US")).toBe("$0.05");
  });

  it("formats negatives", () => {
    expect(formatMoney(-2500, "USD", "en-US")).toBe("-$25.00");
  });

  it("rejects a non-integer instead of silently rounding money", () => {
    expect(() => formatMoney(12.5, "USD", "en-US")).toThrow(TypeError);
  });
});

describe("formatSavingsRate (mirrors the web: rounded, never clamped)", () => {
  it.each([
    [0.3, "30%"],
    [0.4536, "45%"],
    [-0.12, "-12%"],
    [1.5, "150%"],
  ])("%s → %s", (rate, expected) => {
    expect(formatSavingsRate(rate)).toBe(expected);
  });
});

describe("formatMonthLabel", () => {
  it("names the month and year", () => {
    expect(formatMonthLabel("2026-09", "en-US")).toBe("September 2026");
    expect(formatMonthLabel("2026-01", "en-US")).toBe("January 2026");
  });
});

describe("formatActivityDay (stored UTC calendar day, like the web)", () => {
  const now = new Date("2026-09-19T15:00:00Z");

  it("says Today and Yesterday", () => {
    expect(formatActivityDay("2026-09-19T01:00:00.000Z", now, "en-US")).toBe("Today");
    expect(formatActivityDay("2026-09-18T23:00:00.000Z", now, "en-US")).toBe("Yesterday");
  });

  it("otherwise shows a short date", () => {
    expect(formatActivityDay("2026-09-16T12:00:00.000Z", now, "en-US")).toBe("Sep 16");
  });
});
