import { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byTestId, flat, hosts, render, textContent, texts } from "../../test/render";
import type { MobileCategory } from "../../lib/categories/categories-api";
import type { HomeCategory, MobileHome } from "../../lib/home/contract";
import { HomeView } from "./home-view";
import { resetOverAlertDismissals } from "./over-alert";
import { TITLE_WORD_GAP } from "./home-header";

const cat = (over: Partial<HomeCategory>): HomeCategory => ({
  id: "c1",
  name: "Groceries",
  color: "#3FA772",
  budget: 22000,
  actual: 18555,
  remaining: 3445,
  pctUsed: 84,
  state: "near",
  ...over,
});

const full = (over: Partial<MobileHome> = {}): MobileHome => ({
  version: 1,
  month: "2026-09",
  today: "2026-09-19",
  currency: "USD",
  moneyLeft: 145146,
  income: 320000,
  spent: 174854,
  budgeted: 191000,
  leftToSpend: 16146,
  savingsRate: 0.4536,
  categories: [
    cat({ id: "over", name: "Dining", budget: 10000, actual: 15000, remaining: -5000, pctUsed: 150, state: "over" }),
    cat({ id: "unplanned", name: "Fun", budget: 0, actual: 2500, remaining: -2500, pctUsed: 100, state: "over" }),
    cat({}),
  ],
  recent: [
    { id: "t1", description: "Whole Foods Market", amount: 3980, direction: "debit", occurredAt: "2026-09-16T12:00:00.000Z", isTransfer: false, category: { name: "Groceries", color: "#3FA772" } },
    { id: "t2", description: "", amount: 320000, direction: "credit", occurredAt: "2026-09-15T12:00:00.000Z", isTransfer: false, category: null },
    { id: "t3", description: "To savings", amount: 5000, direction: "debit", occurredAt: "2026-09-14T12:00:00.000Z", isTransfer: true, category: null },
  ],
  savings: { activeCount: 2, totalSaved: 42000, totalTarget: 100000, pct: 42 },
  bankConnected: true,
  suggestion: { kind: "mover", categoryId: "over", name: "Dining", amount: 15000, delta: 4200 },
  ...over,
});

const categories: MobileCategory[] = [
  { id: "a", name: "Groceries", kind: "expense", color: "#000" },
  { id: "b", name: "Salary", kind: "income", color: "#000" },
  { id: "c", name: "Dining", kind: "expense", color: "#000" },
];

function view(home: MobileHome, over: { categories?: MobileCategory[] | null } = {}) {
  const props = {
    home,
    categories: over.categories === undefined ? categories : over.categories,
    name: "Alex",
    hour: 14,
    go: vi.fn<(path: string) => void>(),
    onMonth: vi.fn<(month: string) => void>(),
    onAddIncome: vi.fn<() => void>(),
    onAddTransaction: vi.fn<() => void>(),
  };
  return { r: render(<HomeView {...props} />), props };
}

const allText = (r: ReturnType<typeof render>) => texts(r).join("");

afterEach(() => resetOverAlertDismissals());

describe("Home header", () => {
  it("greets by name word by word, with the web's subtitle and the month", () => {
    const { r } = view(full());
    const title = byTestId(r, "page-title");
    expect(title.props.accessibilityLabel).toBe("Good afternoon, Alex.");
    expect(title.props.accessibilityRole).toBe("header");
    expect(flat(title.props.style).columnGap).toBe(TITLE_WORD_GAP);
    expect(textContent(byTestId(r, "page-subtitle"))).toBe("You're doing well this month.");
    expect(textContent(byTestId(r, "month-nav-label"))).toBe("September 2026");
  });

  it("the arrows step the month", () => {
    const { r, props } = view(full());
    act(() => byTestId(r, "month-nav-prev").props.onPress());
    act(() => byTestId(r, "month-nav-next").props.onPress());
    expect(props.onMonth.mock.calls).toEqual([["2026-08"], ["2026-10"]]);
  });
});

