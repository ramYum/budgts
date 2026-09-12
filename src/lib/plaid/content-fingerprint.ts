/**
 * A content fingerprint over a raw Plaid transaction payload, excluding
 * `transaction_id` — an ANOMALY-DETECTION aid only, never a canonical
 * identity or dedupe key (design: 2026-09-12 duplicate-feed investigation,
 * "Phase 13" — content alone cannot prove two source records are the same
 * real-world event; it can only prove they are byte-identical in every
 * retained field except the id Plaid assigned them).
 *
 * Used solely to count suspiciously repetitive content per account and flag
 * the account for owner review. Never used to suppress, merge, delete, or
 * exclude a transaction from financial totals.
 */
import { createHash } from "node:crypto";

/** Deterministic JSON: object keys sorted at every nesting level. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, canonicalize(v)]));
  }
  return value;
}

export function computeContentFingerprint(raw: unknown): string {
  const clone: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : { value: raw };
  delete clone.transaction_id;
  const json = JSON.stringify(canonicalize(clone));
  return createHash("sha256").update(json).digest("hex");
}
