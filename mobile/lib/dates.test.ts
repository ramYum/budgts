import { describe, expect, it } from "vitest";
import { dayOf, monthOf } from "./dates";
import { shiftDateKey, shiftMonthKey } from "./shared";

describe("calendar keys", () => {
  it("derives the month key from a date and the day from a stored timestamp", () => {
    expect(monthOf("2026-09-10")).toBe("2026-09");
    expect(dayOf("2026-09-10T12:00:00+00:00")).toBe("2026-09-10");
  });

  it("shifts with the web's own helpers, across month and year ends", () => {
    expect(shiftDateKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-09", -13)).toBe("2025-08");
  });
});
