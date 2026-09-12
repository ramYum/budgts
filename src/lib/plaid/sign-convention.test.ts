import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD,
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
