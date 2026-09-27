import { describe, expect, it } from "vitest";
import { timeZoneLabel } from "./time-zone-label";

const JULY = new Date("2026-07-01T12:00:00Z");
const JANUARY = new Date("2026-01-15T12:00:00Z");

describe("timeZoneLabel", () => {
  it("names the city and the zone's name at that moment", () => {
    expect(timeZoneLabel("America/New_York", JULY)).toBe("New York · Eastern Daylight Time");
    expect(timeZoneLabel("America/New_York", JANUARY)).toBe("New York · Eastern Standard Time");
    expect(timeZoneLabel("Asia/Kolkata", JULY)).toBe("Kolkata · India Standard Time");
  });

  it("uses the last part of a nested zone as the city", () => {
    expect(timeZoneLabel("America/Argentina/Buenos_Aires", JULY)).toBe("Buenos Aires · Argentina Standard Time");
  });

  it("shows a zone with no city by its name alone", () => {
    expect(timeZoneLabel("UTC", JULY)).toBe("Coordinated Universal Time");
  });
});
