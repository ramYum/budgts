/**
 * The redirect URL handed to Supabase for both Magic Link (`emailRedirectTo`)
 * and Google OAuth (`redirectTo`).
 *
 * Supabase compares it to the project's `uri_allow_list` EXACTLY and, on any
 * mismatch, silently falls back to the project Site URL — i.e. the WEB app.
 * That is the bug this module exists to prevent: `Linking.createURL("/auth/callback")`
 * (leading slash) emits `budgts:///auth/callback` (three slashes) in a standalone
 * build, which is not allow-listed, so the email link opened the web app instead
 * of returning to the installed one. See `callback-url.test.ts`.
 *
 * Pure — no native modules. `createURL` is injected so this is unit-testable.
 */

/** The exact string that must be present in Supabase → Auth → URL Configuration
 * → Redirect URLs (staging and production alike). Scheme comes from app.json. */
export const AUTH_CALLBACK_URL = "budgts://auth/callback";

/** `scheme:///x` → `scheme://x` for custom schemes only; https/file untouched,
 * and only the scheme separator is touched (never a path or query string). */
export function normalizeCallbackUrl(url: string): string {
  return url.replace(/^(?!file:)([a-z][a-z0-9+.-]*):\/{3}(?=[^/])/i, "$1://");
}

export function buildAuthCallbackUrl(createURL: (path: string) => string): string {
  // No leading slash: `createURL("/x")` doubles up the separator slash.
  return normalizeCallbackUrl(createURL("auth/callback"));
}
