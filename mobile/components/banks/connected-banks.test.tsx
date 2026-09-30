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
import { ConnectedBanksView } from "./connected-banks-view";

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
  const commands = { mapAccounts: vi.fn(ok), setImporting: vi.fn(ok), setExcluded: vi.fn(ok), clearReview: vi.fn(ok), sync: vi.fn(ok), disconnect: vi.fn(ok), ...over };
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
    expect(textContent(byTestId(r, "page-header-title"))).toBe("Connected banks");
    const words = texts(r);
    expect(words).toContain(
      "Connect a bank and Budgts imports its transactions for you, categories filled in, ready to check. Manual entry still works for cash and anything your bank can't reach.",
    );
    expect(words.some((t) => t.startsWith("Your data is secure."))).toBe(true);
    expect(byTestId(r, "connect-bank").props.accessibilityLabel).toBe("Connect a bank");
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
    const words = texts(r);
    expect(words).toEqual(expect.arrayContaining(["Connected", "Sandbox", "Synced 45 min ago", "Importing", "Plaid Checking ••0000", "Imports into Everyday checking"]));
    expect(words).toContain("Disconnecting a bank keeps every transaction it already imported. They stay in Budgts as history.");
    expect(() => byTestId(r, "bank-item-row-attention")).toThrow();
    expect(byTestId(r, "connect-bank").props.accessibilityLabel).toBe("Connect another bank");
    expect(byTestId(r, "import-row-1").props.accessibilityState).toEqual({ checked: true, disabled: false });
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
    expect(byTestId(r, "overlay").props.accessibilityLabel).toBe("Choose which accounts to import");
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
    expect(textContent(sign)).toBe("We're checking this account's transaction format. 3 transactions appear once it's verified.");
    expect(texts(r)).toContain("This feed sent the same purchase twice.");
    await press(r, "mark-reviewed-row-1");
    expect(a.commands.clearReview).toHaveBeenCalledWith("row-1");
    await press(r, "exclude-row-1");
    expect(a.commands.setExcluded).toHaveBeenCalledWith("row-1", true);
    expect(textContent(byTestId(r, "excluded-row-2"))).toContain("Excluded from totals.");
    await press(r, "include-row-2");
    expect(a.commands.setExcluded).toHaveBeenCalledWith("row-2", false);
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
    expect(byTestId(r, "overlay").props.accessibilityLabel).toBe("Disconnect First Platypus Bank?");
    expect(texts(r)).toContain(
      "Budgts stops syncing First Platypus Bank. The transactions it already imported stay in your history and keep counting toward budgets.",
    );
    expect(byTestId(r, "disconnect-submit").props.accessibilityLabel).toBe("Disconnect");
    await press(r, "disconnect-purge");
    expect(byTestId(r, "disconnect-purge").props.accessibilityState).toEqual({ checked: true });
    // the web's plain checkbox in its accent, not a pixel frame
    expect(byTestId(r, "disconnect-purge-box").props.style).toMatchObject({ width: 16, height: 16, borderRadius: 2, backgroundColor: "#c93434" });
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
