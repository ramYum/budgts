import { describe, expect, it } from "vitest";
import { avatarLetter, parseProfileDetails, signsInWith } from "./profile-details";

const body = {
  email: "alex.lee@example.com",
  currency: "USD",
  onboarded: true,
  timeZone: "America/New_York",
  month: "2026-09",
  today: "2026-09-30",
  supportedCurrencies: ["USD"],
  tourSeen: true,
  displayName: "Alex",
  signInMethods: ["Email link", "Google"],
  timeZoneLabel: "New York · Eastern Daylight Time",
  currencyName: "US Dollar",
};

describe("parseProfileDetails", () => {
  it("reads the Profile screen's lines as the server derived them", () => {
    expect(parseProfileDetails(body)).toEqual({
      email: "alex.lee@example.com",
      displayName: "Alex",
      signInMethods: ["Email link", "Google"],
      currency: "USD",
      currencyName: "US Dollar",
      timeZoneLabel: "New York · Eastern Daylight Time",
    });
  });

  it("keeps a missing email or zone visible as empty, never invented", () => {
    const d = parseProfileDetails({ ...body, email: null, displayName: "", timeZoneLabel: null });
    expect(d.email).toBe("");
    expect(d.timeZoneLabel).toBeNull();
  });

  it("refuses a body it can't show truthfully", () => {
    expect(() => parseProfileDetails(null)).toThrow();
    expect(() => parseProfileDetails({ ...body, signInMethods: [] })).toThrow();
    expect(() => parseProfileDetails({ ...body, signInMethods: undefined })).toThrow();
    expect(() => parseProfileDetails({ ...body, currencyName: 3 })).toThrow();
    expect(() => parseProfileDetails({ ...body, displayName: undefined })).toThrow();
    expect(() => parseProfileDetails({ ...body, currency: "" })).toThrow();
  });
});

describe("the web's derived lines", () => {
  it("says how the user signs in", () => {
    expect(signsInWith(["Email link"])).toBe("an email link");
    expect(signsInWith(["Email link", "Google"])).toBe("an email link or Google");
    expect(signsInWith(["Apple"])).toBe("Apple");
  });

  it("picks the avatar letter", () => {
    expect(avatarLetter({ displayName: "Alex", email: "alex@x.com" })).toBe("A");
    expect(avatarLetter({ displayName: "", email: "9@x.com" })).toBe("9");
    expect(avatarLetter({ displayName: "", email: "" })).toBe("?");
  });
});
