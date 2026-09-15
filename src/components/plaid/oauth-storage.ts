/**
 * Carries a Plaid Link session across the full-page navigation an OAuth
 * institution (SoFi, Capital One, most large US banks) forces: Link sends
 * the browser to the bank's own login page, and the bank redirects back to
 * our registered `redirect_uri` — a fresh page load with no React state.
 * `usePlaidLink` needs the SAME `token` again plus `receivedRedirectUri` to
 * resume, so the token and why we opened Link (a fresh connect, or a
 * specific item's reconnect) travel via sessionStorage instead (design
 * 2026-09-15, the reconnect-hangs-on-Plaid bug report).
 */
export type PlaidLinkContext = { kind: "connect" } | { kind: "reconnect"; itemId: string };

const KEY = "budgts:plaid-link";

export function saveLinkContext(linkToken: string, context: PlaidLinkContext): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ linkToken, context }));
  } catch {
    // Private browsing / storage disabled — OAuth resume won't survive the
    // redirect, but Link still works for non-OAuth institutions either way.
  }
}

export function loadLinkContext(): { linkToken: string; context: PlaidLinkContext } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { linkToken?: unknown; context?: unknown };
    if (typeof parsed.linkToken !== "string" || !parsed.context) return null;
    return parsed as { linkToken: string; context: PlaidLinkContext };
  } catch {
    return null;
  }
}

export function clearLinkContext(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore — nothing to clean up if storage isn't usable
  }
}
