import { describe, expect, it, vi } from "vitest";
import type { MobileBudgetCategory, MobileBudgetsAllTime, MobileBudgetsMonth } from "../../lib/budgets/budgets-api";
import { ROLE } from "../../lib/brand/shared";
import { byTestId, flat, render, textContent, texts } from "../../test/render";
import { EmptyState } from "../kit/empty-state";
import { MonthNav } from "../kit/month-nav";
import { PageHeader } from "../kit/page-header";
import { ProgressBar } from "../kit/progress-bar";
import { SegmentedControl } from "../kit/segmented-control";
import { Reveal } from "../motion/reveal";
import { Button } from "../brand/controls";
import { BudgetRow, BudgetsView } from "./budgets-view";

const cat = (over: Partial<MobileBudgetCategory> = {}): MobileBudgetCategory => ({
  id: "groceries",
  name: "Groceries",
  color: "#0f0",
  budget: 40000,
  actual: 12000,
  remaining: 28000,
  pctUsed: 30,
  state: "under",
  previousActual: 0,
  ...over,
});

const monthData = (over: Partial<MobileBudgetsMonth> = {}): MobileBudgetsMonth => ({
  range: "month",
  month: "2026-09",
  currency: "USD",
  budgeted: 60000,
  spent: 45000,
  leftToSpend: 15000,
  spentPct: 75,
  tone: "under",
  suggestion: null,
  categories: [
    cat(),
    cat({ id: "dining", name: "Dining", budget: 10000, actual: 13000, remaining: -3000, pctUsed: 130, state: "over" }),
    cat({ id: "fun", name: "Entertainment", budget: 0, actual: 5000, remaining: -5000, pctUsed: 0, state: "over" }),
    cat({ id: "car", name: "Transportation", budget: 0, actual: 0, remaining: 0, pctUsed: 0, state: "under" }),
  ],
  unbudgetedCategories: [],
  ...over,
});

const allTime: MobileBudgetsAllTime = {
  range: "all",
  month: "2026-09",
  currency: "USD",
  allTime: [
    { categoryId: "groceries", name: "Groceries", color: "#0f0", total: 123456 },
    { categoryId: "dining", name: "Dining", color: "#f00", total: 5000 },
  ],
};

/** Every host carrying `id`, in tree order (repeated ids are numbered by the parity capture the same way). */
const all = (r: ReturnType<typeof render>, id: string) => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === id);
const button = (r: ReturnType<typeof render>, label: string) => r.root.findAll((n) => n.type === Button && n.props.children === label)[0]!;

function view(over: Partial<Parameters<typeof BudgetsView>[0]> = {}) {
  const props: Parameters<typeof BudgetsView>[0] = {
    month: "2026-09",
    range: "month",
    data: monthData(),
    onMonth: vi.fn(),
    onRange: vi.fn(),
    onOpen: vi.fn(),
    onNew: vi.fn(),
    copy: { pending: false, error: null, onCopy: vi.fn() },
    ...over,
  };
  return { r: render(<BudgetsView {...props} />), props };
}

