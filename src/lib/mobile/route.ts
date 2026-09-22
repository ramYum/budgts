/**
 * The one wrapper every native (`/api/mobile/*`) Route Handler goes through — the transport boundary from
 * docs/specs/2026-09-21-mobile-only-transition-design.md §4A.
 *
 * - Authentication is Bearer-only (`getBearerContext`); cookies are ignored. The handler receives a verified user and a
 *   Supabase client carrying that user's own JWT, so RLS scopes every query. The user id is never taken from the request.
 * - Every response is `private, no-store`.
 * - A thrown error becomes a generic 503 `{ error: "unavailable" }`. Nothing about the failure or the caller's data is
 *   echoed or logged here.
 *
 * Handlers stay thin: parse the request, call a shared domain service in `src/lib/<area>/`, map its result to a response.
 */
import { NextResponse } from "next/server";
import { getBearerContext, type BearerContext } from "@/lib/auth/bearer-context";

const NO_STORE = { "Cache-Control": "private, no-store" };

export function mobileJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** `{ error: <stable machine code>, ...detail }`. The code is the contract; never put internal text in it. */
export function mobileError(error: string, status: number, detail: Record<string, unknown> = {}): NextResponse {
  return mobileJson({ error, ...detail }, status);
}

/**
 * Maps a domain command's failure (`src/lib/command-result.ts` and the per-area result unions) to the wire: a stable code and
 * status, never the storage error's text. One place, so every native route answers the same way for the same outcome.
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
      return mobileError("not_found", 404);
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
      // Next always supplies the route argument; it is optional in the type only so plain (non-dynamic) routes stay callable
      // as `GET(request)` in tests.
      return await handler(ctx, request, route as RouteParams<P>);
    } catch {
      return mobileError("unavailable", 503);
    }
  };
}
