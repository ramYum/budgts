import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMapping, type MappableAccount } from "./account-mapping";

const mapAccounts = vi.fn();
const mappingSuggestionsAction = vi.fn();

vi.mock("@/server/plaid/actions", () => ({
  mapAccounts: (...args: unknown[]) => mapAccounts(...args),
  mappingSuggestionsAction: (...args: unknown[]) => mappingSuggestionsAction(...args),
}));

/** The rows appear once the server's reconnect suggestions are in. */
const ready = () => screen.findByTestId("account-mapping");

const plaidAccounts: MappableAccount[] = [
  {
    plaidAccountId: "plaid-acc-1",
    name: "Plaid Checking",
    officialName: "Plaid Gold Standard 0% Interest Checking",
    mask: "0000",
    type: "depository",
    subtype: "checking",
    currentBalance: 11000,
    isoCurrencyCode: "USD",
  },
  {
    plaidAccountId: "plaid-acc-2",
    name: "Plaid Credit Card",
    officialName: null,
    mask: "3333",
    type: "credit",
    subtype: "credit card",
    currentBalance: -25000,
    isoCurrencyCode: "USD",
  },
];

const budgtsAccounts = [
  { id: "33333333-3333-3333-3333-333333333333", name: "Everyday" },
];

beforeEach(() => mappingSuggestionsAction.mockResolvedValue({ ok: true, suggestions: {} }));
afterEach(() => vi.clearAllMocks());

