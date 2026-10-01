import { describe, expect, it } from "vitest";
import { planHeldRowRelease, type HeldRow } from "./held-rows";

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
