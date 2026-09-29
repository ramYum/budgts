/**
 * How the user signs in, as the Profile screen lists it ("Email link · Google"), from the session's verified
 * `app_metadata.providers`. One mapping for the web Profile page and the native `GET /api/mobile/profile`.
 */
const PROVIDER_LABEL: Record<string, string> = { email: "Email link", google: "Google" };

export function signInMethods(providers: readonly string[] | undefined): string[] {
  return (providers ?? ["email"]).map((p) => PROVIDER_LABEL[p] ?? `${p[0]!.toUpperCase()}${p.slice(1)}`);
}

/**
 * The providers in an access token that has ALREADY been verified in this request (the native routes' `mobileRoute` does
 * so before any handler runs). Reads the payload only; never use it on an unverified token.
 */
export function providersOfVerifiedToken(token: string): string[] | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      app_metadata?: { providers?: unknown };
    };
    const providers = payload.app_metadata?.providers;
    return Array.isArray(providers) && providers.every((p) => typeof p === "string" && p.length > 0) ? providers : undefined;
  } catch {
    return undefined;
  }
}
