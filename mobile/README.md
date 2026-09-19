# Budgts mobile (Expo)

Auth + real-device/EAS readiness so far — see
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

### Done — Google OAuth (staging)

Configured 2026-09-18. Verified from this repo without printing any secret:
GoTrue's public `/auth/v1/settings` shows `google: true`, and a read-only
Supabase Management API call confirms `external_google_enabled: true`,
`budgts://auth/callback` is on the `uri_allow_list`, and the configured
Google Client ID matches the one created for this project. A live browser
round-trip through the redeployed staging web app's "Continue with Google"
completed successfully. Production has its own separate Google OAuth client
and Supabase config to do later, per the same steps, when that milestone
comes up.

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
| Magic Link sign-in | Code-complete. **Device test 2026-09-19 found the email link opened the web app** — root cause fixed (see "Auth redirect URL contract"); needs re-test on the new build |
| Google OAuth sign-in | Code-complete; provider config verified live, browser round-trip verified on **web**. Uses the same redirect URL as Magic Link, so the same fix applies; re-test on the new build |
| Branded sign-in screen | Done — Poppins, cream/sun palette, real robin/sunburst art, "Use a different email" exit; tokens mirrored from web `globals.css` (`lib/theme.ts`, drift-tested) |
| Sign in with Apple | **Not implemented** — see below |
| Secure session persistence | Done (`lib/supabase/large-secure-store.ts`) |
| AppState-driven token refresh | Done (`lib/supabase/auto-refresh.ts`) |
| Bearer-token API requests | Done and live-verified against real staging (`lib/auth/api.ts`, backend: `src/lib/auth/get-request-user.ts`) |
| Logout/session cleanup | Done (`AuthProvider.signOut`) |
| Cold-start deep-link handling | Implemented (`app/auth/callback.tsx`); **unverified on a physical device/simulator** |
| `budgts://` → Android intent-filter | **Verified** via `npx expo prebuild` — see "Native config verification" below |
| `budgts://` → iOS URL scheme | **Not verifiable from this machine** — `expo prebuild` does not generate an iOS project on Windows at all |
| EAS build config | `eas.json` present (`development`, `preview`); linked to a real EAS project (`@budgts/budgts`, see "EAS readiness" below) and validated via `eas config` for both platforms |
| Physical-device/simulator run | **Not performed** — no device, no emulator, and (being Windows) no possibility of an iOS Simulator on this machine |

## Auth redirect URL contract (why Magic Link once opened the web app)

Both Magic Link (`emailRedirectTo`) and Google OAuth (`redirectTo`) must send
Supabase **exactly** `budgts://auth/callback` — the string in Supabase →
Authentication → URL Configuration → Redirect URLs. Supabase matches it
character for character and, on any mismatch, **silently falls back to the
project Site URL (the web app)** instead of erroring.

The trap: `Linking.createURL("/auth/callback")` (leading slash) yields
`budgts:///auth/callback` (three slashes) in a standalone build, which is not
allow-listed. The first Android device test hit exactly this: the email link
opened `budgts-staging.vercel.app`. Verified read-only against the staging
project with `GET /auth/v1/verify?token=x&type=magiclink&redirect_to=…`:
`budgts://auth/callback` → redirected to the app; `budgts:///auth/callback`,
`…/callback/` and `…/callback?x=1` → redirected to the Site URL.

Fix: `lib/auth/callback-url.ts` builds the URL (`createURL("auth/callback")`,
no leading slash, then normalised) and `callback-url.test.ts` runs the real
`createURL` to pin the shape. The web Magic Link is untouched — it sends its own
`https://…/auth/callback` from `src/server/auth.ts`.

**Production checklist:** the production Supabase project needs the same
`budgts://auth/callback` entry in its Redirect URLs before a production build.

Also: the single-use code can reach the app twice on Android (the OAuth browser
result *and* the intent-filter route), so `completeSessionFromUrl` is
deduplicated per URL (`lib/auth/once-by-key.ts`).

## Native config verification (2026-09-18)

Ran `npx expo prebuild --platform all` once, inspected the generated native
projects, then deleted them (`android/`, `ios/` are git-ignored and fully
regenerable — nothing from this is committed):

- **Android**: only platform actually generated on this Windows host (see
  below). `AndroidManifest.xml`'s `MainActivity` has the expected
  intent-filter: `android:launchMode="singleTask"`, `android:exported="true"`,
  categories `DEFAULT`+`BROWSABLE`, `<data android:scheme="budgts"/>` — this
  is exactly the config a real `budgts://auth/callback` link needs to reopen
  the running app rather than spawn a duplicate instance.
  `expo-secure-store`'s config plugin also correctly wired Android's
  auto-backup exclusion rules (`android:fullBackupContent`/
  `dataExtractionRules`) so secure-storage-backed keys are excluded from
  cloud backup, as they should be.
