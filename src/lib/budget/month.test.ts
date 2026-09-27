import { describe, expect, it } from "vitest";
import { currentMonthKey, monthKey, todayDateKey } from "./month";

describe("today and this month follow the user's time zone", () => {
  it("still reports the previous day/month late evening in New York, when UTC has rolled over", () => {
    // 2026-10-01 02:30 UTC = 2026-09-30 22:30 EDT
    const now = new Date("2026-10-01T02:30:00Z");
    expect(todayDateKey("America/New_York", now)).toBe("2026-09-30");
    expect(currentMonthKey("America/New_York", now)).toBe("2026-09");
  });

  it("rolls over at local midnight, not UTC midnight (EDT, UTC-4)", () => {
    expect(currentMonthKey("America/New_York", new Date("2026-10-01T03:59:59Z"))).toBe("2026-09");
    expect(currentMonthKey("America/New_York", new Date("2026-10-01T04:00:00Z"))).toBe("2026-10");
  });

  it("handles standard time (EST, UTC-5) in winter", () => {
    expect(todayDateKey("America/New_York", new Date("2027-01-01T04:59:59Z"))).toBe("2026-12-31");
    expect(todayDateKey("America/New_York", new Date("2027-01-01T05:00:00Z"))).toBe("2027-01-01");
  });

  it("gives users in different zones their own month at the same instant", () => {
    // 2026-09-30 15:30 UTC = 2026-10-01 00:30 in Tokyo, 08:30 in Los Angeles
    const now = new Date("2026-09-30T15:30:00Z");
    expect(currentMonthKey("Asia/Tokyo", now)).toBe("2026-10");
    expect(currentMonthKey("America/Los_Angeles", now)).toBe("2026-09");
    expect(currentMonthKey("UTC", now)).toBe("2026-09");
  });

  it("rolls over late in the evening for zones west of New York", () => {
    // 2026-10-01 06:59:59 UTC = 2026-09-30 23:59:59 PDT
    expect(todayDateKey("America/Los_Angeles", new Date("2026-10-01T06:59:59Z"))).toBe("2026-09-30");
    expect(todayDateKey("America/Los_Angeles", new Date("2026-10-01T07:00:00Z"))).toBe("2026-10-01");
    // Honolulu has no daylight saving: UTC-10 all year
    expect(todayDateKey("Pacific/Honolulu", new Date("2026-10-01T09:59:59Z"))).toBe("2026-09-30");
  });

  it("handles half-hour and quarter-hour offsets", () => {
    // India, UTC+5:30: midnight 1 Oct = 2026-09-30 18:30 UTC
    expect(currentMonthKey("Asia/Kolkata", new Date("2026-09-30T18:29:59Z"))).toBe("2026-09");
    expect(currentMonthKey("Asia/Kolkata", new Date("2026-09-30T18:30:00Z"))).toBe("2026-10");
    // Nepal, UTC+5:45
    expect(todayDateKey("Asia/Kathmandu", new Date("2026-09-30T18:14:59Z"))).toBe("2026-09-30");
    expect(todayDateKey("Asia/Kathmandu", new Date("2026-09-30T18:15:00Z"))).toBe("2026-10-01");
  });

  it("rolls the year over at the user's own New Year", () => {
    // Auckland, UTC+13 in its summer: 2027-01-01 00:00 NZDT = 2026-12-31 11:00 UTC
    expect(currentMonthKey("Pacific/Auckland", new Date("2026-12-31T11:00:00Z"))).toBe("2027-01");
    expect(currentMonthKey("Pacific/Auckland", new Date("2026-12-31T10:59:59Z"))).toBe("2026-12");
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
