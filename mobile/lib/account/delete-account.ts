import { apiRequest } from "../api/request";

/**
 * Outcomes of `POST /api/account/delete` (server: `src/app/api/account/delete/route.ts`, design:
 * docs/specs/2026-09-19-account-deletion-design.md). Every state has a reachable exit: a fresh sign-in for
 * `reauth_required`, a retry for `incomplete` (the account is read-only until it finishes), and a plain message otherwise.
 * Deleting the account does not cancel an Apple / Google subscription — the server says when one may still be running.
 */
export type DeleteOutcome =
  | { status: "deleted"; storeSubscriptionMayBeActive: boolean; manageSubscriptionUrl: string | null }
  | { status: "reauth_required" }
  | { status: "unavailable" }
  | { status: "incomplete" }
  /** 502 plaid_removal_failed: a bank Plaid won't remove. Not deleted; disconnect it in Connected Banks, then retry. */
  | { status: "plaid" }
  /** The route's own "could not delete account": it stopped before anything irreversible. Not deleted. */
  | { status: "failed" }
  /** An answer we can't read (a gateway timeout, an HTML page, an unknown code): it may or may not have run. Retrying
   *  is safe: it finishes a started deletion or confirms a finished one. */
  | { status: "uncertain" }
  | { status: "auth" }
  | { status: "network" };

/** `store` is this device's store: the server lists each store's own manage page, and the app opens its own. */
export async function requestAccountDeletion(
  store: "apple" | "google",
  fetcher: () => Promise<Response>,
): Promise<DeleteOutcome> {
  const r = await apiRequest(fetcher, (b) => {
    if (!b || typeof b !== "object" || (b as { ok?: unknown }).ok !== true) throw new Error("delete: shape");
    const body = b as { storeSubscriptionMayBeActive?: unknown; manageSubscriptionLinks?: unknown };
    const links = Array.isArray(body.manageSubscriptionLinks) ? (body.manageSubscriptionLinks as { store?: unknown; url?: unknown }[]) : [];
    const link = links.find((l) => l && l.store === store && typeof l.url === "string");
    return {
      storeSubscriptionMayBeActive: body.storeSubscriptionMayBeActive === true,
      manageSubscriptionUrl: link ? (link.url as string) : null,
    };
  });

  if (r.ok) return { status: "deleted", ...r.data };
  if (r.kind === "auth") return { status: "auth" };
  if (r.kind === "network") return { status: "network" };
  if (r.kind === "contract") return { status: "uncertain" };
  if (r.code === "reauth_required") return { status: "reauth_required" };
  if (r.code === "account_deletion_unavailable") return { status: "unavailable" };
  if (r.code === "account_deletion_incomplete") return { status: "incomplete" };
  if (r.code === "plaid_removal_failed") return { status: "plaid" };
  if (r.status === 500 && r.code === "could not delete account") return { status: "failed" };
  return { status: "uncertain" };
}
