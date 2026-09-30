import { describe, expect, it } from "vitest";
import { GUIDE_COPY, firstRunRedirect } from "./shared";
import { completeTour, parseOnboardingCards, parseTourCards } from "./tour-api";

describe("shared web sources", () => {
  it("are the web's own guide words and gate, not copies", () => {
    expect(GUIDE_COPY.crystal.heading).toBe("Hi, I'm Crystal.");
    expect(GUIDE_COPY.currency.cta).toBe("Start budgeting");
    expect(firstRunRedirect(null)).toBe("/onboarding");
  });
});

describe("parseOnboardingCards", () => {
  it("reads the server's cards and the whole guide's cell count", () => {
    expect(
      parseOnboardingCards({ version: 1, phase: "onboarding", stepIds: ["crystal", "welcome", "auto-capture", "currency"], totalVisible: 9 }),
    ).toEqual({ stepIds: ["crystal", "welcome", "auto-capture", "currency"], totalVisible: 9 });
  });

  it("refuses a card the app has no words for, an empty list, or fewer cells than cards", () => {
    expect(() => parseOnboardingCards({ stepIds: ["crystal", "mystery"], totalVisible: 5 })).toThrow();
    expect(() => parseOnboardingCards({ stepIds: [], totalVisible: 0 })).toThrow();
    expect(() => parseOnboardingCards({ stepIds: ["crystal", "currency"], totalVisible: 1 })).toThrow();
  });
});

describe("parseTourCards", () => {
  const body = {
    version: 1,
    phase: "tour",
    seen: false,
    currency: "EUR",
    accounts: [{ id: "a1", name: "Everyday checking" }],
    stepIds: ["bank", "auto-sort", "money-left", "plan", "done"],
    offset: 4,
    totalVisible: 9,
  };

  it("reads the cards, their place in the guide and what they show", () => {
    expect(parseTourCards(body)).toEqual({
      stepIds: ["bank", "auto-sort", "money-left", "plan", "done"],
      offset: 4,
      totalVisible: 9,
      currency: "EUR",
      accounts: [{ id: "a1", name: "Everyday checking" }],
      seen: false,
    });
  });

  it("refuses progress that doesn't add up", () => {
    expect(() => parseTourCards({ ...body, totalVisible: 8 })).toThrow();
    expect(() => parseTourCards({ ...body, offset: -1 })).toThrow();
  });
});

describe("completeTour (POST /api/mobile/tour)", () => {
  const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

  it("is done only when the server says it stamped the guide seen", async () => {
    expect(await completeTour(json(200, { ok: true }))).toEqual({ status: "done" });
    expect((await completeTour(json(200, {}))).status).toBe("error");
  });

  it("names the failure in plain words, never the server's", async () => {
    expect(await completeTour(json(503, { error: "unavailable" }))).toMatchObject({ status: "error", kind: "unavailable" });
    expect(await completeTour(json(404, { error: "profile_missing" }))).toMatchObject({ status: "error", kind: "unavailable" });
    expect(await completeTour(json(401, {}))).toMatchObject({ status: "error", kind: "auth" });
    expect(
      await completeTour(async () => {
        throw new TypeError("Network request failed");
      }),
    ).toMatchObject({ status: "error", kind: "network", message: "Couldn't reach Budgts. Check your connection and try again." });
  });
});
