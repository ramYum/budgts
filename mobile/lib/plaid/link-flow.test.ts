import { describe, expect, it, vi } from "vitest";
import { connectBank, reconnectBank } from "./link-flow";
import type { ConnectDeps, ReconnectDeps } from "./link-flow";
import type { PlaidLinkClient } from "./plaid-link";

function fakeLink(outcome: Awaited<ReturnType<PlaidLinkClient["open"]>>, available = true): PlaidLinkClient {
  return { isAvailable: () => available, open: vi.fn(async () => outcome) };
}

const OK_TOKEN = { status: "ok" as const, linkToken: "link-token-1" };

describe("connectBank", () => {
  it("is unavailable when the native SDK cannot run here (e.g. Expo Go), without minting a token", async () => {
    const fetchLinkToken = vi.fn();
    const r = await connectBank({ link: fakeLink({ kind: "success", publicToken: "x", institution: null }, false), fetchLinkToken, exchange: vi.fn() });
    expect(r).toEqual({ status: "unavailable" });
    expect(fetchLinkToken).not.toHaveBeenCalled();
  });

  it("reports the server error when minting the link token fails", async () => {
    const deps: ConnectDeps = {
      link: fakeLink({ kind: "success", publicToken: "x", institution: null }),
      fetchLinkToken: async () => ({ status: "error", message: "Couldn't start the bank link." }),
      exchange: vi.fn(),
    };
    expect(await connectBank(deps)).toEqual({ status: "error", message: "Couldn't start the bank link." });
    expect(deps.exchange).not.toHaveBeenCalled();
  });

  it("passes the platform through to link-token minting so the server can add native Link params", async () => {
    const fetchLinkToken = vi.fn(async () => OK_TOKEN);
    await connectBank({ link: fakeLink({ kind: "exit", errorMessage: null }), fetchLinkToken, exchange: vi.fn() }, "ios");
    expect(fetchLinkToken).toHaveBeenCalledWith({ platform: "ios" });
  });

  it("reports cancelled on a plain exit with no error", async () => {
    const deps: ConnectDeps = { link: fakeLink({ kind: "exit", errorMessage: null }), fetchLinkToken: async () => OK_TOKEN, exchange: vi.fn() };
    expect(await connectBank(deps)).toEqual({ status: "cancelled" });
  });

  it("reports the Link SDK's exit error when there is one", async () => {
    const deps: ConnectDeps = {
      link: fakeLink({ kind: "exit", errorMessage: "INSTITUTION_NOT_RESPONDING" }),
      fetchLinkToken: async () => OK_TOKEN,
      exchange: vi.fn(),
    };
    expect(await connectBank(deps)).toEqual({ status: "error", message: "INSTITUTION_NOT_RESPONDING" });
  });

  it("exchanges on success and reports the unmapped accounts to map next", async () => {
    const exchange = vi.fn(async () => ({ status: "ok" as const, plaidItemId: "row-1", accounts: [{ plaidAccountId: "pa1", name: "Checking" }] }));
    const deps: ConnectDeps = {
      link: fakeLink({ kind: "success", publicToken: "pub-1", institution: { id: "ins_1", name: "First Platypus Bank" } }),
      fetchLinkToken: async () => OK_TOKEN,
      exchange,
    };
    const r = await connectBank(deps);
    expect(r).toEqual({ status: "linked", plaidItemId: "row-1", accounts: [{ plaidAccountId: "pa1", name: "Checking" }] });
    expect(exchange).toHaveBeenCalledWith("pub-1", { id: "ins_1", name: "First Platypus Bank" });
  });

  it("reports already_linked distinctly, so the caller can offer 'reconnect' instead of a duplicate connection", async () => {
    const deps: ConnectDeps = {
      link: fakeLink({ kind: "success", publicToken: "pub-1", institution: null }),
      fetchLinkToken: async () => OK_TOKEN,
      exchange: async () => ({ status: "already_linked", itemId: "plaid-item-1" }),
    };
    expect(await connectBank(deps)).toEqual({ status: "already_linked", itemId: "plaid-item-1" });
  });

  it("reports an exchange failure without crashing", async () => {
    const deps: ConnectDeps = {
      link: fakeLink({ kind: "success", publicToken: "pub-1", institution: null }),
      fetchLinkToken: async () => OK_TOKEN,
      exchange: async () => ({ status: "error", message: "Couldn't finish connecting the bank. Try again." }),
    };
    expect(await connectBank(deps)).toEqual({ status: "error", message: "Couldn't finish connecting the bank. Try again." });
  });
});

describe("reconnectBank", () => {
  const okSync = { status: "ok" as const };

  it("requests update-mode (itemId) link-token creation", async () => {
    const fetchLinkToken = vi.fn(async () => OK_TOKEN);
    const deps: ReconnectDeps = { link: fakeLink({ kind: "success", publicToken: "pub-1", institution: null }), fetchLinkToken, sync: async () => okSync };
    await reconnectBank(deps, "plaid-item-1", "android");
    expect(fetchLinkToken).toHaveBeenCalledWith({ itemId: "plaid-item-1", platform: "android" });
  });

  it("syncs after a successful reconnect", async () => {
    const sync = vi.fn(async () => okSync);
    const deps: ReconnectDeps = { link: fakeLink({ kind: "success", publicToken: "pub-1", institution: null }), fetchLinkToken: async () => OK_TOKEN, sync };
    expect(await reconnectBank(deps, "plaid-item-1")).toEqual({ status: "ok" });
    expect(sync).toHaveBeenCalledWith("plaid-item-1");
  });

  it("does not sync on cancel/exit/unavailable/error", async () => {
    const sync = vi.fn();
    expect(await reconnectBank({ link: fakeLink({ kind: "exit", errorMessage: null }), fetchLinkToken: async () => OK_TOKEN, sync }, "x")).toEqual({ status: "cancelled" });
    expect(await reconnectBank({ link: fakeLink({ kind: "success", publicToken: "p", institution: null }, false), fetchLinkToken: async () => OK_TOKEN, sync }, "x")).toEqual({
      status: "unavailable",
    });
    expect(sync).not.toHaveBeenCalled();
  });
});
