import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { COLOR, ROLE } from "../../lib/brand/shared";
import type { LoadState, MutationOutcome } from "../../lib/api/load";
import type { CategoryWrite } from "../../lib/categories/manage";
import type { ActivityExtras, NeedsCategoryGroup } from "../../lib/transactions/activity-api";
import { SLICE } from "../../lib/transactions/activity-view";
import type { MobileTransaction } from "../../lib/transactions/transactions-api";
import type { LedgerState } from "../../lib/transactions/use-ledger";
import { byTestId, flat, render, textContent, texts } from "../../test/render";
import { reducedMotion } from "../../test/native-hosts";
import { ScrollWatchProvider, type ScrollWatch } from "../motion/scroll-context";
import { HEADER_HEIGHT } from "../shell/app-header";
import { ActivityView, FOCUS_GAP, type ActivityViewProps } from "./activity-view";
import { choiceOf, formatNet, groupMeta, humanizePfc, pickerOptions } from "./needs-category";
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
  source: "manual",
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
    onFocused: vi.fn(),
    onRefreshNotice: vi.fn(),
    ledger: ready([txn("a")]),
    notice: null,
    onRetryRest: vi.fn(),
    extras: extrasOf(),
    onRetryExtras: vi.fn(),
    kinds: new Map([["groceries", "expense"]]),
    categories: [
      { id: "groceries", name: "Groceries" },
      { id: "dining", name: "Dining out" },
    ],
    onCategorize: vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" })),
    onRescan: vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" })),
    onCreateCategory: vi.fn(async (): Promise<CategoryWrite> => ({ ok: true, created: { id: "new-cat", name: "Coffee" } })),
    newRequestId: () => "11111111-1111-4111-8111-111111111111",
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
    const clear = byTestId(r, "category-band-clear");
    expect(clear.props.accessibilityLabel).toBe("Clear category filter");
    act(() => clear.props.onPress());
    expect(props.onClearCategory).toHaveBeenCalled();
  });

  it("waits for the category's name instead of flashing 'Showing category'", () => {
    const { r } = view({ category: { id: "groceries", name: null } });
    expect(has(r, "category-band")).toBe(0);
  });
});

describe("panels (GET /api/mobile/activity)", () => {
  it("shows each limited-history line", () => {
    const { r } = view({ extras: extrasOf({ limitedHistory: ["Chase sent 30 days.", "Amex sent 60 days."] }) });
    const lines = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "limited-history-banner");
    expect(lines.map((l) => texts(l).join(""))).toEqual(["Chase sent 30 days.", "Amex sent 60 days."]); // one id per line, as the web
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
    expect(textContent(byTestId(r, "activity-extras-error"))).toContain("Couldn't check for purchases that need a category.");
    act(() => r.root.find((n) => n.props.accessibilityLabel === "Try again" && typeof n.type === "string").props.onPress());
    expect(props.onRetryExtras).toHaveBeenCalled();
  });
});

describe("a month still arriving (the web shows the page only once every row is read)", () => {
  const partial = (items: MobileTransaction[]) => ready(items, { cursor: "c1" });

  it("never says 'No matching transactions.' before the rest has come; the skeleton footer says it is loading", () => {
    const { r } = view({ ledger: partial([txn("a", { description: "Coffee" })]) });
    act(() => byTestId(r, "activity-search-input").props.onChangeText("rent"));
    expect(has(r, "activity-no-match")).toBe(0);
    expect(has(r, "activity-rest-loading")).toBe(1);
  });

  it("holds each day's net until the day is complete", () => {
    expect(has(view({ ledger: partial([txn("a")]) }).r, "txn-day-total")).toBe(0);
    expect(has(view({ ledger: ready([txn("a")]) }).r, "txn-day-total")).toBe(1);
  });

  it("a later page that failed: the rows so far, no 'No matching', and the way to load the rest", () => {
    const { r } = view({ ledger: ready([txn("a", { description: "Coffee" })], { cursor: "c1", restError: "Couldn't reach Budgts." }) });
    act(() => byTestId(r, "activity-search-input").props.onChangeText("rent"));
    expect(has(r, "activity-no-match")).toBe(0);
    expect(has(r, "activity-rest-error")).toBe(1);
    expect(has(r, "txn-day-total")).toBe(0);
  });
});

