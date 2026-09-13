import { describe, expect, it } from "vitest";
import { buildReviewMessages } from "./review-banner";

describe("buildReviewMessages", () => {
  it("returns an advisory message for a merely-flagged account and no excluded message", () => {
    const { advisory, excluded } = buildReviewMessages([
      { name: "Checking", needsReview: true, excludedFromCalculations: false },
    ]);
    expect(advisory).toMatch(/unusually repetitive/);
    expect(advisory).toMatch(/Checking/);
    expect(excluded).toBeNull();
  });

  it("returns an excluded message for an excluded account and no advisory message for it", () => {
    const { advisory, excluded } = buildReviewMessages([
      { name: "Checking", needsReview: true, excludedFromCalculations: true },
    ]);
    expect(excluded).toMatch(/excluded from your financial totals/i);
    expect(excluded).toMatch(/Checking/);
    expect(excluded).toMatch(/[Nn]othing (was|has been) deleted/);
    expect(advisory).toBeNull();
  });

  it("keeps the two messages separate when both an excluded and a merely-flagged account exist", () => {
    const { advisory, excluded } = buildReviewMessages([
      { name: "Checking", needsReview: true, excludedFromCalculations: true },
      { name: "Savings", needsReview: true, excludedFromCalculations: false },
    ]);
    expect(excluded).toMatch(/Checking/);
    expect(excluded).not.toMatch(/Savings/);
    expect(advisory).toMatch(/Savings/);
    expect(advisory).not.toMatch(/Checking/);
  });

  it("returns null for both when nothing is flagged or excluded", () => {
    const { advisory, excluded } = buildReviewMessages([]);
    expect(advisory).toBeNull();
    expect(excluded).toBeNull();
  });

  it("reassures nothing was deleted, never implying transactions were removed", () => {
    const { excluded } = buildReviewMessages([
      { name: null, needsReview: true, excludedFromCalculations: true },
    ]);
    expect(excluded).toMatch(/nothing (was|has been) deleted/i);
    expect(excluded).not.toMatch(/(were|have been) deleted/i);
  });
});