describe("Money left", () => {
  it("rolls the server's figure at the large size, with the share kept and both flows", () => {
    const { r } = view(full());
    const figure = byTestId(r, "home-money-left").findAll((n) => typeof n.type === "string" && n.props.testID === "rolling-amount")[0]!;
    expect(figure.props.accessibilityLabel).toBe("$1,451.46");
    expect(textContent(byTestId(r, "home-hero-line"))).toBe("45% of this month's income kept.");
    expect(textContent(byTestId(r, "home-came-in"))).toBe("+$3,200.00");
    expect(textContent(byTestId(r, "home-went-out"))).toBe("−$1,748.54");
    expect(allText(r)).toContain("Income minus spending. Not your savings balance.");
  });

  it("steps a long figure down a size and says how much more went out", () => {
    const { r } = view(full({ moneyLeft: -123456789, savingsRate: -0.4 }));
    const figure = r.root.findAll((n) => n.props.testID === "rolling-amount" && n.props.variant !== undefined)[0]!;
    expect(figure.props.variant).toBe("tNumLg");
    expect(textContent(byTestId(r, "home-hero-line"))).toBe("$1,234,567.89 more went out than came in.");
  });

  it("an empty month invites the first income; a month without income says so", () => {
    expect(textContent(byTestId(view(full({ income: 0, spent: 0, savingsRate: null, moneyLeft: 0 })).r, "home-hero-line"))).toBe(
      "Add income or connect a bank and your month appears here.",
    );
    expect(textContent(byTestId(view(full({ income: 0, savingsRate: null, moneyLeft: -174854 })).r, "home-hero-line"))).toBe(
      "No income yet this month.",
    );
  });

  it("plain zeros carry no sign", () => {
    const { r } = view(full({ income: 0, spent: 0, savingsRate: null, moneyLeft: 0 }));
    expect(textContent(byTestId(r, "home-came-in"))).toBe("$0.00");
    expect(textContent(byTestId(r, "home-went-out"))).toBe("$0.00");
  });

  it("the plus by Came in adds income", () => {
    const { r, props } = view(full());
    const plus = byTestId(r, "home-add-income");
    expect(plus.props.accessibilityLabel).toBe("Add income");
    plus.props.onPress();
    expect(props.onAddIncome).toHaveBeenCalledOnce();
  });
});

describe("the budgets-over-income warning", () => {
  it("shows the two figures, links to Budgets, and stays dismissed for the month", () => {
    const { r, props } = view(full({ budgeted: 400000 }));
    expect(textContent(byTestId(r, "home-over-alert"))).toContain(
      "This month's budgets add up to $4,000.00, more than the $3,200.00 you've brought in so far. Review your budgets.",
    );
    byTestId(r, "home-over-alert-review").props.onPress();
    expect(props.go).toHaveBeenCalledWith("/budgets");
    act(() => byTestId(r, "home-over-alert-dismiss").props.onPress());
    expect(r.root.findAll((n) => n.props.testID === "home-over-alert")).toHaveLength(0);
    // coming back to Home keeps it dismissed; another month still warns
    expect(view(full({ budgeted: 400000 })).r.root.findAll((n) => n.props.testID === "home-over-alert")).toHaveLength(0);
    expect(view(full({ budgeted: 400000, month: "2026-10" })).r.root.findAll((n) => n.props.testID === "home-over-alert").length).toBeGreaterThan(0);
  });

  it("is absent when the plan fits the income", () => {
    expect(view(full()).r.root.findAll((n) => n.props.testID === "home-over-alert")).toHaveLength(0);
  });
});

describe("Where it went", () => {
  it("summarises the plan, then a row per category with the web's notes", () => {
    const { r } = view(full());
    expect(textContent(byTestId(r, "home-where-summary"))).toBe("$161.46 left of your $1,910.00 budget");
    const rows = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "home-where-row");
    expect(rows.map((n) => textContent(n))).toEqual([
      "Dining$150.00Over by $50.00of $100.00",
      "Fun$25.00No budget, all unplannedSet budget",
      "Groceries$185.55$34.45 leftof $220.00",
    ]);
  });

  it("says how far over the plan the month is", () => {
    const { r } = view(full({ leftToSpend: -5000 }));
    expect(textContent(byTestId(r, "home-where-summary"))).toBe("$50.00 over your $1,910.00 budget");
  });

  it("a row opens its transactions; Set budget opens the budget, also as the row's screen-reader action", () => {
    const { r, props } = view(full());
    const rows = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "home-where-row");
    rows[0]!.props.onPress();
    byTestId(r, "home-where-set-budget").props.onPress();
    rows[1]!.props.onAccessibilityAction({ nativeEvent: { actionName: "setBudget" } });
    expect(props.go.mock.calls.map((c) => c[0])).toEqual([
      "/activity?m=2026-09&category=over",
      "/budgets?m=2026-09&edit=unplanned",
      "/budgets?m=2026-09&edit=unplanned",
    ]);
    expect(rows[0]!.props.accessibilityActions).toBeUndefined();
  });

  it("no spending yet: Crystal asleep and the expense categories as chips", () => {
    const { r } = view(full({ income: 0, spent: 0, budgeted: 0, leftToSpend: 0, savingsRate: null, moneyLeft: 0, categories: [], recent: [] }));
    expect(allText(r)).toContain("No spending yet this month");
    const chips = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "home-category-chip");
    expect(chips.map((c) => textContent(c))).toEqual(["Groceries", "Dining"]);
    expect(r.root.findAll((n) => n.props.testID === "home-where-summary")).toHaveLength(0);
  });

  it("no chips while the categories load", () => {
    const { r } = view(full({ spent: 0, categories: [] }), { categories: null });
    expect(r.root.findAll((n) => n.props.testID === "home-category-chip")).toHaveLength(0);
  });

  it("spending without any budget points to the Budgets screen", () => {
    const { r, props } = view(full({ categories: [], budgeted: 0 }));
    expect(textContent(byTestId(r, "home-where-no-budgets"))).toBe("Set a budget on the Budgets screen to see how you're tracking.");
    hosts(byTestId(r, "home-where-no-budgets"), "Text").find((t) => t.props.accessibilityRole === "link")!.props.onPress();
    expect(props.go).toHaveBeenCalledWith("/budgets");
  });
});

