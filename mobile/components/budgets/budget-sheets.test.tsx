import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { MobileBudgetCategory } from "../../lib/budgets/budgets-api";
import { ROLE } from "../../lib/brand/shared";
import { byTestId, flat, render, textContent, texts } from "../../test/render";
import { ProgressBar } from "../kit/progress-bar";
import { Select } from "../kit/select";
import { CategorySheet, NewBudgetSheet, toInput } from "./budget-sheets";

const bar = (over: Partial<MobileBudgetCategory> = {}): MobileBudgetCategory => ({
  id: "dining",
  name: "Dining",
  color: "#f00",
  budget: 10000,
  actual: 13000,
  remaining: -3000,
  pctUsed: 130,
  state: "over",
  previousActual: 10000,
  ...over,
});

function sheet(over: Partial<Parameters<typeof CategorySheet>[0]> = {}) {
  const props: Parameters<typeof CategorySheet>[0] = {
    bar: bar(),
    currency: "USD",
    startEditing: false,
    onSave: vi.fn(async () => null),
    onSeeTransactions: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  return { r: render(<CategorySheet {...props} />), props };
}

const has = (r: ReturnType<typeof render>, id: string) => r.root.findAll((n) => n.props.testID === id).length > 0;

describe("the category sheet (web budgets-view.tsx CategoryDetail)", () => {
  it("shows spent of budget, the cells, what's over and the change against last month", () => {
    const { r } = sheet();
    expect(byTestId(r, "sheet").props.accessibilityLabel).toBe("Dining");
    expect(textContent(byTestId(r, "budget-sheet-spent"))).toBe("$130.00");
    expect(texts(byTestId(r, "sheet"))).toContain("of $100.00 budget");
    expect(r.root.findByType(ProgressBar).props).toMatchObject({ pct: 130, tone: "over" });
    expect(texts(byTestId(r, "budget-sheet-figures"))).toEqual(["Over by", "$30.00", "vs. last month", "↑ 30%"]);
    expect(flat(byTestId(r, "budget-sheet-remaining").props.style).color).toBe(ROLE.neg);
    expect(flat(byTestId(r, "budget-sheet-trend-value").props.style).color).toBe(ROLE.neg);
  });

  it("reads Remaining in ink and a fall in green", () => {
    const { r } = sheet({ bar: bar({ actual: 7500, remaining: 2500, pctUsed: 75, state: "under" }) });
    expect(texts(byTestId(r, "budget-sheet-figures"))).toEqual(["Remaining", "$25.00", "vs. last month", "↓ 25%"]);
    expect(flat(byTestId(r, "budget-sheet-remaining").props.style).color).toBe(ROLE.ink);
    expect(flat(byTestId(r, "budget-sheet-trend-value").props.style).color).toBe(ROLE.pos);
  });

  it("leaves the trend out without last month's spending, and says No budget without a plan", () => {
    const { r } = sheet({ bar: bar({ budget: 0, remaining: -13000, pctUsed: 0, previousActual: 0 }) });
    expect(has(r, "budget-sheet-trend")).toBe(false);
    expect(texts(byTestId(r, "sheet"))).toContain("no budget set");
    expect(texts(byTestId(r, "budget-sheet-figures"))).toEqual(["Over by", "No budget"]);
    expect(flat(byTestId(r, "budget-sheet-remaining").props.style).color).toBe(ROLE.ink);
  });

  it("goes to the category's transactions", () => {
    const { r, props } = sheet();
    byTestId(r, "budget-sheet-transactions").props.onPress();
    expect(props.onSeeTransactions).toHaveBeenCalled();
  });

  it("changes the budget in place: prefilled, saved, then back to the buttons", async () => {
    const { r, props } = sheet();
    expect(has(r, "budget-amount")).toBe(false);
    act(() => byTestId(r, "budget-sheet-change").props.onPress());
    expect(byTestId(r, "budget-amount").props.value).toBe("100.00");
    act(() => byTestId(r, "budget-amount").props.onChangeText("150"));
    await act(async () => byTestId(r, "budget-save").props.onPress());
    expect(props.onSave).toHaveBeenCalledWith("dining", "150");
    expect(has(r, "budget-amount")).toBe(false);
    expect(has(r, "budget-sheet-change")).toBe(true);
  });

  it("clears with an empty field, and keeps the form with the server's message on a failure", async () => {
    const onSave = vi.fn(async () => "Enter an amount of 0 or more");
    const { r } = sheet({ startEditing: true, onSave });
    act(() => byTestId(r, "budget-amount").props.onChangeText(""));
    await act(async () => byTestId(r, "budget-save").props.onPress());
    expect(onSave).toHaveBeenCalledWith("dining", "0");
    expect(textContent(byTestId(r, "budget-amount-error"))).toBe("Enter an amount of 0 or more");
    expect(has(r, "budget-amount")).toBe(true);
  });

  it("prefills the way the web does", () => {
    expect(toInput(0)).toBe("");
    expect(toInput(40000)).toBe("400.00");
    expect(toInput(12345)).toBe("123.45");
  });
});

describe("New budget (web budgets-view.tsx AddBudget)", () => {
  it("says so when every expense category has a budget", () => {
    const r = render(<NewBudgetSheet categories={[]} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(texts(byTestId(r, "sheet"))).toContain("Every expense category already has a budget.");
  });

  it("picks a category (the first by default), saves its amount and closes", async () => {
    const onSave = vi.fn(async () => null);
    const onClose = vi.fn();
    const cats = [
      { id: "a", name: "Dining" },
      { id: "b", name: "Travel" },
    ];
    const r = render(<NewBudgetSheet categories={cats} onSave={onSave} onClose={onClose} />);
    expect(r.root.findByType(Select).props.value).toBe("a");
    expect(r.root.findAll((n) => n.props.accessibilityLabel === "Category, Dining").length).toBeGreaterThan(0);
    act(() => byTestId(r, "budget-amount").props.onChangeText("75"));
    await act(async () => byTestId(r, "budget-save").props.onPress());
    expect(onSave).toHaveBeenCalledWith("a", "75");
    expect(onClose).toHaveBeenCalled();
  });
});
