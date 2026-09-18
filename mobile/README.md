# Budgts mobile (Expo)

Auth-only milestone so far — see
`../docs/specs/2026-09-17-mobile-app-launch-design.md` for the full track.
No native Plaid, billing, or the wider mobile IA yet.

## Real-device testing (Expo Go)

This app currently uses **no native module outside the Expo SDK's own**, so
it runs directly in **Expo Go** — no EAS dev-client build, Xcode, or Android
Studio needed to verify auth on a physical device.

1. Copy `.env.example` to `.env.local` and fill in:
   - `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` —
     same values as the web app's `.env.local` (same Supabase project).
   - `EXPO_PUBLIC_API_BASE_URL` — a deployed backend the phone can reach,
     e.g. `https://budgts-staging.vercel.app`. `http://localhost:3000` does
     **not** work from a physical device.
2. `npm install`
3. `npm start`, scan the QR code with **Expo Go** (iOS App Store / Google
   Play) on a real device.
4. Magic Link: enter an email, open the link **on the same device**. Google
   OAuth: tap "Continue with Google" — this needs the Supabase-side config
   below or it will fail with a provider error, not a code bug.

## Manual configuration this repo cannot perform

None of the following can be done from source — they're dashboard/account
steps for whoever holds the Supabase and Google/Apple accounts.

### Required now — Google OAuth

Verified against the live `budgts-staging-2` Supabase project
(`GET /auth/v1/settings`) while building this milestone: **the Google
provider is currently disabled**, so `signInWithOAuth({ provider: "google" })`
will fail end-to-end on a real device today, independent of any app code.
To enable it:

1. Google Cloud Console → OAuth consent screen (if not already done for the
   web app's existing Google sign-in) → OAuth client ID, type **Web
   application** (Supabase mediates the redirect centrally; the mobile app
   does not need its own Google client type).
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Supabase Dashboard → Authentication → Providers → Google: paste the
   Client ID/Secret, enable the provider.
4. Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:
   add `budgts://auth/callback` (GoTrue rejects/ignores a `redirectTo` that
   isn't on this allow-list, for both magic-link `emailRedirectTo` and
   OAuth `redirectTo`).

Do this per Supabase project (staging and, later, production) separately.

### If Apple Sign In is ever added later

Not implemented in this milestone (see "Apple Sign In" below for why).
If a later decision reverses that, all of the following are prerequisite
and external to this repo:

1. **Apple Developer Program enrollment** — per the mobile-launch spec §10,
   not yet done at all.
2. An Apple **Services ID** (App ID + "Sign in with Apple" capability
   enabled), redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
3. A **Sign in with Apple key** (.p8), its Key ID, and the Apple Team ID —
   entered into Supabase Dashboard → Authentication → Providers → Apple.
4. The native app needs the `expo-apple-authentication` config plugin and
   the "Sign in with Apple" capability added to its iOS bundle identifier —
   requires the bundle identifier to exist in an Apple Developer account
   first (step 1).
5. `budgts://auth/callback` already being on Supabase's redirect allow-list
   (same entry Google needs above) covers Apple too, since both complete
   through the same deep link.

## What's implemented vs. still open

| Item | Status |
| --- | --- |
| Expo SDK 57 / Expo Router scaffold | Done |
| Magic Link sign-in | Done, code-complete; needs the redirect-URL allow-list entry above to work end-to-end |
| Google OAuth sign-in | Done, code-complete; blocked end-to-end until the provider is enabled (above) |
| Sign in with Apple | **Not implemented** — see below |
| Secure session persistence | Done (`lib/supabase/large-secure-store.ts`) |
| AppState-driven token refresh | Done (`lib/supabase/auto-refresh.ts`) |
| Bearer-token API requests | Done (`lib/auth/api.ts`, backend: `src/lib/auth/get-request-user.ts`) |
| Logout/session cleanup | Done (`AuthProvider.signOut`) |
| Cold-start deep-link handling | Implemented (`app/auth/callback.tsx`); **unverified on a physical device** |
| Physical-device run | Not performed in this environment — no device/emulator available here |

## Apple Sign In — evaluated, not implemented

Re-evaluated 2026-09-18 during the mobile-auth milestone. The mobile-launch
spec §4/§10/§17 **locks** mobile sign-in to Magic Link + Google OAuth and
explicitly excludes Sign in with Apple from the initial launch scope — this
is a product decision, not something this milestone can override by
implementing it anyway. That lock is unchanged by this review.

The spec separately flags a still-open compliance question: whether Apple
App Review Guideline 4.8 requires an Apple-equivalent sign-in option
*because* Google OAuth is offered. That question is **not resolved by this
review** — it explicitly needs re-verification against the *final* mobile
implementation at App Store submission time, and this repo has no Apple
Developer Program enrollment yet to even test against. Implementing Apple
Sign In speculatively now, without that account, without Supabase-side
Apple provider config, and against a scope decision that hasn't changed,
would be inventing product/compliance scope this repo doesn't own.

**If** the owner later decides Apple Sign In is needed (either to reverse
the scope decision, or because 4.8 is determined to require it), the
correct native mechanism is Expo's `expo-apple-authentication` (wraps
`ASAuthorizationAppleIDProvider` — no custom OAuth flow), feeding its
identity token into `supabase.auth.signInWithIdToken({ provider: "apple",
token })`, which is Supabase's documented native (non-web-redirect) path
for Apple and would **not** need `budgts://auth/callback` at all — a
different completion shape from Magic Link/Google's deep-link path,
because it doesn't go through a browser. That's a real architectural
difference worth knowing about before starting: it would sit in
`lib/auth/`, alongside the existing flows, but wouldn't reuse
`complete-session-from-url.ts`.