describe("What can I change?", () => {
  it("a category that grew opens its transactions", () => {
    const { r, props } = view(full());
    const card = byTestId(r, "home-change");
    expect(textContent(card)).toBe("What can I change?Dining$150.00 this month, up $42.00 vs. last month");
    card.props.onPress();
    expect(props.go).toHaveBeenCalledWith("/activity?m=2026-09&category=over");
  });

  it("an unbudgeted category opens its budget", () => {
    const { r, props } = view(full({ suggestion: { kind: "unbudgeted", categoryId: "unplanned", name: "Fun", amount: 2500, share: 12 } }));
    expect(textContent(byTestId(r, "home-change"))).toBe("What can I change?Give Fun a budget$25.00 this month, 12% of spending.");
    byTestId(r, "home-change").props.onPress();
    expect(props.go).toHaveBeenCalledWith("/budgets?m=2026-09&edit=unplanned");
  });

  it("is absent with nothing to suggest", () => {
    expect(view(full({ suggestion: null })).r.root.findAll((n) => n.props.testID === "home-change")).toHaveLength(0);
  });
});

describe("Savings", () => {
  it("rolls the total kept with its progress badge", () => {
    const { r } = view(full());
    const card = byTestId(r, "home-savings");
    expect(textContent(card)).toContain("42%");
    expect(textContent(card)).toContain("Kept toward $1,000.00 across 2 goals");
    expect(card.findAll((n) => typeof n.type === "string" && n.props.testID === "rolling-amount")[0]!.props.accessibilityLabel).toBe("$420.00");
  });

  it("is absent without goals", () => {
    expect(view(full({ savings: null })).r.root.findAll((n) => n.props.testID === "home-savings")).toHaveLength(0);
  });
});

describe("Recent activity", () => {
  it("lists the newest with the web's titles, kinds and signs", () => {
    const { r } = view(full());
    const rows = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "home-recent-row");
    expect(rows.map((n) => n.props.accessibilityLabel)).toEqual([
      "Whole Foods Market, Groceries, −$39.80",
      "Transaction, Uncategorized, +$3,200.00",
      "To savings, Transfer, −$50.00",
    ]);
  });

  it("an empty list offers adding one by hand, worded for a connected bank or not", () => {
    const { r, props } = view(full({ recent: [] }));
    expect(allText(r)).toContain("Purchases from your bank land here on their own.");
    byTestId(r, "home-add-transaction").props.onPress();
    expect(props.onAddTransaction).toHaveBeenCalledOnce();
    expect(allText(view(full({ recent: [], bankConnected: false })).r)).toContain("Connected purchases land here on their own.");
  });

  it("the section links go where the web's go", () => {
    const { r, props } = view(full());
    for (const id of ["home-where", "home-savings", "home-recent"])
      byTestId(r, id).findAll((n) => typeof n.type === "string" && n.props.testID === "section-head-action")[0]!.props.onPress();
    expect(props.go.mock.calls.map((c) => c[0])).toEqual(["/budgets?m=2026-09", "/goals", "/activity"]);
  });
});

describe("reading order", () => {
  it("follows the web's phone order", () => {
    const { r } = view(full({ budgeted: 400000 }));
    const heads = texts(r).filter((t) => ["Where it went", "Savings", "Recent activity", "What can I change?", "Money left"].includes(t));
    expect(heads).toEqual(["Money left", "Where it went", "What can I change?", "Savings", "Recent activity"]);
  });
});