describe("AccountMapping", () => {
  it("renders one row per linked account", async () => {
    render(
      <AccountMapping
        plaidItemId="99999999-9999-9999-9999-999999999999"
        plaidAccounts={plaidAccounts}
        budgtsAccounts={budgtsAccounts}
        onDone={vi.fn()}
      />,
    );
    await ready();
    expect(screen.getByText("Plaid Checking ••0000")).toBeInTheDocument();
    expect(screen.getByText("Plaid Credit Card ••3333")).toBeInTheDocument();
  });

  it("submits the chosen mapping: one new account, one pointed at an existing one", async () => {
    mapAccounts.mockResolvedValue({ ok: true });
    const user = userEvent.setup({ delay: null });

    render(
      <AccountMapping
        plaidItemId="99999999-9999-9999-9999-999999999999"
        plaidAccounts={plaidAccounts}
        budgtsAccounts={budgtsAccounts}
        onDone={vi.fn()}
      />,
    );
    await ready();

    const [mode1, mode2] = screen.getAllByRole("combobox", { name: "Import as" });
    // second account: map onto the existing "Everyday" — its name field disappears
    await user.selectOptions(mode2, "existing");
    await user.selectOptions(screen.getByRole("combobox", { name: "Existing account" }), budgtsAccounts[0].id);
    // first account: keep "new", rename it (now the only name field)
    await user.clear(screen.getByRole("textbox", { name: "New account name" }));
    await user.type(screen.getByRole("textbox", { name: "New account name" }), "Everyday checking");
    expect(mode1).toHaveValue("new");

    await user.click(screen.getByRole("button", { name: "Import transactions" }));

    expect(mapAccounts).toHaveBeenCalledTimes(1);
    const fd = mapAccounts.mock.calls[0][1] as FormData;
    expect(fd.get("plaidItemId")).toBe("99999999-9999-9999-9999-999999999999");
    const entries = JSON.parse(String(fd.get("entries")));
    expect(entries).toEqual([
      { plaidAccountId: "plaid-acc-1", mode: "new", name: "Everyday checking", type: "checking" },
      {
        plaidAccountId: "plaid-acc-2",
        mode: "existing",
        existingAccountId: "33333333-3333-3333-3333-333333333333",
      },
    ]);
  });

  it("pre-fills each row from Plaid's type: a CD as Savings, an HSA, a loan and an investment left out", async () => {
    mapAccounts.mockResolvedValue({ ok: true });
    const user = userEvent.setup({ delay: null });
    const acct = (id: string, name: string, type: string, subtype: string): MappableAccount => ({
      plaidAccountId: id,
      name,
      officialName: null,
      mask: null,
      type,
      subtype,
      currentBalance: 0,
      isoCurrencyCode: "USD",
    });

    render(
      <AccountMapping
        plaidItemId="99999999-9999-9999-9999-999999999999"
        plaidAccounts={[
          acct("cd", "CD", "depository", "cd"),
          acct("mm", "Money market", "depository", "money market"),
          acct("hsa", "HSA", "depository", "hsa"),
          acct("loan", "Mortgage", "loan", "mortgage"),
          acct("inv", "401k", "investment", "401k"),
        ]}
        budgtsAccounts={budgtsAccounts}
        onDone={vi.fn()}
      />,
    );
    await ready();

    const modes = screen.getAllByRole("combobox", { name: "Import as" });
    expect(modes.map((m) => (m as HTMLSelectElement).value)).toEqual(["new", "new", "ignore", "ignore", "ignore"]);
    expect(screen.getAllByRole("combobox", { name: "New account type" }).map((m) => (m as HTMLSelectElement).value)).toEqual([
      "savings",
      "savings",
    ]);

    // The user still decides: import the HSA after all, as a new account starting from Checking.
    await user.selectOptions(modes[2], "new");
    await user.click(screen.getByRole("button", { name: "Import transactions" }));

    const entries = JSON.parse(String((mapAccounts.mock.calls[0][1] as FormData).get("entries")));
    expect(entries).toEqual([
      { plaidAccountId: "cd", mode: "new", name: "CD", type: "savings" },
      { plaidAccountId: "mm", mode: "new", name: "Money market", type: "savings" },
      { plaidAccountId: "hsa", mode: "new", name: "HSA", type: "checking" },
      { plaidAccountId: "loan", mode: "ignore" },
      { plaidAccountId: "inv", mode: "ignore" },
    ]);
  });

  it("hints under an HSA row only that it can be imported, and the hint stays whatever the row's choice", async () => {
    const user = userEvent.setup({ delay: null });
    const acct = (id: string, name: string, type: string, subtype: string): MappableAccount => ({
      plaidAccountId: id,
      name,
      officialName: null,
      mask: null,
      type,
      subtype,
      currentBalance: 0,
      isoCurrencyCode: "USD",
    });
    render(
      <AccountMapping
        plaidItemId="99999999-9999-9999-9999-999999999999"
        plaidAccounts={[acct("chk", "Checking", "depository", "checking"), acct("hsa", "HSA", "depository", "hsa"), acct("inv", "401k", "investment", "401k")]}
        budgtsAccounts={budgtsAccounts}
        onDone={vi.fn()}
      />,
    );
    await ready();

    const hints = screen.getAllByText("Import it if you pay for care from it.");
    expect(hints).toHaveLength(1);
    expect(hints[0]).toHaveClass("text-sm", "text-muted");
    expect(hints[0].closest("li")).toHaveTextContent("HSA");

    await user.selectOptions(screen.getAllByRole("combobox", { name: "Import as" })[1], "new");
    expect(screen.getByText("Import it if you pay for care from it.")).toBeInTheDocument();
  });

  it("surfaces a partial-success warning instead of closing", async () => {
    mapAccounts.mockResolvedValue({ ok: true, warning: "Accounts saved. The first sync didn't finish." });
    const onDone = vi.fn();
    const user = userEvent.setup();

    render(
      <AccountMapping
        plaidItemId="99999999-9999-9999-9999-999999999999"
        plaidAccounts={[plaidAccounts[0]]}
        budgtsAccounts={budgtsAccounts}
        onDone={onDone}
      />,
    );
    await ready();

    await user.click(screen.getByRole("button", { name: "Import transactions" }));

    expect(await screen.findByText(/first sync didn't finish/)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalled();
  });

  describe("a bank account connected before (owner decision 2026-10-02)", () => {
    const accounts = [
      { id: "33333333-3333-3333-3333-333333333333", name: "Everyday" },
      { id: "44444444-4444-4444-4444-444444444444", name: "Old Chase" },
      { id: "55555555-5555-5555-5555-555555555555", name: "Chase card" },
    ];
    const renderWith = async (suggestions: Record<string, unknown>) => {
      mappingSuggestionsAction.mockResolvedValue({ ok: true, suggestions });
      render(
        <AccountMapping
          plaidItemId="99999999-9999-9999-9999-999999999999"
          plaidAccounts={plaidAccounts}
          budgtsAccounts={accounts}
          onDone={vi.fn()}
        />,
      );
      await ready();
      expect(mappingSuggestionsAction).toHaveBeenCalledWith("99999999-9999-9999-9999-999999999999");
    };
    const optionsOf = (el: HTMLElement) => [...(el as HTMLSelectElement).options].map((o) => o.value);

    it("starts the row on the account its history is in, says so, and saves that by default", async () => {
      mapAccounts.mockResolvedValue({ ok: true });
      const user = userEvent.setup({ delay: null });
      await renderWith({ "plaid-acc-1": { kind: "previous", accountId: accounts[1].id, accountName: "Old Chase" } });

      const [mode1, mode2] = screen.getAllByRole("combobox", { name: "Import as" });
      expect(mode1).toHaveValue("existing");
      expect(mode2).toHaveValue("new");
      expect(screen.getByRole("combobox", { name: "Existing account" })).toHaveValue(accounts[1].id);
      expect(screen.getByTestId("account-mapping-previous-0")).toHaveTextContent(
        "You connected this account before. Its history stays in Old Chase.",
      );
      expect(screen.queryByTestId("account-mapping-previous-1")).toBeNull();

      await user.click(screen.getByRole("button", { name: "Import transactions" }));
      const entries = JSON.parse(String((mapAccounts.mock.calls[0][1] as FormData).get("entries")));
      expect(entries[0]).toEqual({ plaidAccountId: "plaid-acc-1", mode: "existing", existingAccountId: accounts[1].id });
    });

    it("the user can still choose a new account instead", async () => {
      mapAccounts.mockResolvedValue({ ok: true });
      const user = userEvent.setup({ delay: null });
      await renderWith({ "plaid-acc-1": { kind: "previous", accountId: accounts[1].id, accountName: "Old Chase" } });
      await user.selectOptions(screen.getAllByRole("combobox", { name: "Import as" })[0], "new");
      await user.click(screen.getByRole("button", { name: "Import transactions" }));
      const entries = JSON.parse(String((mapAccounts.mock.calls[0][1] as FormData).get("entries")));
      expect(entries[0]).toEqual({ plaidAccountId: "plaid-acc-1", mode: "new", name: "Plaid Checking ••0000", type: "checking" });
    });

    it("ambiguous: lists the candidates first and preselects nothing", async () => {
      const user = userEvent.setup({ delay: null });
      await renderWith({ "plaid-acc-1": { kind: "ambiguous", accountIds: [accounts[2].id, accounts[1].id] } });
      const [mode1] = screen.getAllByRole("combobox", { name: "Import as" });
      expect(mode1).toHaveValue("new");
      expect(screen.queryByTestId("account-mapping-previous-0")).toBeNull();
      await user.selectOptions(mode1, "existing");
      const existing = screen.getByRole("combobox", { name: "Existing account" });
      expect(optionsOf(existing)).toEqual([accounts[2].id, accounts[1].id, accounts[0].id]);
      expect(existing).toHaveValue(accounts[2].id);
    });

    it("a failed suggestion read shows no rows and offers Try again", async () => {
      mappingSuggestionsAction.mockResolvedValueOnce({ ok: false });
      const user = userEvent.setup({ delay: null });
      render(
        <AccountMapping
          plaidItemId="99999999-9999-9999-9999-999999999999"
          plaidAccounts={plaidAccounts}
          budgtsAccounts={accounts}
          onDone={vi.fn()}
        />,
      );
      expect(await screen.findByTestId("account-mapping-load-error")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Import transactions" })).toBeNull();
      await user.click(screen.getByRole("button", { name: "Try again" }));
      await ready();
      expect(mappingSuggestionsAction).toHaveBeenCalledTimes(2);
    });
  });
});
