import { describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn(async (_code: string) => {
  await new Promise((r) => setTimeout(r, 5));
  return { error: null };
});
vi.mock("../supabase/client", () => ({ supabase: { auth: { exchangeCodeForSession } } }));

const { completeSessionFromUrl } = await import("./complete-session-from-url");
const { signInWithGoogle } = await import("./google");

describe("the Android double return exchanges its code exactly once", () => {
  it("the callback screen and Google in place (the deletion re-sign-in) share one exchange", async () => {
    const url = "budgts://auth/callback?code=google-return";
    // Google in place (app/(app)/settings/delete-account.tsx): the in-app browser session returns the URL...
    const inPlace = signInWithGoogle({
      redirectTo: "budgts://auth/callback",
      signInWithOAuth: async () => ({ data: { url: "https://accounts.example/o" }, error: null }),
      openAuthSession: async () => ({ type: "success", url }),
      completeSession: completeSessionFromUrl,
    });
    // ...while Android also routes the same URL to app/auth/callback.tsx, now reachable signed in.
    const [google, callback, again] = await Promise.all([inPlace, completeSessionFromUrl(url), completeSessionFromUrl(url)]);
    expect(google).toEqual({ status: "signed_in" });
    expect(callback).toEqual({ ok: true });
    expect(again).toEqual({ ok: true });
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(exchangeCodeForSession).toHaveBeenCalledWith("google-return");

    // and later: still the one result, never a second exchange of a single-use code
    expect(await completeSessionFromUrl(url)).toEqual({ ok: true });
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);
  });
});
