/**
 * Paired-transfer detection (V1.5) — pure, deterministic matching over a
 * snapshot of already-loaded, already-filtered candidate transactions. No
 * I/O: the caller (sync-store.ts) loads eligible candidates and applies
 * accepted pairs to real Postgres under row locks (this module has no
 * opinion on concurrency — see sync-store.ts's applyAcceptedPair).
 *
 * Design: docs/specs/2026-09-16-paired-transfer-detection-design.md.
 *
 * Pairing is a relationship, not a classification:
 *  - Tier A links two ALREADY correctly-classified legs (transferPairId
 *    only — event_role/is_transfer untouched).
 *  - Tier B corrects exactly one UNRESOLVED leg (event_role='TRANSFER',
 *    is_transfer=true) alongside linking both — never touches a leg that
 *    already has a resolved role.
 *  - Tier C (ambiguous) writes nothing.
 */
import type { EventRole } from "./types";

export type PairingDirection = "debit" | "credit";

/** The fields the matcher needs from an already-eligible candidate row.
 * The caller is responsible for every candidacy exclusion (duplicate_of_id,
 * transfer_user_set, removed_at, status, pending, source, and the
 * P2P_PAYMENT/REFUND/INCOME role exclusion) — this module trusts its input
 * is already the eligible set and only decides WHICH eligible rows pair. */
export interface PairingCandidate {
  id: string;
  accountId: string;
  /** Minor units, always > 0 — exact equality is the only amount rule. */
  amount: number;
  direction: PairingDirection;
  occurredAt: string;
  eventRole: EventRole | null;
  isTransfer: boolean;
}

export type PairTier = "A" | "B";

export interface AcceptedPair {
  tier: PairTier;
  legA: string;
  legB: string;
  /** Tier B only — the id of the leg that gets is_transfer/event_role
   * written. Always null for Tier A (link only, nothing reclassified). */
  classifyLegId: string | null;
}

export interface AmbiguousGroup {
  candidateIds: string[];
  reason: "multiple-candidates" | "resolved-role-conflict";
}

