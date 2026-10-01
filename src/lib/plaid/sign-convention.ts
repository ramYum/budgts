/**
 * Detects whether a Plaid-connected account's raw transaction sign
 * convention matches Plaid's documented standard (positive amount =
 * outflow) or is inverted — a confirmed real-world defect on at least one
 * institution (design: 2026-09-12 North Star Architecture §2).
 * Deterministic, evidence-based, no ML/statistics beyond a simple vote
 * tally. Never guesses: ambiguous or insufficient evidence returns
 * "unknown", the same value every account starts at.
 */

export type SignConvention = "unknown" | "standard" | "inverted";

/** One piece of evidence: a transaction whose Plaid PFC primary has a
 * reliably-expected flow direction for a typical consumer account. */
export interface SignEvidenceTxn {
  /** Plaid's raw, uncorrected signed amount — positive means "Plaid says outflow". */
  rawAmount: number;
  primary: string | null;
}

/** PFC primaries where a typical consumer transaction is overwhelmingly an
 * outflow (a purchase, fee, bill payment). Refunds happen but are always a
 * small minority, never anywhere near a majority. */
const EXPECTED_OUTFLOW_PRIMARIES = new Set([
  "FOOD_AND_DRINK",
  "TRANSPORTATION",
  "ENTERTAINMENT",
  "PERSONAL_CARE",
  "GENERAL_MERCHANDISE",
  "HOME_IMPROVEMENT",
  "RENT_AND_UTILITIES",
  "LOAN_PAYMENTS",
  "BANK_FEES",
  "MEDICAL",
  "GENERAL_SERVICES",
]);

/** PFC primaries where a typical consumer transaction is overwhelmingly an inflow. */
const EXPECTED_INFLOW_PRIMARIES = new Set(["INCOME"]);

/** A substring of the review reason the sync sets on an account whose convention stays ambiguous (sync-engine.ts), so
 * resolving it can clear exactly that flag and no other. */
export const SIGN_CONVENTION_REVIEW_MARKER = "transaction sign convention";

/** Minimum qualifying evidence transactions before any verdict is reached. */
export const MIN_EVIDENCE_SAMPLES = 8;
/** Vote fraction (0..1) at or above which the account is classified INVERTED. */
export const INVERTED_VOTE_THRESHOLD = 0.85;
/** Vote fraction (0..1) at or below which the account is classified STANDARD. */
export const STANDARD_VOTE_THRESHOLD = 0.15;
/** Sample count past which a still-ambiguous account stops waiting for more
 * evidence and should be flagged for human review instead. */
export const AMBIGUOUS_REVIEW_SAMPLE_THRESHOLD = 30;

/** On a credit-type account (Plaid `type` "credit") the expected flows differ (design: 2026-10-01 card payments §4):
 * a LOAN_PAYMENTS row is the user paying the card, which comes IN to the card, and INCOME is not a reliable signal
 * (gig-economy charges such as rides arrive labelled INCOME on cards), so it does not vote. */
const CREDIT_EXPECTED_OUTFLOW_PRIMARIES = new Set([...EXPECTED_OUTFLOW_PRIMARIES].filter((p) => p !== "LOAN_PAYMENTS"));
const CREDIT_EXPECTED_INFLOW_PRIMARIES = new Set(["LOAN_PAYMENTS"]);

/**
 * Tally qualifying evidence and classify. A transaction "votes inverted"
 * when its raw sign contradicts the flow its PFC primary would normally
 * have under Plaid's documented convention (an outflow-shaped primary with
 * a negative raw amount, or an inflow-shaped primary with a positive raw
 * amount); it "votes standard" otherwise. A primary outside both sets is
 * silently ignored, never counted as a vote either way. `accountType` is
 * Plaid's account `type` for the feed; "credit" switches to the card's
 * expected flows above.
 */
export function detectSignConvention(evidence: SignEvidenceTxn[], accountType?: string | null): SignConvention {
  const isCredit = accountType?.trim().toLowerCase() === "credit";
  const outflow = isCredit ? CREDIT_EXPECTED_OUTFLOW_PRIMARIES : EXPECTED_OUTFLOW_PRIMARIES;
  const inflow = isCredit ? CREDIT_EXPECTED_INFLOW_PRIMARIES : EXPECTED_INFLOW_PRIMARIES;
  let invertedVotes = 0;
  let totalVotes = 0;

  for (const e of evidence) {
    if (e.primary != null && outflow.has(e.primary)) {
      totalVotes++;
      if (e.rawAmount < 0) invertedVotes++;
    } else if (e.primary != null && inflow.has(e.primary)) {
      totalVotes++;
      if (e.rawAmount > 0) invertedVotes++;
    }
  }

  if (totalVotes < MIN_EVIDENCE_SAMPLES) return "unknown";

  const invertedFraction = invertedVotes / totalVotes;
  if (invertedFraction >= INVERTED_VOTE_THRESHOLD) return "inverted";
  if (invertedFraction <= STANDARD_VOTE_THRESHOLD) return "standard";
  return "unknown";
}

/** The user's answer about one held transaction: did the money go out of the account or come in? */
export type MoneyFlowAnswer = "out" | "in";

/**
 * The account's convention from the user's answer about one of its held transactions (design: 2026-10-01 card
 * payments §5): the exit for an account whose evidence never settles. Plaid's documented convention is raw > 0 =
 * money out, so an answer that agrees with the raw sign means "standard" and one that contradicts it "inverted".
 * `rawAmount` is the immutable Plaid payload amount, never the user-editable `direction`.
 */
export function conventionFromAnswer(rawAmount: number, answer: MoneyFlowAnswer): "standard" | "inverted" {
  if (!Number.isFinite(rawAmount) || rawAmount === 0) throw new Error("a zero amount carries no sign");
  const rawSaysOut = rawAmount > 0;
  return rawSaysOut === (answer === "out") ? "standard" : "inverted";
}
