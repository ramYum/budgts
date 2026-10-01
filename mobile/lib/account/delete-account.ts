import { apiRequest } from "../api/request";

/**
 * Outcomes of `POST /api/account/delete` (server: `src/app/api/account/delete/route.ts`, design:
 * docs/specs/2026-09-19-account-deletion-design.md). Every state has a reachable exit: a fresh sign-in for
 * `reauth_required`, a retry for `incomplete` (the account is read-only until it finishes), and a plain message otherwise.
 * Deleting the account does not cancel an Apple / Google subscription — the server says when one may still be running.
 */
export type DeleteOutcome =
  | { status: "deleted"; storeSubscriptionMayBeActive: boolean }
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

/**
 * `POST /api/account/delete`'s answer. When a store subscription may still be running, the account-deleted screen links
 * both stores' own pages (as the web's does), so the server's per-store links aren't read here.
 */
export async function requestAccountDeletion(fetcher: () => Promise<Response>): Promise<DeleteOutcome> {
  const r = await apiRequest(fetcher, (b) => {
    if (!b || typeof b !== "object" || (b as { ok?: unknown }).ok !== true) throw new Error("delete: shape");
    return { storeSubscriptionMayBeActive: (b as { storeSubscriptionMayBeActive?: unknown }).storeSubscriptionMayBeActive === true };
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
