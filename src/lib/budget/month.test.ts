import { describe, expect, it } from "vitest";
import { APP_TIME_ZONE, currentMonthKey, monthKey, todayDateKey } from "./month";

describe("app time zone (Pennsylvania / US Eastern)", () => {
  it("is America/New_York", () => {
    expect(APP_TIME_ZONE).toBe("America/New_York");
  });

  it("still reports the previous day/month late evening Eastern, when UTC has rolled over", () => {
    // 2026-10-01 02:30 UTC = 2026-09-30 22:30 EDT
    const now = new Date("2026-10-01T02:30:00Z");
    expect(todayDateKey(now)).toBe("2026-09-30");
    expect(currentMonthKey(now)).toBe("2026-09");
  });

  it("rolls over at local midnight, not UTC midnight (EDT, UTC-4)", () => {
    expect(currentMonthKey(new Date("2026-10-01T03:59:59Z"))).toBe("2026-09");
    expect(currentMonthKey(new Date("2026-10-01T04:00:00Z"))).toBe("2026-10");
  });

  it("handles standard time (EST, UTC-5) in winter", () => {
    expect(todayDateKey(new Date("2027-01-01T04:59:59Z"))).toBe("2026-12-31");
    expect(todayDateKey(new Date("2027-01-01T05:00:00Z"))).toBe("2027-01-01");
  });
});

describe("monthKey", () => {
  it("formats a date as UTC YYYY-MM", () => {
    expect(monthKey(new Date("2026-09-07T12:00:00Z"))).toBe("2026-09");
  });

  it("pads single-digit months", () => {
    expect(monthKey(new Date("2026-01-31T23:59:59Z"))).toBe("2026-01");
  });

  it("uses UTC, not local time, at a month boundary", () => {
    // 2026-10-01 00:30 UTC is still October in UTC even west of Greenwich
    expect(monthKey(new Date("2026-10-01T00:30:00Z"))).toBe("2026-10");
  });
});
