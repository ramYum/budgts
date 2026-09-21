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

export function mobileRoute(
  handler: (ctx: BearerContext, request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const ctx = await getBearerContext(request);
    if (!ctx) return mobileError("unauthorized", 401);
    try {
      return await handler(ctx, request);
    } catch {
      return mobileError("unavailable", 503);
    }
  };
}
