/**
 * Universal-link (iOS) and app-link (Android) association for the native app — what lets an https URL such as the Plaid
 * OAuth return open the installed app instead of a browser. Design: docs/specs/2026-09-21-mobile-only-transition-design.md §5.
 *
 * The identifiers come from the owner's Apple Developer / Google Play accounts and are read from the environment. Until they
 * are configured, and whenever a value is malformed, both builders answer `null` and the routes answer 404 — a wrong
 * association is worse than none (it can silently break the return to the app), so nothing is ever guessed.
 */
type Env = Record<string, string | undefined>;

/** The path prefix the app claims. Anything under it opens the app when installed, and falls back to a web page otherwise. */
export const NATIVE_LINK_PATH = "/app/*";

// Apple: `<10-char upper-case team id>.<bundle id>`.
const APPLE_APP_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*$/;
// Android: a dotted Java-style package name.
const ANDROID_PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
// Android: a SHA-256 certificate fingerprint, 32 upper-case hex bytes separated by colons.
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export type AppleAppSiteAssociation = {
  applinks: { apps: never[]; details: { appIDs: string[]; components: { "/": string }[] }[] };
};

export function appleAppSiteAssociation(env: Env): AppleAppSiteAssociation | null {
  const appId = env.APPLE_APP_ID?.trim();
  if (!appId || !APPLE_APP_ID.test(appId)) return null;
  return { applinks: { apps: [], details: [{ appIDs: [appId], components: [{ "/": NATIVE_LINK_PATH }] }] } };
}

export type AssetLink = {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
};

/** `ANDROID_CERT_SHA256` may list several fingerprints (upload key and Play app-signing key), comma- or space-separated. */
export function assetLinks(env: Env): AssetLink[] | null {
  const pkg = env.ANDROID_PACKAGE_NAME?.trim();
  if (!pkg || !ANDROID_PACKAGE.test(pkg)) return null;

  const fingerprints = (env.ANDROID_CERT_SHA256 ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((f) => f.toUpperCase());
  if (fingerprints.length === 0 || !fingerprints.every((f) => SHA256_FINGERPRINT.test(f))) return null;

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints },
    },
  ];
}
