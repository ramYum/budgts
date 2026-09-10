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
    const user = userEvent.setup();

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
