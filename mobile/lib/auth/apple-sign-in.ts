/**
 * Sign in with Apple, orchestrated over injected dependencies so the logic is unit-testable without a device.
 *
 * The mechanism is Supabase's native ID-token path (no browser, no `budgts://auth/callback`): Apple's system sheet returns an
 * identity token, which `supabase.auth.signInWithIdToken({ provider: "apple" })` verifies and turns into a session. The nonce
 * binds the two: Apple gets the SHA-256 hash of a fresh random nonce (it embeds the hash in the token) and Supabase gets the raw
 * nonce (it hashes and compares). Required by App Store guideline 4.8 alongside Google sign-in; see
 * docs/specs/2026-09-21-mobile-only-transition-design.md §1.
 *
 * Messages are fixed strings: the provider's and the OS's own error text never reaches the screen.
 */
export type AppleSignInDeps = {
  isAvailable(): Promise<boolean>;
  /** A fresh, unguessable value; called once per attempt. */
  randomNonce(): Promise<string>;
  sha256Hex(input: string): Promise<string>;
  /** Shows Apple's sheet with the HASHED nonce. `{ cancelled: true }` when the user dismissed it. */
  requestCredential(hashedNonce: string): Promise<{ identityToken: string | null } | { cancelled: true }>;
  /** `supabase.auth.signInWithIdToken({ provider: "apple", token, nonce })` with the RAW nonce. */
  signInWithIdToken(args: { token: string; nonce: string }): Promise<{ error: { message: string } | null }>;
};

export type AppleSignInResult =
  | { status: "signed_in" }
  | { status: "cancelled" }
  | { status: "unavailable" }
  | { status: "error"; message: string };

const FAILED: AppleSignInResult = { status: "error", message: "Apple sign-in could not be completed. Please try again." };

export async function signInWithApple(deps: AppleSignInDeps): Promise<AppleSignInResult> {
  try {
    if (!(await deps.isAvailable())) return { status: "unavailable" };

    const nonce = await deps.randomNonce();
    const credential = await deps.requestCredential(await deps.sha256Hex(nonce));
    if ("cancelled" in credential) return { status: "cancelled" };
    if (!credential.identityToken) return FAILED;

    const { error } = await deps.signInWithIdToken({ token: credential.identityToken, nonce });
    return error ? FAILED : { status: "signed_in" };
  } catch {
    return FAILED;
  }
}
