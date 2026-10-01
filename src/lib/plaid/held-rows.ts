import { resolveEventRole } from "./event-role";
import { directionFromRaw } from "./sign-convention";
import type { EventRole } from "./types";

/** A row held as `pending_review` / `sign_convention_unknown`, with the fields its release depends on. */
export interface HeldRow {
  id: string;
  /** As landed while the account was unknown: read from the raw sign as if the feed were standard. */
  direction: "debit" | "credit";
  primary: string | null;
  detailed: string | null;
  isTransfer: boolean;
}

export interface HeldRowRelease {
  id: string;
  direction: "debit" | "credit";
  eventRole: EventRole | null;
}

/**
 * What each held row becomes once its account's convention is known: the direction flipped for an inverted feed,
 * and the event role recomputed from the corrected direction and the account's type by the same resolver the live
 * adapter uses (event_role is direction-dependent: PURCHASE/REFUND, and a card's incoming payment). Pure. The one
 * implementation behind `finalizeSignConvention` and the remediation tool (tools/card-payment-remediation.ts).
 */
export function planHeldRowRelease(
  rows: readonly HeldRow[],
  convention: "standard" | "inverted",
  accountType: string | null,
): HeldRowRelease[] {
  return rows.map((row) => {
    const direction = convention === "inverted" ? (row.direction === "debit" ? "credit" : "debit") : row.direction;
    const eventRole = resolveEventRole({
      primary: row.primary,
      detailed: row.detailed,
      isTransfer: row.isTransfer,
      direction,
      accountType,
    });
    return { id: row.id, direction, eventRole };
  });
}

/** A row on an account whose convention is being changed, with what its re-evaluation depends on. */
export interface ConventionChangeRow extends HeldRow {
  /** The immutable Plaid payload amount (`raw.amount`); null when absent or not a number. */
  rawAmount: number | null;
}

/**
 * The rows a "Change answer" re-evaluates when an account's convention flips from `from` to `to` (design:
 * 2026-10-01 card payments §5a). Only rows whose stored direction is exactly what `from` derives from the raw sign:
 * those directions came from the convention being changed. A row whose direction disagrees was set some other way
 * (the user's own edit, or a row that landed before conventions existed) and is left alone, as is a row without a
 * usable raw amount. Each changed row gets the direction `to` derives and its event role recomputed by the live
 * resolver. Pure; returns only rows that change.
 */
export function planConventionChange(
  rows: readonly ConventionChangeRow[],
  from: "standard" | "inverted",
  to: "standard" | "inverted",
  accountType: string | null,
): HeldRowRelease[] {
  if (from === to) return [];
  const out: HeldRowRelease[] = [];
  for (const row of rows) {
    if (row.rawAmount == null || !Number.isFinite(row.rawAmount) || row.rawAmount === 0) continue;
    if (row.direction !== directionFromRaw(row.rawAmount, from)) continue;
    const direction = directionFromRaw(row.rawAmount, to);
    const eventRole = resolveEventRole({
      primary: row.primary,
      detailed: row.detailed,
      isTransfer: row.isTransfer,
      direction,
      accountType,
    });
    out.push({ id: row.id, direction, eventRole });
  }
  return out;
}
