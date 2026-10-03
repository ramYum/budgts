/**
 * Web Connect a bank / Reconnect and the bank-sync gate: a 402 from the server says "Bank sync needs a Budgts
 * subscription." and returns the button to idle (no dead end, no generic error, no silent failure).
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const syncConnection = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/server/plaid/actions", () => ({ syncConnection: (...a: unknown[]) => syncConnection(...a) }));
// Link "succeeds" as soon as it is handed a token: what matters here is what the component does with the server's answers.
vi.mock("./link-handoff", () => ({
  LinkHandoff: ({ onSuccess }: { onSuccess: (t: string, m: unknown) => void }) => (
    <button type="button" onClick={() => onSuccess("public-1", { institution: { institution_id: "ins_1", name: "Bank" } })}>
      finish link
    </button>
  ),
}));
vi.mock("./account-mapping", () => ({ AccountMapping: () => null }));

import { ConnectBank } from "./connect-bank";
import { ReconnectButton } from "./reconnect-button";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const refusal = () => json(402, { error: "premium_required", entitlement: { hasPremium: false, status: "expired" } });
const fetchMock = vi.fn();
const MESSAGE = "Bank sync needs a Budgts subscription.";

beforeEach(() => {
  fetchMock.mockReset();
  syncConnection.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
});

describe("ConnectBank and the bank-sync gate", () => {
  it("a 402 from the link token says a subscription is needed and the button works again", async () => {
    fetchMock.mockResolvedValueOnce(refusal());
    render(<ConnectBank accounts={[]} />);
    await userEvent.click(screen.getByTestId("connect-bank"));
    expect(await screen.findByTestId("connect-bank-error")).toHaveTextContent(MESSAGE);
    expect(screen.getByTestId("connect-bank")).toBeEnabled();
    expect(screen.queryByText("finish link")).toBeNull();
  });

  it("a 402 from the exchange says the same, never the generic failure", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { link_token: "link-1" })).mockResolvedValueOnce(refusal());
    render(<ConnectBank accounts={[]} />);
    await userEvent.click(screen.getByTestId("connect-bank"));
    await userEvent.click(await screen.findByText("finish link"));
    expect(await screen.findByTestId("connect-bank-error")).toHaveTextContent(MESSAGE);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/plaid/exchange", expect.objectContaining({ method: "POST" }));
    expect(screen.getByTestId("connect-bank")).toBeEnabled();
  });

  it("other failures keep their own message", async () => {
    fetchMock.mockResolvedValueOnce(json(502, { error: "could not start the bank link" }));
    render(<ConnectBank accounts={[]} />);
    await userEvent.click(screen.getByTestId("connect-bank"));
    expect(await screen.findByTestId("connect-bank-error")).toHaveTextContent("Couldn't start the bank connection. Try again.");
  });
});

describe("ReconnectButton and the bank-sync gate", () => {
  it("a 402 from the update-mode link token says a subscription is needed, opens no Link and syncs nothing", async () => {
    fetchMock.mockResolvedValueOnce(refusal());
    render(<ReconnectButton itemId="item-1" testId="reconnect" />);
    await act(() => userEvent.click(screen.getByTestId("reconnect")));
    expect(await screen.findByTestId("reconnect-error")).toHaveTextContent(MESSAGE);
    expect(screen.getByTestId("reconnect")).toBeEnabled();
    expect(screen.queryByText("finish link")).toBeNull();
    expect(syncConnection).not.toHaveBeenCalled();
  });
});