- **iOS**: `expo prebuild` did not generate an `ios/` directory at all on
  this host — Expo's CLI skips native iOS project generation outside macOS
  (no Xcode/CocoaPods toolchain to target). This means the `CFBundleURLTypes`
  entry for the `budgts` scheme could not be inspected from this machine,
  full stop — not "unverified," but structurally impossible to verify here.
  It's the same automatic, config-plugin-driven mechanism as Android
  (`scheme` in app.json → the platform's own URL-handling config), so there's
  no reason to expect it behaves differently, but that's an expectation, not
  a verification.
- `npx expo-doctor`: 20/21 checks pass, including "Validate packages against
  React Native Directory package metadata" — the check that would flag a
  package needing custom native code incompatible with Expo Go. The one
  failure (duplicate `react` versions) is the same pre-existing,
  non-blocking nested-repo artifact noted in the previous milestone
  (`mobile/` sits inside this non-monorepo Next.js repo; EAS Build treats
  `mobile/` as its own root and never sees the parent tree).

**Conclusion for task 1 (Expo Go vs. Development Build):** Expo Go remains
sufficient for the current auth-only feature set — confirmed by the doctor
check above, not assumed. A development-client / EAS build only becomes
necessary once a module outside the Expo SDK is added (native Plaid is the
next one on the roadmap).

## EAS readiness

Linked 2026-09-18 to a real EAS project: **`@budgts/budgts`**, project ID
`4ab8a69b-67e2-49a5-94dc-5bc9f4d873a5` (`app.json`'s `extra.eas.projectId`
and `owner: "budgts"` — both written by `eas init --account budgts
--non-interactive`, not hand-typed). This is a fresh project created for
this exact codebase, not the unrelated project ID from the generic Expo
setup-page example. `eas config` now resolves both build profiles for both
platforms without error (see below).

`eas.json` defines two build profiles:

- `development` — `developmentClient: true`, internal distribution, iOS
  simulator build enabled (simulator builds don't need a paid Apple
  Developer account, unlike device builds).
- `preview` — internal distribution, Android as a directly-installable APK
  (no Play Console needed), iOS as a real-device (non-simulator) build.

No `production` profile — deliberately omitted; there's no StoreKit/Play
Billing, RevenueCat, or submission-readiness work done yet to justify one
(mobile-launch spec §10/§11/§16).

**What's still needed before an actual build can run**, none of it
performable from this repo:

1. ~~An Expo account and `eas login`~~ — done 2026-09-18 (account
   `crispyphata@gmail.com`, org `budgts`).
2. ~~`eas init`~~ — done; see the project link above.
3. **Android preview/device builds**: no Apple account needed — this is now
   the most reachable path to a real installable build. Just needs
   `eas build --profile preview --platform android` to actually be run
   (not done this session — no build was authorized).
4. **iOS builds of any kind**: still needs the Apple Developer Program
   enrollment that mobile-launch spec §10 already flags as not done. iOS
   *simulator* builds specifically don't need a paid account, but still need
   a Mac (or EAS's own macOS cloud builders) to ever run the result — this
   Windows machine can do neither.
5. `com.budgts.app` (`ios.bundleIdentifier`/`android.package` in `app.json`)
   is still a **provisional placeholder**, not a confirmed decision — the
   mobile-launch spec has no existing bundle-identifier decision to defer to.
   It's fine for development/preview builds; it should be explicitly
   confirmed (or changed) before it's ever used for a real App Store
   Connect/Play Console listing, since that binding is effectively permanent
   once a real submission happens.
6. `EXPO_PUBLIC_*` values for a cloud EAS build come from `eas env:create`
   (now possible — the account is linked) rather than a committed file;
   not set up this session since it wasn't needed to validate `eas.json`.
   `.env.example` still documents which three are needed.

## Native auth test matrix — not run

The previous milestone's request for a device/simulator-verified pass
through cold launch, Magic Link, Google OAuth, session refresh, API auth,
logout, and deep-link error cases (malformed link, missing code, expired
callback, cancelled OAuth, network failure, expired session) was **not
executed** — confirmed empirically, not assumed:

- No `adb`/Android emulator on this machine (`ANDROID_HOME` unset, no SDK
  installed).
- This is a Windows host, so an iOS Simulator is categorically unavailable
  (Simulator only runs on macOS) — not a missing-tool problem, an
  operating-system one.

Everything gated on "review the code, not run it on a device" was still
done: `signInWithOtp`/`signInWithOAuth`/`verifyOtp`/`exchangeCodeForSession`
all resolve `{ data, error }` rather than throwing on a network failure
(confirmed against the pinned `@supabase/auth-js`'s own try/catch blocks),
so a network failure surfaces as a normal, handled error state, not a
crash. A cancelled Google OAuth browser sheet (`WebBrowser.openAuthSessionAsync`
returning `"cancel"`/`"dismiss"`) is already handled as a silent no-op, not
an error. A malformed/incomplete deep link and an expired magic-link
`token_hash` both resolve to `parseAuthCallbackUrl`/`completeSessionFromUrl`
returning a typed error the callback screen already displays before
redirecting to sign-in. None of this required changing the auth
architecture — it was already built to handle these cases; this pass
confirmed that by reading it, not by assuming it.

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
