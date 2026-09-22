import { describe, expect, it } from "vitest";
import { currentMonth, dayOf, monthOf, shiftDate, shiftMonth, todayIso } from "./dates";

describe("todayIso", () => {
  it("is the device's local calendar date, not the UTC one", () => {
    // 23:30 local on 5 Oct is still 5 Oct for the user, even though it is already 6 Oct in UTC for a UTC-5 device.
    expect(todayIso(new Date(2026, 9, 5, 23, 30))).toBe("2026-10-05");
    expect(todayIso(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });
});

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

  it("the current month follows the device's local date", () => {
    expect(currentMonth(new Date(2026, 8, 30, 23, 59))).toBe("2026-09");
  });
});
