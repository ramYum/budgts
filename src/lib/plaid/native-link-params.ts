/**
 * The extra `/link/token/create` parameters a native Link session needs, on top of the existing web params
 * (mobile-only-transition spec §4A/§5). Confirmed against the `plaid` npm package's own request type: Android sends
 * `android_package_name` and MUST leave `redirect_uri` blank; every other platform (iOS, web) sends `redirect_uri` and
 * MUST leave `android_package_name` blank — sending the wrong one for the platform is rejected by Plaid.
 *
 * Both values are configuration, gated exactly like the existing web `PLAID_OAUTH_REDIRECT_URI`: sending Plaid a
 * redirect URI or package name it does not have registered in the dashboard fails EVERY link-token creation for that
 * platform, not just OAuth ones — so an unset value is omitted, never guessed, and the caller still gets a working
 * (non-OAuth-capable) Link session.
 */
export type LinkPlatform = "ios" | "android" | "web";

type EnvLike = Record<string, string | undefined>;

export function nativeLinkParams(
  env: EnvLike,
  platform: LinkPlatform | undefined,
): { android_package_name?: string; redirect_uri?: string } {
  if (platform === "android") {
    const pkg = env.ANDROID_PACKAGE_NAME?.trim();
    return pkg ? { android_package_name: pkg } : {};
  }

  if (platform === "ios") {
    const uri = env.PLAID_NATIVE_OAUTH_REDIRECT_URI?.trim();
    if (!uri) return {};
    if (!uri.startsWith("https://")) {
      throw new Error(`PLAID_NATIVE_OAUTH_REDIRECT_URI must be an https URL (got ${JSON.stringify(uri)})`);
    }
    return { redirect_uri: uri };
  }

  return {};
}
