import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { byTestId, render, texts } from "../../test/render";

vi.mock("../../lib/auth/auth-context", () => ({ useAuth: () => ({ session: null }) }));
const api = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock("../../lib/auth/api", () => ({ authFetch: api.authFetch, NotAuthenticatedError: class NotAuthenticatedError extends Error {} }));
vi.mock("react-native-plaid-link-sdk", () => ({ sdkVersion: "13.0.0", createPlaidLinkSession: vi.fn() }));

import { getVersion } from "../../lib/api/invalidate";
import type { UnmappedAccount } from "../../lib/plaid/banks-api";
import type { PlaidLinkClient } from "../../lib/plaid/plaid-link";
import { AccountMapping, AccountMappingSheet } from "./account-mapping";
import { ConnectBank } from "./connect-bank";

const account = (over: Partial<UnmappedAccount> = {}): UnmappedAccount => ({
  plaidAccountId: "pa1",
  name: "Plaid Checking",
  officialName: "Plaid Gold Standard 0% Interest Checking",
  mask: "0000",
  type: "depository",
  subtype: "checking",
  currentBalance: 11000,
  isoCurrencyCode: "USD",
  ...over,
});
const savings = account({ plaidAccountId: "pa2", name: "Plaid Saving", mask: "1111", subtype: "savings" });
const card = account({ plaidAccountId: "pa3", name: "Plaid Credit Card", mask: "3333", type: "credit", subtype: "credit card" });
const choices = { budgtsAccounts: [{ id: "acct-1", name: "Everyday checking" }, { id: "acct-2", name: "Travel card" }], accountTypes: ["checking", "credit", "cash", "savings"] };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const press = async (r: ReturnType<typeof render>, id: string) => {
  await act(async () => {
    byTestId(r, id).props.onPress();
  });
};