export interface PairingResult {
  accepted: AcceptedPair[];
  ambiguous: AmbiguousGroup[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Product rule, not a derived fact — see the design doc §Tier A/B. */
const TIER_A_WINDOW_DAYS = 3;
const TIER_B_WINDOW_DAYS = 1; // same calendar day, or the immediate next day

const TRANSFER_SHAPED_ROLES = new Set<EventRole>(["TRANSFER", "CARD_PAYMENT"]);

function isTransferShaped(c: PairingCandidate): boolean {
  return c.isTransfer || (c.eventRole != null && TRANSFER_SHAPED_ROLES.has(c.eventRole));
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DAY_MS;
}

interface Verdict {
  tierA: PairingCandidate[];
  tierB: PairingCandidate[];
  roleConflict: PairingCandidate[];
}

/**
 * The structural verdict for one candidate against the FULL candidate list
 * — deliberately ignoring any notion of "already claimed." Uniqueness must
 * be judged from the complete structure, not from whichever candidate a
 * single left-to-right pass happens to visit first: two credit legs that
 * could each plausibly match one debit leg are genuinely ambiguous
 * regardless of which of the two is processed first, and an accept
 * decision must not depend on that arbitrary ordering.
 */
function classify(candidate: PairingCandidate, all: readonly PairingCandidate[]): Verdict {
  const candidateShaped = isTransferShaped(candidate);
  const pool = all.filter(
    (other) =>
      other.id !== candidate.id &&
      other.accountId !== candidate.accountId &&
      other.amount === candidate.amount &&
      other.direction !== candidate.direction &&
      daysBetween(candidate.occurredAt, other.occurredAt) <= TIER_A_WINDOW_DAYS,
  );

  const tierA = candidateShaped ? pool.filter((other) => isTransferShaped(other)) : [];

  const withinB = pool.filter((other) => daysBetween(candidate.occurredAt, other.occurredAt) <= TIER_B_WINDOW_DAYS);
  const tierB: PairingCandidate[] = [];
  const roleConflict: PairingCandidate[] = [];
  for (const other of withinB) {
    const otherShaped = isTransferShaped(other);
    if (candidateShaped === otherShaped) continue; // need exactly one shaped side
    const unresolvedSide = candidateShaped ? other : candidate;
    (unresolvedSide.eventRole === null ? tierB : roleConflict).push(other);
  }

  return { tierA, tierB, roleConflict };
}

/**
 * Deterministic, order-independent matching. A pair is only accepted when
 * BOTH sides see each other as their unique eligible match — mutual, not
 * one-directional, uniqueness — so the result never depends on which
 * candidate a left-to-right pass happens to visit first. Re-running
 * against the same snapshot always produces the identical result.
 *
 * This determinism is NOT a concurrency guarantee across two concurrent
 * *processes* running their own passes; that safety comes entirely from
 * the store layer's per-pair row locking, not from anything here (see
 * sync-store.ts's applyAcceptedPair).
 */
export function findTransferPairs(candidates: readonly PairingCandidate[]): PairingResult {
  const sorted = [...candidates].sort((x, y) => {
    const t = new Date(x.occurredAt).getTime() - new Date(y.occurredAt).getTime();
    return t !== 0 ? t : x.id.localeCompare(y.id);
  });

  const claimed = new Set<string>();
  const flaggedAmbiguous = new Set<string>();
  const accepted: AcceptedPair[] = [];
  const ambiguous: AmbiguousGroup[] = [];

  for (const candidate of sorted) {
    if (claimed.has(candidate.id) || flaggedAmbiguous.has(candidate.id)) continue;

    const verdict = classify(candidate, sorted);
    const signalCount = verdict.tierA.length + verdict.tierB.length + verdict.roleConflict.length;
    if (signalCount === 0) continue; // no transfer signal anywhere -> Reject, not ambiguous

    if (verdict.tierA.length === 1 && verdict.tierB.length === 0 && verdict.roleConflict.length === 0) {
      const other = verdict.tierA[0];
      if (claimed.has(other.id)) continue; // already claimed by an earlier, unrelated accept
      const otherVerdict = classify(other, sorted);
      if (otherVerdict.tierA.length !== 1 || otherVerdict.tierA[0].id !== candidate.id) {
        ambiguous.push({ candidateIds: [candidate.id, other.id], reason: "multiple-candidates" });
        flaggedAmbiguous.add(candidate.id);
        flaggedAmbiguous.add(other.id);
        continue;
      }
      claimed.add(candidate.id);
      claimed.add(other.id);
      accepted.push({ tier: "A", legA: candidate.id, legB: other.id, classifyLegId: null });
      continue;
    }

    if (verdict.tierB.length === 1 && verdict.tierA.length === 0 && verdict.roleConflict.length === 0) {
      const other = verdict.tierB[0];
      if (claimed.has(other.id)) continue;
      const otherVerdict = classify(other, sorted);
      if (otherVerdict.tierB.length !== 1 || otherVerdict.tierB[0].id !== candidate.id) {
        ambiguous.push({ candidateIds: [candidate.id, other.id], reason: "multiple-candidates" });
        flaggedAmbiguous.add(candidate.id);
        flaggedAmbiguous.add(other.id);
        continue;
      }
      const candidateShaped = isTransferShaped(candidate);
      const unresolvedId = candidateShaped ? other.id : candidate.id;
      claimed.add(candidate.id);
      claimed.add(other.id);
      accepted.push({ tier: "B", legA: candidate.id, legB: other.id, classifyLegId: unresolvedId });
      continue;
    }

    // Signal exists but doesn't cleanly resolve to a unique A or B match —
    // multiple candidates on either tier, or a Tier-B shape whose
    // "unresolved" side actually already has a resolved role.
    const all = [...verdict.tierA, ...verdict.tierB, ...verdict.roleConflict];
    ambiguous.push({
      candidateIds: [candidate.id, ...all.map((p) => p.id)],
      reason: verdict.roleConflict.length > 0 && verdict.tierA.length === 0 && verdict.tierB.length === 0
        ? "resolved-role-conflict"
        : "multiple-candidates",
    });
    flaggedAmbiguous.add(candidate.id);
    for (const p of all) flaggedAmbiguous.add(p.id);
  }

  return { accepted, ambiguous };
}
