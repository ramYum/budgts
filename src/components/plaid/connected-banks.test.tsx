import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectedBanks, type ConnectedBank } from "./connected-banks";

const disconnectBank = vi.fn();
const syncConnection = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("@/server/plaid/actions", () => ({
  disconnectBank: (...args: unknown[]) => disconnectBank(...args),
  syncConnection: (...args: unknown[]) => syncConnection(...args),
  mapAccounts: vi.fn(),
}));

vi.mock("./reconnect-button", () => ({
  ReconnectButton: ({ itemId }: { itemId: string }) => <button type="button">Reconnect {itemId}</button>,
}));

function bank(over: Partial<ConnectedBank> = {}): ConnectedBank {
  return {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    itemId: "item-sandbox-1",
    institutionName: "First Platypus Bank",
    status: "active",
    lastSyncedAt: new Date().toISOString(),
    accounts: [
      { name: "Plaid Checking", mask: "0000", linkState: "mapped", mappedAccountName: "Checking" },
      { name: "Plaid Saving", mask: "1111", linkState: "ignored", mappedAccountName: null },
    ],
    unmappedAccounts: [],
    ...over,
  };
}

afterEach(() => vi.clearAllMocks());

describe("ConnectedBanks", () => {
  it("shows the connection, its accounts, and the retained-history guarantee", () => {
    render(<ConnectedBanks banks={[bank()]} budgtsAccounts={[{ id: "acc-1", name: "Checking" }]} />);

    expect(screen.getByText("First Platypus Bank")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("→ Checking")).toBeInTheDocument();
    expect(screen.getByText("not imported")).toBeInTheDocument();
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
});
