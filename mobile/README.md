# Budgts mobile (Expo)

The native iOS/Android app, ported from `mobile/native-home` in Stage 0 (2026-09-27). The launch plan is
`../docs/specs/2026-09-17-mobile-app-launch-design.md`: native apps beside budgts.com (not mobile-only), every screen
visually identical to the web (Phase 3 restyles the screens, which still show the older look), $9.99/month or $69/year
with a 7-day free trial (Phase 4 turns billing on). **No live store products or RevenueCat project exist**, so the
purchase flow is unit-tested but has not run against a real store.

"Today" and "this month" come from the server, in the user's stored time zone (`GET /api/mobile/profile` → `month`,
`today`; Home carries them too). The app sends the device's zone (`expo-localization`) at Get Started and again whenever
it differs, checked each time the app returns to the foreground: the rule the web's `<TimeZoneSync>` follows.

**Built (typechecked and unit-tested; not yet run on a device):** the signed-in shell (profile gate, tabs), Get Started (currency,
then an optional bank-connect step), Settings (subscription status, restore, manage, delete account, sign-out; the privacy / terms / support links are built but hidden until Phase 1 creates those pages, see below), the
paywall, Sign in with Apple, **Activity, add/edit transaction, Budgets and Accounts** screens over the native data API, and
**native Plaid Link, Connected Banks (reconnect / disconnect / exclude) and account mapping** — all verified live on staging over
Bearer auth (`tests/e2e/mobile-data-api.spec.ts`, `tests/e2e/mobile-plaid-api.spec.ts`), but **not yet opened on a real device** —
Plaid Link itself, the native OAuth-bank redirect, and the Associated Domains / App Links config all need an EAS dev build to
verify, which this environment cannot produce.

**Legal links (Phase 1, 2026-09-28):** Settings shows Privacy, Terms and Support only while the web says its legal pages
are live (`GET /api/legal`, `lib/legal.ts`). The web's switch is the one switch: the pages turn on when the owner facts in
`src/lib/legal/config.ts` are set in Vercel, and the app follows without a release.

**Still required before launch:** the Get Started trial step (blocked on RevenueCat/store products); running the prepared Maestro
suite (needs a device/emulator or CI runner); real-device verification of everything above. (Goals, category management and
in-app CSV export are post-launch.)

## Stage 2A: native foundation (2026-09-29, built, not deployed)

- **Toolkit:** Expo SDK 57 at its latest patch set (`npx expo install --fix`), New Architecture on; `npx expo-doctor` 21/21.
  The old "duplicate react" warning had a root cause: `react-dom`, a required peer of expo-router's web modal packages, was not
  installed here (`.npmrc` has `legacy-peer-deps`), so it resolved from the web app's `../node_modules` and pulled that `react` in.
  `react-dom@19.2.3` is now installed here, matching `react`. `react-native-plaid-link-sdk` is excluded from the React Native
  Directory check: v13 is an Expo module (New Architecture native); the directory's metadata is stale.
- **Shared, not copied:** `metro.config.js` watches only `src/lib/brand`, `src/lib/crystal` and `src/app/fonts` of the web app and
  resolves packages from this folder's `node_modules` alone (the web's `node_modules` and `.next` are block-listed).
  `lib/brand/shared.ts` is the one import of those files. `lib/theme.ts` now maps the older screens onto the same tokens and Geist
  (Poppins and the cream palette are gone) until Phase 3 rebuilds each screen from the primitives.
- **Brand primitives** (`components/brand/*`): `<PixelFrame>`, `<Robin>`, `<Icon>`, `<Text variant>`, `<Button>`, `<Field>`,
  `<TextButton>`, `<IconTile>`, `<BrandStage>`; see `docs/BRAND_GUIDELINES.md` → "Native apps". The development-only screen
  `budgts://dev/brand` shows every primitive at the places in `lib/brand/specimen.ts`, for parity captures.
