import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectedBanks, type ConnectedBank } from "./connected-banks";

const disconnectBank = vi.fn();
const syncConnection = vi.fn();
const mapAccounts = vi.fn();
const clearAccountReview = vi.fn();
const setAccountCalculationExclusionAction = vi.fn();
const setAccountImportingAction = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("@/server/plaid/actions", () => ({
  disconnectBank: (...args: unknown[]) => disconnectBank(...args),
  syncConnection: (...args: unknown[]) => syncConnection(...args),
  mapAccounts: (...args: unknown[]) => mapAccounts(...args),
  clearAccountReview: (...args: unknown[]) => clearAccountReview(...args),
  setAccountCalculationExclusionAction: (...args: unknown[]) => setAccountCalculationExclusionAction(...args),
  setAccountImportingAction: (...args: unknown[]) => setAccountImportingAction(...args),
}));

vi.mock("./reconnect-button", () => ({
  ReconnectButton: ({ itemId }: { itemId: string }) => <button type="button">Reconnect {itemId}</button>,
}));

const checkingDefaults = { officialName: null, type: "depository", subtype: "checking" };

function bank(over: Partial<ConnectedBank> = {}): ConnectedBank {
  return {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    itemId: "item-sandbox-1",
    institutionName: "First Platypus Bank",
    status: "active",
    lastSyncedAt: new Date().toISOString(),
    accounts: [
      {
        rowId: "row-checking",
        plaidAccountId: "plaid-acc-checking",
        name: "Plaid Checking",
        ...checkingDefaults,
        mask: "0000",
        linkState: "mapped",
        mappedAccountName: "Checking",
        needsReview: false,
        reviewReason: null,
        excludedFromCalculations: false,
        pendingSignCheckCount: 0,
      },
      {
        rowId: "row-saving",
        plaidAccountId: "plaid-acc-saving",
        name: "Plaid Saving",
        officialName: null,
        type: "depository",
        subtype: "savings",
        mask: "1111",
        linkState: "ignored",
        mappedAccountName: null,
        needsReview: false,
        reviewReason: null,
        excludedFromCalculations: false,
        pendingSignCheckCount: 0,
      },
    ],
    unmappedAccounts: [],
    ...over,
  };
}

afterEach(() => vi.clearAllMocks());

/** Matches the element whose whole text is `text`, even when it spans child
 * elements ("… — <span>3 transactions</span> appear …"). */
const wholeText = (text: string) => (_: string, el: Element | null) =>
  el?.textContent === text && Array.from(el.children).every((c) => c.textContent !== text);

