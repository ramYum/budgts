import type { BudgetEffect, Direction } from "./types";
import type { EventRole } from "@/lib/plaid/types";

/**
 * Resolves a transaction's Budget Effect from its Event Role and (already
 * sign-corrected) direction. Pure, deterministic, no I/O, not persisted —
 * design: docs/specs/2026-09-12-budget-effect-design.md §1, §3.
 * Answers "what kind of event is this," never "does it count right now"
 * (that split belongs to qualify.ts, untouched here — §4).
 */
export function budgetEffectOf(eventRole: EventRole | null, direction: Direction): BudgetEffect | null {
  if (eventRole === null) {
    return null;
  }

  switch (eventRole) {
    case "PURCHASE":
      return "EXPENSE";
    case "REFUND":
      // Distinct from EXPENSE — a refund reverses prior spend rather than
      // creating new spend (spec §7).
      return "EXPENSE_REVERSAL";
    case "INCOME":
      return "INCOME";
    case "CARD_PAYMENT":
      return "NONE";
    case "TRANSFER":
      return "NONE";
    case "FEE":
      return "EXPENSE";
    case "INTEREST":
      // Correct only because event-role.ts assigns INTEREST exclusively
      // from interest *charged*, never interest *earned* (design:
      // 2026-09-12 Budget Effect §3) — an earned-interest signal would
      // need INCOME here instead.
      return "EXPENSE";
    case "P2P_PAYMENT":
      return direction === "credit" ? "INCOME" : "EXPENSE";
    case "CASH_ADVANCE":
      return "NONE";
    case "ADJUSTMENT":
      return "UNKNOWN";
  }
}
