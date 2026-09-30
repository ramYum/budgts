import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { COLOR, ROLE } from "../../lib/brand/shared";
import type { LoadState } from "../../lib/api/load";
import type { ActivityExtras, NeedsCategoryGroup } from "../../lib/transactions/activity-api";
import { SLICE } from "../../lib/transactions/activity-view";
import type { MobileTransaction } from "../../lib/transactions/transactions-api";
import type { LedgerState } from "../../lib/transactions/use-ledger";
import { byTestId, flat, render, textContent, texts } from "../../test/render";
import { ActivityView, type ActivityViewProps } from "./activity-view";
import { formatNet, groupMeta } from "./needs-category";
import { AHEAD, withinReach } from "./show-more";

// E1's ConnectBank runs native Plaid Link; here it only has to be the card's action.
vi.mock("../banks/connect-bank", async () => {
  const { createElement } = await import("react");
  return { ConnectBank: (p: { tone?: string }) => createElement("ConnectBank", { testID: "connect-bank", tone: p.tone }) };
});

const txn = (id: string, over: Partial<MobileTransaction> = {}): MobileTransaction => ({
  id,
  amount: 1250,
  direction: "debit",
  occurredAt: "2026-09-12T12:00:00+00:00",
  description: `Shop ${id}`,
  note: null,
  isTransfer: false,
  category: { id: "groceries", name: "Groceries", color: "#000" },
  account: { id: "a1", name: "Everyday checking" },
  uncategorized: false,
  ...over,
});

const ready = (items: MobileTransaction[], more: Partial<Extract<LedgerState, { status: "ready" }>> = {}): LedgerState => ({
  status: "ready",
  page: { month: "2026-09", items, nextCursor: null },
  cursor: null,
  restError: null,
  ...more,
});

const extrasOf = (over: Partial<ActivityExtras> = {}): LoadState<ActivityExtras> => ({
  status: "ready",
  data: { plaidEnabled: true, needsCategory: [], missingStandardCategories: [], limitedHistory: [], ...over },
});

const group = (key: string, count = 1, over: Partial<NeedsCategoryGroup> = {}): NeedsCategoryGroup => ({
  key,
  label: `Merchant ${key}`,
  anchorId: `${key}-1`,
  count,
  netAmount: 650 * count,
  plaidCategoryPrimary: null,
  suggestedCategoryId: null,
  transactions: Array.from({ length: count }, (_, i) => ({
    id: `${key}-${i + 1}`,
    description: `ROW ${i + 1}`,
    amount: 650,
    direction: "debit" as const,
    occurredAt: "2026-09-16T12:00:00+00:00",
    accountName: "Everyday checking",
    pending: false,
  })),
  ...over,
});

function view(over: Partial<ActivityViewProps> = {}) {
  const props: ActivityViewProps = {
    month: "2026-09",
    onMonth: vi.fn(),
    currency: "USD",
    category: null,
    onClearCategory: vi.fn(),
    ledger: ready([txn("a")]),
    notice: null,
    onRetryRest: vi.fn(),
    extras: extrasOf(),
    onRetryExtras: vi.fn(),
    kinds: new Map([["groceries", "expense"]]),
    onAdd: vi.fn(),
    onOpen: vi.fn(),
    ...over,
  };
  return { r: render(<ActivityView {...props} />), props };
}

const has = (r: ReturnType<typeof render>, id: string) => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === id).length;
const rowTitles = (r: ReturnType<typeof render>) =>
  r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "txn-title").map((n) => textContent(n));

describe("Activity header (web transactions/page.tsx)", () => {
  it("is 'Activity' with the month switcher and a primary Add that reads 'Add transaction'", () => {
    const { r, props } = view();
    expect(textContent(byTestId(r, "page-title"))).toBe("Activity");
    expect(textContent(byTestId(r, "month-label"))).toBe("September 2026");
    const add = byTestId(r, "activity-add");
    expect(add.props.accessibilityLabel).toBe("Add transaction");
    expect(texts(add)).toContain("Add");
    act(() => add.props.onPress());
    expect(props.onAdd).toHaveBeenCalled();
    act(() => byTestId(r, "month-prev").props.onPress());
    expect(props.onMonth).toHaveBeenCalledWith("2026-08");
  });
});

