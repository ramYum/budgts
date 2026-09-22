import { describe, expect, it } from "vitest";
import { legalUrl } from "./legal";

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
