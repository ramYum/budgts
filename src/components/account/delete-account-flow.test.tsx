import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn<(opts?: { scope: string }) => Promise<{ error: null }>>(async () => ({ error: null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut } }) }));
const requestReauthLink = vi.fn(async () => ({ sent: true }));
vi.mock("@/server/account", () => ({
  requestReauthLink: (...a: unknown[]) => (requestReauthLink as (...x: unknown[]) => unknown)(...a),
  reauthWithGoogle: vi.fn(),
}));

import { DeleteAccountFlow } from "./delete-account-flow";

const go = vi.fn();
const fetchMock = vi.fn();

function flow(props: Partial<Parameters<typeof DeleteAccountFlow>[0]> = {}) {
  return render(
    <DeleteAccountFlow
      email="alex@example.com"
      recent
      google={false}
      inProgress={false}
      initial="intro"
      supportEmail={null}
      billing
      go={go}
      {...props}
    />,
  );
}

function answer(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

async function toConfirmAndDelete(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Type DELETE to confirm/), "delete");
  await user.click(screen.getByRole("button", { name: "Delete my account" }));
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  go.mockReset();
  signOut.mockClear();
  requestReauthLink.mockClear();
});

describe("DeleteAccountFlow: before anything runs", () => {
  it("explains what is deleted and kept, with the store notice and a way back", () => {
    flow();
    expect(screen.getByText("What's deleted")).toBeInTheDocument();
    expect(screen.getByText(/Every connected bank, disconnected at Plaid/)).toBeInTheDocument();
    expect(screen.getByText("What's kept")).toBeInTheDocument();
    expect(screen.getByText(/does not automatically cancel your App Store or Google Play subscription/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Keep my account" })).toHaveAttribute("href", "/settings");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says nothing is kept when the owner set retention to 0", () => {
    flow({ keepsRecords: false });
    expect(screen.getByText("Nothing. Your data is deleted right away.")).toBeInTheDocument();
    expect(screen.queryByText(/billing records/)).not.toBeInTheDocument();
  });

  it("leaves the store notice out while this deployment sells no subscriptions", () => {
    flow({ billing: false });
    expect(screen.queryByText(/does not automatically cancel/)).not.toBeInTheDocument();
    expect(screen.getByText("What's kept")).toBeInTheDocument();
  });

  it("goes straight to the confirm step after a recent sign-in", async () => {
    const user = userEvent.setup();
    flow({ recent: true });
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText(/permanently delete the Budgts account for/)).toHaveTextContent("alex@example.com");
  });

  it("asks for a fresh sign-in first when the last one is older than 10 minutes", async () => {
    const user = userEvent.setup();
    flow({ recent: false });
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByText(/needs a sign-in from the last 10 minutes/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Type DELETE/)).not.toBeInTheDocument();
    // Google only for an account that uses it
    expect(screen.queryByRole("button", { name: /Continue with Google/ })).not.toBeInTheDocument();
  });

  it("offers Google for an account that signs in with it", async () => {
    const user = userEvent.setup();
    flow({ recent: false, google: true });
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("button", { name: /Continue with Google/ })).toBeInTheDocument();
  });

  it("sends the sign-in link and says where it went", async () => {
    const user = userEvent.setup();
    flow({ recent: false });
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: /Email me a sign-in link/ }));
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("alex@example.com");
    expect(requestReauthLink).toHaveBeenCalledTimes(1);
  });

  it("shows why the link couldn't be sent", async () => {
    requestReauthLink.mockResolvedValueOnce({ error: "A link was sent a moment ago. Wait a minute, then try again." } as never);
    const user = userEvent.setup();
    flow({ recent: false });
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    await user.click(screen.getByRole("button", { name: /Email me a sign-in link/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wait a minute");
  });

  it("opens on the confirm step when a fresh sign-in returns to it, but only if it is still recent", () => {
    flow({ initial: "confirm", recent: true });
    expect(screen.getByLabelText(/Type DELETE to confirm/)).toBeInTheDocument();
  });

  it("falls back to the fresh sign-in if the returning sign-in is already stale", () => {
    flow({ initial: "confirm", recent: false });
    expect(screen.getByText(/needs a sign-in from the last 10 minutes/)).toBeInTheDocument();
  });

  it("keeps Delete disabled until DELETE is typed", async () => {
    const user = userEvent.setup();
    flow({ initial: "confirm" });
    const button = screen.getByRole("button", { name: "Delete my account" });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/Type DELETE to confirm/), "delet");
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/Type DELETE to confirm/), "e");
    expect(button).toBeEnabled();
  });

  it("says a deletion already started, and that continuing finishes it", () => {
    flow({ inProgress: true });
    expect(screen.getByText(/Deletion already started/)).toBeInTheDocument();
    expect(screen.getByText(/read-only until it finishes/)).toBeInTheDocument();
  });
});

