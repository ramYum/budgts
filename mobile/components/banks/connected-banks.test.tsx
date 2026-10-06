import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { byTestId, render, textContent, texts } from "../../test/render";

vi.mock("../../lib/auth/auth-context", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("react-native-plaid-link-sdk", () => ({ sdkVersion: "13.0.0", createPlaidLinkSession: vi.fn() }));

import { getVersion } from "../../lib/api/invalidate";
import type { BankAccount, ConnectedBank } from "../../lib/plaid/banks-api";
import type { BankCommands, CommandOutcome } from "../../lib/plaid/bank-commands";
import type { PlaidLinkClient } from "../../lib/plaid/plaid-link";
import type { BankActions } from "./bank-card";
import { ConnectedBanksView, REMOVED_BANKS_UNAVAILABLE } from "./connected-banks-view";
import { PixelFrame } from "../brand/pixel-frame";

const NOW = Date.parse("2026-09-30T12:00:00Z");
const ok = async (): Promise<CommandOutcome> => ({ status: "ok" });

const acct = (over: Partial<BankAccount>): BankAccount => ({
  rowId: "row-1",
  plaidAccountId: "pa1",
  name: "Plaid Checking",
  officialName: null,
  mask: "0000",
  type: "depository",
  subtype: "checking",
  linkState: "mapped",
  mappedAccountName: "Everyday checking",
  needsReview: false,
  reviewReason: null,
  excludedFromCalculations: false,
  pendingSignCheckCount: 0,
  signCheckSample: null,
  signAnswer: null,
  directionReview: null,
  ...over,
});

const bank = (over: Partial<ConnectedBank> = {}): ConnectedBank => ({
  id: "item-row",
  itemId: "plaid-item",
  institutionName: "First Platypus Bank (Sandbox)",
  status: "active",
  lastSyncedAt: "2026-09-30T11:15:00Z",
  accounts: [acct({})],
  unmappedAccounts: [],
  ...over,
});

function actions(over: Partial<BankCommands> = {}, link?: PlaidLinkClient): BankActions {
  const commands = {
    mapAccounts: vi.fn(ok),
    setImporting: vi.fn(ok),
    setExcluded: vi.fn(ok),
    clearReview: vi.fn(ok),
    sync: vi.fn(ok),
    disconnect: vi.fn(ok),
    answerSign: vi.fn(ok),
    answerRemovedHeld: vi.fn(ok),
    ...over,
  };
  return {
    commands,
    ports: { fetchLinkToken: vi.fn(async () => ({ status: "ok" as const, linkToken: "link-1" })), sync: vi.fn(async () => ({ status: "ok" as const })) },
    link: link ?? { isAvailable: () => true, open: vi.fn(async () => ({ kind: "exit" as const })) },
    choices: { budgtsAccounts: [{ id: "acct-1", name: "Everyday checking" }], accountTypes: ["checking", "credit", "cash", "savings"] },
  };
}

const view = (banks: ConnectedBank[], a = actions(), enabled = true) =>
  render(<ConnectedBanksView enabled={enabled} banks={banks} actions={a} now={NOW} onBack={() => {}} />);
const press = async (r: ReturnType<typeof render>, id: string) => {
  await act(async () => {
    byTestId(r, id).props.onPress();
  });
};

describe("Connected banks (web /connected-banks)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("with no bank: the web's empty card and Connect a bank", () => {
    const r = view([]);
    expect(textContent(byTestId(r, "page-title"))).toBe("Connected banks");
    const words = texts(r);
    expect(words).toContain(
      "Connect a bank and Budgts imports its transactions for you, categories filled in, ready to check. Manual entry still works for cash and anything your bank can't reach.",
    );
    expect(words.some((t) => t.startsWith("Your data is secure."))).toBe(true);
    expect(byTestId(r, "connect-bank").props.accessibilityLabel).toBe("Connect a bank");
  });

  it("after a lapse removed the banks: the web's notice, the empty card, and Connect a bank as the way back", () => {
    const r = render(<ConnectedBanksView enabled banks={[]} connectionsRemovedForLapse actions={actions()} now={NOW} onBack={() => {}} />);
    expect(textContent(byTestId(r, "lapse-removal-notice"))).toBe(
      "Your bank connections were removed when your subscription ended. Your past transactions are still here. Subscribe again to reconnect.",
    );
    expect(byTestId(r, "connect-bank").props.accessibilityLabel).toBe("Connect a bank");
    expect(view([]).root.findAll((n) => n.props.testID === "lapse-removal-notice")).toHaveLength(0);
  });

  it("with bank connections off on the deployment: the web's note, no connect", () => {
    const r = view([], actions(), false);
    expect(texts(r)).toContain(
      "Bank connections aren't available yet on this deployment. Manual entry works for every account in the meantime: add transactions from Activity.",
    );
    expect(r.root.findAll((n) => n.props.testID === "connect-bank")).toHaveLength(0);
  });

  it("a connected bank: its name without (Sandbox), Connected and Sandbox badges, last sync, importing accounts, Connect another bank", () => {
    const r = view([bank()]);
    expect(textContent(byTestId(r, "bank-item-row-name"))).toBe("First Platypus Bank");
    // the web's text-base font-medium, as a type role (no inline size)
    const name = r.root.find((n) => typeof n.type !== "string" && n.props.testID === "bank-item-row-name");
    expect(name.props.variant).toBe("listNameLg");
    expect(name.props.style).toBeUndefined();
    const words = texts(r);
    expect(words).toEqual(expect.arrayContaining(["Connected", "Sandbox", "Synced 45 min ago", "Importing", "Plaid Checking ••0000", "Imports into Everyday checking"]));
    expect(words).toContain("Disconnecting a bank keeps every transaction it already imported. They stay in Budgts as history.");
    expect(() => byTestId(r, "bank-item-row-attention")).toThrow();
    expect(byTestId(r, "connect-bank").props.accessibilityLabel).toBe("Connect another bank");
    expect(byTestId(r, "import-row-1").props.accessibilityState).toEqual({ checked: true, disabled: false });
  });

  it("Reconnect says Opening…, disabled, from the tap until Link closes: the token load and Link's own slow start alike", async () => {
    type Outcome = Awaited<ReturnType<PlaidLinkClient["open"]>>;
    let close!: (o: Outcome) => void;
    const slow: PlaidLinkClient = { isAvailable: () => true, open: vi.fn(() => new Promise<Outcome>((res) => (close = res))) };
    const a = actions({}, slow);
    let token!: (t: { status: "ok"; linkToken: string }) => void;
    a.ports.fetchLinkToken = vi.fn(() => new Promise<{ status: "ok"; linkToken: string }>((res) => (token = res)));
    const r = view([bank({ status: "login_required" })], a);
    const props = () => byTestId(r, "bank-item-row-reconnect").props;
    await press(r, "bank-item-row-reconnect");
    expect(props().accessibilityLabel).toBe("Opening…");
    expect(props().accessibilityState).toMatchObject({ disabled: true, busy: true });
    await act(async () => token({ status: "ok", linkToken: "link-1" }));
    expect(slow.open).toHaveBeenCalledTimes(1);
    // Link is starting: still no way to open a second update-mode session
    expect(props().accessibilityLabel).toBe("Opening…");
    expect(props().accessibilityState).toMatchObject({ disabled: true, busy: true });
    await act(async () => close({ kind: "exit" }));
    expect(props().accessibilityLabel).toBe("Reconnect");
    expect(props().accessibilityState).toMatchObject({ disabled: false });
  });

  it("Reconnect never opens Link twice: a second tap while it loads, even in the same frame, does nothing", async () => {
    const a = actions();
    let token!: (t: { status: "ok"; linkToken: string }) => void;
    a.ports.fetchLinkToken = vi.fn(() => new Promise<{ status: "ok"; linkToken: string }>((res) => (token = res)));
    const r = view([bank({ status: "login_required" })], a);
    const onPress = byTestId(r, "bank-item-row-reconnect").props.onPress as () => void;
    await act(async () => {
      onPress();
      onPress();
    });
    await act(async () => byTestId(r, "bank-item-row-reconnect").props.onPress?.());
    await act(async () => token({ status: "ok", linkToken: "link-1" }));
    expect(a.ports.fetchLinkToken).toHaveBeenCalledTimes(1);
    expect(a.link.open).toHaveBeenCalledTimes(1);
  });

  it("Reconnect never sticks on Opening… when starting throws: it says so and can be tapped again", async () => {
    const a = actions();
    a.ports.fetchLinkToken = vi.fn(async () => {
      throw new Error("boom");
    });
    const r = view([bank({ status: "login_required" })], a);
    await press(r, "bank-item-row-reconnect");
    expect(texts(byTestId(r, "bank-item-row-reconnect-error"))).toEqual(["Couldn't start the reconnect. Try again."]);
    expect(byTestId(r, "bank-item-row-reconnect").props.accessibilityLabel).toBe("Reconnect");
    expect(byTestId(r, "bank-item-row-reconnect").props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("Reconnect refused by the bank-sync gate says a subscription is needed, hands on to the paywall seam, opens no Link", async () => {
    const a = actions();
    a.ports.fetchLinkToken = vi.fn(async () => ({ status: "subscription_required" as const }));
    a.onSubscriptionRequired = vi.fn();
    const r = view([bank({ status: "login_required" })], a);
    await press(r, "bank-item-row-reconnect");
    expect(texts(byTestId(r, "bank-item-row-reconnect-error"))).toEqual(["Bank sync needs a Budgts subscription."]);
    expect(a.onSubscriptionRequired).toHaveBeenCalledOnce();
    expect(a.link.open).not.toHaveBeenCalled();
    expect(a.ports.sync).not.toHaveBeenCalled();
    expect(byTestId(r, "bank-item-row-reconnect").props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("a bank that needs its login again says so and reconnects through Link in update mode, then syncs", async () => {
    const link: PlaidLinkClient = { isAvailable: () => true, open: vi.fn(async () => ({ kind: "success" as const, publicToken: "p", institution: null })) };
    const a = actions({}, link);
    const r = view([bank({ status: "login_required" })], a);
    expect(texts(r)).toEqual(expect.arrayContaining(["Needs attention", "This connection needs you to sign in with your bank again."]));
    const before = getVersion("accounts");
    await press(r, "bank-item-row-reconnect");
    expect(a.ports.fetchLinkToken).toHaveBeenCalledWith({ itemId: "plaid-item", platform: "android" });
    expect(a.ports.sync).toHaveBeenCalledWith("plaid-item");
    expect(getVersion("accounts")).toBe(before + 1);
    expect(texts(view([bank({ status: "revoked" })]))).toContain("Access to this bank was revoked. Reconnect to keep it syncing, or disconnect it.");
  });

  it("pauses and resumes importing, and connects an account never set up with its guessed name and type", async () => {
    const a = actions();
    const r = view(
      [
        bank({
          accounts: [
            acct({}),
            acct({ rowId: "row-2", plaidAccountId: "pa2", name: "Plaid Saving", mask: "1111", subtype: "savings", linkState: "ignored", mappedAccountName: "Rainy-day savings" }),
            acct({ rowId: "row-3", plaidAccountId: "pa3", name: "Plaid Credit Card", mask: "3333", type: "credit", subtype: "credit card", linkState: "unmapped", mappedAccountName: null }),
          ],
          unmappedAccounts: [
            { plaidAccountId: "pa3", name: "Plaid Credit Card", officialName: null, mask: "3333", type: "credit", subtype: "credit card", currentBalance: 41000, isoCurrencyCode: "USD" },
          ],
        }),
      ],
      a,
    );
    expect(texts(r)).toEqual(expect.arrayContaining(["Not imported", "Switch on to import", "paused · was Rainy-day savings", "not set up", "Choose accounts to import"]));
    await press(r, "import-row-1");
    expect(a.commands.setImporting).toHaveBeenCalledWith("row-1", false);
    await press(r, "import-row-2");
    expect(a.commands.setImporting).toHaveBeenCalledWith("row-2", true);
    await press(r, "connect-row-3");
    expect(a.commands.mapAccounts).toHaveBeenCalledWith("item-row", [{ plaidAccountId: "pa3", mode: "new", name: "Plaid Credit Card ••3333", type: "credit" }]);
    await press(r, "bank-item-row-choose");
    expect(byTestId(r, "sheet").props.accessibilityLabel).toBe("Choose which accounts to import");
  });

  it("connects a never-set-up CD as Savings: the web's suggested type", async () => {
    const a = actions();
    const r = view(
      [
        bank({
          accounts: [acct({ rowId: "row-cd", plaidAccountId: "pa-cd", name: "Plaid CD", mask: "2222", subtype: "cd", linkState: "unmapped", mappedAccountName: null })],
          unmappedAccounts: [
            { plaidAccountId: "pa-cd", name: "Plaid CD", officialName: null, mask: "2222", type: "depository", subtype: "cd", currentBalance: 100000, isoCurrencyCode: "USD" },
          ],
        }),
      ],
      a,
    );
    await press(r, "connect-row-cd");
    expect(a.commands.mapAccounts).toHaveBeenCalledWith("item-row", [{ plaidAccountId: "pa-cd", mode: "new", name: "Plaid CD ••2222", type: "savings" }]);
  });

  it("shows a refused switch's reason under it", async () => {
    const a = actions({ setImporting: vi.fn(async () => ({ status: "error" as const, message: "Choose which Budgts account to import into first." })) });
    const r = view([bank()], a);
    await press(r, "import-row-1");
    expect(texts(r)).toContain("Choose which Budgts account to import into first.");
  });

  it("never hides held transactions or a review: the sign check, Mark reviewed, Exclude and Include again", async () => {
    const a = actions();
    const r = view(
      [
        bank({
          accounts: [
            acct({ pendingSignCheckCount: 3, needsReview: true, reviewReason: "This feed sent the same purchase twice." }),
            acct({ rowId: "row-2", plaidAccountId: "pa2", name: "Plaid Saving", mask: "1111", excludedFromCalculations: true }),
          ],
        }),
      ],
      a,
    );
    const sign = r.root.findAll((n) => typeof n.type === "string" && textContent(n).startsWith("We're checking this account's transaction format."))[0]!;
    expect(textContent(sign)).toBe("We're checking this account's transaction format. 3 transactions count once it's verified.");
    expect(texts(r)).toContain("This feed sent the same purchase twice.");
    await press(r, "exclude-row-1");
    expect(a.commands.setExcluded).toHaveBeenCalledWith("row-1", true);
    expect(textContent(byTestId(r, "excluded-row-2"))).toContain("Excluded from totals.");
    await press(r, "include-row-2");
    expect(a.commands.setExcluded).toHaveBeenCalledWith("row-2", false);

    const reviewed = view([bank({ accounts: [acct({ needsReview: true, reviewReason: "Odd feed." })] })], a);
    await press(reviewed, "mark-reviewed-row-1");
    expect(a.commands.clearReview).toHaveBeenCalledWith("row-1");
  });

  it("asks the money-direction question about a held transaction and sends the answer (card payments §5)", async () => {
    const a = actions();
    const sample = { transactionId: "t-held", description: "GOOGLE *SERVICES", occurredAt: "2026-09-05T12:00:00Z", amount: 4600, currency: "USD" };
    const r = view([bank({ accounts: [acct({ pendingSignCheckCount: 2, signCheckSample: sample })] })], a);
    const band = r.root.find((n) => n.type === PixelFrame && n.props.testID === "sign-check-row-1");
    expect(band.props.frame).toBe("px-band");
    expect(textContent(band)).toBe(
      "We're checking this account's transaction format. 2 transactions count once it's verified." +
        "You can verify it now. Was this money going out or coming in?" +
        "GOOGLE *SERVICES$46.00 · Sep 5Going outComing in",
    );
    const before = getVersion("accounts");
    await press(r, "sign-question-row-1-in");
    expect(a.commands.answerSign).toHaveBeenCalledWith("row-1", "t-held", "in", false);
    expect(getVersion("accounts")).toBe(before + 1);
    // answered: no second answer over stale data until the reload lands
    expect(byTestId(r, "sign-question-row-1-out").props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("says why an answer was refused, in the server's words, and lets the user try again", async () => {
    const a = actions({ answerSign: vi.fn(async () => ({ status: "error" as const, message: "This bank is syncing right now. Try again in a moment.", stale: true as const })) });
    const sample = { transactionId: "t-held", description: "GOOGLE", occurredAt: "2026-09-05T12:00:00Z", amount: 4600, currency: "USD" };
    const r = view([bank({ accounts: [acct({ pendingSignCheckCount: 1, signCheckSample: sample })] })], a);
    await press(r, "sign-question-row-1-out");
    expect(textContent(byTestId(r, "sign-question-row-1-error"))).toBe("This bank is syncing right now. Try again in a moment.");
    expect(byTestId(r, "sign-question-row-1-out").props.accessibilityState).toMatchObject({ disabled: false });
  });

  it("with no sample to ask about, says the rows are held and asks nothing", () => {
    const r = view([bank({ accounts: [acct({ pendingSignCheckCount: 1 })] })]);
    expect(textContent(byTestId(r, "sign-check-row-1"))).toBe("We're checking this account's transaction format. 1 transaction counts once it's verified.");
    expect(() => byTestId(r, "sign-question-row-1")).toThrow();
  });

  it("after an answer: Money direction set. Change answer asks again and sends a change (§5a)", async () => {
    const a = actions();
    const sample = { transactionId: "t-ans", description: "PAYROLL", occurredAt: "2026-09-01T12:00:00Z", amount: 250000, currency: "USD" };
    const r = view([bank({ accounts: [acct({ signAnswer: { answeredAt: "2026-10-01T00:00:00Z", sample } })] })], a);
    expect(textContent(byTestId(r, "sign-answered-row-1"))).toBe("Money direction set. Change answer");
    expect(() => byTestId(r, "sign-question-row-1")).toThrow();
    await press(r, "sign-change-row-1");
    expect(byTestId(r, "sign-change-row-1").props.accessibilityState).toEqual({ expanded: true });
    expect(texts(byTestId(r, "sign-question-row-1"))).toContain("Was this money going out or coming in?");
    await press(r, "sign-question-row-1-out");
    expect(a.commands.answerSign).toHaveBeenCalledWith("row-1", "t-ans", "out", true);
    // the panel closes once the change lands
    expect(() => byTestId(r, "sign-question-row-1")).toThrow();
  });

  it("an account resolved from evidence offers Amounts on this account look reversed? with its warning (§5b)", async () => {
    const a = actions();
    const sample = { transactionId: "t-rec", description: "COFFEE", occurredAt: "2026-09-20T12:00:00Z", amount: 450, currency: "USD" };
    const r = view([bank({ accounts: [acct({ directionReview: { sample } })] })], a);
    expect(textContent(byTestId(r, "direction-review-row-1"))).toBe("Amounts on this account look reversed?");
    await press(r, "direction-review-toggle-row-1");
    expect(texts(r)).toContain(
      "Check one transaction to confirm. If your answer doesn't match how Budgts reads this account, every amount on it flips. You can change it back the same way.",
    );
    await press(r, "sign-question-row-1-in");
    expect(a.commands.answerSign).toHaveBeenCalledWith("row-1", "t-rec", "in", true);
  });

  it("the open question wins over an answer line, as on the web", () => {
    const sample = { transactionId: "t", description: "X", occurredAt: "2026-09-20T12:00:00Z", amount: 1, currency: "USD" };
    const r = view([bank({ accounts: [acct({ pendingSignCheckCount: 1, signCheckSample: sample, signAnswer: { answeredAt: "x", sample }, directionReview: { sample } })] })]);
    expect(() => byTestId(r, "sign-answered-row-1")).toThrow();
    expect(() => byTestId(r, "direction-review-row-1")).toThrow();
  });

  it("From removed banks: asks about held rows a disconnected bank left behind, and changes an answered group (§5c)", async () => {
    const a = actions();
    const sample = { transactionId: "t-det", description: "ZELLE FROM SAM", occurredAt: "2026-08-30T12:00:00Z", amount: 12000, currency: "USD" };
    const held = {
      groups: [{ accountId: "acc-1", accountName: "Everyday checking", originRef: "o1", count: 3, sample }],
      answered: [{ accountId: "acc-2", accountName: "Travel card", originRef: "o2", answeredAt: "2026-10-01T00:00:00Z", sample: { ...sample, transactionId: "t-ans2" } }],
    };
    const r = render(<ConnectedBanksView enabled banks={[]} removedBanksHeld={held} actions={a} now={NOW} onBack={() => {}} />);
    const card = byTestId(r, "removed-banks-held");
    expect(texts(card)).toContain("From removed banks");
    expect(textContent(byTestId(r, "removed-held-acc-1"))).toContain(
      "A bank you disconnected left 3 transactions here before Budgts could check its transaction format. They count once you answer.",
    );
    await press(r, "removed-question-acc-1-out");
    expect(a.commands.answerRemovedHeld).toHaveBeenCalledWith("t-det", "out", false);
    expect(textContent(byTestId(r, "removed-answered-acc-2"))).toBe("Travel card. Money direction set. Change answer");
    await press(r, "removed-change-acc-2");
    await press(r, "removed-question-acc-2-in");
    expect(a.commands.answerRemovedHeld).toHaveBeenCalledWith("t-ans2", "in", true);
    // first on the page, above the banks, where Home's "Check them" lands
    const ids = r.root.findAll((n) => typeof n.type === "string" && typeof n.props.testID === "string").map((n) => n.props.testID);
    expect(ids.indexOf("removed-banks-held")).toBeLessThan(ids.indexOf("connected-banks-empty"));
  });

  it("no removed-bank rows: no card; couldn't load them: says so where the card would be", () => {
    expect(view([bank()]).root.findAll((n) => n.props.testID === "removed-banks-held")).toHaveLength(0);
    const r = render(<ConnectedBanksView enabled banks={[bank()]} removedBanksHeld={null} actions={actions()} now={NOW} onBack={() => {}} />);
    expect(textContent(byTestId(r, "removed-banks-unavailable"))).toBe(REMOVED_BANKS_UNAVAILABLE);
    expect(REMOVED_BANKS_UNAVAILABLE).toBe("Couldn't load transactions from removed banks. Try again later.");
    expect(byTestId(r, "bank-item-row-name")).toBeTruthy();
  });

  it("after a change lands, the switch stays disabled in its new position until the reloaded row arrives", async () => {
    const a = actions();
    const before = bank();
    const r = view([before], a);
    await press(r, "import-row-1");
    expect(byTestId(r, "import-row-1").props.accessibilityState).toEqual({ checked: false, disabled: true });
    // a reload that failed brings nothing new (the screen's shell says so): still disabled, never an enabled stale switch
    act(() => r.update(<ConnectedBanksView enabled banks={[before]} actions={a} now={NOW} onBack={() => {}} />));
    expect(byTestId(r, "import-row-1").props.accessibilityState).toEqual({ checked: false, disabled: true });
    // the reload lands: the row is the server's again
    act(() => r.update(<ConnectedBanksView enabled banks={[bank({ accounts: [acct({ linkState: "ignored" })] })]} actions={a} now={NOW} onBack={() => {}} />));
    expect(byTestId(r, "import-row-1").props.accessibilityState).toEqual({ checked: false, disabled: false });
  });

  it("the review buttons stay disabled after Mark reviewed until the reload lands", async () => {
    const a = actions();
    const r = view([bank({ accounts: [acct({ needsReview: true, reviewReason: "Odd feed." })] })], a);
    await press(r, "mark-reviewed-row-1");
    expect(byTestId(r, "exclude-row-1").props.accessibilityState).toMatchObject({ disabled: true });
    expect(byTestId(r, "mark-reviewed-row-1").props.accessibilityLabel).toBe("Saving…");
  });

  it("a connect switch shows on and stays disabled once connected, until the reload", async () => {
    const a = actions();
    const r = view([bank({ accounts: [acct({ linkState: "unmapped", mappedAccountName: null })] })], a);
    await press(r, "connect-row-1");
    expect(byTestId(r, "connect-row-1").props.accessibilityState).toEqual({ checked: true, disabled: true });
  });

  it("the switches say what a tap does, as the web's titles do", () => {
    const r = view([
      bank({
        accounts: [
          acct({}),
          acct({ rowId: "row-2", plaidAccountId: "pa2", linkState: "ignored", mappedAccountName: "Rainy-day savings" }),
          acct({ rowId: "row-3", plaidAccountId: "pa3", linkState: "unmapped", mappedAccountName: null }),
        ],
      }),
    ]);
    expect(byTestId(r, "import-row-1").props.accessibilityHint).toBe("Importing. Tap to pause. New transactions from a paused account aren't recovered later.");
    expect(byTestId(r, "import-row-2").props.accessibilityHint).toBe("Paused. Tap to resume importing new transactions from now on.");
    expect(byTestId(r, "connect-row-3").props.accessibilityHint).toBe("Not connected. Tap to start importing this account into a new Budgts account.");
  });

  it("Sync now reports the outcome beside the buttons", async () => {
    const a = actions({ sync: vi.fn(async () => ({ status: "ok" as const, warning: "Connected, but the first sync didn't finish. It'll retry shortly." })) });
    const r = view([bank()], a);
    await press(r, "bank-item-row-sync");
    expect(textContent(byTestId(r, "bank-item-row-sync-message"))).toBe("Connected, but the first sync didn't finish. It'll retry shortly.");
    const plain = view([bank()]);
    await press(plain, "bank-item-row-sync");
    expect(textContent(byTestId(plain, "bank-item-row-sync-message"))).toBe("Synced.");
  });

  it("Disconnect confirms in a sheet: history kept unless the user also chooses to delete it", async () => {
    const a = actions();
    const r = view([bank()], a);
    await press(r, "bank-item-row-disconnect");
    expect(byTestId(r, "sheet").props.accessibilityLabel).toBe("Disconnect First Platypus Bank?");
    expect(texts(r)).toContain(
      "Budgts stops syncing First Platypus Bank. The transactions it already imported stay in your history and keep counting toward budgets.",
    );
    expect(byTestId(r, "disconnect-submit").props.accessibilityLabel).toBe("Disconnect");
    await press(r, "disconnect-purge");
    expect(byTestId(r, "disconnect-purge").props.accessibilityState).toMatchObject({ checked: true });
    expect(byTestId(r, "disconnect-submit").props.accessibilityLabel).toBe("Disconnect and delete");
    await press(r, "disconnect-purge");
    await press(r, "disconnect-submit");
    expect(a.commands.disconnect).toHaveBeenCalledWith("plaid-item", false);
    expect(r.root.findAll((n) => n.props.testID === "disconnect-confirm")).toHaveLength(0);
  });

  it("a failed disconnect stays open with its reason, and Cancel closes it", async () => {
    const a = actions({ disconnect: vi.fn(async () => ({ status: "error" as const, message: "Couldn't disconnect this bank. Try again." })) });
    const r = view([bank()], a);
    await press(r, "bank-item-row-disconnect");
    await press(r, "disconnect-submit");
    expect(textContent(byTestId(r, "disconnect-error"))).toBe("Couldn't disconnect this bank. Try again.");
    await press(r, "disconnect-cancel");
    expect(r.root.findAll((n) => n.props.testID === "disconnect-confirm")).toHaveLength(0);
  });
});
