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
  | { status: "failed" }
  | { status: "auth" }
  | { status: "network" };

export async function requestAccountDeletion(fetcher: () => Promise<Response>): Promise<DeleteOutcome> {
  const r = await apiRequest(fetcher, (b) => {
    if (!b || typeof b !== "object" || (b as { ok?: unknown }).ok !== true) throw new Error("delete: shape");
    const body = b as { storeSubscriptionMayBeActive?: unknown; manageSubscriptionUrl?: unknown };
    return {
      storeSubscriptionMayBeActive: body.storeSubscriptionMayBeActive === true,
      manageSubscriptionUrl: typeof body.manageSubscriptionUrl === "string" ? body.manageSubscriptionUrl : null,
    };
  });

  if (r.ok) return { status: "deleted", ...r.data };
  if (r.kind === "auth") return { status: "auth" };
  if (r.kind === "network") return { status: "network" };
  if (r.code === "reauth_required") return { status: "reauth_required" };
  if (r.code === "account_deletion_unavailable") return { status: "unavailable" };
  if (r.code === "account_deletion_incomplete") return { status: "incomplete" };
  return { status: "failed" };
}
