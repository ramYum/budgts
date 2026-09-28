/**
 * GET /api/mobile/session — the caller's own identity, from a verified Bearer
 * access token. The native app's first call after sign-in, and the reference
 * check that a token minted by the native Supabase client is accepted and
 * resolved to its user server-side, with nothing trusted from the client.
 *
 * Design authority: docs/specs/2026-09-17-mobile-app-launch-design.md §4/§6.
 */
import { mobileJson, mobileRoute } from "@/lib/mobile/route";

export const GET = mobileRoute(async ({ user }) => mobileJson({ id: user.id, email: user.email ?? null }));
