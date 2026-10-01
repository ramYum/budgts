import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { MobileAccount } from "../../lib/accounts/accounts-api";
import type { MutationOutcome } from "../../lib/api/load";
import type { MobileCategory } from "../../lib/categories/categories-api";
import type { MobileTransaction } from "../../lib/transactions/transactions-api";
import { byTestId, flat, render, textContent, texts } from "../../test/render";
import { PixelFrame } from "../brand/pixel-frame";
import { TransactionForm, transferToggleDraft } from "./transaction-form";
import { AddIncomeSheet, AddTransactionSheet, EditTransactionSheet, TransactionDetailSheet, fullDateLabel } from "./transaction-sheets";

const picker = vi.hoisted(() => ({ opened: [] as { value: Date; onChange: (e: { type: string }, d?: Date) => void }[] }));
vi.mock("@react-native-community/datetimepicker", () => ({
  default: () => null,
  DateTimePickerAndroid: { open: (o: (typeof picker.opened)[number]) => picker.opened.push(o) },
}));

vi.mock("expo-crypto", () => ({ randomUUID: () => "22222222-2222-4222-8222-222222222222" }));

vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const account = (id: string, name: string, selectable = true): MobileAccount => ({ id, name, type: "checking", source: "manual", archived: false, selectable });
const accounts = [account("a1", "Everyday checking"), account("a2", "Travel card"), account("gone", "Old bank", false)];
const categories: MobileCategory[] = [
  { id: "c-food", name: "Groceries", kind: "expense", color: "#000" },
  { id: "c-pay", name: "Salary", kind: "income", color: "#000" },
];
const txn = (over: Partial<MobileTransaction> = {}): MobileTransaction => ({
  id: "t1",
  amount: 1234,
  direction: "debit",
  occurredAt: "2026-09-29T12:00:00+00:00",
  description: "Trader Joe's",
  note: "weekly shop",
  isTransfer: false,
  category: { id: "c-food", name: "Groceries", color: "#000" },
  account: { id: "a2", name: "Travel card" },
  source: "manual",
  uncategorized: false,
  ...over,
});

const find = (r: ReturnType<typeof render>, id: string) => byTestId(r, id);
async function press(r: ReturnType<typeof render>, id: string) {
  await act(async () => {
    await find(r, id).props.onPress();
  });
}
function pick(r: ReturnType<typeof render>, select: string, value: string) {
  act(() => find(r, select).props.onPress());
  act(() => find(r, `${select}-option-${value}`).props.onPress());
}

function form(over: Partial<Parameters<typeof TransactionForm>[0]> = {}) {
  const save = vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" }));
  const onDone = vi.fn();
  const r = render(
    <TransactionForm accounts={accounts} categories={categories} defaultDate="2026-09-29" submitLabel="Add" save={save} onDone={onDone} {...over} />,
  );
  return { r, save, onDone };
}

describe("dates", () => {
  it("shows the sheet's long date with the web's formatter, without shifting a day", () => {
    expect(fullDateLabel("2026-09-29T12:00:00+00:00", "en-US")).toBe("Tuesday, September 29, 2026");
  });
});

