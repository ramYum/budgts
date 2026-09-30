import { describe, expect, it } from "vitest";
import { parseActivityExtras } from "./activity-api";

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  description: "SQ *BLUE BOTTLE",
  merchant_name: "Blue Bottle",
  merchant_entity_id: "m1",
  amount: 650,
  direction: "debit",
  occurred_at: "2026-09-16T12:00:00+00:00",
  account_name: "Everyday checking",
  pending: false,
  plaid_category_primary: "FOOD_AND_DRINK",
  suggested_category_id: null,
  ...over,
});

const body = (over: Record<string, unknown> = {}) => ({
  version: 1,
  plaidEnabled: true,
  needsCategory: [
    {
      key: "m1",
      label: "Blue Bottle",
      anchorId: "t2",
      count: 2,
      netAmount: 1300,
      plaidCategoryPrimary: "FOOD_AND_DRINK",
      suggestedCategoryId: "cat-dining",
      transactions: [row("t2"), row("t1", { occurred_at: "2026-09-10T12:00:00+00:00", pending: true })],
      somethingNew: 1,
    },
  ],
  missingStandardCategories: ["Travel"],
  limitedHistory: ["Chase sent 30 days of history."],
  ...over,
});

describe("parseActivityExtras (GET /api/mobile/activity)", () => {
  it("reads the groups, the standard categories to restore and the advisory, ignoring unknown fields", () => {
    const x = parseActivityExtras(body());
    expect(x.plaidEnabled).toBe(true);
    expect(x.needsCategory[0]).toMatchObject({ key: "m1", label: "Blue Bottle", anchorId: "t2", count: 2, netAmount: 1300, suggestedCategoryId: "cat-dining" });
    expect(x.needsCategory[0]!.transactions[1]).toEqual({
      id: "t1",
      description: "SQ *BLUE BOTTLE",
      amount: 650,
      direction: "debit",
      occurredAt: "2026-09-10T12:00:00+00:00",
      accountName: "Everyday checking",
      pending: true,
    });
    expect(x.missingStandardCategories).toEqual(["Travel"]);
    expect(x.limitedHistory).toEqual(["Chase sent 30 days of history."]);
  });

  it("accepts bank connections switched off (nothing to show)", () => {
    expect(parseActivityExtras(body({ plaidEnabled: false, needsCategory: [], missingStandardCategories: [], limitedHistory: [] }))).toEqual({
      plaidEnabled: false,
      needsCategory: [],
      missingStandardCategories: [],
      limitedHistory: [],
    });
  });

  it.each([
    ["a fractional net", { needsCategory: [{ ...body().needsCategory[0], netAmount: 12.5 }] }],
    ["a group with no rows", { needsCategory: [{ ...body().needsCategory[0], transactions: [] }] }],
    ["a missing advisory list", { limitedHistory: undefined }],
  ])("rejects %s", (_n, over) => {
    expect(() => parseActivityExtras(body(over))).toThrow();
  });
});
