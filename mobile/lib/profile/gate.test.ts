import { describe, expect, it } from "vitest";
import { profileFailure, shellRoute } from "./gate";

describe("shellRoute (the web's firstRunRedirect)", () => {
  it("holds a user without a currency on Get Started, whatever the tour flag says", () => {
    expect(shellRoute({ onboarded: false, tourSeen: false })).toBe("onboarding");
    expect(shellRoute({ onboarded: false, tourSeen: true })).toBe("onboarding");
  });

  it("plays the welcome guide until it is finished or skipped", () => {
    expect(shellRoute({ onboarded: true, tourSeen: false })).toBe("tour");
  });

  it("opens the app once the guide is seen", () => {
    expect(shellRoute({ onboarded: true, tourSeen: true })).toBe("app");
  });
});

describe("profileFailure", () => {
  it("never lets a failed read through as a guess: every kind has a screen, and all but a missing profile can retry", () => {
    expect(profileFailure("network")).toEqual({ kind: "network", detail: false, canRetry: true });
    expect(profileFailure("auth")).toEqual({ kind: "auth", detail: false, canRetry: true });
    expect(profileFailure("unavailable")).toEqual({ kind: "unavailable", detail: false, canRetry: true });
    expect(profileFailure("contract")).toEqual({ kind: "contract", detail: true, canRetry: true });
    expect(profileFailure("time_zone")).toEqual({ kind: "rejected", detail: true, canRetry: true });
    expect(profileFailure("profile_missing")).toEqual({ kind: "rejected", detail: true, canRetry: false });
  });
});
