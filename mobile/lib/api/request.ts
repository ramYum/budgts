import { NotAuthenticatedError } from "../auth/api";

/**
 * The single place a native backend call's outcome is mapped to something a screen can render — the client half of the
 * transport in docs/specs/2026-09-21-mobile-only-transition-design.md §4A. Every resource module (profile, transactions,
 * budgets, ...) builds on this instead of re-deriving status handling.
 *
 * `apiRequest` never throws and never returns raw error text (it can carry hostnames). A success body is returned only
 * after the caller's `parse` accepted it, so a server change the app does not understand is a `contract` failure, never a
 * screen that guesses.
 */
export type ApiFailure = {
  ok: false;
  /** auth: session missing/expired · network: could not reach the server · unavailable: 5xx · rejected: 4xx with a code · contract: unreadable success body */
  kind: "auth" | "network" | "unavailable" | "rejected" | "contract";
  status?: number;
  /** The server's stable machine code (`{ error }`), when it sent one. */
  code?: string;
  fieldErrors?: Record<string, string>;
};

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

export async function apiRequest<T>(fetcher: () => Promise<Response>, parse: (body: unknown) => T): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetcher();
  } catch (err) {
    return err instanceof NotAuthenticatedError ? { ok: false, kind: "auth" } : { ok: false, kind: "network" };
  }

  if (response.status === 401) return { ok: false, kind: "auth", status: 401 };

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const failure: ApiFailure = { ok: false, kind: response.status >= 500 ? "unavailable" : "rejected", status: response.status };
    if (body && typeof body === "object") {
      const { error, fieldErrors } = body as { error?: unknown; fieldErrors?: unknown };
      if (typeof error === "string") failure.code = error;
      if (fieldErrors && typeof fieldErrors === "object") failure.fieldErrors = fieldErrors as Record<string, string>;
    }
    return failure;
  }

  try {
    return { ok: true, data: parse(await response.json()) };
  } catch {
    return { ok: false, kind: "contract" };
  }
}

/** A JSON request body for `authFetch(path, session, jsonInit("POST", body))`. */
export function jsonInit(method: "POST" | "PUT" | "PATCH" | "DELETE", body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
