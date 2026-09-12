import { describe, expect, it } from "vitest";
import { groupUncategorized, type UncategorizedTxn } from "./group-uncategorized";

function txn(over: Partial<UncategorizedTxn> = {}): UncategorizedTxn {
  return {
    id: "id-1",
    description: "SQ *BLUE BOTTLE",
    merchant_name: "Blue Bottle Coffee",
    merchant_entity_id: "ent-blue-bottle",
    amount: 650,
    direction: "debit",
    occurred_at: "2026-09-07T12:00:00.000Z",
    account_name: "Checking",
    pending: false,
    plaid_category_primary: null,
    suggested_category_id: null,
    ...over,
  };
}

describe("groupUncategorized", () => {
  it("groups transactions sharing the same merchant_entity_id", () => {
    const groups = groupUncategorized([
      txn({ id: "a", amount: 650 }),
      txn({ id: "b", amount: 500 }),
      txn({ id: "c", merchant_entity_id: "ent-other", merchant_name: "Other Shop", amount: 1000 }),
    ]);

    expect(groups).toHaveLength(2);
    const blueBottle = groups.find((g) => g.key === "ent-blue-bottle")!;
    expect(blueBottle.count).toBe(2);
    expect(blueBottle.label).toBe("Blue Bottle Coffee");
    expect(blueBottle.transactions.map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("falls back to a description-based key when merchant_entity_id is missing", () => {
    const groups = groupUncategorized([
      txn({ id: "a", merchant_entity_id: null, merchant_name: null, description: "Corner Diner" }),
      txn({ id: "b", merchant_entity_id: null, merchant_name: null, description: "Corner Diner" }),
      txn({ id: "c", merchant_entity_id: null, merchant_name: null, description: "Some Other Shop" }),
    ]);

    expect(groups).toHaveLength(2);
    const diner = groups.find((g) => g.label === "Corner Diner")!;
    expect(diner.count).toBe(2);
  });

  it("never merges two different merchant_entity_ids even with the same display name", () => {
    const groups = groupUncategorized([
      txn({ id: "a", merchant_entity_id: "ent-1", merchant_name: "Chain Store" }),
      txn({ id: "b", merchant_entity_id: "ent-2", merchant_name: "Chain Store" }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("computes a net amount (debits add, credits subtract)", () => {
    const groups = groupUncategorized([
      txn({ id: "a", direction: "debit", amount: 1000 }),
      txn({ id: "b", direction: "credit", amount: 300 }),
    ]);

    expect(groups[0].netAmount).toBe(700);
  });

  it("picks the most recently occurred transaction as the anchor for the categorize action", () => {
    const groups = groupUncategorized([
      txn({ id: "old", occurred_at: "2026-09-01T00:00:00.000Z" }),
      txn({ id: "new", occurred_at: "2026-09-10T00:00:00.000Z" }),
    ]);

    expect(groups[0].anchorId).toBe("new");
  });

  it("carries the suggested category id from the group's transactions", () => {
    const groups = groupUncategorized([
      txn({ id: "a", suggested_category_id: "cat-food" }),
      txn({ id: "b", suggested_category_id: "cat-food" }),
    ]);

    expect(groups[0].suggestedCategoryId).toBe("cat-food");
  });

  it("sorts groups by transaction count (descending), then by most recent activity", () => {
    const groups = groupUncategorized([
      txn({ id: "a1", merchant_entity_id: "ent-a", merchant_name: "A", occurred_at: "2026-09-01T00:00:00.000Z" }),
      txn({ id: "b1", merchant_entity_id: "ent-b", merchant_name: "B", occurred_at: "2026-09-09T00:00:00.000Z" }),
      txn({ id: "b2", merchant_entity_id: "ent-b", merchant_name: "B", occurred_at: "2026-09-08T00:00:00.000Z" }),
      txn({ id: "b3", merchant_entity_id: "ent-b", merchant_name: "B", occurred_at: "2026-09-07T00:00:00.000Z" }),
    ]);

    expect(groups.map((g) => g.label)).toEqual(["B", "A"]);
  });

  it("sorts transactions within a group newest first", () => {
    const groups = groupUncategorized([
      txn({ id: "old", occurred_at: "2026-09-01T00:00:00.000Z" }),
      txn({ id: "new", occurred_at: "2026-09-10T00:00:00.000Z" }),
    ]);

    expect(groups[0].transactions.map((t) => t.id)).toEqual(["new", "old"]);
  });

  it("returns an empty array for no input", () => {
    expect(groupUncategorized([])).toEqual([]);
  });
});
