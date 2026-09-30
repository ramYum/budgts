import { describe, expect, it } from "vitest";
import { parseOverview } from "./overview-api";

const account = (over: Record<string, unknown> = {}) => ({ id: "a1", name: "Everyday checking", type: "checking", is_archived: false, mask: null, txnCount: 3, ...over });

describe("parseOverview (GET /api/mobile/accounts/overview)", () => {
  it("reads bank groups with their state, the by-hand group without one, and archived", () => {
    const data = parseOverview({
      version: 1,
      month: "2026-09",
      groups: [
        { key: "item-1", title: "Linked · First Platypus Bank", status: "attention", accounts: [account({ id: "a2", mask: "0000", extra: 1 })] },
        { key: "by-hand", title: "Added by hand", accounts: [account()] },
      ],
      archived: [account({ id: "a3", is_archived: true, txnCount: 0 })],
    });
    expect(data.groups.map((g) => [g.title, g.status])).toEqual([
      ["Linked · First Platypus Bank", "attention"],
      ["Added by hand", null],
    ]);
    expect(data.groups[0]!.accounts[0]).toEqual({ id: "a2", name: "Everyday checking", type: "checking", isArchived: false, mask: "0000", txnCount: 3 });
    expect(data.archived[0]!.isArchived).toBe(true);
  });

  it.each([
    ["an unknown bank state", { groups: [{ key: "k", title: "t", status: "mystery", accounts: [] }] }],
    ["a fractional count", { groups: [{ key: "k", title: "t", accounts: [account({ txnCount: 1.5 })] }] }],
    ["no archived list", { archived: undefined }],
  ])("rejects %s", (_name, over) => {
    expect(() => parseOverview({ version: 1, month: "2026-09", groups: [], archived: [], ...over })).toThrow();
  });
});
