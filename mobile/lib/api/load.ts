import { apiRequest } from "./request";

/**
 * The two shapes every native data screen needs, built once on `apiRequest`:
 *   loadResource — a GET whose success body is parsed into the screen's data, or a plain-language error;
 *   mutate       — a write whose outcome is one of a fixed set the form knows how to show.
 * Messages are fixed strings: server, OS and network error text never reaches the screen.
 */
export type LoadErrorKind = "auth" | "network" | "unavailable" | "contract" | "rejected";

const LOAD_MESSAGES: Record<LoadErrorKind, string> = {
  auth: "Your session has expired. Please sign in again.",
  network: "Couldn't reach Budgts. Check your connection and try again.",
  unavailable: "Budgts couldn't load this right now. Please try again.",
  contract: "Budgts sent something this version of the app doesn't understand. Please update the app.",
  rejected: "Budgts couldn't load this. Please try again.",
};

export type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; kind: LoadErrorKind; message: string };

export async function loadResource<T>(
  fetcher: () => Promise<Response>,
  parse: (body: unknown) => T,
): Promise<Exclude<LoadState<T>, { status: "loading" }>> {
  const r = await apiRequest(fetcher, parse);
  if (r.ok) return { status: "ready", data: r.data };
  return { status: "error", kind: r.kind, message: LOAD_MESSAGES[r.kind] };
}

export type MutationErrorKind = "auth" | "network" | "unavailable" | "locked";

/**
 * A started account deletion has made the account read-only (the server's 423 `account_locked`): the web's words
 * (src/lib/ownership.ts `LOCKED_MESSAGE`; tests/unit/mobile-locked-message.test.ts keeps them equal), never
 * "something went wrong".
 */
export const LOCKED_MESSAGE = "Your account is being deleted, so changes are paused.";

const MUTATION_MESSAGES: Record<MutationErrorKind, string> = {
  auth: "Your session has expired. Please sign in again.",
  network: "Couldn't reach Budgts. Check your connection and try again.",
  unavailable: "Something went wrong. Please try again.",
  locked: LOCKED_MESSAGE,
};

export type MutationOutcome =
  | { status: "ok"; id?: string }
  /** The server rejected the input; `fieldErrors` is keyed by form field. */
  | { status: "invalid"; fieldErrors: Record<string, string> }
  /** The row changed under the user (optimistic concurrency). */
  | { status: "conflict" }
  /** The row no longer exists (or was never the caller's). */
  | { status: "missing" }
  | { status: "nothing_to_copy" }
  | { status: "error"; kind: MutationErrorKind; message: string };

export async function mutate(fetcher: () => Promise<Response>): Promise<MutationOutcome> {
  const r = await apiRequest(fetcher, (body) => {
    const id = body && typeof body === "object" ? (body as { id?: unknown }).id : undefined;
    return typeof id === "string" ? id : undefined;
  });
  if (r.ok) return r.data === undefined ? { status: "ok" } : { status: "ok", id: r.data };

  if (r.kind === "rejected") {
    if (r.code === "invalid") return { status: "invalid", fieldErrors: r.fieldErrors ?? {} };
    if (r.code === "conflict") return { status: "conflict" };
    if (r.code === "not_found") return { status: "missing" };
    if (r.code === "nothing_to_copy") return { status: "nothing_to_copy" };
    if (r.code === "account_locked") return { status: "error", kind: "locked", message: MUTATION_MESSAGES.locked };
  }
  const kind: MutationErrorKind = r.kind === "auth" || r.kind === "network" ? r.kind : "unavailable";
  return { status: "error", kind, message: MUTATION_MESSAGES[kind] };
}
