import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { byTestId, render, textContent, texts } from "../../test/render";
import type { CategorySettings, ManagedCategory } from "../../lib/categories/manage";
import { RowMenu } from "../kit/row-menu";
import { CategoriesView, type CategoryActions } from "./categories-view";

const ids = vi.hoisted(() => ({ newRequestId: vi.fn(() => "req-1") }));
vi.mock("../../lib/api/request-id", () => ids);

const cat = (over: Partial<ManagedCategory>): ManagedCategory => ({ id: "c1", name: "Food", kind: "expense", color: "#22c55e", archived: false, txnCount: 0, ...over });

const data: CategorySettings = {
  month: "2026-09",
  categories: [
    cat({ id: "food", name: "Food", txnCount: 3 }),
    cat({ id: "pay", name: "Paycheck", kind: "income", txnCount: 1 }),
    cat({ id: "old", name: "Old gym", archived: true }),
  ],
};

function actions(over: Partial<CategoryActions> = {}): CategoryActions {
  return {
    create: vi.fn(async () => ({ ok: true as const })),
    update: vi.fn(async () => ({ ok: true as const })),
    setArchived: vi.fn(async () => ({ ok: true as const })),
    openCategory: vi.fn(),
    ...over,
  };
}

const has = (r: ReturnType<typeof render>, id: string) => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === id).length > 0;
/** A row menu's items (the kebab measures itself on a device before it opens, which the test hosts can't). */
const menu = (r: ReturnType<typeof render>, id: string) => r.root.find((n) => n.type === RowMenu && n.props.testID === id).props.items as { label: string; onSelect: () => void }[];
const pick = async (r: ReturnType<typeof render>, id: string, label: string) => {
  await act(async () => {
    menu(r, id).find((i) => i.label === label)!.onSelect();
  });
};
const press = async (r: ReturnType<typeof render>, id: string) => {
  await act(async () => {
    byTestId(r, id).props.onPress();
  });
};

describe("Categories (web /settings/categories)", () => {
  it("lists Expense, Income and Archived with counts, and this month's line per row", () => {
    const r = render(<CategoriesView data={data} actions={actions()} onBack={() => {}} />);
    expect(texts(r)).toContain("Tap a category to see its transactions.");
    expect(has(r, "categories-expense") && has(r, "categories-income") && has(r, "categories-archived")).toBe(true);
    expect(byTestId(r, "category-food").props.accessibilityLabel).toBe("Food, 3 transactions this month");
    expect(byTestId(r, "category-old").props.accessibilityLabel).toBe("Old gym, Nothing this month");
  });

  it("opens the category's transactions this month", async () => {
    const a = actions();
    const r = render(<CategoriesView data={data} actions={a} onBack={() => {}} />);
    await press(r, "category-food");
    expect(a.openCategory).toHaveBeenCalledWith("food", "2026-09");
  });

  it("adds a category in the sheet, with one request id for every try", async () => {
    const create = vi.fn().mockResolvedValueOnce({ ok: false, fieldError: "Name is required" }).mockResolvedValueOnce({ ok: true });
    const a = actions({ create });
    const r = render(<CategoriesView data={data} actions={a} onBack={() => {}} />);
    expect(byTestId(r, "categories-add").props.accessibilityLabel).toBe("Add category");
    await press(r, "categories-add");
    expect(byTestId(r, "category-sheet").props.accessibilityLabel).toBe("Add category");
    await press(r, "category-save");
    expect(textContent(byTestId(r, "category-form-error"))).toBe("Name is required");
    act(() => byTestId(r, "category-name").props.onChangeText("Pets"));
    await press(r, "category-save");
    expect(create.mock.calls).toEqual([
      [{ name: "", kind: "expense", color: "#8b5cf6" }, "req-1"],
      [{ name: "Pets", kind: "expense", color: "#8b5cf6" }, "req-1"],
    ]);
    expect(ids.newRequestId).toHaveBeenCalledTimes(1);
    expect(has(r, "category-sheet")).toBe(false);
  });

  it("edits a category, keeping its colour", async () => {
    const a = actions();
    const r = render(<CategoriesView data={data} actions={a} onBack={() => {}} />);
    await pick(r, "category-menu-food", "Edit");
    expect(byTestId(r, "category-sheet").props.accessibilityLabel).toBe("Edit category");
    act(() => byTestId(r, "category-name").props.onChangeText("Groceries"));
    await press(r, "category-save");
    expect(a.update).toHaveBeenCalledWith("food", { name: "Groceries", kind: "expense", color: "#22c55e" });
  });

  it("archives and restores from the row menu (an archived one can't be edited), and says when it can't", async () => {
    const setArchived = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: "Your account is being deleted, so changes are paused." });
    const a = actions({ setArchived });
    const r = render(<CategoriesView data={data} actions={a} onBack={() => {}} />);
    await pick(r, "category-menu-food", "Archive");
    expect(setArchived).toHaveBeenCalledWith("food", true);
    expect(menu(r, "category-menu-old").map((i) => i.label)).toEqual(["Restore"]);
    expect(menu(r, "category-menu-food").map((i) => i.label)).toEqual(["Edit", "Archive"]);
    await pick(r, "category-menu-old", "Restore");
    expect(setArchived).toHaveBeenLastCalledWith("old", false);
    expect(textContent(byTestId(r, "categories-error"))).toBe("Your account is being deleted, so changes are paused.");
  });
});
