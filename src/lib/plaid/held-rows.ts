import { resolveEventRole } from "./event-role";
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
