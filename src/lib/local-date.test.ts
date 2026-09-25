import { describe, expect, it } from "vitest";
import {
  dateKeyAt,
  greetingForHour,
  relativeDayLabel,
  resolveDefaultDate,
  shiftDateKey,
} from "./local-date";

// 2026-09-25T03:30:00Z is 2026-09-24 20:30 in America/Los_Angeles (UTC-7,
// getTimezoneOffset() = 420) — the evening window where UTC and the user's
// calendar day disagree.
const EVENING_PDT = new Date("2026-09-25T03:30:00.000Z");

describe("dateKeyAt", () => {
  it("returns the UTC calendar date for offset 0", () => {
    expect(dateKeyAt(EVENING_PDT, 0)).toBe("2026-09-25");
  });

  it("returns the local calendar date for a US-west offset", () => {
    expect(dateKeyAt(EVENING_PDT, 420)).toBe("2026-09-24");
  });

  it("handles offsets east of UTC (negative getTimezoneOffset)", () => {
    // 2026-09-24T22:00Z is 2026-09-25 07:00 in Asia/Tokyo (offset -540).
    expect(dateKeyAt(new Date("2026-09-24T22:00:00.000Z"), -540)).toBe("2026-09-25");
  });

  it("crosses a month boundary correctly", () => {
    // Oct 1 02:00 UTC = Sep 30 evening in Chicago (UTC-5 → offset 300).
    expect(dateKeyAt(new Date("2026-10-01T02:00:00.000Z"), 300)).toBe("2026-09-30");
  });
});

describe("shiftDateKey", () => {
  it("moves across month and year boundaries", () => {
    expect(shiftDateKey("2026-10-01", -1)).toBe("2026-09-30");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDateKey("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("resolveDefaultDate", () => {
  it("replaces a server 'today' (UTC) with the user's local today", () => {
    expect(resolveDefaultDate("2026-09-25", EVENING_PDT, 420)).toBe("2026-09-24");
  });

  it("keeps a non-today default (viewing another month) unchanged", () => {
    expect(resolveDefaultDate("2026-08-15", EVENING_PDT, 420)).toBe("2026-08-15");
  });

  it("is a no-op when UTC and local agree", () => {
    expect(resolveDefaultDate("2026-09-25", EVENING_PDT, 0)).toBe("2026-09-25");
  });
});

describe("relativeDayLabel", () => {
  // occurred_at stores a calendar date at noon UTC (dateToIso).
  const fmt = (iso: string) => `fmt:${iso.slice(0, 10)}`;

  it("labels a transaction dated the user's local today as Today", () => {
    expect(relativeDayLabel("2026-09-24T12:00:00.000Z", "2026-09-24", fmt)).toBe("Today");
  });

  it("labels the previous calendar day as Yesterday", () => {
    expect(relativeDayLabel("2026-09-23T12:00:00.000Z", "2026-09-24", fmt)).toBe("Yesterday");
  });

  it("formats anything older", () => {
    expect(relativeDayLabel("2026-09-20T12:00:00.000Z", "2026-09-24", fmt)).toBe("fmt:2026-09-20");
  });
});

describe("greetingForHour", () => {
  it("maps hours to a greeting", () => {
    expect(greetingForHour(0)).toBe("Good morning");
    expect(greetingForHour(11)).toBe("Good morning");
    expect(greetingForHour(12)).toBe("Good afternoon");
    expect(greetingForHour(17)).toBe("Good afternoon");
    expect(greetingForHour(18)).toBe("Good evening");
    expect(greetingForHour(23)).toBe("Good evening");
  });
});
