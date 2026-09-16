import { describe, expect, it } from "vitest";
import { classifySubscription, type SubscriptionEvidence } from "./subscription-detection";

function evidence(overrides: Partial<SubscriptionEvidence> = {}): SubscriptionEvidence {
  return {
    status: "ACTIVE",
    eventRole: "PURCHASE",
    plaidCategoryPrimary: "ENTERTAINMENT",
    plaidCategoryDetailed: "ENTERTAINMENT_TV_AND_MOVIES",
    ...overrides,
  };
}

describe("classifySubscription — strong detailed-category evidence", () => {
  it.each([
    ["ENTERTAINMENT_TV_AND_MOVIES", "ENTERTAINMENT"],
    ["ENTERTAINMENT_MUSIC_AND_AUDIO", "ENTERTAINMENT"],
    ["ENTERTAINMENT_VIDEO_GAMES", "ENTERTAINMENT"],
    ["PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS", "PERSONAL_CARE"],
  ])("classifies %s as a subscription", (detailed, primary) => {
    expect(classifySubscription(evidence({ plaidCategoryPrimary: primary, plaidCategoryDetailed: detailed }))).toBe(
      true,
    );
  });
});

describe("classifySubscription — merchant knowledge (documented gap)", () => {
  it("does not classify based on category alone, even for a merchant-knowledge-eligible bucket, without a trusted detailed subtype", () => {
    // Simulates a merchant whose PFC primary is ENTERTAINMENT (the same
    // bucket Netflix/Spotify fall in via MERCHANT_KNOWLEDGE) but whose
    // detailed subtype is something other than the trusted three -- e.g.
    // a one-off entertainment-venue purchase. Proves the current
    // implementation genuinely requires the strong signal and does not
    // fall back to a coarse category/merchant-bucket match.
    const result = classifySubscription(
      evidence({ plaidCategoryPrimary: "ENTERTAINMENT", plaidCategoryDetailed: "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS" }),
    );
    expect(result).toBe(false);
  });

  it("does not classify a Personal Care merchant without the gym-specific detailed subtype", () => {
    // Mirrors a pay-per-visit Personal Care merchant (e.g. a hair salon) --
    // same category bucket as membership gyms in MERCHANT_KNOWLEDGE, but
    // no positive subscription evidence.
    const result = classifySubscription(
      evidence({ plaidCategoryPrimary: "PERSONAL_CARE", plaidCategoryDetailed: "PERSONAL_CARE_HAIR_AND_BEAUTY" }),
    );
    expect(result).toBe(false);
  });
});

describe("classifySubscription — unsupported/general categories never default to true", () => {
  it("returns false for a bare primary with no detailed subtype at all", () => {
    expect(classifySubscription(evidence({ plaidCategoryPrimary: "ENTERTAINMENT", plaidCategoryDetailed: null }))).toBe(
      false,
    );
  });

  it("returns false for GENERAL_MERCHANDISE / GENERAL_SERVICES even with some detailed value", () => {
    expect(
      classifySubscription(evidence({ plaidCategoryPrimary: "GENERAL_MERCHANDISE", plaidCategoryDetailed: "GENERAL_MERCHANDISE_SUPERSTORES" })),
    ).toBe(false);
    expect(
      classifySubscription(evidence({ plaidCategoryPrimary: "GENERAL_SERVICES", plaidCategoryDetailed: "GENERAL_SERVICES_OTHER_GENERAL_SERVICES" })),
    ).toBe(false);
  });

  it("returns false when both category fields are null", () => {
    expect(classifySubscription(evidence({ plaidCategoryPrimary: null, plaidCategoryDetailed: null }))).toBe(false);
  });
});

describe("classifySubscription — the bill/subscription boundary", () => {
  it("never classifies RENT_AND_UTILITIES as a subscription, even paired with a trusted-looking detailed value", () => {
    // Defensive: even if a future detailed subtype under RENT_AND_UTILITIES
    // were accidentally added to the trusted set, the primary-level hard
    // block must still win.
    const result = classifySubscription({
      status: "ACTIVE",
      eventRole: "PURCHASE",
      plaidCategoryPrimary: "RENT_AND_UTILITIES",
      plaidCategoryDetailed: "ENTERTAINMENT_TV_AND_MOVIES",
    });
    expect(result).toBe(false);
  });

  it("never classifies ordinary RENT_AND_UTILITIES detailed subtypes (internet/cable/utilities)", () => {
    for (const detailed of [
      "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY",
      "RENT_AND_UTILITIES_INTERNET_AND_CABLE",
      "RENT_AND_UTILITIES_TELEPHONE",
      "RENT_AND_UTILITIES_WATER",
      "RENT_AND_UTILITIES_RENT",
    ]) {
      expect(
        classifySubscription(evidence({ plaidCategoryPrimary: "RENT_AND_UTILITIES", plaidCategoryDetailed: detailed })),
      ).toBe(false);
    }
  });

  it("never classifies LOAN_PAYMENTS (mortgage/auto/student loan) even with an otherwise-trusted detailed value", () => {
    const result = classifySubscription({
      status: "ACTIVE",
      eventRole: "PURCHASE",
      plaidCategoryPrimary: "LOAN_PAYMENTS",
      plaidCategoryDetailed: "ENTERTAINMENT_MUSIC_AND_AUDIO",
    });
    expect(result).toBe(false);
  });
});

describe("classifySubscription — lifecycle status gate", () => {
  it("never classifies a CANDIDATE series, even with perfect subscription evidence", () => {
    expect(classifySubscription(evidence({ status: "CANDIDATE" }))).toBe(false);
  });

  it("never classifies a MUTED series, even with perfect subscription evidence", () => {
    expect(classifySubscription(evidence({ status: "MUTED" }))).toBe(false);
  });

  it("classifies an ACTIVE series with perfect evidence", () => {
    expect(classifySubscription(evidence({ status: "ACTIVE" }))).toBe(true);
  });
});

describe("classifySubscription — event role gate", () => {
  it.each(["INCOME", "FEE", "INTEREST"] as const)(
    "never classifies a %s event role, even with perfect category evidence",
    (eventRole) => {
      expect(classifySubscription(evidence({ eventRole }))).toBe(false);
    },
  );

  it("classifies PURCHASE with perfect evidence", () => {
    expect(classifySubscription(evidence({ eventRole: "PURCHASE" }))).toBe(true);
  });
});

describe("classifySubscription — determinism and idempotency", () => {
  it("returns the identical result for identical evidence across repeated calls", () => {
    const input = evidence();
    const first = classifySubscription(input);
    const second = classifySubscription(input);
    const third = classifySubscription({ ...input });
    expect(first).toBe(true);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("is a pure function of its input -- no shared mutable state across calls with different inputs", () => {
    const a = classifySubscription(evidence({ plaidCategoryDetailed: "ENTERTAINMENT_TV_AND_MOVIES" }));
    const b = classifySubscription(evidence({ plaidCategoryDetailed: "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS" }));
    const aAgain = classifySubscription(evidence({ plaidCategoryDetailed: "ENTERTAINMENT_TV_AND_MOVIES" }));
    expect(a).toBe(true);
    expect(b).toBe(false);
    expect(aAgain).toBe(true);
  });
});
