import { describe, expect, it } from "vitest";
import { planConventionChange, planHeldRowRelease, type HeldRow } from "./held-rows";
import { directionFromRaw } from "./sign-convention";

const row = (over: Partial<HeldRow> = {}): HeldRow => ({
  id: "r1",
  direction: "debit",
  primary: "FOOD_AND_DRINK",
  detailed: "FOOD_AND_DRINK_RESTAURANT",
  isTransfer: false,
  ...over,
});

describe("planHeldRowRelease", () => {
  it("keeps direction on a standard feed and resolves the role", () => {
    expect(planHeldRowRelease([row()], "standard", "depository")).toEqual([{ id: "r1", direction: "debit", eventRole: "PURCHASE" }]);
  });

  it("flips direction on an inverted feed and re-resolves the direction-dependent role", () => {
    expect(planHeldRowRelease([row({ direction: "credit" })], "inverted", "depository")).toEqual([
      { id: "r1", direction: "debit", eventRole: "PURCHASE" },
    ]);
  });

  it("an inverted card's held payment becomes a CARD_PAYMENT", () => {
    const payment = row({ primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_OTHER_PAYMENT", direction: "debit" });
    expect(planHeldRowRelease([payment], "inverted", "credit")).toEqual([{ id: "r1", direction: "credit", eventRole: "CARD_PAYMENT" }]);
  });

  it("leaves a transfer a TRANSFER either way", () => {
    const t = row({ primary: "TRANSFER_IN", detailed: null, isTransfer: true, direction: "credit" });
    expect(planHeldRowRelease([t], "inverted", "depository")[0].eventRole).toBe("TRANSFER");
  });
});

describe("planConventionChange (Change answer, design: 2026-10-01 card payments §5a)", () => {
  const purchase = { id: "p", direction: "credit" as const, primary: "FOOD_AND_DRINK", detailed: null, isTransfer: false, rawAmount: 12 };

  it("a wrong 'inverted' corrected to 'standard' turns a purchase stored as a refund back into a PURCHASE", () => {
    expect(planConventionChange([purchase], "inverted", "standard", "depository")).toEqual([
      { id: "p", direction: "debit", eventRole: "PURCHASE" },
    ]);
  });

  it("a card payment follows the corrected direction (CARD_PAYMENT only when money comes in to the card)", () => {
    const pay = { id: "c", direction: "debit" as const, primary: "LOAN_PAYMENTS", detailed: "LOAN_PAYMENTS_OTHER_PAYMENT", isTransfer: false, rawAmount: -50 };
    expect(planConventionChange([pay], "inverted", "standard", "credit")).toEqual([{ id: "c", direction: "credit", eventRole: "CARD_PAYMENT" }]);
  });

  it("leaves a row whose direction the convention did not set (a user edit, or a pre-convention row)", () => {
    const edited = { ...purchase, direction: "debit" as const }; // raw 12 under inverted would be credit
    expect(planConventionChange([edited], "inverted", "standard", "depository")).toEqual([]);
  });

  it("leaves a row without a usable raw amount", () => {
    expect(planConventionChange([{ ...purchase, rawAmount: null }, { ...purchase, id: "z", rawAmount: 0 }], "inverted", "standard", null)).toEqual([]);
  });

  it("changes nothing when the convention does not change", () => {
    expect(planConventionChange([purchase], "inverted", "inverted", null)).toEqual([]);
  });
});

describe("directionFromRaw", () => {
  it.each([
    [5, "standard", "debit"],
    [-5, "standard", "credit"],
    [5, "inverted", "credit"],
    [-5, "inverted", "debit"],
  ] as const)("raw %s under %s → %s", (raw, conv, dir) => {
    expect(directionFromRaw(raw, conv)).toBe(dir);
  });
});