describe("TransactionForm (web transaction-form.tsx)", () => {
  it("starts as the web's new entry: first account, Money out, Uncategorized, the given date", () => {
    const { r } = form();
    expect(find(r, "txn-form-account").props.accessibilityLabel).toBe("Account, Everyday checking");
    expect(find(r, "txn-form-direction").props.accessibilityLabel).toBe("Direction, Money out");
    expect(find(r, "txn-form-category").props.accessibilityLabel).toBe("Category, Uncategorized");
    expect(find(r, "txn-form-date").props.accessibilityLabel).toBe("Date, 09/29/2026");
    expect(texts(find(r, "txn-form-save"))).toContain("Add");
  });

  it("lists only accounts that can take an entry, and marks income categories", () => {
    const { r } = form();
    act(() => find(r, "txn-form-account").props.onPress());
    expect(() => find(r, "txn-form-account-option-gone")).toThrow();
    act(() => find(r, "txn-form-category").props.onPress());
    expect(textContent(find(r, "txn-form-category-option-c-pay"))).toContain("Salary (income)");
  });

  it("stops an empty amount without sending, then sends the draft with one request id across retries", async () => {
    const { r, save, onDone } = form();
    await press(r, "txn-form-save");
    expect(save).not.toHaveBeenCalled();
    expect(textContent(find(r, "txn-form-amount-error"))).toBe("Enter an amount");

    save.mockResolvedValueOnce({ status: "error", kind: "network", message: "Couldn't reach Budgts." });
    act(() => find(r, "txn-form-amount").props.onChangeText("12.50"));
    pick(r, "txn-form-category", "c-food");
    act(() => find(r, "txn-form-description").props.onChangeText("Lunch"));
    await press(r, "txn-form-transfer");
    await press(r, "txn-form-save");
    expect(textContent(find(r, "txn-form-message"))).toBe("Couldn't reach Budgts.");
    expect(onDone).not.toHaveBeenCalled();

    await press(r, "txn-form-save");
    expect(save).toHaveBeenCalledTimes(2);
    const [draft, id1] = save.mock.calls[0] as unknown as [Record<string, unknown>, string];
    const [, id2] = save.mock.calls[1] as unknown as [unknown, string];
    expect(draft).toMatchObject({ accountId: "a1", categoryId: "c-food", amount: "12.50", direction: "debit", date: "2026-09-29", description: "Lunch", isTransfer: true });
    expect(id1).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(id2).toBe(id1);
    expect(onDone).toHaveBeenCalledWith(true, { id: undefined, replayed: false });
  });

  it("shows each field error the server names under its field (occurredAt under Date)", async () => {
    const { r, save } = form();
    save.mockResolvedValueOnce({ status: "invalid", fieldErrors: { amount: "Amount must be positive", occurredAt: "Pick a real date" } });
    act(() => find(r, "txn-form-amount").props.onChangeText("-1"));
    await press(r, "txn-form-save");
    expect(textContent(find(r, "txn-form-amount-error"))).toBe("Amount must be positive");
    expect(textContent(find(r, "txn-form-date-error"))).toBe("Pick a real date");
  });

  it("picks a date in the platform's date dialog (kit DateField)", () => {
    const { r } = form();
    act(() => find(r, "txn-form-date").props.onPress());
    act(() => picker.opened.at(-1)!.onChange({ type: "set" }, new Date(2026, 7, 14)));
    expect(find(r, "txn-form-date").props.accessibilityLabel).toBe("Date, 08/14/2026");
  });

  it("a 2-line note and the transfer box, as the web's textarea and checkbox", async () => {
    const { r } = form();
    expect(find(r, "txn-form-note").props.multiline).toBe(true);
    expect(find(r, "txn-form-transfer").props.accessibilityState).toMatchObject({ checked: false });
    act(() => find(r, "txn-form-transfer").props.onPress());
    expect(find(r, "txn-form-transfer").props.accessibilityState).toMatchObject({ checked: true });
  });

  it("edits a row as it is, its own account added at the end of the list when it can no longer take entries, no request id", async () => {
    const { r, save } = form({ initial: txn({ account: { id: "gone", name: "Old bank" } }), submitLabel: "Save changes" });
    expect(find(r, "txn-form-account").props.accessibilityLabel).toBe("Account, Old bank");
    act(() => find(r, "txn-form-account").props.onPress());
    const listed = r.root
      .findAll((n) => typeof n.type === "string" && typeof n.props.testID === "string" && n.props.testID.startsWith("txn-form-account-option-"))
      .map((n) => n.props.testID.replace("txn-form-account-option-", ""));
    expect(listed).toEqual(["a1", "a2", "gone"]); // the web appends it (transaction-form.tsx accountOptions)
    expect(find(r, "txn-form-amount").props.value).toBe("12.34");
    await press(r, "txn-form-save");
    expect(save.mock.calls[0]).toEqual([expect.objectContaining({ accountId: "gone", note: "weekly shop" }), undefined]);
  });

  it("a bank row's account is shown, not chosen: the web's px-band line, and the save keeps it (owner decision 2026-09-30)", async () => {
    const { r, save } = form({ initial: txn({ source: "bank", account: { id: "gone", name: "Chase checking" } }), submitLabel: "Save changes" });
    expect(() => find(r, "txn-form-account")).toThrow();
    const locked = r.root.find((n) => n.type === PixelFrame && n.props.testID === "txn-form-account-locked");
    expect(textContent(locked)).toBe("Chase checking");
    expect(locked.props.frame).toBe("px-band");
    const words = r.root.find((n) => (n.type as unknown) === "Text" && textContent(n) === "Chase checking");
    expect(flat(words.props.style)).toMatchObject({ fontSize: 16, lineHeight: 24, color: "#3d3d3d" });
    await press(r, "txn-form-save");
    expect((save.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({ accountId: "gone" });
  });

  it("a manual row's account is still a choice", () => {
    const { r } = form({ initial: txn({ source: "manual" }), submitLabel: "Save changes" });
    expect(find(r, "txn-form-account").props.accessibilityLabel).toBe("Account, Travel card");
  });

  it("a retry the server answers as replayed reports the row it kept (the first try had landed)", async () => {
    const { r, save, onDone } = form();
    act(() => find(r, "txn-form-amount").props.onChangeText("12.50"));
    save.mockResolvedValueOnce({ status: "error", kind: "network", message: "Couldn't reach Budgts." });
    await press(r, "txn-form-save");
    act(() => find(r, "txn-form-amount").props.onChangeText("15.00"));
    save.mockResolvedValueOnce({ status: "ok", id: "t-kept", replayed: true });
    await press(r, "txn-form-save");
    expect(onDone).toHaveBeenCalledWith(true, { id: "t-kept", replayed: true });
  });

  it("a retry after a lost answer whose first try never landed is a plain save, not a replay", async () => {
    const { r, save, onDone } = form();
    act(() => find(r, "txn-form-amount").props.onChangeText("12.50"));
    save.mockResolvedValueOnce({ status: "error", kind: "network", message: "Couldn't reach Budgts." });
    await press(r, "txn-form-save");
    save.mockResolvedValueOnce({ status: "ok", id: "t-new" });
    await press(r, "txn-form-save");
    expect(onDone).toHaveBeenCalledWith(true, { id: "t-new", replayed: false });
  });

  it("Cancel closes without saving", async () => {
    const { r, save, onDone } = form();
    await press(r, "txn-form-cancel");
    expect(onDone).toHaveBeenCalledWith(false);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("a direction-locked form (web transaction-form.tsx initialDirection + lockDirection: Home's Add income)", () => {
  it("shows the direction as the web's read-only px-band line, narrows categories to income, and saves money in", async () => {
    const { r, save } = form({ initialDirection: "credit", lockDirection: true, submitLabel: "Add" });
    expect(() => find(r, "txn-form-direction")).toThrow();
    const band = r.root.find((n) => n.type === PixelFrame && n.props.testID === "txn-form-direction-locked");
    expect(band.props.frame).toBe("px-band");
    expect(textContent(band)).toBe("Money in");
    const words = r.root.find((n) => (n.type as unknown) === "Text" && textContent(n) === "Money in");
    expect(flat(words.props.style)).toMatchObject({ fontSize: 16, lineHeight: 24, color: "#3d3d3d" });
    // income categories only, no "(income)" mark, the first one chosen (the web's defaultValue)
    expect(find(r, "txn-form-category").props.accessibilityLabel).toBe("Category, Salary");
    act(() => find(r, "txn-form-category").props.onPress());
    expect(() => find(r, "txn-form-category-option-c-food")).toThrow();
    expect(textContent(find(r, "txn-form-category-option-c-pay"))).not.toContain("(income)");
    act(() => find(r, "txn-form-amount").props.onChangeText("2500"));
    await press(r, "txn-form-save");
    expect((save.mock.calls[0] as unknown as [Record<string, unknown>])[0]).toMatchObject({ direction: "credit", categoryId: "c-pay", amount: "2500" });
  });

  it("locked to money out: 'Money out', and every category", () => {
    const { r } = form({ initialDirection: "debit", lockDirection: true });
    expect(textContent(r.root.find((n) => n.type === PixelFrame && n.props.testID === "txn-form-direction-locked"))).toBe("Money out");
    act(() => find(r, "txn-form-category").props.onPress());
    expect(find(r, "txn-form-category-option-c-food")).toBeTruthy();
  });

  it("an unlocked credit start preselects money in but leaves the picker", () => {
    const { r } = form({ initialDirection: "credit" });
    expect(find(r, "txn-form-direction").props.accessibilityLabel).toBe("Direction, Money in");
    expect(find(r, "txn-form-category").props.accessibilityLabel).toBe("Category, Salary (income)");
  });

  it("editing ignores the lock: the row's own direction, every category", () => {
    const { r } = form({ initial: txn(), initialDirection: "credit", lockDirection: true, submitLabel: "Save changes" });
    expect(find(r, "txn-form-direction").props.accessibilityLabel).toBe("Direction, Money out");
    expect(find(r, "txn-form-category").props.accessibilityLabel).toBe("Category, Groceries");
  });
});

describe("AddIncomeSheet (web income-tile.tsx)", () => {
  it("is the form under 'Add income', locked to money in, saving through the create command with 'Add'", async () => {
    const cmds = commands();
    const onClose = vi.fn();
    const r = render(<AddIncomeSheet data={ready} defaultDate="2026-09-30" commands={cmds} onClose={onClose} />);
    expect(textContent(find(r, "sheet-title"))).toBe("Add income");
    expect(textContent(r.root.find((n) => n.type === PixelFrame && n.props.testID === "txn-form-direction-locked"))).toBe("Money in");
    expect(texts(find(r, "txn-form-save"))).toContain("Add");
    act(() => find(r, "txn-form-amount").props.onChangeText("100"));
    await press(r, "txn-form-save");
    expect(cmds.create).toHaveBeenCalledWith(expect.objectContaining({ direction: "credit", categoryId: "c-pay", date: "2026-09-30" }), expect.any(String));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("the Transaction sheet (web list detail)", () => {
  it("opened for a replayed create, says what happened above the facts", () => {
    const r = render(<TransactionDetailSheet transaction={txn()} currency="USD" alreadySaved onClose={vi.fn()} onEdit={vi.fn()} onToggleTransfer={vi.fn()} />);
    expect(textContent(find(r, "txn-detail-replayed"))).toBe("This was already saved. Changes made after that weren't applied.");
    // above the facts, in reading order
    const ids = r.root.findAll((n) => typeof n.type === "string" && typeof n.props.testID === "string").map((n) => n.props.testID);
    expect(ids.indexOf("txn-detail-replayed")).toBeLessThan(ids.indexOf("txn-detail-facts"));
  });

  it("opened from the list, no such line", () => {
    const r = render(<TransactionDetailSheet transaction={txn()} currency="USD" onClose={vi.fn()} onEdit={vi.fn()} onToggleTransfer={vi.fn()} />);
    expect(() => find(r, "txn-detail-replayed")).toThrow();
  });

  it("shows the row's facts and flips transfer with the row otherwise unchanged", async () => {
    const onToggle = vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" }));
    const onEdit = vi.fn();
    const r = render(<TransactionDetailSheet transaction={txn()} currency="USD" onClose={vi.fn()} onEdit={onEdit} onToggleTransfer={onToggle} />);
    const facts = textContent(find(r, "txn-detail-facts"));
    for (const s of ["Date", "Tuesday, September 29, 2026", "Category", "Groceries", "Account", "Travel card", "Amount", "−$12.34"]) expect(facts).toContain(s);
    expect(texts(r.root).join(" ")).toContain("weekly shop");

    await press(r, "txn-detail-transfer");
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
    expect(find(r, "txn-detail-transfer").props.accessibilityLabel).toBe("Remove transfer");
    expect(textContent(find(r, "txn-detail-facts"))).toContain("Transfer");

    await press(r, "txn-detail-edit");
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "t1", isTransfer: true }));
  });

  it("says why when the flip fails and keeps the row as it was", async () => {
    const onToggle = vi.fn(async (): Promise<MutationOutcome> => ({ status: "error", kind: "unavailable", message: "Something went wrong. Please try again." }));
    const r = render(<TransactionDetailSheet transaction={txn()} currency="USD" onClose={vi.fn()} onEdit={vi.fn()} onToggleTransfer={onToggle} />);
    await press(r, "txn-detail-transfer");
    expect(textContent(find(r, "txn-detail-error"))).toBe("Something went wrong. Please try again.");
    expect(find(r, "txn-detail-transfer").props.accessibilityLabel).toBe("Mark as transfer");
  });

  it("a transfer toggle re-sends the row with only isTransfer flipped (web toggleTransfer)", () => {
    expect(transferToggleDraft(txn())).toEqual({
      accountId: "a2",
      categoryId: "c-food",
      amount: "12.34",
      direction: "debit",
      date: "2026-09-29",
      description: "Trader Joe's",
      note: "weekly shop",
      isTransfer: true,
    });
  });
});

const ready = {
  accounts: { status: "ready" as const, data: { accounts, accountTypes: ["checking"] } },
  categories: { status: "ready" as const, data: categories },
  onRetry: vi.fn(),
  notice: null,
  onRefresh: vi.fn(),
};
const commands = () => ({
  create: vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok", id: "new" })),
  update: vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" })),
  remove: vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" })),
  categorize: vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" })),
  rescan: vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" })),
  createCategory: vi.fn(async () => ({ ok: true as const })),
});

describe("Add and Edit sheets", () => {
  it("Add is the form under 'Add transaction'; it waits for its lists and offers Try again when they fail", () => {
    const loading = render(
      <AddTransactionSheet data={{ ...ready, accounts: { status: "loading" } }} defaultDate="2026-09-15" commands={commands()} onClose={vi.fn()} />,
    );
    expect(find(loading, "txn-form-loading")).toBeTruthy();
    const onRetry = vi.fn();
    const failed = render(
      <AddTransactionSheet
        data={{ ...ready, onRetry, accounts: { status: "error", kind: "network", message: "Couldn't reach Budgts." } }}
        defaultDate="2026-09-15"
        commands={commands()}
        onClose={vi.fn()}
      />,
    );
    expect(textContent(find(failed, "txn-form-failed"))).toContain("Couldn't reach Budgts.");
    act(() => failed.root.find((n) => typeof n.type === "string" && n.props.accessibilityLabel === "Try again").props.onPress());
    expect(onRetry).toHaveBeenCalled();
    const r = render(<AddTransactionSheet data={ready} defaultDate="2026-09-15" commands={commands()} onClose={vi.fn()} />);
    expect(textContent(find(r, "sheet-title"))).toBe("Add transaction"); // the sheet's title
    expect(texts(find(r, "txn-form-save"))).toContain("Add"); // web add-transaction.tsx: submitLabel "Add"
    expect(texts(find(r, "txn-form-save"))).not.toContain("Add transaction");
    expect(find(r, "txn-form-date").props.accessibilityLabel).toBe("Date, 09/15/2026");
  });

  it("says when its lists are stale (a reload failed and kept the older ones), with Retry that keeps the form", () => {
    const onRefresh = vi.fn();
    const onRetry = vi.fn();
    const stale = { ...ready, notice: "Couldn't reach Budgts. Check your connection and try again.", onRefresh, onRetry };
    for (const sheet of [
      <AddTransactionSheet key="add" data={stale} defaultDate="2026-09-15" commands={commands()} onClose={vi.fn()} />,
      <AddIncomeSheet key="income" data={stale} defaultDate="2026-09-15" commands={commands()} onClose={vi.fn()} />,
      <EditTransactionSheet key="edit" transaction={txn()} data={stale} commands={commands()} onClose={vi.fn()} />,
    ]) {
      const r = render(sheet);
      expect(textContent(find(r, "txn-form-notice"))).toContain(
        "These accounts and categories may be out of date. Couldn't reach Budgts. Check your connection and try again.",
      );
      // the form stays, with what the user typed
      expect(find(r, "txn-form-save")).toBeTruthy();
      act(() => find(r, "txn-form-notice").findAll((n) => typeof n.type === "string" && n.props.accessibilityLabel === "Retry")[0]!.props.onPress());
    }
    expect(onRefresh).toHaveBeenCalledTimes(3);
    expect(onRetry).not.toHaveBeenCalled();
    expect(render(<AddTransactionSheet data={ready} defaultDate="2026-09-15" commands={commands()} onClose={vi.fn()} />).root.findAll((n) => n.props.testID === "txn-form-notice")).toHaveLength(0);
  });

  it("Edit deletes only after the confirm, then closes", async () => {
    const cmds = commands();
    const onClose = vi.fn();
    let yes: (() => void) | null = null;
    const r = render(<EditTransactionSheet transaction={txn()} data={ready} commands={cmds} onClose={onClose} confirm={(f) => (yes = f)} />);
    expect(texts(find(r, "txn-form-save"))).toContain("Save changes");
    await press(r, "txn-delete");
    expect(cmds.remove).not.toHaveBeenCalled();
    await act(async () => {
      await yes!();
    });
    expect(cmds.remove).toHaveBeenCalledWith("t1");
    expect(onClose).toHaveBeenCalled();
  });

  it("a failed delete stays open and says why", async () => {
    const cmds = commands();
    cmds.remove.mockResolvedValueOnce({ status: "error", kind: "network", message: "Couldn't reach Budgts." });
    const onClose = vi.fn();
    const r = render(<EditTransactionSheet transaction={txn()} data={ready} commands={cmds} onClose={onClose} confirm={(f) => f()} />);
    await press(r, "txn-delete");
    await act(async () => {});
    expect(textContent(find(r, "txn-delete-error"))).toBe("Couldn't reach Budgts.");
    expect(onClose).not.toHaveBeenCalled();
    expect(flat(find(r, "txn-delete").props.style)).toMatchObject({ marginTop: 12 });
  });
});
