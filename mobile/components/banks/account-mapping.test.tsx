import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { byTestId, flat, render, texts } from "../../test/render";

vi.mock("../../lib/auth/auth-context", () => ({ useAuth: () => ({ session: null }) }));
const api = vi.hoisted(() => ({ authFetch: vi.fn() }));
vi.mock("../../lib/auth/api", () => ({ authFetch: api.authFetch, NotAuthenticatedError: class NotAuthenticatedError extends Error {} }));
vi.mock("react-native-plaid-link-sdk", () => ({ sdkVersion: "13.0.0", createPlaidLinkSession: vi.fn() }));

import { getVersion } from "../../lib/api/invalidate";
import { ROLE } from "../../lib/brand/shared";
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
const SUGGESTIONS = "/api/mobile/plaid/accounts/suggestions?plaidItemId=item-row";
/** Every other path answers `res`; the sheet's suggestions read answers `suggestions` (none by default). */
const routes = (res: () => Response, suggestions: unknown = { version: 1, suggestions: {} }) =>
  api.authFetch.mockImplementation(async (path: string) => (path === SUGGESTIONS ? json(200, suggestions) : res()));
const settle = () => act(async () => {});
const press = async (r: ReturnType<typeof render>, id: string) => {
  await act(async () => {
    byTestId(r, id).props.onPress();
  });
};

