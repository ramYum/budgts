/**
 * The one wrapper every native (`/api/mobile/*`) Route Handler goes through.
 *
 * - Authentication is Bearer-only (`getBearerContext`); cookies are ignored. The handler receives a verified user and a
 *   Supabase client carrying that user's own JWT, so RLS scopes every query. The user id is never taken from the request.
 * - Every response is `private, no-store`.
 * - A thrown error becomes a generic 503 `{ error: "unavailable" }`. Nothing about the failure or the caller's data is
 *   echoed to the client; the server log gets the path and `describePlaidError` (codes, never row data or SQL).
 *
 * Handlers stay thin: parse the request, call a shared domain service in `src/lib/<area>/`, map its result to a response.
 */
import { NextResponse } from "next/server";
import { getBearerContext, type BearerContext } from "@/lib/auth/bearer-context";
import { describePlaidError } from "@/lib/plaid/error-policy";

const NO_STORE = { "Cache-Control": "private, no-store" };

export function mobileJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** `{ error: <stable machine code>, ...detail }`. The code is the contract; never put internal text in it. */
export function mobileError(error: string, status: number, detail: Record<string, unknown> = {}): NextResponse {
  return mobileJson({ error, ...detail }, status);
}

/**
 * Maps a domain command's failure (`src/lib/command-result.ts` and the per-area result unions) to the wire: a stable code
 * and status, never the storage error's text. One place, so every native route answers the same way for the same outcome.
 */
export function mobileCommandError(failure: {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
  /** Present on a storage failure; deliberately never sent to the client. */
  message?: string;
}): NextResponse {
  switch (failure.error) {
    case "invalid":
      return mobileError("invalid", 422, { fieldErrors: failure.fieldErrors ?? {} });
    case "missing":
    case "missing_reference":
      return mobileError("not_found", 404);
    case "locked":
      // A started account deletion has made the account read-only (423 Locked): the app says changes are paused and
      // offers to finish deleting, never "not found".
      return mobileError("account_locked", 423);
    case "conflict":
      return mobileError("conflict", 409);
    case "nothing_to_copy":
      return mobileError("nothing_to_copy", 409);
    default:
      return mobileError("unavailable", 503);
  }
}

/** Next's second route-handler argument: the dynamic segments (`[id]`), as a promise in Next 16. */
export type RouteParams<P = Record<string, never>> = { params: Promise<P> };

export function mobileRoute<P = Record<string, never>>(
  handler: (ctx: BearerContext, request: Request, route: RouteParams<P>) => Promise<Response>,
): (request: Request, route?: RouteParams<P>) => Promise<Response> {
  return async (request, route) => {
    const ctx = await getBearerContext(request);
    if (!ctx) return mobileError("unauthorized", 401);
    try {
      // Next always supplies the route argument; it is optional in the type only so plain (non-dynamic) routes stay
      // callable as `GET(request)` in tests.
      return await handler(ctx, request, route as RouteParams<P>);
    } catch (e) {
      console.error("mobile route failed", new URL(request.url).pathname, describePlaidError(e));
      return mobileError("unavailable", 503);
    }
  };
}

/** The JSON body, or null when it is missing or not JSON. */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** The JSON body when it is a plain object, or null (missing, not JSON, an array or a scalar): the routes answer `invalid_body`. */
export async function readObject(request: Request): Promise<Record<string, unknown> | null> {
  const body = await readJson(request);
  return body !== null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/**
 * A native client's optional `requestId`: absent is `undefined`; anything that is not a string is `false`, which the route
 * answers as `invalid` rather than silently dropping the retry protection the client asked for.
 */
export function requestIdOf(body: Record<string, unknown>): string | undefined | false {
  const id = body.requestId;
  if (id === undefined || id === null) return undefined;
  return typeof id === "string" ? id : false;
}

/** JSON `null` for an optional text field, as the web form's empty string (the shared form schemas take strings). */
export function nullsAsEmpty(body: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out = { ...body };
  for (const k of keys) if (out[k] === null || out[k] === undefined) out[k] = "";
  return out;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
