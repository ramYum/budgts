import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { MobileAccount } from "../../lib/accounts/accounts-api";
import type { MutationOutcome } from "../../lib/api/load";
import type { MobileCategory } from "../../lib/categories/categories-api";
import type { MobileTransaction } from "../../lib/transactions/transactions-api";
import { byTestId, flat, render, textContent, texts } from "../../test/render";
import { dateFieldLabel, monthGrid } from "./date-field";
import { TransactionForm, transferToggleDraft } from "./transaction-form";
import { AddTransactionSheet, EditTransactionSheet, TransactionDetailSheet, fullDateLabel } from "./transaction-sheets";

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
    <TransactionForm accounts={accounts} categories={categories} defaultDate="2026-09-29" submitLabel="Add transaction" save={save} onDone={onDone} {...over} />,
  );
  return { r, save, onDone };
}

describe("dates", () => {
  it("lays out a month Sunday first (September 2026 starts on a Tuesday)", () => {
    const g = monthGrid("2026-09");
    expect(g[0]).toEqual([null, null, "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
    expect(g.flat().filter(Boolean)).toHaveLength(30);
    expect(g.every((w) => w.length === 7)).toBe(true);
  });

  it("shows a day as the browser's date field does, and the sheet's long date, without shifting a day", () => {
    expect(dateFieldLabel("2026-09-29", "en-US")).toBe("09/29/2026");
    expect(fullDateLabel("2026-09-29T12:00:00+00:00", "en-US")).toBe("Tuesday, September 29, 2026");
  });
});

describe("TransactionForm (web transaction-form.tsx)", () => {
  it("starts as the web's new entry: first account, Money out, Uncategorized, the given date", () => {
    const { r } = form();
    expect(find(r, "txn-form-account").props.accessibilityLabel).toBe("Account, Everyday checking");
    expect(find(r, "txn-form-direction").props.accessibilityLabel).toBe("Direction, Money out");
    expect(find(r, "txn-form-category").props.accessibilityLabel).toBe("Category, Uncategorized");
    expect(textContent(find(r, "txn-form-date-value"))).toBe(dateFieldLabel("2026-09-29"));
    expect(texts(find(r, "txn-form-save"))).toContain("Add transaction");
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
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it("shows each field error the server names under its field (occurredAt under Date)", async () => {
    const { r, save } = form();
    save.mockResolvedValueOnce({ status: "invalid", fieldErrors: { amount: "Amount must be positive", occurredAt: "Pick a real date" } });
    act(() => find(r, "txn-form-amount").props.onChangeText("-1"));
    await press(r, "txn-form-save");
    expect(textContent(find(r, "txn-form-amount-error"))).toBe("Amount must be positive");
    expect(textContent(find(r, "txn-form-date-error"))).toBe("Pick a real date");
  });

  it("picks a date from the month sheet", () => {
    const { r } = form();
    act(() => find(r, "txn-form-date").props.onPress());
    act(() => find(r, "txn-form-date-calendar-prev").props.onPress());
    act(() => find(r, "txn-form-date-calendar-2026-08-14").props.onPress());
    expect(textContent(find(r, "txn-form-date-value"))).toBe(dateFieldLabel("2026-08-14"));
  });

  it("edits a row as it is, keeping its account listed even when it can no longer take entries, with no request id", async () => {
    const { r, save } = form({ initial: txn({ account: { id: "gone", name: "Old bank" } }), submitLabel: "Save changes" });
    expect(find(r, "txn-form-account").props.accessibilityLabel).toBe("Account, Old bank");
    expect(find(r, "txn-form-amount").props.value).toBe("12.34");
    await press(r, "txn-form-save");
    expect(save.mock.calls[0]).toEqual([expect.objectContaining({ accountId: "gone", note: "weekly shop" }), undefined]);
  });

  it("Cancel closes without saving", async () => {
    const { r, save, onDone } = form();
    await press(r, "txn-form-cancel");
    expect(onDone).toHaveBeenCalledWith(false);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("the Transaction sheet (web list detail)", () => {
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

const ready = { accounts: { status: "ready" as const, data: { accounts, accountTypes: ["checking"] } }, categories: { status: "ready" as const, data: categories }, onRetry: vi.fn() };
const commands = () => ({
  create: vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok", id: "new" })),
  update: vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" })),
  remove: vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" })),
  categorize: vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" })),
  rescan: vi.fn(async (): Promise<MutationOutcome> => ({ status: "ok" })),
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
    expect(texts(r.root)).toContain("Add transaction");
    expect(textContent(find(r, "txn-form-date-value"))).toBe(dateFieldLabel("2026-09-15"));
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
