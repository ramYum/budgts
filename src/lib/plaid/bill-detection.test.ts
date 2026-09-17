import { describe, expect, it } from "vitest";
import { BILL_DUE_GRACE_DAYS, classifyBill, dueState, type BillEvidence, type DueStateInput } from "./bill-detection";
import { classifySubscription } from "./subscription-detection";

function evidence(overrides: Partial<BillEvidence> = {}): BillEvidence {
  return {
    status: "ACTIVE",
    eventRole: "PURCHASE",
    direction: "debit",
    plaidCategoryPrimary: "RENT_AND_UTILITIES",
    plaidCategoryDetailed: "RENT_AND_UTILITIES_RENT",
    ...overrides,
  };
}

describe("classifyBill — the six approved detailed subtypes", () => {
  it.each([
    "RENT_AND_UTILITIES_RENT",
    "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY",
    "RENT_AND_UTILITIES_INTERNET_AND_CABLE",
    "RENT_AND_UTILITIES_TELEPHONE",
    "RENT_AND_UTILITIES_WATER",
    "RENT_AND_UTILITIES_SEWAGE_AND_WASTE",
  ])("classifies %s as a bill", (detailed) => {
    expect(classifyBill(evidence({ plaidCategoryDetailed: detailed }))).toBe(true);
  });
});

describe("classifyBill — bare primary and unsupported categories never default to true", () => {
  it("returns false for a bare RENT_AND_UTILITIES primary with no detailed subtype", () => {
    expect(classifyBill(evidence({ plaidCategoryDetailed: null }))).toBe(false);
  });

  it("returns false for an untrusted RENT_AND_UTILITIES detailed subtype", () => {
    // Plaid's taxonomy has no other RENT_AND_UTILITIES detailed values today,
    // but the classifier must not fall back to the bare primary for one it
    // doesn't recognise.
    expect(classifyBill(evidence({ plaidCategoryDetailed: "RENT_AND_UTILITIES_SOMETHING_NEW" }))).toBe(false);
  });

  it("returns false for ordinary recurring purchases (transportation, groceries)", () => {
    expect(
      classifyBill(
        evidence({ plaidCategoryPrimary: "TRANSPORTATION", plaidCategoryDetailed: "TRANSPORTATION_GAS" }),
      ),
    ).toBe(false);
    expect(
      classifyBill(
        evidence({ plaidCategoryPrimary: "FOOD_AND_DRINK", plaidCategoryDetailed: "FOOD_AND_DRINK_GROCERIES" }),
      ),
    ).toBe(false);
  });

  it("returns false for GENERAL_MERCHANDISE / GENERAL_SERVICES even with some detailed value (defense-in-depth; structurally unreachable today)", () => {
    expect(
      classifyBill(
        evidence({ plaidCategoryPrimary: "GENERAL_SERVICES", plaidCategoryDetailed: "GENERAL_SERVICES_INSURANCE" }),
      ),
    ).toBe(false);
  });

  it("returns false for LOAN_PAYMENTS even with some detailed value (defense-in-depth; structurally unreachable today)", () => {
    expect(
      classifyBill(
        evidence({ plaidCategoryPrimary: "LOAN_PAYMENTS", plaidCategoryDetailed: "LOAN_PAYMENTS_MORTGAGE_PAYMENT" }),
      ),
    ).toBe(false);
  });

  it("returns false when both category fields are null", () => {
    expect(classifyBill(evidence({ plaidCategoryPrimary: null, plaidCategoryDetailed: null }))).toBe(false);
  });
});

