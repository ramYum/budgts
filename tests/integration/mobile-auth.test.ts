/**
 * Bearer-token authentication for the mobile client, against real staging
 * Supabase Auth — never mocked, since this is exactly the boundary
 * `getRequestUser` depends on Supabase itself enforcing (token signature,
 * expiry, revocation).
 *
 * The token used here is produced the same way the mobile app would obtain
 * one — completing a magic-link verification — not hand-constructed, so
 * this proves the real end-to-end shape: mint a session as a mobile client
 * would, then verify it server-side as `/api/mobile/session` and
 * `/api/account/delete` would.
 */
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { getRequestUser } from "@/lib/auth/get-request-user";
import { adminSupabase } from "@/lib/supabase/admin";

const admin = adminSupabase();
const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const cleanupIds: string[] = [];

afterEach(async () => {
  for (const id of cleanupIds.splice(0)) {
    await admin.auth.admin.deleteUser(id, false).catch(() => {});
  }
});

/** Mints a real access token via magic-link verification — the same
 * Supabase Auth path the mobile app's deep-link callback completes. */
async function mintAccessTokenForNewUser(): Promise<{ userId: string; accessToken: string }> {
  const email = `itest-mobile-auth+${crypto.randomUUID()}@example.test`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createErr || !created.user) throw createErr ?? new Error("createUser returned no user");

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !link) throw linkErr ?? new Error("generateLink returned nothing");

  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (verifyErr || !verified.session) {
    throw verifyErr ?? new Error("verifyOtp produced no session");
  }

  return { userId: created.user.id, accessToken: verified.session.access_token };
}

describe("getRequestUser — Bearer token path", () => {
  it("resolves a real mobile-style access token to its user", async () => {
    const { userId, accessToken } = await mintAccessTokenForNewUser();
    cleanupIds.push(userId);

    const request = new Request("https://example.test/api/mobile/session", {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const user = await getRequestUser(request);
    expect(user?.id).toBe(userId);
  });

  it("rejects a malformed/garbage token", async () => {
    const request = new Request("https://example.test/api/mobile/session", {
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(await getRequestUser(request)).toBeNull();
  });

  it("rejects a token after the user has been hard-deleted", async () => {
    const { userId, accessToken } = await mintAccessTokenForNewUser();
    await admin.auth.admin.deleteUser(userId, false);

    const request = new Request("https://example.test/api/mobile/session", {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(await getRequestUser(request)).toBeNull();
  });

  // The no-Authorization-header fallback calls the cookie-based
  // `getSessionUser()`, which reads `next/headers`' `cookies()` — that only
  // works inside a real Next.js request scope (a Route Handler/Server
  // Component), not bare Vitest. Cookie-session auth itself is already
  // exercised by the live e2e suite (tests/e2e/*.spec.ts) against a real
  // deployed request; nothing Bearer-specific would be added by forcing
  // that call here.
});
