import { describe, expect, it } from "vitest";
import { monthKey } from "./month";

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