describe("ConnectedBanks", () => {
  it("shows the connection, its accounts, and the retained-history guarantee", () => {
    render(<ConnectedBanks banks={[bank()]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);

    expect(screen.getByText("First Platypus Bank")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Imports into Checking")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Not imported/ })).toBeInTheDocument();
    expect(
      screen.getByText(/Disconnecting a bank keeps every transaction it already imported/),
    ).toBeInTheDocument();
  });

  it("shows the reconnect banner when the connection needs attention", () => {
    render(
      <ConnectedBanks banks={[bank({ status: "login_required" })]} budgtsAccounts={[]} />,
    );
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText(/sign in with your bank again/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reconnect item-sandbox-1/ })).toBeInTheDocument();
  });

  it("disconnects (history kept) through an explicit confirm", async () => {
    disconnectBank.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<ConnectedBanks banks={[bank()]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);

    await user.click(screen.getByRole("button", { name: "Disconnect" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/transactions it already imported stay in your history/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Disconnect" }));

    expect(disconnectBank).toHaveBeenCalledTimes(1);
    const fd = disconnectBank.mock.calls[0][1] as FormData;
    expect(fd.get("itemId")).toBe("item-sandbox-1");
    expect(fd.get("purge")).toBe("0");
  });

  it("passes purge=1 only when the destructive checkbox is ticked", async () => {
    disconnectBank.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<ConnectedBanks banks={[bank()]} budgtsAccounts={[]} />);

    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Disconnect and delete" }));

    const fd = disconnectBank.mock.calls[0][1] as FormData;
    expect(fd.get("purge")).toBe("1");
  });

  it("runs a manual sync", async () => {
    syncConnection.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<ConnectedBanks banks={[bank()]} budgtsAccounts={[]} />);
    await user.click(screen.getByRole("button", { name: "Sync now" }));

    expect(syncConnection).toHaveBeenCalledWith("item-sandbox-1");
  });

  it("shows a review warning for a flagged account and never hides it silently", () => {
    const flagged = bank({
      accounts: [
        {
          rowId: "row-checking",
          plaidAccountId: "plaid-acc-checking",
          name: "Plaid Checking",
          ...checkingDefaults,
          mask: "0000",
          linkState: "mapped",
          mappedAccountName: "Checking",
          needsReview: true,
          reviewReason: "50 transactions with identical content — this connection's data may be unreliable.",
          excludedFromCalculations: false,
          pendingSignCheckCount: 0,
        },
      ],
    });

    render(<ConnectedBanks banks={[flagged]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);

    expect(screen.getByText(/50 transactions with identical content/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark reviewed" })).toBeInTheDocument();
  });

  it("never offers Exclude from totals for a healthy (non-flagged) account", () => {
    render(<ConnectedBanks banks={[bank()]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);
    expect(screen.queryByRole("button", { name: "Exclude from totals" })).not.toBeInTheDocument();
  });

  it("offers Exclude from totals for a flagged account and submits excluded=1", async () => {
    setAccountCalculationExclusionAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const flagged = bank({
      accounts: [
        {
          rowId: "row-checking",
          plaidAccountId: "plaid-acc-checking",
          name: "Plaid Checking",
          ...checkingDefaults,
          mask: "0000",
          linkState: "mapped",
          mappedAccountName: "Checking",
          needsReview: true,
          reviewReason: "Suspicious repetition detected.",
          excludedFromCalculations: false,
          pendingSignCheckCount: 0,
        },
      ],
    });

    render(<ConnectedBanks banks={[flagged]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);
    await user.click(screen.getByRole("button", { name: "Exclude from totals" }));

    expect(setAccountCalculationExclusionAction).toHaveBeenCalledTimes(1);
    const fd = setAccountCalculationExclusionAction.mock.calls[0][1] as FormData;
    expect(fd.get("plaidAccountRowId")).toBe("row-checking");
    expect(fd.get("excluded")).toBe("1");
    expect(refresh).not.toHaveBeenCalled(); // the action's revalidation is the one refresh
  });

  it("shows the excluded state clearly, without implying deletion, and offers Include again", async () => {
    setAccountCalculationExclusionAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const excluded = bank({
      accounts: [
        {
          rowId: "row-checking",
          plaidAccountId: "plaid-acc-checking",
          name: "Plaid Checking",
          ...checkingDefaults,
          mask: "0000",
          linkState: "mapped",
          mappedAccountName: "Checking",
          needsReview: true,
          reviewReason: "Suspicious repetition detected.",
          excludedFromCalculations: true,
          pendingSignCheckCount: 0,
        },
      ],
    });

    render(<ConnectedBanks banks={[excluded]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);

    expect(screen.getByText(/Excluded from totals/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing was deleted/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exclude from totals" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Include again" }));

    expect(setAccountCalculationExclusionAction).toHaveBeenCalledTimes(1);
    const fd = setAccountCalculationExclusionAction.mock.calls[0][1] as FormData;
    expect(fd.get("plaidAccountRowId")).toBe("row-checking");
    expect(fd.get("excluded")).toBe("0");
    expect(refresh).not.toHaveBeenCalled(); // the action's revalidation is the one refresh
  });

  it("clears a review flag only through the explicit Mark reviewed action", async () => {
    clearAccountReview.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const flagged = bank({
      accounts: [
        {
          rowId: "row-checking",
          plaidAccountId: "plaid-acc-checking",
          name: "Plaid Checking",
          ...checkingDefaults,
          mask: "0000",
          linkState: "mapped",
          mappedAccountName: "Checking",
          needsReview: true,
          reviewReason: "Suspicious repetition detected.",
          excludedFromCalculations: false,
          pendingSignCheckCount: 0,
        },
      ],
    });

    render(<ConnectedBanks banks={[flagged]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);

    await user.click(screen.getByRole("button", { name: "Mark reviewed" }));

    expect(clearAccountReview).toHaveBeenCalledTimes(1);
    const fd = clearAccountReview.mock.calls[0][1] as FormData;
    expect(fd.get("plaidAccountRowId")).toBe("row-checking");
    expect(refresh).not.toHaveBeenCalled(); // the action's revalidation is the one refresh
  });
});

// Design: 2026-09-12 North Star §2 — "UI: never exposes 'sign convention.'
// While unresolved: 'We're checking this account's transaction format. Your
// transactions will appear once verified.'" This message was never built
// (found in production 2026-09-15: transactions vanished from every total
// with zero explanation). It must never be confused with the anomaly
// needs_review banner — different cause, different (non-actionable) state.
describe("ConnectedBanks — sign-convention 'checking this account' notice", () => {
  it("shows the exact design copy while an account has unverified transactions held", () => {
    const checking = bank({
      accounts: [
        {
          rowId: "row-checking",
          plaidAccountId: "plaid-acc-checking",
          name: "Plaid Checking",
          ...checkingDefaults,
          mask: "0000",
          linkState: "mapped",
          mappedAccountName: "Checking",
          needsReview: false,
          reviewReason: null,
          excludedFromCalculations: false,
          pendingSignCheckCount: 3,
        },
      ],
    });

    render(<ConnectedBanks banks={[checking]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);

    // copy as drawn in the 2026-09-26 design: the held count, so the gap is explained
    expect(
      screen.getByText(
        wholeText("We're checking this account's transaction format — 3 transactions appear once it's verified."),
      ),
    ).toBeInTheDocument();
    // Never the word "sign convention" or "inverted"/"standard" — internal terms.
    expect(screen.queryByText(/sign convention/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/inverted/i)).not.toBeInTheDocument();
  });

  it("says nothing extra once the account has no rows held for this reason", () => {
    render(<ConnectedBanks banks={[bank()]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);
    expect(screen.queryByText(/checking this account/i)).not.toBeInTheDocument();
  });

  it("shows both the checking notice and an unrelated review flag together, never suppressing either", () => {
    const both = bank({
      accounts: [
        {
          rowId: "row-checking",
          plaidAccountId: "plaid-acc-checking",
          name: "Plaid Checking",
          ...checkingDefaults,
          mask: "0000",
          linkState: "mapped",
          mappedAccountName: "Checking",
          needsReview: true,
          reviewReason: "Suspicious repetition detected.",
          excludedFromCalculations: false,
          pendingSignCheckCount: 5,
        },
      ],
    });

    render(<ConnectedBanks banks={[both]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);

    expect(screen.getByText(/checking this account's transaction format/i)).toBeInTheDocument();
    expect(screen.getByText(/Suspicious repetition detected/)).toBeInTheDocument();
  });
});

// User request 2026-09-15: "Stop importing" should be a reversible switch, not
// a one-way action requiring the mapping screen again to resume.
describe("ConnectedBanks — import on/off switch (already-mapped accounts)", () => {
  it("renders an ON switch for a mapped account and turns it off with no confirm dialog", async () => {
    setAccountImportingAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<ConnectedBanks banks={[bank()]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);

    const toggle = screen.getByRole("switch", { name: /import.*Plaid Checking/i });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await user.click(toggle);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); // reversible now — no destructive confirm
    expect(setAccountImportingAction).toHaveBeenCalledTimes(1);
    const fd = setAccountImportingAction.mock.calls[0][1] as FormData;
    expect(fd.get("plaidAccountRowId")).toBe("row-checking");
    expect(fd.get("importing")).toBe("0");
    expect(refresh).not.toHaveBeenCalled(); // the action's revalidation is the one refresh
  });

  it("renders an OFF switch for a paused-but-still-mapped account and turns it back on", async () => {
    setAccountImportingAction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    const paused = bank({
      accounts: [
        {
          rowId: "row-checking",
          plaidAccountId: "plaid-acc-checking",
          name: "Plaid Checking",
          ...checkingDefaults,
          mask: "0000",
          linkState: "ignored",
          mappedAccountName: "Checking", // still resolvable — toggled off via the new path, not nulled
          needsReview: false,
          reviewReason: null,
          excludedFromCalculations: false,
          pendingSignCheckCount: 0,
        },
      ],
    });

    render(<ConnectedBanks banks={[paused]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);

    const toggle = screen.getByRole("switch", { name: /import.*Plaid Checking/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    await user.click(toggle);

    expect(setAccountImportingAction).toHaveBeenCalledTimes(1);
    const fd = setAccountImportingAction.mock.calls[0][1] as FormData;
    expect(fd.get("plaidAccountRowId")).toBe("row-checking");
    expect(fd.get("importing")).toBe("1");
  });
});

// User request 2026-09-15: the accounts a bank exposes but Budgts never
// mapped ("not set up") — or that were explicitly declined via "Don't
// import this one" — get the same kind of one-tap switch as an already
// mapped account, instead of plain unclickable text. Turning it on reuses
// the exact bulk-mapping action (mapAccounts) in "new" mode with the same
// guessed defaults the "Choose accounts to import" form pre-fills.
describe("ConnectedBanks — connect switch (never-mapped accounts)", () => {
  it("renders an OFF connect switch (not plain text) for an account never set up", () => {
    render(<ConnectedBanks banks={[bank()]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);
    // "Plaid Saving" fixture: linkState ignored, mappedAccountName null — never mapped.
    expect(screen.getByRole("heading", { name: /Not imported/ })).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: /connect.*Plaid Saving/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("renders an OFF connect switch for a truly unmapped (never-decided) account", () => {
    const withUnmapped = bank({
      accounts: [
        {
          rowId: "row-new",
          plaidAccountId: "plaid-acc-new",
          name: "Plaid Credit Card",
          officialName: null,
          type: "credit",
          subtype: null,
          mask: "2222",
          linkState: "unmapped",
          mappedAccountName: null,
          needsReview: false,
          reviewReason: null,
          excludedFromCalculations: false,
          pendingSignCheckCount: 0,
        },
      ],
    });

    render(<ConnectedBanks banks={[withUnmapped]} budgtsAccounts={[]} />);

    expect(screen.getByText("not set up")).toBeInTheDocument();
    const toggle = screen.getByRole("switch", { name: /connect.*Plaid Credit Card/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("connecting calls mapAccounts in 'new' mode with the guessed name/type and the item id", async () => {
    mapAccounts.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<ConnectedBanks banks={[bank()]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);

    const toggle = screen.getByRole("switch", { name: /connect.*Plaid Saving/i });
    await user.click(toggle);

    expect(mapAccounts).toHaveBeenCalledTimes(1);
    const fd = mapAccounts.mock.calls[0][1] as FormData;
    expect(fd.get("plaidItemId")).toBe("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    const entries = JSON.parse(fd.get("entries") as string);
    expect(entries).toEqual([
      { plaidAccountId: "plaid-acc-saving", mode: "new", name: "Plaid Saving ••1111", type: "savings" },
    ]);
    expect(refresh).not.toHaveBeenCalled(); // the action's revalidation is the one refresh
  });

  it("the switch is always OFF for a not-yet-connected account — there is no on/off toggle here, only connect", () => {
    // Once mapAccounts succeeds, linkState flips to "mapped" and BankCard
    // renders ImportToggle for this row instead — THAT switch (already
    // covered above) is what offers reversible on/off from then on.
    render(<ConnectedBanks banks={[bank()]} budgtsAccounts={[]} />);
    expect(screen.getByRole("switch", { name: /connect.*Plaid Saving/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("shows a field error returned by mapAccounts without crashing", async () => {
    mapAccounts.mockResolvedValue({ fieldError: "Could not create the account. Try again." });
    const user = userEvent.setup();

    render(<ConnectedBanks banks={[bank()]} budgtsAccounts={[]} />);
    await user.click(screen.getByRole("switch", { name: /connect.*Plaid Saving/i }));

    expect(await screen.findByText("Could not create the account. Try again.")).toBeInTheDocument();
  });
});
