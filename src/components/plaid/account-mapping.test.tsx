import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMapping, type MappableAccount } from "./account-mapping";

const mapAccounts = vi.fn();

vi.mock("@/server/plaid/actions", () => ({
  mapAccounts: (...args: unknown[]) => mapAccounts(...args),
}));

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

afterEach(() => vi.clearAllMocks());

describe("AccountMapping", () => {
  it("renders one row per linked account", () => {
    render(
      <AccountMapping
        plaidItemId="99999999-9999-9999-9999-999999999999"
        plaidAccounts={plaidAccounts}
        budgtsAccounts={budgtsAccounts}
        onDone={vi.fn()}
      />,
    );
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

    await user.click(screen.getByRole("button", { name: "Import transactions" }));

    expect(await screen.findByText(/first sync didn't finish/)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalled();
  });
});