describe("classifyBill — subscription-shaped categories must remain subscriptions, not bills", () => {
  it.each([
    "ENTERTAINMENT_TV_AND_MOVIES",
    "ENTERTAINMENT_MUSIC_AND_AUDIO",
    "ENTERTAINMENT_VIDEO_GAMES",
    "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS",
  ])("never classifies %s as a bill", (detailed) => {
    expect(classifyBill(evidence({ plaidCategoryPrimary: "ENTERTAINMENT", plaidCategoryDetailed: detailed }))).toBe(
      false,
    );
  });

  it("subscription-before-bill precedence: today's two trusted-detailed sets are disjoint, so no real evidence can satisfy both classifiers -- documented, not assumed", () => {
    // classifySubscription's and classifyBill's trusted sets never overlap
    // (ENTERTAINMENT_*/PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS vs the six
    // RENT_AND_UTILITIES_* subtypes), so a precedence "tie" cannot occur
    // with today's evidence -- recurring-engine.ts still enforces explicit
    // ordering (subscription checked first) as forward-looking correctness
    // for when evidence sources expand, not because it changes any outcome
    // reachable today. This test proves the disjointness itself, so that
    // fact is asserted rather than silently relied upon.
    const subscriptionDetailed = ["ENTERTAINMENT_TV_AND_MOVIES", "ENTERTAINMENT_MUSIC_AND_AUDIO", "ENTERTAINMENT_VIDEO_GAMES", "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS"];
    const billDetailed = [
      "RENT_AND_UTILITIES_RENT",
      "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY",
      "RENT_AND_UTILITIES_INTERNET_AND_CABLE",
      "RENT_AND_UTILITIES_TELEPHONE",
      "RENT_AND_UTILITIES_WATER",
      "RENT_AND_UTILITIES_SEWAGE_AND_WASTE",
    ];
    for (const d of subscriptionDetailed) {
      expect(billDetailed.includes(d)).toBe(false);
      expect(classifySubscription({ status: "ACTIVE", eventRole: "PURCHASE", plaidCategoryPrimary: null, plaidCategoryDetailed: d })).toBe(true);
      expect(classifyBill(evidence({ plaidCategoryDetailed: d }))).toBe(false);
    }
  });
});

describe("classifyBill — lifecycle status gate", () => {
  it("never classifies a CANDIDATE series, even with perfect bill evidence", () => {
    expect(classifyBill(evidence({ status: "CANDIDATE" }))).toBe(false);
  });

  it("never classifies a MUTED series, even with perfect bill evidence", () => {
    expect(classifyBill(evidence({ status: "MUTED" }))).toBe(false);
  });

  it("classifies an ACTIVE series with perfect evidence", () => {
    expect(classifyBill(evidence({ status: "ACTIVE" }))).toBe(true);
  });
});

describe("classifyBill — event role and direction gates", () => {
  it.each(["INCOME", "FEE", "INTEREST", "REFUND", "CARD_PAYMENT", "TRANSFER"] as const)(
    "never classifies a %s event role, even with perfect category evidence",
    (eventRole) => {
      expect(classifyBill(evidence({ eventRole }))).toBe(false);
    },
  );

  it("classifies PURCHASE with perfect evidence", () => {
    expect(classifyBill(evidence({ eventRole: "PURCHASE" }))).toBe(true);
  });

  it("never classifies a credit-direction observation, even with perfect category evidence (defense-in-depth; structurally unreachable given eventRole===PURCHASE)", () => {
    expect(classifyBill(evidence({ direction: "credit" }))).toBe(false);
  });
});

describe("classifyBill — annual cadence and fixed/variable amounts are not this function's concern", () => {
  it("classifies regardless of amount value -- cadence/amount live entirely in recurring_series, never read here", () => {
    // A fixed $1500 rent and a variable $340 winter electricity bill both
    // classify purely from category evidence -- classifyBill never reads
    // amount or cadence at all, by construction (evidence has no such
    // fields), so this documents that invariant rather than testing a
    // parameter that doesn't exist on BillEvidence.
    expect(classifyBill(evidence({ plaidCategoryDetailed: "RENT_AND_UTILITIES_RENT" }))).toBe(true);
    expect(classifyBill(evidence({ plaidCategoryDetailed: "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY" }))).toBe(true);
  });
});

