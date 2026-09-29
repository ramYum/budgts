import { afterEach, describe, expect, it, vi } from "vitest";
import { OWNER_LEGAL_ENV } from "@/test-utils/legal-env";
import robots from "./robots";
import sitemap from "./sitemap";
import { siteUrl } from "@/lib/site";

afterEach(() => vi.unstubAllEnvs());

describe("robots.txt and the sitemap", () => {
  it("lets crawlers read everything, /company included, and points at the sitemap", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://budgts.com/");
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" }, sitemap: "https://budgts.com/sitemap.xml" });
  });

  it("lists the homepage and the four legal pages once they are live", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://budgts.com");
    for (const [name, value] of Object.entries(OWNER_LEGAL_ENV)) vi.stubEnv(name, value);
    expect(sitemap().map((e) => e.url)).toEqual([
      "https://budgts.com/",
      "https://budgts.com/privacy",
      "https://budgts.com/terms",
      "https://budgts.com/support",
      "https://budgts.com/account-deletion",
    ]);
  });

  it("lists only the homepage while the legal pages are 404s", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://budgts.com");
    for (const name of Object.keys(OWNER_LEGAL_ENV)) vi.stubEnv(name, "");
    expect(sitemap().map((e) => e.url)).toEqual(["https://budgts.com/"]);
  });

  it("falls back to budgts.com when the site URL is unset", () => {
    expect(siteUrl({})).toBe("https://budgts.com");
  });
});