describe("AccountMapping (web account-mapping.tsx)", () => {
  it("offers each account as a new Budgts account first, named and typed from Plaid's guess", () => {
    const r = render(<AccountMapping suggestions={{}} plaidAccounts={[account(), savings, card]} choices={choices} onSave={vi.fn()} onDone={() => {}} />);
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

  it("sizes the type picker like a select: the web's 112px at least, wide enough for its longest option, never truncated", () => {
    const r = render(<AccountMapping suggestions={{}} plaidAccounts={[account()]} choices={choices} onSave={vi.fn()} onDone={() => {}} />);
    const field = byTestId(r, "account-mapping-type-0");
    let box = field.parent!;
    while (typeof box.type !== "string" || box.props.testID !== "account-mapping-type-0-box") box = box.parent!;
    const style = flat(box.props.style);
    expect(style.minWidth).toBe(112);
    expect(style.width).toBeUndefined();
    expect(style.flexShrink).toBe(0);
    // every option's label sits in the field's sizing layer, so the field is as wide as the widest; none is cut short
    expect(texts(byTestId(r, "account-mapping-type-0-sizer"))).toEqual(["Checking", "Credit", "Cash", "Savings"]);
    let label = byTestId(r, "account-mapping-type-0-sizer").parent!;
    while (typeof label.type !== "string" || label.props.testID === "account-mapping-type-0-sizer") label = label.parent!;
    expect(flat(label.props.style)).toMatchObject({ flexGrow: 1 });
  });

  it("caps the type picker at half the row, so a long type label can't squeeze the name field away", () => {
    const long = { ...choices, accountTypes: ["checking", "a very long account type from the server"] };
    const r = render(<AccountMapping suggestions={{}} plaidAccounts={[account()]} choices={long} onSave={vi.fn()} onDone={() => {}} />);
    expect(flat(byTestId(r, "account-mapping-type-0-box").props.style)).toMatchObject({ minWidth: 112, maxWidth: "50%" });
    // the name field keeps the rest of the row (at 360px: 280 of content, at least 140 for the name)
    expect(flat(byTestId(r, "account-mapping-name-0").parent!.props.style)).toMatchObject({ flex: 1 });
    // past the cap the chosen label truncates on one line instead of spilling out of the field
    let label = byTestId(r, "account-mapping-type-0-sizer").parent!;
    while (typeof label.type !== "string" || label.props.testID === "account-mapping-type-0-sizer") label = label.parent!;
    expect(flat(label.props.style)).toMatchObject({ flexShrink: 1, minWidth: 0 });
  });

  it("shows a long name from its start when the field isn't being edited, as a web input does", () => {
    const long = account({ name: "Plaid Money Market", mask: "4444" });
    const r = render(<AccountMapping suggestions={{}} plaidAccounts={[long]} choices={choices} onSave={vi.fn()} onDone={() => {}} />);
    const name = () => byTestId(r, "account-mapping-name-0").props;
    expect(name().selection).toEqual({ start: 0, end: 0 });
    act(() => name().onFocus?.({}));
    expect(name().selection).toBeUndefined(); // editing: the caret is the user's
    act(() => name().onBlur?.({}));
    expect(name().selection).toEqual({ start: 0, end: 0 });
  });

  it("starts an HSA as Don't import, with the web's hint under its name; no other row has one", () => {
    const hsa = account({ plaidAccountId: "pa-hsa", name: "Plaid HSA", mask: "5555", subtype: "hsa" });
    const r = render(<AccountMapping suggestions={{}} plaidAccounts={[account(), hsa]} choices={choices} onSave={vi.fn()} onDone={() => {}} />);
    expect(byTestId(r, "account-mapping-mode-1").props.accessibilityLabel).toBe("Import as, Don't import this one");
    expect(texts(byTestId(r, "account-mapping-hint-1"))).toEqual(["Import it if you pay for care from it."]);
    expect(() => byTestId(r, "account-mapping-hint-0")).toThrow();
    // web `text-sm text-muted`, its own line between the name row and Import as
    const hint = byTestId(r, "account-mapping-hint-1");
    expect(hint.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ color: ROLE.muted })]));
    const row = byTestId(r, "account-mapping-row-1");
    const order = row.findAll((n) => typeof n.type === "string" && ["account-mapping-hint-1", "account-mapping-mode-1"].includes(n.props.testID)).map((n) => n.props.testID);
    expect(order).toEqual(["account-mapping-hint-1", "account-mapping-mode-1"]);
  });

  it("saves the web's entries: new, existing and left out", async () => {
    const onSave = vi.fn(async () => ({ status: "ok" as const }));
    const onDone = vi.fn();
    const r = render(<AccountMapping suggestions={{}} plaidAccounts={[account(), savings, card]} choices={choices} onSave={onSave} onDone={onDone} />);
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
    const r = render(<AccountMapping suggestions={{}} plaidAccounts={[account()]} choices={{ ...choices, budgtsAccounts: [] }} onSave={vi.fn()} onDone={() => {}} />);
    await press(r, "account-mapping-mode-0");
    expect(byTestId(r, "account-mapping-mode-0-option-existing").props.disabled).toBe(true);
  });

  it("shows a refused save and keeps the choices; a sync that didn't finish shows its warning with Done", async () => {
    const onSave = vi
      .fn()
      .mockResolvedValueOnce({ status: "error", message: "Could not save the account mapping. Try again." })
      .mockResolvedValueOnce({ status: "ok", warning: "Connected, but the first sync didn't finish. It'll retry shortly." });
    const onDone = vi.fn();
    const r = render(<AccountMapping suggestions={{}} plaidAccounts={[account()]} choices={choices} onSave={onSave} onDone={onDone} />);
    await press(r, "account-mapping-save");
    expect(texts(r)).toContain("Could not save the account mapping. Try again.");
    await press(r, "account-mapping-save");
    expect(texts(r)).toContain("Connected, but the first sync didn't finish. It'll retry shortly.");
    expect(onDone).not.toHaveBeenCalled();
    await press(r, "account-mapping-done");
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("AccountMapping refusals over stale data", () => {
  beforeEach(() => {
    api.authFetch.mockReset();
  });

  it("shows the server's refusal with a Refresh that closes onto the current list", async () => {
    const onDone = vi.fn();
    const onSave = vi.fn(async () => ({ status: "error" as const, message: "That account is already imported. Refresh to see where it goes.", stale: true as const }));
    const r = render(<AccountMapping suggestions={{}} plaidAccounts={[account()]} choices={choices} onSave={onSave} onDone={onDone} />);
    await press(r, "account-mapping-save");
    expect(texts(byTestId(r, "account-mapping-error"))).toEqual(["That account is already imported. Refresh to see where it goes."]);
    await press(r, "account-mapping-refresh");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("offers no Refresh for a failure that isn't about stale data", async () => {
    const onSave = vi.fn(async () => ({ status: "error" as const, message: "Could not save the account mapping. Try again." }));
    const r = render(<AccountMapping suggestions={{}} plaidAccounts={[account()]} choices={choices} onSave={onSave} onDone={() => {}} />);
    await press(r, "account-mapping-save");
    expect(() => byTestId(r, "account-mapping-refresh")).toThrow();
  });

  it("moves a row off an existing account that is no longer offered when the choices reload", async () => {
    const onSave = vi.fn(async () => ({ status: "ok" as const }));
    const r = render(<AccountMapping suggestions={{}} plaidAccounts={[account()]} choices={choices} onSave={onSave} onDone={() => {}} />);
    await press(r, "account-mapping-mode-0");
    await press(r, "account-mapping-mode-0-option-existing");
    await press(r, "account-mapping-existing-0");
    await press(r, "account-mapping-existing-0-option-acct-2");
    act(() => r.update(<AccountMapping suggestions={{}} plaidAccounts={[account()]} choices={{ ...choices, budgtsAccounts: [{ id: "acct-1", name: "Everyday checking" }] }} onSave={onSave} onDone={() => {}} />));
    await press(r, "account-mapping-save");
    expect(onSave).toHaveBeenLastCalledWith([{ plaidAccountId: "pa1", mode: "existing", existingAccountId: "acct-1" }]);
    act(() => r.update(<AccountMapping suggestions={{}} plaidAccounts={[account()]} choices={{ ...choices, budgtsAccounts: [] }} onSave={onSave} onDone={() => {}} />));
    await press(r, "account-mapping-save");
    expect(onSave).toHaveBeenLastCalledWith([{ plaidAccountId: "pa1", mode: "new", name: "Plaid Checking ••0000", type: "checking" }]);
  });

  it("a refused save reloads the accounts behind the sheet; a no-op repeat counts as saved", async () => {
    routes(() => json(422, { error: "refused", message: "That account is already imported. Refresh to see where it goes." }));
    const before = getVersion("accounts");
    const r = render(<AccountMappingSheet plaidItemId="item-row" plaidAccounts={[account()]} choices={choices} onDone={() => {}} onClose={() => {}} />);
    await settle();
    await press(r, "account-mapping-save");
    expect(getVersion("accounts")).toBe(before + 1);
    routes(() => json(200, { ok: true }));
    const onDone = vi.fn();
    const again = render(<AccountMappingSheet plaidItemId="item-row" plaidAccounts={[account()]} choices={choices} onDone={onDone} onClose={() => {}} />);
    await settle();
    await press(again, "account-mapping-save");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("an input-validation refusal keeps the sheet and its choices as they are: no reload behind it", async () => {
    routes(() => json(422, { error: "invalid", fieldErrors: { form: "Choose which Budgts account to import into first." } }));
    const before = getVersion("accounts");
    const r = render(<AccountMappingSheet plaidItemId="item-row" plaidAccounts={[account()]} choices={choices} onDone={() => {}} onClose={() => {}} />);
    await settle();
    await press(r, "account-mapping-save");
    expect(getVersion("accounts")).toBe(before);
    expect(byTestId(r, "account-mapping-save")).toBeTruthy();
  });
});

describe("AccountMappingSheet", () => {
  beforeEach(() => {
    api.authFetch.mockReset();
  });

  it("is the web's sheet: its title, a close, and the saved mapping reaches every screen", async () => {
    routes(() => json(200, { ok: true }));
    const onDone = vi.fn();
    const onClose = vi.fn();
    const before = getVersion("transactions");
    const r = render(<AccountMappingSheet plaidItemId="item-row" plaidAccounts={[account()]} choices={choices} onDone={onDone} onClose={onClose} />);
    await settle();
    expect(byTestId(r, "sheet").props.accessibilityLabel).toBe("Choose which accounts to import");
    await press(r, "sheet-close");
    expect(onClose).toHaveBeenCalledTimes(1);
    await press(r, "account-mapping-save");
    expect(api.authFetch.mock.calls.map((c) => c[0])).toEqual([SUGGESTIONS, "/api/mobile/plaid/accounts/map"]);
    expect(getVersion("transactions")).toBe(before + 1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  describe("a bank account connected before (owner decision 2026-10-02)", () => {
    const three = {
      ...choices,
      budgtsAccounts: [
        { id: "acct-1", name: "Everyday checking" },
        { id: "acct-2", name: "Travel card" },
        { id: "acct-3", name: "Old Chase" },
      ],
    };
    const open = async (suggestions: unknown) => {
      routes(() => json(200, { ok: true }), { version: 1, suggestions });
      const r = render(<AccountMappingSheet plaidItemId="item-row" plaidAccounts={[account(), card]} choices={three} onDone={() => {}} onClose={() => {}} />);
      await settle();
      return r;
    };
    const savedEntries = () => {
      const save = api.authFetch.mock.calls.find((c) => c[0] === "/api/mobile/plaid/accounts/map")!;
      return JSON.parse(String((save[2] as RequestInit).body)).entries;
    };

    it("starts the row on the account its history is in, says so, and saves that by default", async () => {
      const r = await open({ pa1: { kind: "previous", accountId: "acct-3", accountName: "Old Chase" } });
      expect(byTestId(r, "account-mapping-mode-0").props.accessibilityLabel).toBe("Import as, An existing account");
      expect(byTestId(r, "account-mapping-existing-0").props.accessibilityLabel).toBe("Existing account, Old Chase");
      expect(texts(r)).toContain("You connected this account before. Its history stays in Old Chase.");
      expect(() => byTestId(r, "account-mapping-previous-1")).toThrow();
      expect(byTestId(r, "account-mapping-mode-1").props.accessibilityLabel).toBe("Import as, A new Budgts account");
      await press(r, "account-mapping-save");
      expect(savedEntries()[0]).toEqual({ plaidAccountId: "pa1", mode: "existing", existingAccountId: "acct-3" });
    });

    it("the user can still choose a new account instead", async () => {
      const r = await open({ pa1: { kind: "previous", accountId: "acct-3", accountName: "Old Chase" } });
      await press(r, "account-mapping-mode-0");
      await press(r, "account-mapping-mode-0-option-new");
      await press(r, "account-mapping-save");
      expect(savedEntries()[0]).toMatchObject({ plaidAccountId: "pa1", mode: "new" });
    });

    it("ambiguous: lists the candidates first and preselects nothing", async () => {
      const r = await open({ pa1: { kind: "ambiguous", accountIds: ["acct-3", "acct-2"] } });
      expect(byTestId(r, "account-mapping-mode-0").props.accessibilityLabel).toBe("Import as, A new Budgts account");
      expect(() => byTestId(r, "account-mapping-previous-0")).toThrow();
      await press(r, "account-mapping-mode-0");
      await press(r, "account-mapping-mode-0-option-existing");
      expect(byTestId(r, "account-mapping-existing-0").props.accessibilityLabel).toBe("Existing account, Old Chase");
      await press(r, "account-mapping-existing-0");
      const prefix = "account-mapping-existing-0-option-";
      const listed = r.root
        .findAll((n) => typeof n.props.testID === "string" && n.props.testID.startsWith(prefix))
        .map((n) => (n.props.testID as string).slice(prefix.length));
      expect([...new Set(listed)]).toEqual(["acct-3", "acct-2", "acct-1"]);
    });

    it("shows no rows until the suggestions are in, and a failed read offers Try again", async () => {
      let reads = 0;
      api.authFetch.mockImplementation(async (path: string) => {
        if (path !== SUGGESTIONS) return json(200, { ok: true });
        reads++;
        return reads === 1 ? json(503, { error: "unavailable" }) : json(200, { version: 1, suggestions: {} });
      });
      const r = render(<AccountMappingSheet plaidItemId="item-row" plaidAccounts={[account()]} choices={choices} onDone={() => {}} onClose={() => {}} />);
      expect(byTestId(r, "account-mapping-loading")).toBeTruthy();
      expect(() => byTestId(r, "account-mapping-save")).toThrow();
      await settle();
      expect(byTestId(r, "account-mapping-load-error")).toBeTruthy();
      expect(() => byTestId(r, "account-mapping-save")).toThrow();
      await press(r, "account-mapping-retry");
      await settle();
      expect(byTestId(r, "account-mapping-save")).toBeTruthy();
    });
  });
});

describe("ConnectBank (web connect-bank.tsx)", () => {
  beforeEach(() => {
    api.authFetch.mockReset();
  });
  const link = (outcome: Awaited<ReturnType<PlaidLinkClient["open"]>>): PlaidLinkClient => ({ isAvailable: () => true, open: vi.fn(async () => outcome) });

  it("connects, then opens the mapping sheet with the new bank's accounts and the user's accounts", async () => {
    api.authFetch.mockImplementation(async (path: string) => {
      if (path === "/api/plaid/link-token") return json(200, { link_token: "link-1" });
      if (path === "/api/plaid/exchange") return json(200, { plaidItemId: "item-row", accounts: [account()] });
      if (path === SUGGESTIONS) return json(200, { version: 1, suggestions: {} });
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

  it("says the bank is connected and where to finish when the account choices can't load", async () => {
    api.authFetch.mockImplementation(async (path: string) => {
      if (path === "/api/plaid/link-token") return json(200, { link_token: "link-1" });
      if (path === "/api/plaid/exchange") return json(200, { plaidItemId: "item-row", accounts: [account()] });
      return json(503, { error: "unavailable" });
    });
    const r = render(<ConnectBank link={link({ kind: "success", publicToken: "public-1", institution: null })} />);
    await press(r, "connect-bank");
    expect(texts(byTestId(r, "connect-bank-notice"))).toEqual(["Your bank is connected. Choose which of its accounts to import from Connected banks."]);
    expect(() => byTestId(r, "sheet")).toThrow();
  });

  it("says Opening…, disabled, from the tap until Link closes: the token load and Link's own slow start alike", async () => {
    let token!: (r: Response) => void;
    api.authFetch.mockImplementation((path: string) => (path === "/api/plaid/link-token" ? new Promise<Response>((res) => (token = res)) : Promise.resolve(json(404, {}))));
    let close!: (o: Awaited<ReturnType<PlaidLinkClient["open"]>>) => void;
    const slow: PlaidLinkClient = { isAvailable: () => true, open: vi.fn(() => new Promise<Awaited<ReturnType<PlaidLinkClient["open"]>>>((res) => (close = res))) };
    const r = render(<ConnectBank link={slow} />);
    await press(r, "connect-bank");
    const opening = () => byTestId(r, "connect-bank").props;
    expect(opening().accessibilityLabel).toBe("Opening…");
    expect(opening().accessibilityState).toMatchObject({ disabled: true, busy: true });
    await act(async () => token(json(200, { link_token: "link-1" })));
    expect(slow.open).toHaveBeenCalledTimes(1);
    // Link is starting (the native SDK can take a while to show): still no way to start a second one
    expect(opening().accessibilityLabel).toBe("Opening…");
    expect(opening().accessibilityState).toMatchObject({ disabled: true, busy: true });
    await act(async () => close({ kind: "exit" }));
    expect(opening().accessibilityLabel).toBe("Connect a bank");
    expect(opening().accessibilityState).toMatchObject({ disabled: false });
  });

  it("never opens Link twice: a second tap while it loads, even before the button re-renders, does nothing", async () => {
    let token!: (r: Response) => void;
    api.authFetch.mockImplementation((path: string) => (path === "/api/plaid/link-token" ? new Promise<Response>((res) => (token = res)) : Promise.resolve(json(404, {}))));
    const once: PlaidLinkClient = { isAvailable: () => true, open: vi.fn(async () => ({ kind: "exit" as const })) };
    const r = render(<ConnectBank link={once} />);
    const onPress = byTestId(r, "connect-bank").props.onPress as () => void;
    await act(async () => {
      onPress();
      onPress(); // the same frame: the disabled state hasn't rendered yet
    });
    await act(async () => byTestId(r, "connect-bank").props.onPress?.());
    await act(async () => token(json(200, { link_token: "link-1" })));
    expect(api.authFetch.mock.calls.filter(([path]) => path === "/api/plaid/link-token")).toHaveLength(1);
    expect(once.open).toHaveBeenCalledTimes(1);
  });

  it("never sticks on Opening… when starting throws: it says so and can be tapped again", async () => {
    api.authFetch.mockImplementation(async () => {
      throw new Error("boom");
    });
    const throwing: PlaidLinkClient = { isAvailable: () => true, open: vi.fn(async () => ({ kind: "exit" as const })) };
    const r = render(<ConnectBank link={throwing} />);
    await press(r, "connect-bank");
    expect(texts(byTestId(r, "connect-bank-error"))).toEqual(["Couldn't start the bank connection. Try again."]);
    expect(byTestId(r, "connect-bank").props.accessibilityLabel).toBe("Connect a bank");
    expect(byTestId(r, "connect-bank").props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("shows a failed start and lets the user try again", async () => {
    api.authFetch.mockResolvedValue(json(500, {}));
    const r = render(<ConnectBank label="Connect another bank" link={link({ kind: "exit" })} />);
    await press(r, "connect-bank");
    expect(texts(r)).toContain("Couldn't start the bank connection. Try again.");
    expect(byTestId(r, "connect-bank").props.accessibilityState).toMatchObject({ disabled: false });
  });
});
