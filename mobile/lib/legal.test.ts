import { describe, expect, it, vi } from "vitest";
import { fetchLegalLive, legalUrl, settingsLegalLinks } from "./legal";

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

describe("fetchLegalLive: the web's switch is the app's switch", () => {
  const answering = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it("asks the web's /api/legal", async () => {
    const f = answering(200, { live: true, pages: [] });
    expect(await fetchLegalLive("https://budgts.com/", f)).toBe(true);
    expect(f).toHaveBeenCalledWith("https://budgts.com/api/legal");
  });

  it("is off unless the answer is exactly live: true", async () => {
    expect(await fetchLegalLive("https://budgts.com", answering(200, { live: false, pages: [] }))).toBe(false);
    expect(await fetchLegalLive("https://budgts.com", answering(200, { live: "yes" }))).toBe(false);
    expect(await fetchLegalLive("https://budgts.com", answering(404, { live: true }))).toBe(false);
  });

  it("is off when the web can't be reached or the base URL is missing", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    expect(await fetchLegalLive("https://budgts.com", failing)).toBe(false);
    const unused = vi.fn() as unknown as typeof fetch;
    expect(await fetchLegalLive(undefined, unused)).toBe(false);
    expect(unused).not.toHaveBeenCalled();
  });
});

describe("settingsLegalLinks", () => {
  it("shows no legal links while the web's pages are off (a tap would dead-end on a 404)", () => {
    expect(settingsLegalLinks("https://budgts.com", false)).toEqual([]);
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