describe("the list (web transaction-list.tsx)", () => {
  it("bands rows by day with the day's net, newest first, and each row's category, meta and signed amount", () => {
    const { r } = view({
      ledger: ready([
        txn("a", { amount: 500 }),
        txn("b", { amount: 2000, direction: "credit", description: "Return" }),
        txn("c", { occurredAt: "2026-09-11T12:00:00+00:00", isTransfer: true, category: null, description: "To savings" }),
        txn("d", { occurredAt: "2026-09-11T12:00:00+00:00", category: null, uncategorized: true, description: "" }),
      ]),
    });
    const labels = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "txn-day-label").map(textContent);
    const totals = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "txn-day-total").map(textContent);
    expect(labels).toHaveLength(2);
    expect(totals).toEqual(["+$15.00", "−$25.00"]);
    const metas = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "txn-meta");
    expect(metas.map(textContent)).toEqual(["Groceries", "Groceries · Refund", "Transfer", "Needs a category"]);
    expect(flat(metas[3]!.props.style).color).toBe(ROLE.warn);
    expect(rowTitles(r)).toEqual(["Shop a", "Return", "To savings", "Transaction"]);
    const amounts = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "txn-amount");
    expect(amounts.map(textContent)).toEqual(["−$5.00", "+$20.00", "−$12.50", "−$12.50"]);
    expect(flat(amounts[1]!.props.style).color).toBe(ROLE.pos);
  });

  it("opens a row on tap", () => {
    const { r, props } = view();
    const row = r.root.find((n) => typeof n.type === "string" && n.props.testID === "txn-row");
    expect(row.props.accessibilityLabel).toBe("Shop a, Groceries, −$12.50");
    act(() => row.props.onPress());
    expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });

  it("filters by kind and search together across every row, and says so when nothing matches", () => {
    const { r } = view({
      ledger: ready([txn("a", { description: "Trader Joe's" }), txn("b", { direction: "credit", description: "Payroll", category: null }), txn("c", { isTransfer: true })]),
    });
    act(() => byTestId(r, "segment-income").props.onPress());
    expect(rowTitles(r)).toEqual(["Payroll"]);
    act(() => byTestId(r, "segment-all").props.onPress());
    act(() => byTestId(r, "activity-search-input").props.onChangeText("groc"));
    expect(rowTitles(r)).toEqual(["Trader Joe's", "Shop c"]);
    act(() => byTestId(r, "activity-search-input").props.onChangeText("nothing like this"));
    expect(textContent(byTestId(r, "activity-no-match"))).toBe("No matching transactions.");
    expect(has(r, "activity-search")).toBe(1);
  });

  it("renders the first 60 rows, then 'Show N more' adds the next slice", () => {
    const many = Array.from({ length: SLICE + 5 }, (_, i) => txn(`t${i}`));
    const { r } = view({ ledger: ready(many) });
    expect(rowTitles(r)).toHaveLength(SLICE);
    const more = byTestId(r, "show-more-rows");
    expect(more.props.accessibilityLabel).toBe("Show 5 more");
    act(() => more.props.onPress());
    expect(rowTitles(r)).toHaveLength(SLICE + 5);
    expect(has(r, "show-more-rows")).toBe(0);
  });

  it("adds rows once the end is within 600px of the screen's bottom (the web's rootMargin)", () => {
    expect(withinReach(1000 + 915 + AHEAD, { height: 915, y: 1000 })).toBe(true);
    expect(withinReach(1000 + 915 + AHEAD + 1, { height: 915, y: 1000 })).toBe(false);
    expect(withinReach(0, { height: 0, y: 0 })).toBe(false);
  });
});

describe("empty and connect (web page + TransactionList)", () => {
  it("an empty month shows sleepy Crystal's card and, with bank connections on, the connect prompt first", () => {
    const { r } = view({ ledger: ready([]) });
    expect(textContent(byTestId(r, "activity-empty"))).toBe("No transactions this month yet.Add your first with Add, or connect a bank and they arrive on their own.");
    expect(textContent(byTestId(r, "connect-bank-card"))).toContain("Connect a bank to fill this in on its own, or add a transaction by hand.");
    expect(byTestId(r, "connect-bank").props.tone).toBe("outline"); // the web's outline ConnectBank
    expect(has(r, "activity-search")).toBe(0);
  });

  it("no connect prompt when bank connections are off, when the month has rows, or when narrowed to a category", () => {
    expect(has(view({ ledger: ready([]), extras: extrasOf({ plaidEnabled: false }) }).r, "connect-bank-card")).toBe(0);
    expect(has(view().r, "connect-bank-card")).toBe(0);
    expect(has(view({ ledger: ready([]), category: { id: "groceries", name: "Groceries" } }).r, "connect-bank-card")).toBe(0);
  });
});

