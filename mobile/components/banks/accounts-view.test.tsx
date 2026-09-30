import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { byTestId, render, textContent, texts } from "../../test/render";
import { getVersion } from "../../lib/api/invalidate";
import type { AccountCommands, AccountsOverview, OverviewAccount } from "../../lib/accounts/overview-api";
import { RowMenu, type RowMenuItem } from "../kit/row-menu";
import { AccountsView, accountMeta } from "./accounts-view";

/** A row menu's items (the kit menu opens by measuring the kebab on a device; its own tests cover opening). */
const menu = (r: ReturnType<typeof render>, id: string): RowMenuItem[] =>
  r.root.find((n) => n.type === RowMenu && n.props.testID === `account-row-${id}-menu`).props.items;
const pick = async (r: ReturnType<typeof render>, id: string, label: string) => {
  await act(async () => {
    menu(r, id).find((i) => i.label === label)!.onSelect();
  });
};

const acct = (over: Partial<OverviewAccount>): OverviewAccount => ({ id: "a1", name: "Everyday checking", type: "checking", isArchived: false, mask: null, txnCount: 3, ...over });
const overview: AccountsOverview = {
  month: "2026-09",
  groups: [
    { key: "item-1", title: "Linked · First Platypus Bank", status: "connected", accounts: [acct({ id: "a2", name: "Plaid Checking", mask: "0000", txnCount: 1 })] },
    { key: "item-2", title: "Linked · Tartan Bank", status: "attention", accounts: [acct({ id: "a4", name: "Card 9876", type: "credit", mask: "9876", txnCount: 0 })] },
    { key: "by-hand", title: "Added by hand", status: null, accounts: [acct({}), acct({ id: "a5", name: "Wallet", type: "cash" })] },
  ],
  archived: [acct({ id: "a3", name: "Old savings", type: "savings", isArchived: true, txnCount: 0 })],
};
const ok = async () => ({ status: "ok" as const });
const commands = (over: Partial<AccountCommands> = {}): AccountCommands => ({ create: vi.fn(ok), update: vi.fn(ok), setArchived: vi.fn(ok), ...over });
const view = (c = commands(), o = overview) =>
  render(<AccountsView overview={o} accountTypes={["checking", "credit", "cash", "savings"]} commands={c} onBack={() => {}} />);
const press = async (r: ReturnType<typeof render>, id: string) => {
  await act(async () => {
    byTestId(r, id).props.onPress();
  });
};

describe("Accounts (web /accounts)", () => {
  it("groups by bank with its state, then by hand, then archived, under the web's title, Add and lead line", () => {
    const r = view();
    expect(textContent(byTestId(r, "page-title"))).toBe("Accounts");
    expect(byTestId(r, "accounts-add").props.accessibilityLabel).toBe("Add account");
    const words = texts(r);
    expect(words).toContain("Accounts hold your transactions. Linked ones update on their own; add cash or anything else by hand.");
    expect(words.filter((t) => t.startsWith("Linked") || t === "Added by hand" || t === "Archived")).toEqual([
      "Linked · First Platypus Bank",
      "Linked · Tartan Bank",
      "Added by hand",
      "Archived",
    ]);
    expect(words).toEqual(expect.arrayContaining(["Connected", "Needs attention"]));
    expect(textContent(byTestId(r, "account-row-a2-name"))).toBe("Plaid Checking ••0000");
    // a name that already carries the last four doesn't repeat them
    expect(textContent(byTestId(r, "account-row-a4-name"))).toBe("Card 9876");
    expect(textContent(byTestId(r, "account-row-a2-meta"))).toBe("Checking · 1 transaction this month");
  });

  it("words this month's count like the web", () => {
    expect(accountMeta({ type: "cash", txnCount: 0 })).toBe("Cash · nothing this month");
    expect(accountMeta({ type: "savings", txnCount: 12 })).toBe("Savings · 12 transactions this month");
  });

  it("archives and restores from a row's menu, and edit is offered only for an active account", async () => {
    const c = commands();
    const r = view(c);
    expect(menu(r, "a1").map((i) => [i.label, i.icon])).toEqual([
      ["Edit", "edit"],
      ["Archive", "archive"],
    ]);
    const before = getVersion("accounts");
    await pick(r, "a1", "Archive");
    expect(c.setArchived).toHaveBeenCalledWith("a1", true);
    expect(getVersion("accounts")).toBe(before + 1);
    expect(menu(r, "a3").map((i) => i.label)).toEqual(["Restore"]);
    await pick(r, "a3", "Restore");
    expect(c.setArchived).toHaveBeenCalledWith("a3", false);
  });

  it("shows a refused archive rather than failing silently", async () => {
    const r = view(commands({ setArchived: vi.fn(async () => ({ status: "error" as const, message: "Your account is being deleted, so changes are paused." })) }));
    await pick(r, "a1", "Archive");
    expect(textContent(byTestId(r, "accounts-error"))).toBe("Your account is being deleted, so changes are paused.");
  });

  it("adds an account in the web's sheet: name, type, Add", async () => {
    const c = commands();
    const r = view(c);
    await press(r, "accounts-add");
    expect(byTestId(r, "sheet").props.accessibilityLabel).toBe("Add account");
    await act(async () => byTestId(r, "account-form-name").props.onChangeText("Cash jar"));
    await press(r, "account-form-type");
    await press(r, "account-form-type-option-cash");
    expect(byTestId(r, "account-form-submit").props.accessibilityLabel).toBe("Add");
    await press(r, "account-form-submit");
    expect(c.create).toHaveBeenCalledWith({ name: "Cash jar", type: "cash" });
    expect(r.root.findAll((n) => n.props.testID === "account-form")).toHaveLength(0);
  });

  it("edits in the sheet with the account filled in, and keeps it open with the server's reason when refused", async () => {
    const c = commands({ update: vi.fn(async () => ({ status: "error" as const, message: "Name is required" })) });
    const r = view(c);
    await pick(r, "a1", "Edit");
    expect(byTestId(r, "sheet").props.accessibilityLabel).toBe("Edit account");
    expect(byTestId(r, "account-form-name").props.value).toBe("Everyday checking");
    await act(async () => byTestId(r, "account-form-name").props.onChangeText(""));
    await press(r, "account-form-submit");
    expect(c.update).toHaveBeenCalledWith("a1", { name: "", type: "checking" });
    expect(textContent(byTestId(r, "account-form-error"))).toBe("Name is required");
    await press(r, "account-form-cancel");
    expect(r.root.findAll((n) => n.props.testID === "account-form")).toHaveLength(0);
  });
});
