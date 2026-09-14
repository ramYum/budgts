/**
 * Automatic replay containment for Advancial Federal Credit Union's
 * confirmed feed defect (docs/specs/2026-09-12-advancial-remediation-and-
 * future-ingestion-defense.md). Advancial's own `/transactions/sync` feed
 * re-sends a real transaction as up to 50 separate `added` rows — same
 * content, a distinct Plaid `transaction_id` each time. Phase 14's anomaly
 * threshold already *detects* this for every institution; this additionally
 * *contains* it automatically, but only for this one confirmed
 * `institution_id` — never a general "N copies = duplicate" rule. A
 * legitimate repeat purchase at a different institution must never be
 * excluded by this (design ask 2026-09-14).
 */

/** Advancial Federal Credit Union — confirmed via both incidents' `plaid_items.institution_id`. */
export const ADVANCIAL_INSTITUTION_ID = "ins_116484";

/**
 * The stable substring inside the Phase 14 anomaly detector's own review
 * message (sync-engine.ts's `flagAccountForReview` call) that identifies
 * "this account was flagged purely for identical-content duplication" —
 * the one flag category automatic replay containment can resolve on its
 * own. Never matches the sign-convention-ambiguity message (completely
 * different wording), so clearing a flag by this marker can never
 * silently discard an unrelated, still-valid warning.
 */
export const ANOMALY_DUPLICATE_REASON_MARKER =
  "identical content (differing only by Plaid's own transaction ID)";

export interface ContainmentCandidate {
  id: string;
  contentFingerprint: string;
  /** A human decision must never be discarded — see canonical-selection rule below. */
  userCategorized: boolean;
}

export interface ContainmentUpdate {
  canonicalId: string;
  duplicateIds: string[];
}

/**
 * Groups candidates by content fingerprint; every group of 2+ gets one
 * canonical row and the rest planned as duplicates of it. Canonical
 * selection: the user-categorized row wins if one exists in the group
 * (rule A.2 in the design doc); otherwise the lexicographically smallest
 * id — arbitrary but fully deterministic, since these are byte-identical
 * copies and *which* one survives as canonical doesn't matter, only that
 * the choice is stable and reproducible across repeated runs.
 */
export function planReplayContainment(candidates: ContainmentCandidate[]): ContainmentUpdate[] {
  const groups = new Map<string, ContainmentCandidate[]>();
  for (const c of candidates) {
    const list = groups.get(c.contentFingerprint) ?? [];
    list.push(c);
    groups.set(c.contentFingerprint, list);
  }

  const updates: ContainmentUpdate[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const userCat = group.find((c) => c.userCategorized);
    const canonical = userCat ?? group.slice().sort((a, b) => a.id.localeCompare(b.id))[0];
    const duplicateIds = group.filter((c) => c.id !== canonical.id).map((c) => c.id);
    updates.push({ canonicalId: canonical.id, duplicateIds });
  }
  return updates;
}