describe("AccountMapping (web account-mapping.tsx)", () => {
  it("offers each account as a new Budgts account first, named and typed from Plaid's guess", () => {
    const r = render(<AccountMapping plaidAccounts={[account(), savings, card]} choices={choices} onSave={vi.fn()} onDone={() => {}} />);
    const words = texts(r);
    expect(words).toContain("Each account can become a new Budgts account, feed one you already have, or be left out.");
    expect(words).toEqual(expect.arrayContaining(["Plaid Checking ••0000", "checking", "Plaid Saving ••1111", "savings", "Plaid Credit Card ••3333", "credit card"]));
    expect(byTestId(r, "account-mapping-mode-0").props.accessibilityLabel).toBe("Import as, A new Budgts account");
    expect(byTestId(r, "account-mapping-name-1").props.value).toBe("Plaid Saving ••1111");
    expect(byTestId(r, "account-mapping-type-1").props.accessibilityLabel).toBe("New account type, Savings");
    expect(byTestId(r, "account-mapping-type-2").props.accessibilityLabel).toBe("New account type, Credit");
    expect(byTestId(r, "account-mapping-name-0").props.maxLength).toBe(40);
    expect(texts(r)).toContain("Import transactions");
  });

  it("saves the web's entries: new, existing and left out", async () => {
    const onSave = vi.fn(async () => ({ status: "ok" as const }));
    const onDone = vi.fn();
    const r = render(<AccountMapping plaidAccounts={[account(), savings, card]} choices={choices} onSave={onSave} onDone={onDone} />);
    await press(r, "account-mapping-mode-1");
    await press(r, "account-mapping-mode-1-option-existing");
    await press(r, "account-mapping-existing-1");
    await press(r, "account-mapping-existing-1-option-acct-2");
    await press(r, "account-mapping-mode-2");
    await press(r, "account-mapping-mode-2-option-ignore");
    await act(async () => byTestId(r, "account-mapping-name-0").props.onChangeText("  Joint checking "));
    await press(r, "account-mapping-save");
    expect(onSave).toHaveBeenCalledWith([
      { plaidAccountId: "pa1", mode: "new", name: "Joint checking", type: "checking" },
      { plaidAccountId: "pa2", mode: "existing", existingAccountId: "acct-2" },
      { plaidAccountId: "pa3", mode: "ignore" },
    ]);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("can't point at an existing account when there is none", async () => {
    const r = render(<AccountMapping plaidAccounts={[account()]} choices={{ ...choices, budgtsAccounts: [] }} onSave={vi.fn()} onDone={() => {}} />);
    await press(r, "account-mapping-mode-0");
    expect(byTestId(r, "account-mapping-mode-0-option-existing").props.disabled).toBe(true);
  });

  it("shows a refused save and keeps the choices; a sync that didn't finish shows its warning with Done", async () => {
    const onSave = vi
      .fn()
      .mockResolvedValueOnce({ status: "error", message: "Could not save the account mapping. Try again." })
      .mockResolvedValueOnce({ status: "ok", warning: "Connected, but the first sync didn't finish. It'll retry shortly." });
    const onDone = vi.fn();
    const r = render(<AccountMapping plaidAccounts={[account()]} choices={choices} onSave={onSave} onDone={onDone} />);
    await press(r, "account-mapping-save");
    expect(texts(r)).toContain("Could not save the account mapping. Try again.");
    await press(r, "account-mapping-save");
    expect(texts(r)).toContain("Connected, but the first sync didn't finish. It'll retry shortly.");
    expect(onDone).not.toHaveBeenCalled();
    await press(r, "account-mapping-done");
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("AccountMappingSheet", () => {
  beforeEach(() => api.authFetch.mockReset());

  it("is the web's sheet: its title, a close, and the saved mapping reaches every screen", async () => {
    api.authFetch.mockResolvedValue(json(200, { ok: true }));
    const onDone = vi.fn();
    const onClose = vi.fn();
    const before = getVersion("transactions");
    const r = render(<AccountMappingSheet plaidItemId="item-row" plaidAccounts={[account()]} choices={choices} onDone={onDone} onClose={onClose} />);
    expect(byTestId(r, "sheet").props.accessibilityLabel).toBe("Choose which accounts to import");
    await press(r, "sheet-close");
    expect(onClose).toHaveBeenCalledTimes(1);
    await press(r, "account-mapping-save");
    expect(api.authFetch.mock.calls[0]![0]).toBe("/api/mobile/plaid/accounts/map");
    expect(getVersion("transactions")).toBe(before + 1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("ConnectBank (web connect-bank.tsx)", () => {
  beforeEach(() => api.authFetch.mockReset());
  const link = (outcome: Awaited<ReturnType<PlaidLinkClient["open"]>>): PlaidLinkClient => ({ isAvailable: () => true, open: vi.fn(async () => outcome) });

  it("connects, then opens the mapping sheet with the new bank's accounts and the user's accounts", async () => {
    api.authFetch.mockImplementation(async (path: string) => {
      if (path === "/api/plaid/link-token") return json(200, { link_token: "link-1" });
      if (path === "/api/plaid/exchange") return json(200, { plaidItemId: "item-row", accounts: [account()] });
      if (path === "/api/mobile/accounts")
        return json(200, {
          version: 1,
          accountTypes: ["checking", "credit", "cash", "savings"],
          accounts: [
            { id: "acct-1", name: "Everyday checking", type: "checking", source: "manual", archived: false, selectable: true },
            { id: "acct-9", name: "Old wallet", type: "cash", source: "manual", archived: true, selectable: false },
          ],
        });
      return json(404, { error: "not_found" });
    });
    const r = render(<ConnectBank link={link({ kind: "success", publicToken: "public-1", institution: { id: "ins_1", name: "First Platypus Bank" } })} />);
    expect(byTestId(r, "connect-bank").props.accessibilityLabel).toBe("Connect a bank");
    await press(r, "connect-bank");
    expect(byTestId(r, "sheet").props.accessibilityLabel).toBe("Choose which accounts to import");
    expect(texts(r)).toContain("Plaid Checking ••0000");
    await press(r, "account-mapping-mode-0");
    // archived accounts are not offered, as on the web
    expect(() => byTestId(r, "account-mapping-mode-0-option-existing")).not.toThrow();
    await press(r, "account-mapping-mode-0-option-existing");
    await press(r, "account-mapping-existing-0");
    expect(() => byTestId(r, "account-mapping-existing-0-option-acct-9")).toThrow();
  });

  it("says so when the bank is already connected, and shows nothing more when Link is closed", async () => {
    api.authFetch.mockImplementation(async (path: string) =>
      path === "/api/plaid/link-token" ? json(200, { link_token: "link-1" }) : json(409, { error: "already-linked", itemId: "p", plaidItemId: "r" }),
    );
    const r = render(<ConnectBank link={link({ kind: "success", publicToken: "public-1", institution: null })} />);
    await press(r, "connect-bank");
    expect(texts(r)).toContain("You've already connected this bank. Reconnect it from the list below if it needs attention.");

    const closed = render(<ConnectBank link={link({ kind: "exit" })} />);
    await press(closed, "connect-bank");
    expect(() => byTestId(closed, "connect-bank-error")).toThrow();
    expect(byTestId(closed, "connect-bank").props.accessibilityLabel).toBe("Connect a bank");
  });

  it("shows a failed start and lets the user try again", async () => {
    api.authFetch.mockResolvedValue(json(500, {}));
    const r = render(<ConnectBank label="Connect another bank" link={link({ kind: "exit" })} />);
    await press(r, "connect-bank");
    expect(texts(r)).toContain("Couldn't start the bank connection. Try again.");
    expect(byTestId(r, "connect-bank").props.accessibilityState).toMatchObject({ disabled: false });
  });
});