describe("Needs a category after a sync", () => {
  it("a merchant that was picked can come back when a later sync brings new rows for it", async () => {
    const onCategorize = vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" }));
    const g = group("m1", 1, { suggestedCategoryId: "dining" });
    const other = group("m2", 1); // keeps the card on screen throughout
    const base: Omit<ActivityViewProps, "extras"> = { ...view().props };
    const r = render(<ActivityView {...base} onCategorize={onCategorize} extras={extrasOf({ needsCategory: [g, other] })} />);
    await act(async () => byTestId(r, "needs-category-suggestion").props.onPress());
    expect(has(r, "needs-category-group")).toBe(1);
    // the refresh after the pick: the merchant is gone
    act(() => r.update(<ActivityView {...base} onCategorize={onCategorize} extras={extrasOf({ needsCategory: [other] })} />));
    // a later sync: new rows for the same merchant
    act(() => r.update(<ActivityView {...base} onCategorize={onCategorize} extras={extrasOf({ needsCategory: [{ ...g, anchorId: "m1-9" }, other] })} />));
    expect(has(r, "needs-category-group")).toBe(2);
  });
});

describe("the header bell's focus=needs-category (web /transactions#needs-category)", () => {
  function mounted(over: Partial<ActivityViewProps>) {
    const scrollTo = vi.fn();
    const watch: ScrollWatch = { contentRef: { current: {} as never }, viewport: () => ({ height: 800, y: 0 }), subscribe: () => () => {}, scrollTo };
    const props = { ...view().props, ...over };
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <ScrollWatchProvider watch={watch}>
          <ActivityView {...props} />
        </ScrollWatchProvider>,
        // every host measures 640px down the content (the card's place under the header, month and banners)
        { createNodeMock: () => ({ measureLayout: (_c: unknown, done: (x: number, y: number) => void) => done(0, 640) }) },
      );
    });
    return { r, scrollTo, props };
  }

  it("scrolls the card to just under the header, once, then clears the param", () => {
    const onFocused = vi.fn();
    const { r, scrollTo, props } = mounted({ focus: "needs-category", onFocused, extras: extrasOf({ needsCategory: [group("m1")] }) });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(640 - HEADER_HEIGHT - FOCUS_GAP, true); // contentRef holds the header clearance (insets 0 in tests)
    expect(onFocused).toHaveBeenCalledTimes(1);
    // a later layout (a group expanding) never scrolls again
    act(() => r.root.findAll((n) => typeof n.props.onLayout === "function").forEach((n) => n.props.onLayout({ nativeEvent: { layout: {} } })));
    expect(scrollTo).toHaveBeenCalledTimes(1);
    void props;
  });

  it("waits for the panels to load; with nothing to categorize it only clears the param", () => {
    const onFocused = vi.fn();
    const loading = mounted({ focus: "needs-category", onFocused, extras: { status: "loading" } });
    expect(loading.scrollTo).not.toHaveBeenCalled();
    expect(onFocused).not.toHaveBeenCalled();
    const none = mounted({ focus: "needs-category", onFocused, extras: extrasOf({ needsCategory: [] }) });
    expect(none.scrollTo).not.toHaveBeenCalled();
    expect(onFocused).toHaveBeenCalledTimes(1);
  });

  it("no param, no scroll", () => {
    const { scrollTo } = mounted({ focus: null, extras: extrasOf({ needsCategory: [group("m1")] }) });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("under Reduce Motion the jump is instant", () => {
    reducedMotion.value = true;
    try {
      const { scrollTo } = mounted({ focus: "needs-category", extras: extrasOf({ needsCategory: [group("m1")] }) });
      expect(scrollTo).toHaveBeenCalledWith(640 - HEADER_HEIGHT - FOCUS_GAP, false);
    } finally {
      reducedMotion.value = false;
    }
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

  it("a failed refresh (a pull, or a silent reload after a save or sync) keeps the list, says why, and offers Refresh", () => {
    const onRefreshNotice = vi.fn();
    const { r } = view({ notice: "Couldn't reach Budgts.", onRefreshNotice });
    expect(textContent(byTestId(r, "activity-notice"))).toContain("Couldn't reach Budgts.");
    expect(rowTitles(r)).toEqual(["Shop a"]);
    act(() => r.root.find((n) => typeof n.type === "string" && n.props.accessibilityLabel === "Refresh").props.onPress());
    expect(onRefreshNotice).toHaveBeenCalled();
  });
});

describe("Needs a category actions (web needs-category.tsx)", () => {
  const one = (over: Partial<NeedsCategoryGroup> = {}) => extrasOf({ needsCategory: [group("m1", 2, over)], missingStandardCategories: ["Travel"] });
  const hostsWith = (r: ReturnType<typeof render>, id: string) => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === id);

  it("offers a suggestion as a one-tap chip; a pick hides the group at once and sends it for the newest row", async () => {
    let settle!: (o: MutationOutcome) => void;
    const onCategorize = vi.fn(() => new Promise<MutationOutcome>((res) => (settle = res)));
    const { r } = view({ extras: one({ suggestedCategoryId: "dining" }), onCategorize });
    expect(textContent(byTestId(r, "needs-category"))).toContain("Looks like");
    expect(byTestId(r, "needs-category-picker").props.accessibilityLabel).toBe("Category for Merchant m1, Choose another");
    expect(textContent(byTestId(r, "needs-category"))).not.toContain("Plaid");
    await act(async () => byTestId(r, "needs-category-suggestion").props.onPress());
    expect(onCategorize).toHaveBeenCalledWith("m1-1", { categoryId: "dining" });
    expect(hostsWith(r, "needs-category")).toHaveLength(0); // hidden before the server answers
    await act(async () => settle({ status: "ok" }));
    expect(hostsWith(r, "needs-category")).toHaveLength(0);
  });

  it("without a suggestion: 'Choose a category' and Plaid's own guess as a hint", () => {
    const { r } = view({ extras: one({ plaidCategoryPrimary: "FOOD_AND_DRINK" }) });
    expect(byTestId(r, "needs-category-picker").props.accessibilityLabel).toBe("Category for Merchant m1, Choose a category");
    // longer than 12 characters: its own line; a short guess sits inside the field (kit Select plaidHint)
    expect(textContent(byTestId(r, "needs-category"))).toContain("Plaid suggests: Food and drink");
    const short = view({ extras: one({ plaidCategoryPrimary: "OTHER" }) }).r;
    expect(textContent(byTestId(short, "needs-category"))).toContain("Plaid: Other");
    expect(textContent(byTestId(short, "needs-category"))).not.toContain("Plaid suggests");
  });

  it("the picker lists the categories, then the standard ones to restore under a heading", async () => {
    const onCategorize = vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" }));
    const { r } = view({ extras: one(), onCategorize });
    act(() => byTestId(r, "needs-category-picker").props.onPress());
    expect(textContent(byTestId(r, "needs-category-picker-option-dining"))).toContain("Dining out");
    expect(byTestId(r, "needs-category-picker-option-__std_heading").props.accessibilityState).toMatchObject({ disabled: true });
    await act(async () => byTestId(r, "needs-category-picker-option-std:Travel").props.onPress());
    expect(onCategorize).toHaveBeenCalledWith("m1-1", { standardCategoryName: "Travel" });
  });

  it("a failed pick brings the group back and says why; a row already gone stays gone", async () => {
    const failing = vi.fn(async (): Promise<MutationOutcome> => ({ status: "error", kind: "network", message: "Couldn't reach Budgts. Check your connection and try again." }));
    const a = view({ extras: one({ suggestedCategoryId: "dining" }), onCategorize: failing }).r;
    await act(async () => byTestId(a, "needs-category-suggestion").props.onPress());
    expect(hostsWith(a, "needs-category-group")).toHaveLength(1);
    expect(textContent(byTestId(a, "needs-category-error"))).toBe("Couldn't reach Budgts. Check your connection and try again.");

    const gone = vi.fn(async (): Promise<MutationOutcome> => ({ status: "missing" }));
    const b = view({ extras: one({ suggestedCategoryId: "dining" }), onCategorize: gone }).r;
    await act(async () => byTestId(b, "needs-category-suggestion").props.onPress());
    expect(hostsWith(b, "needs-category")).toHaveLength(0);
  });

  it("Re-scan shows it is working, and says why when it fails", async () => {
    let settle!: (o: MutationOutcome) => void;
    const onRescan = vi.fn(() => new Promise<MutationOutcome>((res) => (settle = res)));
    const { r } = view({ extras: one(), onRescan });
    expect(byTestId(r, "needs-category-rescan").props.accessibilityLabel).toBe("Re-scan");
    await act(async () => void byTestId(r, "needs-category-rescan").props.onPress());
    expect(byTestId(r, "needs-category-rescan").props.accessibilityLabel).toBe("Re-scanning…");
    await act(async () => settle({ status: "error", kind: "locked", message: "Changes are paused." }));
    expect(byTestId(r, "needs-category-rescan").props.accessibilityLabel).toBe("Re-scan");
    expect(textContent(byTestId(r, "needs-category-error"))).toBe("Changes are paused.");
  });

  it("'+ New category…' opens the web's sheet for the merchant; the created category is used for the group", async () => {
    const onCategorize = vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" }));
    const onCreateCategory = vi.fn(async (): Promise<CategoryWrite> => ({ ok: true, created: { id: "new-cat", name: "Coffee" } }));
    const { r } = view({ extras: one(), onCategorize, onCreateCategory });
    expect(textContent(byTestId(r, "needs-category"))).toContain("Missing one? Choose + New category.");
    act(() => byTestId(r, "needs-category-picker").props.onPress());
    act(() => byTestId(r, "needs-category-picker-option-__new__").props.onPress());
    expect(byTestId(r, "sheet").props.accessibilityLabel).toBe("New category for Merchant m1");
    expect(onCategorize).not.toHaveBeenCalled();
    act(() => byTestId(r, "category-name").props.onChangeText("Coffee"));
    await act(async () => byTestId(r, "category-save").props.onPress());
    expect(onCreateCategory).toHaveBeenCalledWith(expect.objectContaining({ name: "Coffee", kind: "expense" }), "11111111-1111-4111-8111-111111111111");
    expect(onCategorize).toHaveBeenCalledWith("m1-1", { categoryId: "new-cat" });
    expect(hostsWith(r, "sheet")).toHaveLength(0);
  });

  it("cancelling the new category leaves the group as it was", async () => {
    const onCategorize = vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" }));
    const { r } = view({ extras: one(), onCategorize });
    act(() => byTestId(r, "needs-category-picker").props.onPress());
    act(() => byTestId(r, "needs-category-picker-option-__new__").props.onPress());
    await act(async () => byTestId(r, "category-cancel").props.onPress());
    expect(hostsWith(r, "sheet")).toHaveLength(0);
    expect(onCategorize).not.toHaveBeenCalled();
    expect(hostsWith(r, "needs-category-group")).toHaveLength(1);
  });

  it("maps picks and Plaid's categories like the web", () => {
    expect(choiceOf("std:Travel")).toEqual({ standardCategoryName: "Travel" });
    expect(choiceOf("abc")).toEqual({ categoryId: "abc" });
    expect(humanizePfc("GENERAL_MERCHANDISE")).toBe("General merchandise");
    expect(humanizePfc(null)).toBeNull();
    expect(pickerOptions([{ id: "a", name: "A" }], []).map((o) => o.value)).toEqual(["a", "__new__"]);
  });
});
