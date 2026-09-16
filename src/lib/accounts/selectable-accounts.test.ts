import { describe, expect, it } from "vitest";
import { selectableAccounts } from "./selectable-accounts";

describe("selectableAccounts", () => {
  it("keeps a manual account regardless of the live-linked set", () => {
    const result = selectableAccounts([{ id: "a1", name: "Cash", source: "manual" }], new Set());
    expect(result).toEqual([{ id: "a1", name: "Cash" }]);
  });

  it("keeps a plaid account that is currently live-linked", () => {
    const result = selectableAccounts(
      [{ id: "a1", name: "Chase Checking", source: "plaid" }],
      new Set(["a1"]),
    );
    expect(result).toEqual([{ id: "a1", name: "Chase Checking" }]);
  });

  it("drops a plaid account that is no longer live-linked (disconnected)", () => {
    const result = selectableAccounts(
      [{ id: "a1", name: "Chase Checking", source: "plaid" }],
      new Set(),
    );
    expect(result).toEqual([]);
  });

  it("drops an orphaned duplicate from a reconnect, keeping only the live one", () => {
    const result = selectableAccounts(
      [
        { id: "old", name: "Chase Checking", source: "plaid" },
        { id: "new", name: "Chase Checking", source: "plaid" },
      ],
      new Set(["new"]),
    );
    expect(result).toEqual([{ id: "new", name: "Chase Checking" }]);
  });

  it("mixes manual and live-linked plaid accounts, dropping only disconnected ones", () => {
    const result = selectableAccounts(
      [
        { id: "cash", name: "Cash", source: "manual" },
        { id: "live", name: "SoFi", source: "plaid" },
        { id: "gone", name: "Old Advancial", source: "plaid" },
      ],
      new Set(["live"]),
    );
    expect(result).toEqual([
      { id: "cash", name: "Cash" },
      { id: "live", name: "SoFi" },
    ]);
  });

  it("returns an empty list for an empty input", () => {
    expect(selectableAccounts([], new Set())).toEqual([]);
  });
});
