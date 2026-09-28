import { describe, expect, it } from "vitest";
import { LEGAL_PAGES_LIVE, legalUrl, settingsLegalLinks } from "./legal";

describe("legalUrl", () => {
  it("builds the hosted page URL from the API base", () => {
    expect(legalUrl("https://budgts.com", "privacy")).toBe("https://budgts.com/privacy");
    expect(legalUrl("https://budgts.com", "terms")).toBe("https://budgts.com/terms");
    expect(legalUrl("https://budgts.com", "support")).toBe("https://budgts.com/support");
    expect(legalUrl("https://budgts.com", "accountDeletion")).toBe("https://budgts.com/account-deletion");
  });

  it("tolerates a trailing slash on the base", () => {
    expect(legalUrl("https://budgts-staging.vercel.app/", "privacy")).toBe("https://budgts-staging.vercel.app/privacy");
  });

  it("is null when the base URL is not configured, never a broken link", () => {
    expect(legalUrl(undefined, "privacy")).toBeNull();
    expect(legalUrl("", "privacy")).toBeNull();
  });
});

describe("settingsLegalLinks", () => {
  it("shows no legal links until Phase 1 builds the pages (a tap would dead-end on a 404 or sign-in)", () => {
    expect(LEGAL_PAGES_LIVE).toBe(false);
    expect(settingsLegalLinks("https://budgts.com")).toEqual([]);
  });

  it("once live, lists each page with its URL, and none without a base URL", () => {
    expect(settingsLegalLinks("https://budgts.com", true).map((l) => l.url)).toEqual([
      "https://budgts.com/privacy",
      "https://budgts.com/terms",
      "https://budgts.com/support",
    ]);
    expect(settingsLegalLinks(undefined, true)).toEqual([]);
  });
});
