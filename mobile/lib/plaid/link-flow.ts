import type { UnmappedAccount } from "./banks-api";
import type { LinkPlatform, PlaidLinkClient, PlaidLinkOutcome } from "./plaid-link";

/**
 * The Plaid Link FLOW: mint a token, open Link, and turn the result into one of a fixed set of outcomes a screen can
 * render — mirroring `lib/billing/purchase-flow.ts`'s shape (a plain object over injected ports, fully unit-tested
 * without a device or the real SDK). Nothing here ever sees a Plaid access token: only the `public_token` Link hands
 * back, which the server exchanges (docs/specs/2026-09-17-mobile-app-launch-design.md §5).
 */
/** `subscription_required`: the bank-sync gate refused (402); see bank-sync-access.ts. */
export type LinkTokenResult = { status: "ok"; linkToken: string } | { status: "subscription_required" } | { status: "error"; message: string };
export type ExchangeResult =
  | { status: "ok"; plaidItemId: string; accounts: UnmappedAccount[] }
  | { status: "already_linked" }
  | { status: "subscription_required" }
  | { status: "error"; message: string };
export type SyncResult = { status: "ok" } | { status: "error"; message: string };

export type ConnectOutcome =
  | { status: "unavailable" }
  | { status: "cancelled" }
  | { status: "linked"; plaidItemId: string; accounts: UnmappedAccount[] }
  | { status: "already_linked" }
  | { status: "subscription_required" }
  | { status: "error"; message: string };

export interface ConnectDeps {
  link: PlaidLinkClient;
  /** `POST /api/plaid/link-token`. `platform` is passed straight through — see native-link-params.ts server-side. */
  fetchLinkToken: (body: { platform?: LinkPlatform; itemId?: string }) => Promise<LinkTokenResult>;
  /** `POST /api/plaid/exchange`. */
  exchange: (publicToken: string, institution: { id: string; name: string } | null) => Promise<ExchangeResult>;
}

const LINK_FAILED = "Couldn't open the bank connection. Try again.";

/** Link's own outcome, or "failed" when it could not start: a rejection never escapes to leave a button stuck. */
async function openLink(link: PlaidLinkClient, linkToken: string): Promise<PlaidLinkOutcome | "failed"> {
  try {
    return await link.open(linkToken);
  } catch {
    return "failed";
  }
}

/** Connect a new bank: mint a token, open Link, exchange on success. */
export async function connectBank(deps: ConnectDeps, platform?: LinkPlatform): Promise<ConnectOutcome> {
  if (!deps.link.isAvailable()) return { status: "unavailable" };

  const token = await deps.fetchLinkToken(platform ? { platform } : {});
  if (token.status === "subscription_required") return token;
  if (token.status === "error") return { status: "error", message: token.message };

  const outcome = await openLink(deps.link, token.linkToken);
  if (outcome === "failed") return { status: "error", message: LINK_FAILED };
  if (outcome.kind === "exit") return { status: "cancelled" };

  const exchanged = await deps.exchange(outcome.publicToken, outcome.institution);
  if (exchanged.status === "ok") return { status: "linked", plaidItemId: exchanged.plaidItemId, accounts: exchanged.accounts };
  if (exchanged.status === "already_linked") return { status: "already_linked" };
  if (exchanged.status === "subscription_required") return exchanged;
  return { status: "error", message: exchanged.message };
}

export type ReconnectOutcome =
  | { status: "unavailable" }
  | { status: "cancelled" }
  | { status: "ok"; warning?: string }
  | { status: "subscription_required" }
  | { status: "error"; message: string };

export interface ReconnectDeps {
  link: PlaidLinkClient;
  fetchLinkToken: (body: { platform?: LinkPlatform; itemId?: string }) => Promise<LinkTokenResult>;
  /** `POST /api/mobile/plaid/sync`. */
  sync: (itemId: string) => Promise<SyncResult>;
}

/** Reconnect a bank whose login expired: Link in update mode (existing item, same access token), then sync. */
export async function reconnectBank(deps: ReconnectDeps, itemId: string, platform?: LinkPlatform): Promise<ReconnectOutcome> {
  if (!deps.link.isAvailable()) return { status: "unavailable" };

  const token = await deps.fetchLinkToken({ itemId, ...(platform ? { platform } : {}) });
  if (token.status === "subscription_required") return token;
  if (token.status === "error") return { status: "error", message: token.message };

  const outcome = await openLink(deps.link, token.linkToken);
  if (outcome === "failed") return { status: "error", message: LINK_FAILED };
  if (outcome.kind === "exit") return { status: "cancelled" };

  const result = await deps.sync(itemId);
  return result.status === "ok" ? { status: "ok" } : { status: "error", message: result.message };
}
