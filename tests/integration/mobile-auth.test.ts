/**
 * Bearer-token authentication and the first-run profile routes for the native app, against real staging Supabase Auth
 * and PostgREST (never mocked: token verification and RLS are exactly what this boundary relies on Supabase enforcing).
 *
 * Tokens are minted the way the app obtains one (a magic-link verification), not hand-constructed. The route handlers
 * are called in-process with a real Request, so this covers verification (getClaims against the project's JWKS), the
 * caller-scoped client, RLS, and the onboarding/time-zone rules end to end.
 */
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { getBearerContext } from "@/lib/auth/bearer-context";
import { getRequestUser } from "@/lib/auth/get-request-user";
import { POST as onboard } from "@/app/api/mobile/onboarding/route";
import { GET as getProfile, PATCH as patchProfile } from "@/app/api/mobile/profile/route";
import { GET as getSession } from "@/app/api/mobile/session/route";
import { adminSupabase } from "./_db";

const admin = adminSupabase();
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const cleanupIds: string[] = [];

afterEach(async () => {
  for (const id of cleanupIds.splice(0)) {
    await admin.auth.admin.deleteUser(id, false).catch(() => {});
  }
});

/** Mints a real access token via magic-link verification, the same Supabase Auth path the app's deep link completes. */
async function mintAccessTokenForNewUser(): Promise<{ userId: string; accessToken: string; email: string }> {
  const email = `itest-mobile-auth+${crypto.randomUUID()}@example.test`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (createErr || !created.user) throw createErr ?? new Error("createUser returned no user");
  cleanupIds.push(created.user.id);

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link) throw linkErr ?? new Error("generateLink returned nothing");

  const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });
  if (verifyErr || !verified.session) throw verifyErr ?? new Error("verifyOtp produced no session");

  return { userId: created.user.id, accessToken: verified.session.access_token, email };
}

const bearer = (token: string, init: RequestInit = {}, path = "/api/mobile/session") =>
  new Request(`https://example.test${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });

describe("Bearer token verification", () => {
  it("resolves a real mobile-style access token to its user", async () => {
    const { userId, accessToken, email } = await mintAccessTokenForNewUser();

    expect((await getRequestUser(bearer(accessToken)))?.id).toBe(userId);
    const res = await getSession(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: userId, email });
  });

  it("rejects a malformed token and a token with a tampered payload", async () => {
    expect(await getRequestUser(bearer("not-a-real-token"))).toBeNull();

    const { accessToken } = await mintAccessTokenForNewUser();
    const [h, p, s] = accessToken.split(".");
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    const forged = [h, Buffer.from(JSON.stringify({ ...claims, sub: crypto.randomUUID() })).toString("base64url"), s].join(".");
    expect(await getRequestUser(bearer(forged))).toBeNull();
    expect((await getSession(bearer(forged))).status).toBe(401);
  });

  it("a hard-deleted user's still-unexpired token reads nothing (RLS), even though its signature verifies locally", async () => {
    const { userId, accessToken } = await mintAccessTokenForNewUser();
    await admin.auth.admin.deleteUser(userId, false);

    // getClaims checks the signature and expiry locally, so the token itself stays valid until it expires (the
    // documented trade-off, same as the web's cookie path) ...
    const ctx = await getBearerContext(bearer(accessToken));
    // ... but the account's rows are gone, so there is nothing to read.
    if (ctx) {
      const res = await getProfile(bearer(accessToken, {}, "/api/mobile/profile"));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "profile_missing" });
    }
  });
});

describe("first-run profile over the native API", () => {
  it("onboards with a currency and the device time zone once, then keeps the zone in step", async () => {
    const { userId, accessToken } = await mintAccessTokenForNewUser();
    const path = "/api/mobile/profile";

    const before = await getProfile(bearer(accessToken, {}, path));
    expect(await before.json()).toMatchObject({ onboarded: false, timeZone: null });

    const bad = await onboard(bearer(accessToken, { method: "POST", body: JSON.stringify({ currency: "EUR" }) }));
    expect(bad.status).toBe(422);
    expect(await bad.json()).toEqual({ error: "invalid_time_zone" });

    const ok = await onboard(
      bearer(accessToken, { method: "POST", body: JSON.stringify({ currency: "EUR", time_zone: "Europe/Paris", userId: "x" }) }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ onboarded: true, currency: "EUR", timeZone: "Europe/Paris" });

    // The currency is set once: a second onboarding (another device, a retry) changes nothing.
    const again = await onboard(
      bearer(accessToken, { method: "POST", body: JSON.stringify({ currency: "GBP", time_zone: "Europe/London" }) }),
    );
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: "already_onboarded" });

    const moved = await patchProfile(bearer(accessToken, { method: "PATCH", body: JSON.stringify({ time_zone: "Asia/Tokyo" }) }, path));
    expect(moved.status).toBe(200);

    const after = await getProfile(bearer(accessToken, {}, path));
    expect(await after.json()).toMatchObject({ onboarded: true, currency: "EUR", timeZone: "Asia/Tokyo" });

    const { data } = await admin.from("profiles").select("currency, time_zone, onboarded_at").eq("id", userId).single();
    expect(data).toMatchObject({ currency: "EUR", time_zone: "Asia/Tokyo" });
    expect(data?.onboarded_at).not.toBeNull();
  });

  it("one user's token can never read or write another user's profile", async () => {
    const a = await mintAccessTokenForNewUser();
    const b = await mintAccessTokenForNewUser();

    const ctx = await getBearerContext(bearer(a.accessToken));
    const { data } = await ctx!.supabase.from("profiles").select("id").eq("id", b.userId);
    expect(data).toEqual([]);

    const { data: updated } = await ctx!.supabase.from("profiles").update({ time_zone: "Asia/Tokyo" }).eq("id", b.userId).select("id");
    expect(updated).toEqual([]);
    const { data: bRow } = await admin.from("profiles").select("time_zone").eq("id", b.userId).single();
    expect(bRow?.time_zone).toBeNull();
  });
});
