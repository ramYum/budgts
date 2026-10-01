import { describe, expect, it } from "vitest";
import { afterGuideNav, firstRunHelpOpen, howItWorksNav, profileFailure, shellRoute } from "./gate";

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

describe("How Budgts Works from the welcome guide", () => {
  it("opens Help's page on a replay by going back into the app, and its own first-run route above the guide", () => {
    // a replay is pushed over the tabs: going to Help returns into them, never stacking a second set of tabs
    expect(howItWorksNav(true)).toEqual({ method: "dismissTo", href: "/help/how-it-works" });
    expect(howItWorksNav(false)).toEqual({ method: "push", href: "/guide/how-it-works" });
  });

  it("leaves the guide for Home: back into the tabs on a replay, replacing the guide on the first run", () => {
    expect(afterGuideNav(true)).toEqual({ method: "dismissTo", href: "/" });
    expect(afterGuideNav(false)).toEqual({ method: "replace", href: "/" });
  });

  it("keeps the first-run route open only while the guide is the gate", () => {
    expect(firstRunHelpOpen("tour")).toBe(true);
    expect(firstRunHelpOpen("onboarding")).toBe(false);
    expect(firstRunHelpOpen("app")).toBe(false);
  });
});