describe("the category band (web ?category=)", () => {
  it("says 'Showing <name>' and clears", () => {
    const { r, props } = view({ category: { id: "groceries", name: "Groceries" } });
    expect(textContent(byTestId(r, "category-band"))).toContain("Showing Groceries");
    act(() => byTestId(r, "category-band-clear").props.onPress());
    expect(props.onClearCategory).toHaveBeenCalled();
  });
});

describe("panels (GET /api/mobile/activity)", () => {
  it("shows each limited-history line", () => {
    const { r } = view({ extras: extrasOf({ limitedHistory: ["Chase sent 30 days.", "Amex sent 60 days."] }) });
    expect(texts(byTestId(r, "limited-history-banner"))).toEqual(["Chase sent 30 days.", "Amex sent 60 days."]);
  });

  it("leads with 'Needs a category': the total, three merchants, then 'Show N more'", () => {
    const { r } = view({ extras: extrasOf({ needsCategory: [group("a", 3), group("b"), group("c"), group("d"), group("e")] }) });
    expect(textContent(byTestId(r, "needs-category-total"))).toBe("7");
    const title = r.root.find((n) => typeof n.type === "string" && n.props.accessibilityRole === "header" && n.props.accessible);
    expect(title.props.accessibilityLabel).toBe("Needs a category, 7 transactions from 5 merchants");
    const count = () => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "needs-category-group").length;
    expect(count()).toBe(3);
    const more = byTestId(r, "needs-category-more");
    expect(more.props.accessibilityLabel).toBe("Show 2 more");
    act(() => more.props.onPress());
    expect(count()).toBe(5);
    expect(flat(byTestId(r, "needs-category-total").props.style).color).toBe(COLOR.signalInk);
  });

  it("describes a group like the web", () => {
    expect(groupMeta(group("a", 3))).toBe("3 purchases · latest Sep 16");
    const one = group("b");
    one.transactions[0]!.pending = true;
    expect(groupMeta(one)).toBe("Sep 16 · Everyday checking · Pending");
    expect(formatNet(1300, "USD")).toBe("−$13.00");
    expect(formatNet(-300, "USD")).toBe("+$3.00");
  });

  it("a failed panel read is said, with a way to try again (never a silently empty to-do list)", () => {
    const { r, props } = view({ extras: { status: "error", kind: "network", message: "x" } });
    expect(textContent(byTestId(r, "needs-category-error"))).toContain("Couldn't check for purchases that need a category.");
    act(() => r.root.find((n) => n.props.accessibilityLabel === "Try again" && typeof n.type === "string").props.onPress());
    expect(props.onRetryExtras).toHaveBeenCalled();
  });
});

describe("failures", () => {
  it("while the rest of the month loads, a skeleton footer; nothing once it is all in", () => {
    expect(has(view({ ledger: ready([txn("a")], { cursor: "c1" }) }).r, "activity-rest-loading")).toBe(1);
    expect(has(view().r, "activity-rest-loading")).toBe(0);
    expect(has(view({ ledger: ready([txn("a")], { cursor: "c1", restError: "x" }) }).r, "activity-rest-loading")).toBe(0);
  });

  it("a later page that failed keeps the rows and offers to load the rest", () => {
    const { r, props } = view({ ledger: ready([txn("a")], { cursor: "c1", restError: "Couldn't reach Budgts." }) });
    expect(rowTitles(r)).toEqual(["Shop a"]);
    expect(textContent(byTestId(r, "activity-rest-error"))).toContain("Some of this month's transactions didn't load.");
    act(() => r.root.find((n) => n.props.accessibilityLabel === "Try again" && typeof n.type === "string").props.onPress());
    expect(props.onRetryRest).toHaveBeenCalled();
  });

  it("a failed refresh keeps the list and says why", () => {
    const { r } = view({ notice: "Couldn't reach Budgts." });
    expect(textContent(byTestId(r, "activity-notice"))).toContain("Couldn't reach Budgts.");
    expect(rowTitles(r)).toEqual(["Shop a"]);
  });
});
