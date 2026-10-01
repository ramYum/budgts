import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD,
  conventionFromAnswer,
  detectSignConvention,
  INVERTED_VOTE_THRESHOLD,
  MIN_EVIDENCE_SAMPLES,
  STANDARD_VOTE_THRESHOLD,
  type SignEvidenceTxn,
} from "./sign-convention";

function outflow(rawAmount: number): SignEvidenceTxn {
  return { rawAmount, primary: "FOOD_AND_DRINK" };
}
function inflow(rawAmount: number): SignEvidenceTxn {
  return { rawAmount, primary: "INCOME" };
}
function ignored(rawAmount: number): SignEvidenceTxn {
  return { rawAmount, primary: "TRANSFER_IN" };
}

describe("detectSignConvention", () => {
  it("returns unknown with no evidence", () => {
    expect(detectSignConvention([])).toBe("unknown");
  });

  it("returns unknown below MIN_EVIDENCE_SAMPLES even with unanimous votes", () => {
    const evidence = Array.from({ length: MIN_EVIDENCE_SAMPLES - 1 }, () => outflow(-100));
    expect(detectSignConvention(evidence)).toBe("unknown");
  });

  it("returns standard when outflow-primary evidence is consistently positive", () => {
    const evidence = Array.from({ length: MIN_EVIDENCE_SAMPLES }, () => outflow(100));
    expect(detectSignConvention(evidence)).toBe("standard");
  });

  it("returns inverted when outflow-primary evidence is consistently negative", () => {
    const evidence = Array.from({ length: MIN_EVIDENCE_SAMPLES }, () => outflow(-100));
    expect(detectSignConvention(evidence)).toBe("inverted");
  });

  it("tolerates a normal refund rate without flipping the verdict to inverted", () => {
    // 20 outflow-shaped transactions, 2 refunds (negative under a standard
    // account) — a 10% refund rate must not be misread as inversion.
    const evidence = [
      ...Array.from({ length: 18 }, () => outflow(100)),
      ...Array.from({ length: 2 }, () => outflow(-100)),
    ];
    expect(detectSignConvention(evidence)).toBe("standard");
  });

  it("stays unknown on genuinely mixed evidence, even with plenty of samples", () => {
    const evidence = [
      ...Array.from({ length: 15 }, () => outflow(100)),
      ...Array.from({ length: 15 }, () => outflow(-100)),
    ];
    expect(detectSignConvention(evidence)).toBe("unknown");
  });

  it("classifies inflow-primary evidence with the opposite expected sign", () => {
    // Standard convention: income arrives as a negative raw amount.
    const evidence = Array.from({ length: MIN_EVIDENCE_SAMPLES }, () => inflow(-500));
    expect(detectSignConvention(evidence)).toBe("standard");
  });

  it("never counts an ignored primary as a vote either way", () => {
    const evidence = Array.from({ length: 50 }, () => ignored(-999));
    expect(detectSignConvention(evidence)).toBe("unknown");
  });

  it("exposes the vote thresholds and sample sizes as named constants", () => {
    expect(MIN_EVIDENCE_SAMPLES).toBeGreaterThan(0);
    expect(INVERTED_VOTE_THRESHOLD).toBeGreaterThan(0.5);
    expect(STANDARD_VOTE_THRESHOLD).toBeLessThan(0.5);
    expect(AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD).toBeGreaterThan(MIN_EVIDENCE_SAMPLES);
  });
});

describe("detectSignConvention on a credit-type account (design: 2026-10-01 card payments §4)", () => {
  const purchase = (raw: number): SignEvidenceTxn => ({ rawAmount: raw, primary: "GENERAL_MERCHANDISE" });
  const cardPayment = (raw: number): SignEvidenceTxn => ({ rawAmount: raw, primary: "LOAN_PAYMENTS" });
  const gig = (raw: number): SignEvidenceTxn => ({ rawAmount: raw, primary: "INCOME" });

  it("a standard card with one purchase per payment resolves standard (payments come IN to a card)", () => {
    const evidence = Array.from({ length: 6 }, () => [purchase(20), cardPayment(-20)]).flat();
    expect(detectSignConvention(evidence, "credit")).toBe("standard");
  });

  it("the same evidence on a depository account stays unknown (the old reading, still right there)", () => {
    const evidence = Array.from({ length: 6 }, () => [purchase(20), cardPayment(-20)]).flat();
    expect(detectSignConvention(evidence, "depository")).toBe("unknown");
  });

  it("an inverted card (purchases and payments both flipped) resolves inverted", () => {
    const evidence = Array.from({ length: 6 }, () => [purchase(-20), cardPayment(20)]).flat();
    expect(detectSignConvention(evidence, "credit")).toBe("inverted");
  });

  it("INCOME rows do not vote on a card (gig-economy charges like rides are labelled INCOME there)", () => {
    const evidence = [...Array.from({ length: 8 }, () => purchase(15)), ...Array.from({ length: 8 }, () => gig(15))];
    expect(detectSignConvention(evidence, "credit")).toBe("standard");
  });

  it("matches Plaid's account type case-insensitively", () => {
    const evidence = Array.from({ length: 6 }, () => [purchase(20), cardPayment(-20)]).flat();
    expect(detectSignConvention(evidence, "Credit")).toBe("standard");
  });
});

describe("conventionFromAnswer (the user's answer to 'Was this money going out or coming in?')", () => {
  it.each([
    [12.34, "out", "standard"],
    [-12.34, "in", "standard"],
    [-12.34, "out", "inverted"],
    [12.34, "in", "inverted"],
  ] as const)("raw %s answered %s → %s", (raw, answer, expected) => {
    expect(conventionFromAnswer(raw, answer)).toBe(expected);
  });

  it("refuses a zero amount, which carries no sign", () => {
    expect(() => conventionFromAnswer(0, "out")).toThrow();
  });
});