describe("DeleteAccountFlow: running the deletion", () => {
  it("shows progress while the server works, then signs out locally and lands on the confirmation", async () => {
    let finish!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (finish = r)));
    const user = userEvent.setup();
    flow({ initial: "confirm" });
    await toConfirmAndDelete(user);

    expect(screen.getByRole("status")).toHaveTextContent(/Disconnecting your banks and removing your data/);
    expect(screen.queryByRole("button", { name: "Delete my account" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/account/delete", { method: "POST" });

    finish(new Response(JSON.stringify({ ok: true, alreadyDeleted: false, path: "hard-delete" }), { status: 200 }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/account-deleted"));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("carries the store-subscription warning to the confirmation page", async () => {
    answer(200, { ok: true, alreadyDeleted: false, path: "anonymize", storeSubscriptionMayBeActive: true });
    const user = userEvent.setup();
    flow({ initial: "confirm" });
    await toConfirmAndDelete(user);
    await waitFor(() => expect(go).toHaveBeenCalledWith("/account-deleted?store=1"));
  });

  it("a sign-in that went stale mid-flow returns to the fresh sign-in, saying nothing was deleted", async () => {
    answer(403, { error: "reauth_required" });
    const user = userEvent.setup();
    flow({ initial: "confirm" });
    await toConfirmAndDelete(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/more than 10 minutes since you signed in\. Nothing was deleted/);
    expect(screen.getByRole("button", { name: /Email me a sign-in link/ })).toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
  });

  it("a lost session offers to sign in again and come back", async () => {
    answer(401, { error: "unauthorized" });
    const user = userEvent.setup();
    flow({ initial: "confirm" });
    await toConfirmAndDelete(user);
    await user.click(await screen.findByRole("button", { name: /Sign in again/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/sign-in?next=%2Fsettings%2Fdelete-account"));
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it.each([
    ["incomplete", 500, { error: "account_deletion_incomplete", retryable: true }, /read-only until it does/],
    ["plaid", 502, { error: "plaid_removal_failed", retryable: true }, /Disconnect it in Connected banks/],
    ["unavailable", 503, { error: "account_deletion_unavailable" }, /nothing was changed/],
    ["failed", 500, { error: "could not delete account" }, /Your account wasn't deleted/],
    ["uncertain (gateway timeout)", 504, "<html>Gateway Timeout</html>", /may or may not be deleted. Try again: if deletion had already started, trying again finishes it/],
  ])("shows the %s failure with a retry", async (_kind, status, body, text) => {
    answer(status, body);
    const user = userEvent.setup();
    flow({ initial: "confirm" });
    await toConfirmAndDelete(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
  });

  it("links a Plaid failure to Connected banks, where the user can disconnect that bank", async () => {
    answer(502, { error: "plaid_removal_failed", retryable: true });
    const user = userEvent.setup();
    flow({ initial: "confirm" });
    await toConfirmAndDelete(user);
    expect(await screen.findByRole("link", { name: /Connected banks/ })).toHaveAttribute("href", "/connected-banks");
  });

  it("a network failure says trying again is safe, and trying again runs the deletion again", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    answer(200, { ok: true, alreadyDeleted: true, path: "already-deleted" });
    const user = userEvent.setup();
    flow({ initial: "confirm" });
    await toConfirmAndDelete(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/trying again finishes it/);
    await user.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("/account-deleted"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("offers the support address on a failure only while the legal pages are live", async () => {
    answer(500, { error: "account_deletion_incomplete", retryable: true });
    const user = userEvent.setup();
    flow({ initial: "confirm", supportEmail: "help@example.com" });
    await toConfirmAndDelete(user);
    expect(await screen.findByRole("link", { name: "help@example.com" })).toHaveAttribute("href", "mailto:help@example.com");
  });

  it("opens signed out when the page found no valid session", () => {
    flow({ initial: "signed_out" });
    expect(screen.getByText(/Your session ended, so nothing was deleted/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /how deletion works/ })).not.toBeInTheDocument();
  });
});
