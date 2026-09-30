# Parity tooling (Phase 3, tasks P1 to P5)

The automated proof that a native screen is the approved PWA at phone width (AGENTS.md → Mobile, "Visual parity").
Same seeded staging users on both sides, web Playwright captures vs native Maestro captures, then a compare step that
fails on any geometry, colour or pixel breach. Plan: `phase3-plan.md` → "Parity tooling lane (P)".

**Staging only.** Every script reads `.env.staging` (copy it into the worktree; it is git-ignored) through `env.ts`, which
refuses any Supabase target but `uvowywszaiojboaxdmoz`. Nothing here opens `.env.local` or `.env.production`.

## Commands

| Step | Command | What it does |
| --- | --- | --- |
| serve | `npm run parity:serve` | `next build` + `next start` on **port 3200** with staging env, `PARITY_HARNESS=1`, `PLAID_TEST_SEED_ENABLED=1` (this process only). `--root <dir>` serves another checkout, `--build-only`, `--no-build`. Ports 3000/8081 (device runs) and 3100 (Wave 0) are refused. |
| P1 seed | `npm run parity:seed` | Deletes and recreates the parity users (below). `--only full,over`, `--skip-banks`. The `banks` user needs the server up. Writes `.tmp/parity/users.json` (name → id, email). |
| P3 web | `npm run parity:web` | Every screen × state in `screens.ts`, Android 412×915 @2.625 and iPhone 390×844 @3, sets `rest` and `frozen`, into `.tmp/parity/web/<device>/<screen>-<state>-<set>.png/.json`. `--screen`, `--device`, `--set`, `--out`, `--now real|<ISO>`. |
| P4 native | `npm run parity:native` | Same on the parity AVD, into `.tmp/parity/native/android-412/`. See "P4 needs". |
| P5 compare | `npm run parity:compare -- --a <dir> --b <dir>` | Writes `<report>/report.html` + `report.json`; exit 1 on a breach. `--pixels-only --max-diff-pixels 0` is the zero-pixel proof. |
| all | `npm run parity -- --screen home` | P3 (real clock) + P4 + P5 for those screens on Android. |

## Users (P1)

`parity+<name>@budgts.test` (undeliverable domain), USD, `America/New_York`, recreated each run:

| name | state |
| --- | --- |
| `firstrun` | signed up, no currency (onboarding) |
| `tour` | onboarded, welcome guide not seen |
| `empty` | onboarded, guide seen, nothing else |
| `full` | 3 manual accounts, custom "Dining out", budgets on 6 categories this month, 82 transactions (42 this month incl. income on the 1st and 15th, a transfer pair, a refund, a 40-character merchant, an uncategorized row; 8 in each of the 5 prior months), 2 goals (93% of $5,000; a $1,234,567.89 target) |
| `over` | `full` with Dining out ≈130% and Groceries 92% of budget |
| `banks` | Plaid Sandbox First Platypus Bank, Checking + Saving imported, synced; review flag on Saving (advisory banner); limited-history notice; needs-category rows (bell) |
| `deleting` | deletion lock set: read-only banner everywhere |

All financial writes use the app's own commands as the signed-in user (RLS applies). The service role sets only what no
user action can: the deletion lock row, `plaid_accounts.needs_review`, and `plaid_items.created_at` (dated to the item's
earliest row so the limited-history rule fires).

Dates follow the users' today in `America/New_York`: prior months use fixed days 1–28; this month's rows are squeezed in
order into days 1..today (`placeDay`: `ceil(day × today / 28)`, identity from the 28th), so no row is ever after today
and on the 1st every this-month row is dated today. The rows never change, so this month's totals and the `full`/`over`
states are the same on any day; only the list's day grouping follows the calendar. Re-seed after a month rolls over
(the users' "this month" is the month they were seeded in).

## Motion sets

- `rest`: web `prefers-reduced-motion: reduce` + Playwright `animations: "disabled"`; device animator scales 0 (React
  Native reports Reduce Motion). The motion-off resting frame.
- `frozen`: web page clock installed and paused, advanced `freezeAt` ms (default 4000), every animation paused at
  `currentTime = freezeAt`; device `?clock=<freezeAt>` (dev-only, `mobile/lib/motion/parity-clock.ts`).
- The web page's `Date` is pinned (10:00 New York today) so relative times and the greeting are stable run to run; the
  combined `npm run parity` uses `--now real` because the device clock is real.

## Test-id contract (P2)

`screens.ts` → `TESTIDS` lists the shared ids; the web sets them as `data-testid`, native atoms must set the same string
as `testID`. Repeated ids are numbered in document/tree order (`progress-bar#2`). Hub row and tab ids come from
`src/lib/brand/test-ids.ts` (`hubTestId`, `tabTestId`), which the native atoms should import too. The native `<Screen>`
**must** set `testID="screen-root"` on the view that spans the screen between the status bar and the gesture inset:
capture-native crops to it and fails without it.

The web harness `/parity-harness/{loading,error,not-found}` (dev-only, `PARITY_HARNESS=1`) stands in for a held load,
a failed load and a missing page. Its loading capture shows no lit tab (the path is not `/`), unlike a real Home load.

## Compare rules (P5)

- Crop each side to its `root` (web: the viewport; native: `screen-root`), compare the shared area top-left. The AVD is
  1080 px / 2.625 = 411.43 dp wide against the web's 412 CSS px (1082 px), so up to 2 px columns are not compared.
- Geometry: every id on both sides, |Δx|,|Δy|,|Δw|,|Δh| ≤ 1 pt from the root. An id on one side only fails.
- Colours: ids tagged in `screens.ts` (`colors`) must be the token hex exactly at their sample point, on both sides.
- Pixels: pixelmatch threshold 0.1, at most `budgets.json` (default 0.6% of compared pixels). Lower freely; raising a
  budget needs the reviewer's sign-off in the commit note.

## P4 needs (the emulator)

1. The emulator lock `.tmp/parity/emulator.lock` (capture-native takes and releases it; a dead holder's lock is taken over).
2. One booted AVD, 1080×2400 @ 420 dpi (Pixel 7 profile), `adb` at `%LOCALAPPDATA%\Android\Sdk\platform-tools` (or `ADB`).
3. The Budgts **dev build** (with `mobile/lib/dev/fault.ts`, i.e. Wave 0 merged with this branch) built with
   `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3200`, staging `EXPO_PUBLIC_SUPABASE_*`, and cleartext HTTP allowed to
   10.0.2.2 (debug builds allow it); Metro on 8082+, never 8081.
4. `npm run parity:serve` running (port 3200) and the users seeded.
5. Maestro CLI: installed at `%USERPROFILE%\.maestro-cli\maestro\bin\maestro.bat` (2.11.0; not on PATH; `MAESTRO_BIN`
   overrides). Java 17 is on PATH.
6. The tool sets the device time zone to `America/New_York` (`service call alarm 3`) and the animation scales per set,
   restoring the scales to 1 at the end. It toggles airplane mode around the `offline` state.
