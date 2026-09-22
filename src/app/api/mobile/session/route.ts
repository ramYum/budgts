/**
 * GET /api/mobile/session — returns the caller's own identity, authenticated
 * only via a Bearer access token (see `getRequestUser`). This is the mobile
 * auth milestone's reference/verification endpoint: proof that a token
 * minted by the native Supabase client is accepted and correctly resolved
 * to a user server-side, with nothing trusted from the client itself.
 *
 * Design authority: docs/specs/2026-09-17-mobile-app-launch-design.md §4/§6.
 */
import { NextResponse } from "next/server";
import { getRequestUser } from "@/lib/auth/get-request-user";

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  return NextResponse.json({ id: user.id, email: user.email });
}
