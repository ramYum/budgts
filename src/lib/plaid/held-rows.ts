import { resolveEventRole } from "./event-role";
import { directionFromRaw } from "./sign-convention";
import type { EventRole } from "./types";

/** A row held as `pending_review` / `sign_convention_unknown`, with the fields its release depends on. */
export interface HeldRow {
  id: string;
  /** As stored: the landed reading of the raw sign as if the feed were standard, unless the user edited it since. */
  direction: "debit" | "credit";
  primary: string | null;
  detailed: string | null;
  isTransfer: boolean;
  /** The immutable Plaid payload amount (`raw.amount`); null when absent or not a number. */
  rawAmount: number | null;
}

export interface HeldRowRelease {
  id: string;
  direction: "debit" | "credit";
  eventRole: EventRole | null;
}

/** A usable raw sign: a finite, nonzero number. */
export const usableRawAmount = (raw: number | null | undefined): raw is number =>
  typeof raw === "number" && Number.isFinite(raw) && raw !== 0;

/**
 * What each held row becomes once its account's convention is known, with the event role recomputed from the result
 * and the account's type by the same resolver the live adapter uses (event_role is direction-dependent:
 * PURCHASE/REFUND, and a card's incoming payment). Pure. The one implementation behind `finalizeSignConvention` (§5 and
 * the sync's own verdict), the removed-bank answer (§5c), reconnect adoption into a resolved account, and the
 * remediation tool (tools/card-payment-remediation.ts).
 *
 * The direction is re-derived from the raw sign only while the stored direction is still the landed reading
 * (`directionFromRaw(raw, 'standard')`, how a held row lands). A row whose direction differs was edited by the user, and
 * a row without a usable raw amount can't be told apart from an edited one: both keep their direction, and only their
 * role is recomputed (the same guard `planConventionChange` uses).
 */
export function planHeldRowRelease(
  rows: readonly HeldRow[],
  convention: "standard" | "inverted",
  accountType: string | null,
): HeldRowRelease[] {
  return rows.map((row) => {
    const landed = usableRawAmount(row.rawAmount) && row.direction === directionFromRaw(row.rawAmount, "standard");
    const direction = landed ? directionFromRaw(row.rawAmount as number, convention) : row.direction;
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

/**
 * The held row to ask "Was this money going out or coming in?" about (§5, §5c): the most recent one, ties by id, among
 * rows whose raw sign is usable, since an answer about a row without one can't set a direction and the server refuses
 * it. If none is usable, the most recent row. That case is unreachable from Plaid (the adapter skips zero amounts, Plaid
 * always sends a number, and `transactions.amount > 0` is a CHECK), so no rule beyond this is needed. Pure.
 */
export function pickQuestionSample<T extends { id: string; occurredAt: string; rawAmount: number | null }>(rows: readonly T[]): T | null {
  let best: T | null = null;
  const better = (a: T, b: T) => {
    const ua = usableRawAmount(a.rawAmount);
    const ub = usableRawAmount(b.rawAmount);
    if (ua !== ub) return ua;
    const ta = Date.parse(a.occurredAt);
    const tb = Date.parse(b.occurredAt);
    if (ta !== tb) return ta > tb;
    return a.id < b.id;
  };
  for (const r of rows) if (!best || better(r, best)) best = r;
  return best;
}

/** A row on an account whose convention is being changed, with what its re-evaluation depends on. */
export type ConventionChangeRow = HeldRow;

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
    if (!usableRawAmount(row.rawAmount)) continue;
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