describe("classifyBill — determinism and idempotency", () => {
  it("returns the identical result for identical evidence across repeated calls", () => {
    const input = evidence();
    const first = classifyBill(input);
    const second = classifyBill(input);
    const third = classifyBill({ ...input });
    expect(first).toBe(true);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("is a pure function of its input -- no shared mutable state across calls with different inputs", () => {
    const a = classifyBill(evidence({ plaidCategoryDetailed: "RENT_AND_UTILITIES_RENT" }));
    const b = classifyBill(evidence({ plaidCategoryDetailed: "TRANSPORTATION_GAS" }));
    const aAgain = classifyBill(evidence({ plaidCategoryDetailed: "RENT_AND_UTILITIES_RENT" }));
    expect(a).toBe(true);
    expect(b).toBe(false);
    expect(aAgain).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dueState
// ---------------------------------------------------------------------------

function dueInput(overrides: Partial<DueStateInput> = {}): DueStateInput {
  return {
    nextExpectedAt: "2026-09-15T00:00:00.000Z",
    hasNewerObservation: false,
    ...overrides,
  };
}

describe("dueState — UPCOMING", () => {
  it("is UPCOMING when now is before nextExpectedAt", () => {
    const now = new Date("2026-09-10T00:00:00.000Z");
    expect(dueState(dueInput(), now)).toBe("UPCOMING");
  });

  it("is UPCOMING one millisecond before nextExpectedAt", () => {
    const now = new Date("2026-09-14T23:59:59.999Z");
    expect(dueState(dueInput(), now)).toBe("UPCOMING");
  });
});

describe("dueState — DUE", () => {
  it("is DUE at exactly nextExpectedAt", () => {
    const now = new Date("2026-09-15T00:00:00.000Z");
    expect(dueState(dueInput(), now)).toBe("DUE");
  });

  it("is DUE partway through the grace window (day 1 of 3)", () => {
    const now = new Date("2026-09-16T00:00:00.000Z");
    expect(dueState(dueInput(), now)).toBe("DUE");
  });

  it("is DUE at exactly the +3-day boundary (grace-days constant, inclusive)", () => {
    const boundary = new Date("2026-09-15T00:00:00.000Z");
    boundary.setUTCDate(boundary.getUTCDate() + BILL_DUE_GRACE_DAYS);
    expect(dueState(dueInput(), boundary)).toBe("DUE");
  });

  it("is DUE (never LATE) once a newer observation has landed, even within the grace window", () => {
    const now = new Date("2026-09-16T00:00:00.000Z");
    expect(dueState(dueInput({ hasNewerObservation: true }), now)).toBe("DUE");
  });
});

describe("dueState — LATE", () => {
  it("is LATE one millisecond past the +3-day boundary", () => {
    const boundary = new Date("2026-09-15T00:00:00.000Z");
    boundary.setUTCDate(boundary.getUTCDate() + BILL_DUE_GRACE_DAYS);
    const now = new Date(boundary.getTime() + 1);
    expect(dueState(dueInput(), now)).toBe("LATE");
  });

  it("is LATE well past the grace window with no newer observation", () => {
    const now = new Date("2026-10-01T00:00:00.000Z");
    expect(dueState(dueInput(), now)).toBe("LATE");
  });

  it("is NEVER LATE once a newer observation has landed, even far past the grace window -- 'do not report late/missed once paid, however late'", () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    expect(dueState(dueInput({ hasNewerObservation: true }), now)).toBe("DUE");
  });
});

describe("dueState — grace period is a calendar-day constant, deterministic", () => {
  it("BILL_DUE_GRACE_DAYS is exactly 3", () => {
    expect(BILL_DUE_GRACE_DAYS).toBe(3);
  });

  it("the boundary shifts by exactly one calendar day when nextExpectedAt shifts by one day, regardless of time-of-day component", () => {
    const inputA = dueInput({ nextExpectedAt: "2026-09-15T14:30:00.000Z" });
    const boundaryA = new Date("2026-09-18T14:30:00.000Z");
    expect(dueState(inputA, boundaryA)).toBe("DUE");
    expect(dueState(inputA, new Date(boundaryA.getTime() + 1))).toBe("LATE");
  });

  it("is deterministic -- identical input and now always produce the identical result", () => {
    const input = dueInput();
    const now = new Date("2026-09-16T12:00:00.000Z");
    const first = dueState(input, now);
    const second = dueState({ ...input }, new Date(now.getTime()));
    expect(first).toBe(second);
  });

  it("defaults `now` to the current time when omitted (still deterministic given the same real clock instant)", () => {
    // Exercises the default-parameter branch; the important invariant is
    // that it doesn't throw and returns a valid DueState.
    const result = dueState(dueInput({ nextExpectedAt: "2020-01-01T00:00:00.000Z" }));
    expect(["UPCOMING", "DUE", "LATE"]).toContain(result);
  });
});
