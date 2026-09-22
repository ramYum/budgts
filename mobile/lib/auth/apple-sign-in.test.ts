import { describe, expect, it, vi } from "vitest";
import { signInWithApple, type AppleSignInDeps } from "./apple-sign-in";

function deps(over: Partial<AppleSignInDeps> = {}): AppleSignInDeps & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { credential: [], supabase: [] };
  return {
    calls,
    isAvailable: async () => true,
    randomNonce: async () => "raw-nonce",
    sha256Hex: async (s) => `sha256(${s})`,
    requestCredential: async (hashed) => {
      calls.credential.push(hashed);
      return { identityToken: "apple-id-token" };
    },
    signInWithIdToken: async (args) => {
      calls.supabase.push(args);
      return { error: null };
    },
    ...over,
  };
}

describe("signInWithApple", () => {
  it("gives Apple the HASHED nonce and Supabase the RAW nonce with the identity token", async () => {
    const d = deps();

    const r = await signInWithApple(d);

    expect(r).toEqual({ status: "signed_in" });
    expect(d.calls.credential).toEqual(["sha256(raw-nonce)"]);
    expect(d.calls.supabase).toEqual([{ token: "apple-id-token", nonce: "raw-nonce" }]);
  });

  it("is unavailable where Sign in with Apple cannot run, without starting anything", async () => {
    const request = vi.fn();
    const r = await signInWithApple(deps({ isAvailable: async () => false, requestCredential: request }));
    expect(r).toEqual({ status: "unavailable" });
    expect(request).not.toHaveBeenCalled();
  });

  it("treats a dismissed Apple sheet as a quiet cancel, not an error", async () => {
    const signIn = vi.fn();
    const r = await signInWithApple(deps({ requestCredential: async () => ({ cancelled: true }), signInWithIdToken: signIn }));
    expect(r).toEqual({ status: "cancelled" });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("errors when Apple returns no identity token, without calling Supabase", async () => {
    const signIn = vi.fn();
    const r = await signInWithApple(deps({ requestCredential: async () => ({ identityToken: null }), signInWithIdToken: signIn }));
    expect(r).toMatchObject({ status: "error" });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("errors when Supabase rejects the token, with a fixed message that does not echo the provider's text", async () => {
    const r = await signInWithApple(deps({ signInWithIdToken: async () => ({ error: { message: "Provider (issuer https://appleid.apple.com) is not enabled" } }) }));
    expect(r).toMatchObject({ status: "error" });
    expect(JSON.stringify(r)).not.toContain("issuer");
  });

  it("turns a thrown failure into a generic error", async () => {
    const r = await signInWithApple(
      deps({
        requestCredential: async () => {
          throw new Error("ASAuthorizationError 1000 at com.apple.AuthenticationServices");
        },
      }),
    );
    expect(r).toMatchObject({ status: "error" });
    expect(JSON.stringify(r)).not.toContain("ASAuthorizationError");
  });

  it("uses a fresh nonce every time", async () => {
    let n = 0;
    const seen: string[] = [];
    const d = deps({
      randomNonce: async () => `nonce-${++n}`,
      requestCredential: async (h) => {
        seen.push(h);
        return { identityToken: "t" };
      },
    });
    await signInWithApple(d);
    await signInWithApple(d);
    expect(new Set(seen).size).toBe(2);
  });
});
