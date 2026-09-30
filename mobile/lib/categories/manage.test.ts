import { describe, expect, it } from "vitest";
import { CATEGORY_COLORS } from "../../../src/lib/categories/options";
import {
  LOCKED_MESSAGE,
  NEW_CATEGORY_COLOR,
  categoryGroups,
  createBody,
  monthCountLine,
  parseCategorySettings,
  writeCategory,
  type ManagedCategory,
} from "./manage";

const cat = (over: Partial<ManagedCategory>): ManagedCategory => ({ id: "c1", name: "Food", kind: "expense", color: "#8b5cf6", archived: false, txnCount: 0, ...over });

describe("parseCategorySettings", () => {
  it("reads GET /api/mobile/settings/categories", () => {
    const body = { version: 1, month: "2026-09", categories: [{ id: "a", name: "Food", kind: "expense", color: "#8b5cf6", archived: false, txnCount: 3 }] };
    expect(parseCategorySettings(body)).toEqual({ month: "2026-09", categories: [cat({ id: "a", txnCount: 3 })] });
  });

  it("refuses what it can't show truthfully", () => {
    expect(() => parseCategorySettings({ version: 2, month: "2026-09", categories: [] })).toThrow();
    expect(() => parseCategorySettings({ version: 1, month: "Sept", categories: [] })).toThrow();
    expect(() => parseCategorySettings({ version: 1, month: "2026-09", categories: [{ id: "a", name: "x", kind: "gift", color: "#000", archived: false, txnCount: 0 }] })).toThrow();
  });
});

describe("the web page's groups and lines", () => {
  it("groups active expense, active income, then archived, leaving empty groups out", () => {
    const groups = categoryGroups([cat({ id: "1" }), cat({ id: "2", kind: "income", archived: true }), cat({ id: "3" })]);
    expect(groups.map((g) => [g.title, g.list.map((c) => c.id)])).toEqual([
      ["Expense", ["1", "3"]],
      ["Archived", ["2"]],
    ]);
  });

  it("counts this month's transactions", () => {
    expect(monthCountLine(0)).toBe("Nothing this month");
    expect(monthCountLine(1)).toBe("1 transaction this month");
    expect(monthCountLine(12)).toBe("12 transactions this month");
  });

  it("gives a new category the web's first palette colour, and says the web's locked message", () => {
    expect(NEW_CATEGORY_COLOR).toBe(CATEGORY_COLORS[0]);
    expect(LOCKED_MESSAGE).toBe("Your account is being deleted, so changes are paused."); // src/lib/ownership.ts
    expect(createBody({ name: "Pets", kind: "expense", color: NEW_CATEGORY_COLOR }, "id-1")).toEqual({ name: "Pets", kind: "expense", color: "#8b5cf6", requestId: "id-1" });
  });
});

describe("writeCategory", () => {
  const answering = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

  it("reads each answer as the web's form says it", async () => {
    expect(await writeCategory(answering(200, { ok: true }))).toEqual({ ok: true });
    expect(await writeCategory(answering(422, { error: "invalid", fieldErrors: { name: "Name is required" } }))).toEqual({ ok: false, fieldError: "Name is required" });
    expect(await writeCategory(answering(404, { error: "not_found" }))).toEqual({ ok: false, error: "That category no longer exists. Refresh and try again." });
    expect(await writeCategory(answering(423, { error: "account_locked" }))).toEqual({ ok: false, error: LOCKED_MESSAGE });
    expect(await writeCategory(answering(503, { error: "unavailable" }))).toEqual({ ok: false, error: "Couldn't save the category. Try again." });
    expect(
      await writeCategory(async () => {
        throw new TypeError("Network request failed");
      }),
    ).toEqual({ ok: false, error: "Couldn't reach Budgts. Check your connection and try again." });
  });
});
