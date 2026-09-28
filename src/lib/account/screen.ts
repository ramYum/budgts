/**
 * The web account-deletion screen's routes and how it reads the deletion endpoint's answer. Plain module (no server
 * imports): the screen runs in the browser, and the pure mapping below is unit-tested on its own.
 *
 * The endpoint (`POST /api/account/delete`) is the only authority; this only turns its status and error code into the
 * one state the screen shows, each with its way out. Design: docs/specs/2026-09-19-account-deletion-design.md.
 */

/** How recently the user must have signed in before a deletion runs: the step-up window (reauth.ts). */
export const REAUTH_WINDOW_MINUTES = 10;

export const DELETE_ACCOUNT_PATH = "/settings/delete-account";
/** Where a fresh sign-in returns: straight to the confirm step, the explanation already read. */
export const DELETE_ACCOUNT_CONFIRM_PATH = `${DELETE_ACCOUNT_PATH}?step=confirm`;
/** Where a completed deletion lands, signed out. `?store=1` when a store subscription may still be running. */
export const ACCOUNT_DELETED_PATH = "/account-deleted";

/** The word the confirm step asks for. Compared case-insensitively, surrounding spaces ignored. */
export const CONFIRM_WORD = "DELETE";

export function confirmWordMatches(typed: string): boolean {
  return typed.trim().toUpperCase() === CONFIRM_WORD;
}

export type DeleteOutcome =
  | { kind: "deleted"; storeSubscriptionMayBeActive: boolean }
  /** 403: the sign-in is older than the window. Sign in again, then confirm. */
  | { kind: "reauth" }
  /** 401: the session is gone (signed out elsewhere, or revoked). */
  | { kind: "signed_out" }
  /** 503: the server can't delete accounts right now. Nothing changed. */
  | { kind: "unavailable" }
  /** 500 + account_deletion_incomplete: started, not finished. Read-only until a retry finishes it. */
  | { kind: "incomplete" }
  /** 502 + plaid_removal_failed: a bank Plaid would not remove. Not deleted; disconnect it, then retry. */
  | { kind: "plaid" }
  /** The route's own "could not delete account": it ran, and stopped before the lock. The account was not deleted. */
  | { kind: "failed" }
  /** An answer we can't read (a gateway 504, an HTML error page, an unknown code): the deletion may or may not have
   *  run. Trying again is safe, since it finishes a started deletion or confirms a finished one. */
  | { kind: "uncertain" }
  /** The request never got an answer. Deletion is idempotent: trying again finishes or confirms it. */
  | { kind: "network" };

/** The endpoint's answer, as the one state the screen shows. */
export function outcomeFromResponse(status: number, body: unknown): DeleteOutcome {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (status >= 200 && status < 300 && b.ok === true) {
    return { kind: "deleted", storeSubscriptionMayBeActive: b.storeSubscriptionMayBeActive === true };
  }
  if (status === 401) return { kind: "signed_out" };
  if (status === 403 && b.error === "reauth_required") return { kind: "reauth" };
  if (status === 503) return { kind: "unavailable" };
  if (b.error === "account_deletion_incomplete") return { kind: "incomplete" };
  if (b.error === "plaid_removal_failed") return { kind: "plaid" };
  if (status === 500 && b.error === "could not delete account") return { kind: "failed" };
  return { kind: "uncertain" };
}

/** Where to go once the account is gone. */
export function deletedDestination(storeSubscriptionMayBeActive: boolean): string {
  return storeSubscriptionMayBeActive ? `${ACCOUNT_DELETED_PATH}?store=1` : ACCOUNT_DELETED_PATH;
}
