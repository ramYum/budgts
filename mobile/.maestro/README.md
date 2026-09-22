# Maestro flows (prepared, not yet run)

Scaffolding for the small native test suite approved in `docs/specs/2026-09-21-mobile-only-transition-design.md` §8.
These flows are **written but unexecuted** — this machine has no Android emulator, no iOS simulator (Windows), and no
Maestro CLI installed, and native screens need an Expo **development build** (Expo Go doesn't carry the Plaid or
billing native modules). Nothing here uses Maestro Cloud or any paid service — the CLI is free, and flows run against
a local emulator/device or a CI runner with one.

## Prerequisites (not done in this repo)

1. `curl -fsSL "https://get.maestro.mobile.dev" | bash` (Maestro CLI).
2. An Expo dev build installed on a device or emulator (`eas build --profile development`, per `mobile/README.md`
   "EAS readiness" — Android is reachable without an Apple account; iOS needs the Apple Developer enrolment that has
   not happened yet).
3. `EXPO_PUBLIC_API_BASE_URL` in that build pointed at `https://budgts-staging.vercel.app` — never production.
4. Stable `testID`s on the screens a flow touches (added throughout the native screens as they were built; a flow
   that needs one that's missing should add it rather than fall back to text matching, which breaks on copy changes).

## Running (once the above exists)

```sh
maestro test .maestro/flows/currency-onboarding.yaml
maestro test .maestro/flows/add-transaction.yaml
```

Sign-in is the one flow that needs an out-of-band secret — see `flows/sign-in.yaml`'s own comment.

## What exists vs. what's next

- `flows/currency-onboarding.yaml` — Get Started: pick a currency, skip the bank step, land on Home.
- `flows/add-transaction.yaml` — Activity → Add → save → appears in the list. Assumes a signed-in, onboarded session
  with at least one account (run after `currency-onboarding.yaml`, or against a seeded test account).
- `flows/sign-in.yaml` — opens the app via a magic-link deep link. The `token_hash` must be minted out-of-band (the
  same `magicTokenHash` helper the Playwright e2e suite uses, `tests/e2e/helpers/test-user.ts`) and substituted before
  running; Maestro has no way to read a real inbox itself.
- **Not yet written:** connect-bank (needs a real Plaid Sandbox institution login inside Link's own UI, which the
  contract test bypasses on purpose — this one can't be bypassed for a true device test) and Sign in with Apple
  (Apple's system UI is generally not automatable this way at all; expect this to stay a manual real-device check).
