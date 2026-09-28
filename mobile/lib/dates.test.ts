import { describe, expect, it } from "vitest";
import { dayOf, monthOf, shiftDate, shiftMonth } from "./dates";

describe("shiftDate", () => {
  it("moves a calendar date by whole days across month and year ends", () => {
    expect(shiftDate("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29"); // leap year
    expect(shiftDate("2026-09-10", 0)).toBe("2026-09-10");
  });
});

describe("months", () => {
  it("derives the month key from a date and from a stored timestamp", () => {
    expect(monthOf("2026-09-10")).toBe("2026-09");
    expect(dayOf("2026-09-10T12:00:00+00:00")).toBe("2026-09-10");
  });

  it("shifts a month key across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-09", -13)).toBe("2025-08");
  });
});