describe("Budgets (web budgets-view.tsx)", () => {
  it("heads the page like the web: title, month, New, This month / All time, Copy last month", () => {
    const { r } = view();
    expect(r.root.findByType(PageHeader).props.title).toBe("Budgets");
    expect(texts(r.root.findByType(MonthNav))).toContain("September 2026");
    expect(button(r, "New").props.accessibilityLabel).toBe("New budget");
    const range = r.root.findByType(SegmentedControl);
    expect(range.props.value).toBe("month");
    expect(texts(range)).toEqual(["This month", "All time"]);
    expect(texts(byTestId(r, "budgets-copy"))).toEqual(["Copy last month"]);
  });

  it("leads with the server's Remaining, spent of budgeted, and 12px cells at the server's share and tone", () => {
    const { r } = view();
    expect(textContent(byTestId(r, "budgets-remaining"))).toBe("$150.00");
    expect(textContent(byTestId(r, "budgets-hero"))).toContain("$450.00 spent of $600.00 budgeted");
    const bar = byTestId(r, "budgets-hero").findByType(ProgressBar);
    expect(bar.props).toMatchObject({ pct: 75, tone: "under", cellHeight: 12 });
  });

  it("prints a negative Remaining in red and steps a long figure down a size", () => {
    const { r } = view({ data: monthData({ leftToSpend: -2500, tone: "over" }) });
    expect(flat(byTestId(r, "budgets-remaining").props.style).color).toBe(ROLE.neg);
  });

  it("gives each category a card whose cells cascade two steps apart, rising in after the hero", () => {
    const { r } = view();
    const bars = r.root.findAllByType(BudgetRow).map((row) => row.findByType(ProgressBar));
    expect(bars.map((b) => [b.props.pct, b.props.tone, b.props.start])).toEqual([
      [30, "under", 0],
      [130, "over", 2],
      [0, "over", 4],
      [0, "under", 6],
    ]);
    expect(r.root.findAllByType(Reveal).map((n) => n.props.i)).toEqual([1, 2, 3, 4, 5]);
  });

  it("says what's left, what's over, and what has no plan, in the web's words", () => {
    const { r } = view();
    expect(all(r, "budget-card").map((c) => texts(c))).toEqual([
      ["Groceries", "$120.00", "$280.00", " left", "of $400.00"],
      ["Dining", "$130.00", "Over by $30.00", "of $100.00"],
      ["Entertainment", "$50.00", "No budget, all unplanned", "Set budget"],
      ["Transportation", "$0.00", "No budget set", "Set budget"],
    ]);
  });

  it("opens a category from its card", () => {
    const { r, props } = view();
    all(r, "budget-card")[1]!.props.onPress();
    expect(props.onOpen).toHaveBeenCalledWith("dining", false);
  });

  it("shows the unplanned note with a Set budget button, and nothing for a mover", () => {
    const suggestion = { kind: "unbudgeted" as const, categoryId: "fun", name: "Entertainment", amount: 5000, share: 11 };
    const { r, props } = view({ data: monthData({ suggestion }) });
    expect(textContent(byTestId(r, "budgets-unplanned"))).toContain("Entertainment has no budget. All $50.00 of it counts as unplanned.");
    button(r, "Set Entertainment budget").props.onPress();
    expect(props.onOpen).toHaveBeenCalledWith("fun", true);

    const mover = { kind: "mover" as const, categoryId: "dining", name: "Dining", amount: 13000, delta: 3000 };
    expect(view({ data: monthData({ suggestion: mover }) }).r.root.findAll((n) => n.props.testID === "budgets-unplanned")).toHaveLength(0);
  });

  it("offers to build a budget when the month has none", () => {
    const { r, props } = view({ data: monthData({ categories: [] }) });
    expect(texts(r.root.findByType(EmptyState))).toEqual([
      "You don't have a budget yet.",
      "Set a monthly limit per category to see how you're tracking.",
      "Build my budget",
    ]);
    button(r, "Build my budget").props.onPress();
    expect(props.onNew).toHaveBeenCalled();
  });

  it("switches range and month through the controls", () => {
    const { r, props } = view();
    r.root.findByType(SegmentedControl).props.onChange("all");
    expect(props.onRange).toHaveBeenCalledWith("all");
    r.root.findByType(MonthNav).props.onChange("2026-08");
    expect(props.onMonth).toHaveBeenCalledWith("2026-08");
  });

  it("shows the copy's pending state and its error", () => {
    const pending = view({ copy: { pending: true, error: null, onCopy: vi.fn() } }).r;
    expect(byTestId(pending, "budgets-copy").props.disabled).toBe(true);
    expect(texts(byTestId(pending, "budgets-copy"))).toEqual(["Copying…"]);
    const failed = view({ copy: { pending: false, error: "There were no budgets last month to copy.", onCopy: vi.fn() } }).r;
    expect(texts(failed)).toContain("There were no budgets last month to copy.");
  });

  it("lists all-time spending largest first, without New or Copy", () => {
    const { r } = view({ range: "all", data: allTime });
    expect(texts(byTestId(r, "budgets-all-time"))).toEqual(["Groceries", "$1,234.56", "Dining", "$50.00"]);
    expect(r.root.findAll((n) => n.type === Button && n.props.children === "New")).toHaveLength(0);
    expect(all(r, "budgets-copy")).toHaveLength(0);
    const rows = all(r, "budgets-all-time-row");
    expect(flat(rows[0]!.props.style).borderTopWidth).toBeUndefined();
    expect(flat(rows[1]!.props.style).borderTopWidth).toBe(1);
  });

  it("says so when there's no spending at all", () => {
    const { r } = view({ range: "all", data: { ...allTime, allTime: [] } });
    expect(texts(r.root.findByType(EmptyState))).toEqual(["No spending recorded yet."]);
  });
});