- **Sign-in:** the web's sign-in screen drawn from the primitives.
  - **Email link** lands on `<API base>/app/auth/callback` (`lib/auth/sign-in-options.ts`): a web page that hands it to the app as
    `budgts://auth/callback` (one tap on a phone) or, on a computer, says to open the email on the phone and keeps web sign-in one
    tap away. Once universal links / app links are configured, the phone opens the app straight from the link. Expired, used and
    other-device links come back to sign-in with a message and the form that fixes it (`lib/auth/auth-errors.ts`; Supabase puts a
    failed link's error in the URL **fragment**, which the old parser missed). The page forwards only `code` and the
    error parameters, and the app accepts only a PKCE `code` it started: a `token_hash` link is refused with "send a new one"
    (login-confusion guard, launch spec §4). The sent screen has "Send it again" (after the server's wait, 60s by default) and
    "Use a different email". A build without `EXPO_PUBLIC_API_BASE_URL` says it isn't set up instead of failing silently.
  - **Google** as on the web (same Supabase project and provider, so the same Google account is the same user), always asking
    which account; closing the sheet or declining is a quiet cancel.
  - **Sign in with Apple** is built and **off**: it shows only on iOS with `EXPO_PUBLIC_APPLE_SIGN_IN=on` in the build, once the
    Apple developer account and Supabase's Apple provider exist (below). Where it shows, the screen warns that Hide My Email starts
    a separate account.
  - Under the buttons, existing budgts.com users are told to use the same email or Google account.
- **Tests:** `npx vitest run` also renders the primitives (`components/**/*.test.tsx`, react-test-renderer over host stand-ins in
  `test/`).

### Device run (Android emulator, 2026-09-29)

A development build (`npx expo run:android`, local Gradle) ran on an Android 16 emulator (Pixel 6 profile, 412×915 at 2.625x)
against an isolated local staging web server (`adb reverse tcp:3000 tcp:3000`, `EXPO_PUBLIC_API_BASE_URL=http://localhost:3000`).
Verified: the fonts, every primitive (within one device pixel of the web, exact colours), the sign-in screen, the web hand-off
page in Chrome, the `budgts://auth/callback` deep link into the running app, and an expired link landing on sign-in with its
message. **Not verified on the device:** a completed sign-in and a data screen loading. On this machine Avast Web/Mail Shield
intercepts HTTPS with its own root certificate, which the emulator doesn't trust, so every HTTPS call from the emulator to Supabase
fails (Chrome: `ERR_CERT_AUTHORITY_INVALID`; the app shows its "Couldn't reach Budgts" message, as designed). Run those on a phone
(an EAS preview build) or with Avast's HTTPS scanning off for the emulator.

Local build notes (this machine): Gradle's Java needs `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT` (the same
interception, trusted through Windows' store), and a slow link can time out the Gradle wrapper download (fetch the zip into
`~/.gradle/wrapper/dists/<version>/<hash>/` by hand).

**Device checklist still to run (needs a real staging sign-in: a readable test inbox and/or test Google accounts, owner):**
the email link with the app cold and again warm (the new link is the one used); an expired link, then "Send it again"
with its countdown; Google with two accounts (the chooser appears; the same Supabase user as on the web); Google cancelled;
the same Google return arriving twice on Android (one exchange); the first data screen loading over TLS; sign out and back
in, and an app restart keeping the session; the keyboard on a short screen; and **the Google authorize URL recorded showing
`code_challenge_method=s256`**, with every `code_challenge`, `code`, `state` and token value redacted.

**Development warnings (checked 2026-09-29, Logcat `ReactNativeJS` and native React tags: cold start, a real sign-in
attempt, Google opened and cancelled, both link paths, the dev screen).** What showed up, and what was done:

- **Fixed: `WebCrypto API is not supported. Code challenge method will default to use plain instead of sha256.`**
  (JS warning on every sign-in attempt). Hermes has no Web Crypto, so supabase-js drew the PKCE verifier from
  `Math.random` and sent it as a "plain" challenge. `lib/supabase/install-webcrypto.ts` (the first import of
  `lib/supabase/client.ts`) now supplies `crypto.getRandomValues` and `crypto.subtle.digest` (SHA-256) from expo-crypto,
  so the verifier is secure-random and the challenge S256; the warning is gone on the emulator.
- **Fixed: a crash on releasing a button** (`Cannot read property 'forEach' of null` in `processTransform`): a press
  style whose `transform` turned `undefined` on release reaches React Native's style processor as `null`. Resting
  transforms are now `[]` (`components/brand/controls.tsx`, regression test `press-transform.test.tsx`).
- **"Open debugger to view warnings" / `Cannot connect to Expo CLI … URL: 10.0.2.2:8081`** (JS warning): Expo's
  fast-refresh (HMR) socket to Metro closes while the app sits behind another app (Chrome's Custom Tab for Google, or
  the browser for a link) or while Metro restarts, and warns when it comes back. Development only: release builds have
  no Metro connection. Not our code.
- **`StatusBarModule: Ignored status bar change, current activity is edge-to-edge`** (native log): React Native's
  `StatusBar` sends its default colour and translucency on mount, and React Native deliberately ignores both under
  Android's edge-to-edge. The status-bar style (dark marks) still applies; nothing to fix in our code.
- **`Packager connection already open`, `Unable to display loading message … Reloading…`, a
  `ReactNoCrashSoftException` "onWindowFocusChange while context is not ready"** (native, one each): React Native / Expo
  development-reload lifecycle logs, emitted while the bundle (re)loads; "NoCrash" by design and absent from release builds.
- Fixed on the way: with Android's edge-to-edge the keyboard no longer resizes the window, so the send button sat under
  it. The sign-in screen uses `KeyboardAvoidingView` padding on both platforms, and when the keyboard appears it scrolls
  the email field and send button above it (`lib/keyboard.ts`), checked on a 360×640 screen.

## Real-device testing (Expo Go)

Sign-in (Magic Link, Google, Sign in with Apple), Home and the account screens run in **Expo Go** — no EAS dev-client build, Xcode or
Android Studio needed to verify them on a physical device. Store billing (`react-native-purchases`) and native Plaid
(`react-native-plaid-link-sdk`) are native modules outside the Expo SDK, so those need an **EAS development build**; until then the
paywall reports that subscriptions are unavailable, and the Connected Banks "Connect a bank" action reports Plaid Link as
unavailable, rather than faking anything.

1. Copy `.env.local.example` to `.env.local` and fill in:
   - `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` —
     same values as the web app's `.env.local` (same Supabase project).
   - `EXPO_PUBLIC_API_BASE_URL` — a deployed backend the phone can reach
     that includes the `/api/mobile/*` routes. `http://localhost:3000` does
     **not** work from a physical device, and Vercel previews sit behind SSO.
     As of 2026-09-28 the `budgts-staging.vercel.app` alias still serves an
     old build without the mobile API, so point it at a current deployment
     first (Phase 2).
   - `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` / `..._ANDROID_API_KEY` — leave
     empty until Phase 4 switches billing on.
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

Configured 2026-09-18 on the original staging project; **re-done on the current staging project `Budgets-Staging-3` on 2026-09-21**
(its callback `https://uvowywszaiojboaxdmoz.supabase.co/auth/v1/callback` must be an authorized redirect URI of the Google OAuth client).
The text below describes the first verification. Verified from this repo without printing any secret:
GoTrue's public `/auth/v1/settings` shows `google: true`, and a read-only
Supabase Management API call confirms `external_google_enabled: true`,
`budgts://auth/callback` is on the `uri_allow_list`, and the configured
Google Client ID matches the one created for this project. A live browser
round-trip through the redeployed staging web app's "Continue with Google"
completed successfully. Production has its own separate Google OAuth client
and Supabase config to do later, per the same steps, when that milestone
comes up.

### Sign in with Apple — external setup (owner)

Implemented in code (see "Sign in with Apple" at the end of this file). These steps are prerequisite and external to this repo:

1. **Apple Developer Program enrolment** — not yet done.
2. The iOS bundle identifier (`com.budgts.app` is still provisional) registered in that account with the **Sign in with Apple**
   capability.
3. Supabase Dashboard → Authentication → Providers → Apple: enabled, with the app's bundle identifier in the authorized client ids
   (the native ID-token flow). A Services ID and `.p8` key are only needed for a browser-based Apple flow, which Budgts does not use.
4. `app.json` already carries `ios.usesAppleSignIn` and the `expo-apple-authentication` config plugin. The flow does not use
   `budgts://auth/callback`.
5. Switch it on: `EXPO_PUBLIC_APPLE_SIGN_IN=on` for the iOS builds (`eas env:create`, per environment), staging first. Until then
   the button never shows. Then test on a device: a new Apple ID signs up; an Apple ID whose shared email is already a Budgts user
   signs in to that same user; Hide My Email creates a new, separate user (the screen says so).

## What's implemented vs. still open

| Item | Status |
| --- | --- |
| Expo SDK 57 / Expo Router scaffold | Done |
| Magic Link sign-in | Built (Stage 2A): web hand-off page, deep-link return, expired/used/other-device handling; emulator-verified up to the deep link (see "Device run") |
| Google OAuth sign-in | Built (Stage 2A): account chooser, quiet cancel, fixed messages; unit-tested; not yet run on a device |
| Branded sign-in screen | Done (Stage 2A): the web's sign-in screen from the shared brand sources |
| Sign in with Apple | Code-complete and unit-tested (`lib/auth/apple-sign-in.ts`), iOS only. **Not run on a device**; needs Apple Developer enrolment and the Supabase Apple provider — see "Sign in with Apple" below |
| Signed-in shell, Get Started, Settings, paywall, delete account | Code-complete, typechecked, pure logic unit-tested (`lib/profile`, `lib/account`, `lib/billing/describe.ts`). **Not run on a device** |
| Data API (transactions, accounts, categories, budgets) | Server side built and verified live on staging; native Activity, add/edit transaction, Budgets and Accounts screens built and typechecked. **Not run on a device** |
| Native Plaid Link, Connected Banks, account mapping | Code-complete: `lib/plaid/*` (port + `react-native-plaid-link-sdk` v13 adapter + `link-flow.ts`), `connected-banks.tsx`, `map-accounts.tsx`; server side (`/api/mobile/plaid/*`) verified live on staging (`tests/e2e/mobile-plaid-api.spec.ts`). **Opening Plaid Link itself, and the native OAuth-bank redirect, need an EAS dev build — not run on a device** |
| Secure session persistence | Done (`lib/supabase/large-secure-store.ts`) |
| AppState-driven token refresh | Done (`lib/supabase/auto-refresh.ts`) |
| Bearer-token API requests | Done and live-verified against real staging (`lib/auth/api.ts`, backend: `src/lib/auth/get-request-user.ts`) |
| Logout/session cleanup | Done (`AuthProvider.signOut`) |
| Cold-start deep-link handling | Implemented (`app/auth/callback.tsx`); **unverified on a physical device/simulator** |
| `budgts://` → Android intent-filter | **Verified** via `npx expo prebuild` — see "Native config verification" below |
| `budgts://` → iOS URL scheme | **Not verifiable from this machine** — `expo prebuild` does not generate an iOS project on Windows at all |
| EAS build config | `eas.json` present (`development`, `preview`); linked to a real EAS project (`@budgts/budgts`, see "EAS readiness" below) and validated via `eas config` for both platforms |
| Native Home | Done — `app/(app)` Home over `GET /api/mobile/home` (Bearer); currency formatting verified on a device under Hermes |
| Store billing (trial / purchase / restore) | Code-complete and unit-tested (`lib/billing/*`, `react-native-purchases` behind a provider port; the server decides access). **Not exercised against a real store** — no RevenueCat project or Apple/Google products yet. The paywall and Settings screens host it |
| Physical-device/simulator run | Android emulator run 2026-09-29 (see "Device run"); no physical device yet; iOS needs a Mac or EAS |

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
- `npx expo-doctor` (2026-09-18; 21/21 since Stage 2A): 20/21 checks passed then, including "Validate packages against
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

No `production` profile — deliberately omitted until store products, a RevenueCat project and submission-readiness work exist to justify one
(the billing *code* is done; the live store configuration is not — mobile-launch spec §10/§11/§16).

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
   `.env.local.example` documents which five exist (the two RevenueCat keys
   stay empty until Phase 4).

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
an error. A malformed/incomplete deep link and an expired magic link
both resolve to `parseAuthCallbackUrl`/`completeSessionFromUrl`
returning a typed error the callback screen already displays before
redirecting to sign-in. (Since Stage 2A the app accepts only PKCE `code`
links it started; a `token_hash` link is refused, see launch spec §4.) None of this required changing the auth
architecture — it was already built to handle these cases; this pass
confirmed that by reading it, not by assuming it.

## Sign in with Apple (iOS)

**In the iOS launch scope** (owner decision 2026-09-21, superseding the earlier exclusion — see
`../docs/specs/2026-09-17-mobile-app-launch-design.md` §1). It also answers App Store guideline 4.8, which asks for an
Apple-equivalent option when Google sign-in is offered.

**How it works** — `lib/auth/apple-sign-in.ts` (unit-tested) orchestrates it over injected dependencies; `lib/auth/apple-native.ts`
wires `expo-apple-authentication` and `expo-crypto`; the sign-in screen shows Apple's own button only where the OS reports it can run.
Apple's sheet returns an identity token, which `supabase.auth.signInWithIdToken({ provider: "apple" })` turns into a session. This is
Supabase's native path: **no browser and no `budgts://auth/callback`**. The nonce binds the two — Apple gets the SHA-256 hash of a
fresh random value, Supabase the raw value. Cancelling Apple's sheet is a quiet no-op, and error text from Apple or Supabase never
reaches the screen.

**Not yet run on a device** (this machine has no iOS). It needs the external setup above: Apple Developer enrolment, the bundle
identifier registered with the Sign in with Apple capability, and Supabase's Apple provider enabled with the app's bundle identifier
as an authorized client id (per Supabase's docs for native sign-in; confirm at setup). The Services ID and `.p8` key are only needed
for a browser-based Apple flow, which Budgts does not use. `app.json` already has `ios.usesAppleSignIn` and the config plugin.
