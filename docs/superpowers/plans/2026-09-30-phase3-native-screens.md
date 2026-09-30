# Phase 3: Native Screens Identical to the Approved PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. All Expo / React Native work goes to `budgts-architect` (AGENTS.md → Mobile); web-only test-attribute and tooling tasks may go to the main session.

**Goal:** Every signed-in native screen, state and flow in `mobile/` becomes the approved PWA (budgts.com / `phase-m/mobile-launch` == live `main`) at phone width, in features, assets, design, copy and motion, proven by an automated parity check and scored 9.5+; every pre-redesign leftover is deleted.

**Architecture:** Screens are rebuilt from the Stage 2A brand primitives (`mobile/components/brand/*`, which import the web's own `src/lib/brand/*` + `src/lib/crystal/*` through Metro `watchFolders`) plus a new shared native component layer that mirrors `src/components/{ui,page-header,hub-list,bottom-nav,overlay,row-menu,month-nav,reveal,rolling-amount,crystal-perch,spending-overview}.tsx` one-to-one. Every figure comes from the Stage 2B `/api/mobile/*` endpoints (shared loaders); the device computes no money. A parity pipeline (Playwright web captures vs Maestro native captures, same seeded staging users) gates every screen.

**Tech Stack:** Expo SDK 57, RN 0.86 (New Architecture), Expo Router, Reanimated 4.5.1 + worklets 0.10, react-native-svg 15, Vitest + react-test-renderer host mocks (`mobile/test/native-hosts.ts`), Maestro, Playwright 1.63, pixelmatch + pngjs (new root devDeps).

**Spec:** `docs/specs/2026-09-17-mobile-app-launch-design.md` (§7, §13a, §15a), `docs/BRAND_GUIDELINES.md` (Motion, Native apps), `AGENTS.md` → Mobile (parity check + scoring gate), `docs/superpowers/plans/2026-09-27-stage0-port.md`.

**Base:** branch `phase-m/stage2` (worktree `C:\Users\ramsy\Projects\budgts-stage2`, integration of 2A `70fb811` + egg loader `1f73725` + 2B `84c5864`, merge in progress at planning time). Phase 3 starts only once that integration is committed and green. Phase 3 integration branch: `phase-m/phase3` (from `phase-m/stage2`); lanes branch from it as `phase-m/p3-<lane>` in worktrees `C:\Users\ramsy\Projects\budgts-p3-<lane>`.

## Global Constraints

- Owner (2026-09-30): "Dont touch any of the calculation codes, just the design codes. Dont ask me questions." No change to `src/lib/budget/*`, `src/lib/plaid/*`, `src/lib/home/load-home.ts`, `src/lib/insights/*`, any `commands.ts`, any migration. If a screen needs a figure the API does not return, stop and escalate; never compute it on the device.
- Owner (2026-09-30): "The current version PWA is the approved version." Reference = `C:\Users\ramsy\Projects\Budget Tracking app` at `phase-m/mobile-launch` (== live `main`), phone width.
- Visual parity (AGENTS.md): geometry within 1pt via matching `testID` / `data-testid`, exact token colours, per-screen pixel-diff budget, status bar and safe areas cropped. Any breach blocks the screen.
- Scoring gate: visual parity, functional correctness, motion fidelity, performance (cold start, 60fps), accessibility (TalkBack/VoiceOver labels, contrast, 44pt targets), premium polish, each 9.5+. First and final scores recorded in the commit notes.
- Brand: 24px phone gutter, 16px card padding; no `border-radius`, no second accent, no gradients, no em-dash in UI copy, sentence-case section heads, Dogica only on its 8px grid and never in reading text, figures, labels or buttons (`docs/BRAND_GUIDELINES.md` → What not to do).
- Motion: web timings and `steps()` easing reproduced in Reanimated; transform/opacity only; everything off under Reduce Motion, showing the web's motion-off resting frame.
- One authoritative implementation: no screen keeps an old-design twin; `mobile/lib/theme.ts`, `mobile/components/ui.tsx`, `mobile/components/parts.tsx` are deleted by the end of the phase (guard test, Task F1).
- No polling: refresh after sync uses Supabase Realtime (the web's `RealtimeRefresh`), debounced.
- Staging only for data (`uvowywszaiojboaxdmoz`); never read `.env.local` / `.env.production`; never production data.
- Web edits allowed in this phase: `data-testid` attributes and a dev-only parity harness route. Each web edit must show 0 changed pixels against the pre-edit capture.
- Git: local commits per task; no push/merge/tag without the owner.

## Review Focus

1. **A new user on a fresh install** (no currency, tour not seen): must see the web's Crystal onboarding cards, then the welcome guide (with native Plaid Link on the bank card), then Home; the tour gate must use `tourSeen` from `/api/mobile/profile`, and Skip must land on Home, not loop. Test: Task A3 gate tests + Maestro `first-run.yaml`.
2. **A low-activity or empty account** (no budgets, no transactions, no goals, no bank): every screen shows the web's empty state and a reachable exit, never a spinner forever or a blank card. Test: parity state `empty` for every screen (Task P3 seed user `parity-empty`).
3. **Long names and big numbers** (a 40-character merchant, a 13+ character figure, a category name that wraps): the web truncates / steps the figure size down (`figureSize`); native must match. Test: seed rows with a long merchant and a `$1,234,567.89` goal; parity budget per screen.
4. **Keyboard over a form in a bottom sheet** on a 360×640 Android screen and on iOS: the Save button and the focused field stay visible (KeyboardAvoidingView padding on both platforms). Test: Task F6 `form-sheet` test + Maestro `add-transaction.yaml` on a small AVD.
5. **A server or network failure mid-session** (503 from `/api/mobile/home`, airplane mode): the web's error boundary / offline design with Try again, never a raw error or stale numbers shown as current. Test: parity states `error` and `offline` (dev-only fault injection, Task P4).

---

## Native today vs the approved PWA

Compared from code: web routes/components in the main folder against `mobile/app/**` and `mobile/components/**` in `budgts-stage2-native` (`70fb811`) and `budgts-egg-loader` (`1f73725`). Live side-by-side captures come with the parity tooling (Task P5). Status: **missing** (no native screen), **old design** (screen exists, pre-redesign look via `lib/theme.ts` + `components/ui.tsx`/`parts.tsx`), **partial** (new design but incomplete), **matches** (new design, pending parity proof).

The whole signed-in app shares one root cause: every screen after sign-in still imports the Stage 0 look (`lib/theme.ts` "older screens' palette", `components/ui.tsx`, `components/parts.tsx`: rounded 12/32/999 radii, 1px borders, system `ActivityIndicator` spinners, no pixel frames, no icons, no Dogica titles, no motion). Only sign-in, the auth callback, the egg loader/splash/icon and the dev brand screen are on the new brand.

| PWA screen / feature (web source) | Native today | Differences | What fixes it |
| --- | --- | --- | --- |
| Signed-in shell header: robin + Dogica "Budgts" logo, needs-category bell (`(dashboard)/layout.tsx`, `logo.tsx`, `needs-category-bell.tsx`) | old design (`(tabs)/index.tsx` only) | PNG `logo-mark.png` + `wordmark.png` raster, on Home only; no bell; other screens have no header | `AppHeader` (F3) on every tab screen: `<Robin>` 22 + Dogica wordmark, bell from `/api/mobile/status` |
| Bottom tabs: Home, Budgets, Activity, More; pixel icons; red active icon; `pip` marker; 2px hairline top (`bottom-nav.tsx`) | old design | Order Home/Activity/Budgets/**Settings**; labels only, icons hidden; accent tint on label; 1px `border` colour; no pip; More tab missing | `BottomTabs` custom `tabBar` (F3); rename `(tabs)/settings.tsx` → `(tabs)/more.tsx`; Settings becomes a pushed screen |
| Deletion read-only banner + bank review banner on every screen (`account/deletion-banner.tsx`, `plaid/review-banner.tsx`) | missing | not shown anywhere | `StatusBanners` (F3) from `/api/mobile/status` |
| Realtime refresh after a sync (`realtime-refresh*.tsx`) | missing | lists only refresh on pull / focus | `useRealtimeRefresh` (F3), Supabase Realtime on `transactions`, debounced → `invalidate()` |
| Onboarding `/onboarding`: Crystal cards crystal → welcome → auto-capture → currency, stepped dots across onboarding + tour (`onboarding-wizard-content.tsx`, `components/tour/*`) | old design, wrong flow | Native "Get Started" = plain title + currency radio list + a **bank step** + Sign out link; no Crystal, no cards, no scenes, no progress cells | Rebuild as `app/(app)/onboarding.tsx` over `/api/mobile/tour?phase=onboarding` (A1–A2); delete `get-started.tsx` and its bank step |
| Welcome guide `/tour`: bank (Plaid) → auto-sort → money-left → plan → done, Skip, replay from More (`tour-wizard-content.tsx`, `scenes.tsx`, `guide.module.css`) | missing | native has no tour; shell gate ignores `tour_seen_at` | `app/(app)/tour.tsx` + scene ports (A2–A4); gate on `tourSeen` (A3) |
| Home (`dashboard-view.tsx`, `crystal-perch.tsx`, `rolling-amount.tsx`, `spending-overview.tsx`, `income-tile.tsx`, `budget-over-alert.tsx`, `reveal.tsx`) | old design, partial | Has Money Left, category list, activity, savings; missing: greeting, MonthNav, CrystalPerch (roam, bubbles, cheers, tap), RollingAmount, savings rate, Add income, over-budget alert, "Get set up" steps, "Where it went" chips, "Spending · 6 months" trend, "Where your money goes" breakdown, Add transaction button, reveals, stepped progress cells; spinner instead of skeleton | B1–B4 |
| Activity `/transactions`: MonthNav, search + All/Spending/Income/Transfers segmented filter, NeedsCategory groups, LimitedHistoryBanner, ConnectBank card, grouped list with RowMenu edit/delete, Add sheet (`transaction-list.tsx`, `plaid/needs-category.tsx`, `add-transaction.tsx`, `transaction-form.tsx`, `overlay.tsx`, `row-menu.tsx`) | old design, partial | Native filters by **category chips** (web: kind segmented control + search); no needs-category, no limited-history, no connect card, no row menu; add/edit is a full-screen modal route, not the web's bottom sheet; spinner footer; keyboard pads on iOS only | D1–D3; delete `app/(app)/transaction.tsx` route in favour of the sheet |
| Budgets `/budgets` + detail sheet, New budget sheet, Copy budgets, This month / All time (`budgets-view.tsx`, `copy-budgets.tsx`) | old design, partial | Inline amount fields per row; no hero, no segmented range, no detail sheet with transactions, no copy, no over flash | D4 |
| Goals `/goals` (`goals-view.tsx`, `goal-form.tsx`, `contribution-form.tsx`) | missing | Home shows a savings summary only | D5 |
| Insights `/insights` (`insights-view.tsx`, `spending-overview.tsx`) | missing | none | D6 |
| Accounts `/accounts` (`account-manager.tsx`) | old design | Chip-type picker, text links; no groups by bank / by hand / archived layout, no row menu | E2 |
| Connected banks `/connected-banks` (`plaid/bank-connections.tsx`, `connected-banks.tsx`, `account-mapping.tsx`, `reconnect-button.tsx`, `connect-bank.tsx`) | old design | Mapping is a separate `map-accounts` modal route (web: "Choose which accounts to import" sheet); "Connected Banks" title case (web: sentence case); no disconnect confirm sheet in web design | E1; delete `map-accounts.tsx` route |
| More `/more`: Play welcome guide card, Your money, Banks & settings, Help rows with counts, robin + Track : Plan : Grow (`more/page.tsx`, `hub-list.tsx`) | missing | none (Settings tab instead) | C1 (omit `InstallApp`: PWA install prompt, meaningless natively) |
| Settings `/settings` hub (`settings/page.tsx`) | old design, wrong content | Native Settings = subscription card, paywall button, text links, delete button, **Diagnostics** link; web = hub rows (Profile, Security, Delete account, Categories, Budgets, Savings goals, Connected banks, Manage accounts, Appearance, Help, About), Data → Export CSV, Sign out | C1 |
| Profile, Security, Appearance (`settings/{profile,security,appearance}/page.tsx`) | missing | none | C2 |
| Categories `/settings/categories` (`category-manager.tsx`, `category-form.tsx`) | missing | none (API exists: `/api/mobile/settings/categories`) | C3 |
| Help, How Budgts works, About (`help/page.tsx`, `help/how-it-works/page.tsx`, `about/page.tsx`) | missing | none | C4 |
| Delete account (`settings/delete-account/page.tsx`, `account/delete-account-flow.tsx`) + `/account-deleted` | old design, partial | Old look; "Connected Banks" title case; no fresh-sign-in step UI of the web; no account-deleted landing | C5 |
| Loading (`(dashboard)/loading.tsx`, `.skeleton` sweep) | old design | `ActivityIndicator` spinners (`parts.tsx` `Loading`, list footers, buttons) | `Skeleton` + per-screen skeletons (F5); button pending state per web `ui.tsx` |
| Error boundary (`app/error.tsx`), not found (`not-found-view.tsx`), offline (`app/offline/page.tsx`) | old design / missing | `ErrorBlock` card in old style; no not-found; no offline screen | F5 (`ErrorState`, `+not-found.tsx`, `OfflineState`) |
| Sign-in (`(auth)/sign-in`, sign-in stage) | matches (2A), motion-off frame | Sign-in stage motion (hop, chirp, ticker) waits for Reanimated | A5 (motion only) |
| Egg loader, splash, launcher icon | matches (egg-loader branch) | PWA has no egg loader: native-only by design (splash / cold start) | keep |

**Native-only leftovers the PWA does not have, and what happens to each:**

| Leftover | Decision |
| --- | --- |
| `mobile/assets/brand/logo-mark.png`, `wordmark.png` (old raster brand) | **Delete** (F3) |
| `mobile/lib/theme.ts`, `mobile/components/ui.tsx`, `mobile/components/parts.tsx` (old palette/radii/spinners) | **Delete** once the last importer is rebuilt (guard test F1 → Task Z1) |
| Settings as the 4th tab | **Delete**: replaced by More (F3) |
| `app/(app)/get-started.tsx` incl. its "connect your bank" step and Sign out link | **Delete**: replaced by onboarding cards + tour bank card (A1–A3) |
| `app/(app)/diagnostics.tsx` ("Check backend session", "Environment") + Settings link | **Delete** (C1). Not on the PWA and not in the spec |
| `app/(app)/map-accounts.tsx` modal route | **Delete**: mapping becomes the web's sheet inside Connected banks and the tour bank card (E1) |
| `app/(app)/transaction.tsx` full-screen modal route | **Delete**: add/edit becomes the web's bottom sheet (D2) |
| Settings subscription card + `settings-open-paywall` button | **Delete** from Settings (C1): the PWA has no plan status and billing is off until Phase 4 |
| `app/(app)/paywall.tsx` (old design) | **Delete** the screen; keep `mobile/lib/billing/*` (tested contract, Phase 4). Phase 4 builds the paywall new in this design (native-only by design, spec §9) |
| Activity category-chip filter | **Delete**: replaced by the web's search + kind segmented control (D1) |
| `ActivityIndicator` everywhere (incl. `brand/controls.tsx` button loading) | **Delete**: skeletons and the web's pending button state (F2, F5) |
| Maestro flows `currency-onboarding.yaml` (bank step, `get-started-continue`), `delete-account.yaml` / `budget.yaml` / `add-transaction.yaml` old testIDs, `tab-settings` | **Rewrite** per lane (each lane owns its flows) |
| `app/dev/brand.tsx`, `lib/brand/specimen.ts` | **Keep**: `__DEV__`-guarded parity specimen, not user-visible |
| Egg loader / splash / launcher icon; Sign in with Apple (iOS); native Plaid Link + OAuth return (`lib/plaid/*`); secure session storage | **Keep**: native-only by design (spec §4, §5, §15a) |
| `mobile/assets/favicon.png` | **Delete** if `app.json` has no `web` platform target (check in F3) |

---

## File structure (created / modified in `mobile/`)

```
mobile/
  app/
    _layout.tsx                         M  (+not-found, offline gate)
    +not-found.tsx                      C  (web not-found-view)
    (app)/_layout.tsx                   M  gate: onboarded → tourSeen → tabs (A3)
    (app)/onboarding.tsx                C  (A1)   replaces get-started.tsx (D)
    (app)/tour.tsx                      C  (A2)
    (app)/(tabs)/_layout.tsx            M  custom tabBar (F3)
    (app)/(tabs)/index.tsx              R  Home (B*)
    (app)/(tabs)/budgets.tsx            R  (D4)
    (app)/(tabs)/activity.tsx           R  (D1)
    (app)/(tabs)/more.tsx               C  (C1)   replaces (tabs)/settings.tsx (D)
    (app)/settings/index.tsx            C  (C1)
    (app)/settings/profile.tsx          C  (C2)
    (app)/settings/security.tsx         C  (C2)
    (app)/settings/appearance.tsx       C  (C2)
    (app)/settings/categories.tsx       C  (C3)
    (app)/settings/delete-account.tsx   C  (C5)   replaces (app)/delete-account.tsx (D)
    (app)/goals.tsx  insights.tsx       C  (D5, D6)
    (app)/accounts.tsx connected-banks.tsx  R (E2, E1)
    (app)/help/index.tsx help/how-it-works.tsx about.tsx  C (C4)
    account-deleted.tsx                 C  (C5, signed-out stack)
  components/
    brand/*                             existing primitives (M: controls pending state, Robin motion)
    shell/  app-header.tsx bottom-tabs.tsx status-banners.tsx screen.tsx      (F3)
    ui/     page-header.tsx section-head.tsx hub-list.tsx icon-tile.tsx badge.tsx chevron.tsx
            segmented-control.tsx month-nav.tsx empty-state.tsx stage.tsx select.tsx
            progress-bar.tsx overlay.tsx row-menu.tsx form-sheet.tsx          (F2, F4, F6)
    motion/ reveal.tsx rolling-amount.tsx press.tsx page-enter.tsx            (F4)
    feedback/ skeleton.tsx skeletons.tsx error-state.tsx offline-state.tsx    (F5)
    charts/ spending-trend-card.tsx spending-breakdown-card.tsx               (F7)
    crystal/ crystal-perch.tsx speech-bubble.tsx                              (B2)
    tour/   tour-card.tsx scenes/*.tsx progress-dots.tsx                      (A1, A2)
    home/ activity/ budgets/ goals/ insights/ settings/ banks/                (per lane)
  lib/
    ui/cells.ts                         C  .px-bar geometry (F4)
    motion/stepped.ts                   existing (egg loader)
    motion/parity-clock.ts              C  dev-only frozen clock (P4)
    dev/fault.ts                        C  dev-only fault/hold injection (P4)
    status/use-status.ts                C  (F3)
    realtime/use-realtime-refresh.ts    C  (F3)
  test/legacy-ui-guard.test.ts          C  (F1)
tools/parity/                           C  (P1–P5, repo root)
  seed.ts capture-web.ts capture-native.ts compare.ts screens.ts budgets.json README.md
src/app/parity-harness/[state]/page.tsx C  dev-only web harness (P2)
```

---

## Wave 0 — Foundation (serial; everything else waits on F1–F4). Owner: one `budgts-architect` agent. Parity tooling (P*) runs in parallel by a second agent.

### Task F1: Phase 3 branch, native deps, legacy guard

**Files:**
- Modify: `mobile/package.json`, `mobile/app.json` (plugins if any)
- Create: `mobile/test/legacy-ui-guard.test.ts`

**Interfaces:** Produces `LEGACY_ALLOWED` (shrinking list), the rule every lane obeys: a rebuilt screen removes itself from the list.

- [ ] **Step 1:** Create `phase-m/phase3` from the committed `phase-m/stage2`; worktree `C:\Users\ramsy\Projects\budgts-phase3`.
- [ ] **Step 2:** Add every native module Phase 3 needs in one go, so the dev client is rebuilt once: `npx expo install expo-haptics expo-clipboard expo-sharing expo-file-system @react-native-community/netinfo` (haptics: key actions per brand guide; clipboard: Profile `CopyButton`; sharing + file-system: CSV export; netinfo: offline state). No bottom-sheet or keyboard library: sheets are RN `Modal` + Reanimated, keyboard is `KeyboardAvoidingView` (fewer native deps).
- [ ] **Step 3:** Write the guard test:

```ts
// mobile/test/legacy-ui-guard.test.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const LEGACY = /from\s+["'][./]*(?:lib\/theme|components\/ui|components\/parts)["']/;
const SPINNER = /\bActivityIndicator\b/;
// Shrinks to [] by Task Z1. A lane that rebuilds a screen deletes its line.
export const LEGACY_ALLOWED = [
  "app/(app)/(tabs)/index.tsx",
  "app/(app)/(tabs)/activity.tsx",
  "app/(app)/(tabs)/budgets.tsx",
  "app/(app)/(tabs)/settings.tsx",
  "app/(app)/_layout.tsx",
  "app/(app)/accounts.tsx",
  "app/(app)/connected-banks.tsx",
  "app/(app)/delete-account.tsx",
  "app/(app)/diagnostics.tsx",
  "app/(app)/get-started.tsx",
  "app/(app)/map-accounts.tsx",
  "app/(app)/paywall.tsx",
  "app/(app)/transaction.tsx",
  "components/brand/controls.tsx",
  "components/parts.tsx",
  "components/ui.tsx",
  "lib/theme.ts",
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "node_modules" || n === "android" || n === "ios") return [];
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) && !/\.test\./.test(n) ? [p] : [];
  });
}

describe("one authoritative UI", () => {
  const all = [...files(join(ROOT, "app")), ...files(join(ROOT, "components")), ...files(join(ROOT, "lib"))];
  it("no new file imports the pre-redesign theme/ui/parts or uses a system spinner", () => {
    const offenders = all
      .map((p) => relative(ROOT, p).replace(/\\/g, "/"))
      .filter((rel) => !LEGACY_ALLOWED.includes(rel))
      .filter((rel) => {
        const src = readFileSync(join(ROOT, rel), "utf8");
        return LEGACY.test(src) || SPINNER.test(src);
      });
    expect(offenders).toEqual([]);
  });
  it("the allow-list only names files that still exist", () => {
    const rels = all.map((p) => relative(ROOT, p).replace(/\\/g, "/"));
    expect(LEGACY_ALLOWED.filter((f) => !rels.includes(f))).toEqual([]);
  });
});
```

- [ ] **Step 4:** `cd mobile && npx vitest run test/legacy-ui-guard.test.ts` → PASS; `npm run typecheck` → PASS; `npx expo-doctor` → all checks pass.
- [ ] **Step 5:** Rebuild the Android dev client once (`npx expo run:android --no-install` into an APK, installed only when the coordinator frees the emulator). Commit: `chore(mobile): phase 3 native deps and legacy-ui guard`.

### Task F2: Shared UI atoms (web `ui.tsx`, `page-header.tsx`, `hub-list.tsx`)

**Files:** Create `mobile/components/ui/{page-header,section-head,hub-list,icon-tile,badge,chevron,segmented-control,month-nav,empty-state,stage,select}.tsx` + `ui.test.tsx`; Modify `mobile/components/brand/controls.tsx` (remove `ActivityIndicator`; pending = web `Button` pending look).

| Native | Web source | Notes |
| --- | --- | --- |
| `PageHeader` (title, back, month, action, subtitle) | `src/components/page-header.tsx` `PageHeader`, `BackLink` | phone grid: title/action row, month on its own row (gap-y 16); `mb-5` |
| `SectionHead` (title, href, action) | `ui.tsx` `SectionHead` | sentence case |
| `HubSection`, `HubRow` | `hub-list.tsx` | `px-card px-rows`, `IconTile` + 15/24 medium label + 13/20 muted value + `Chevron` |
| `IconTile`, `CategoryIcon`, `categoryIcon()` | `ui.tsx` 323–378 | import `categoryIcon` mapping logic by moving it to a pure shared file `src/lib/brand/category-icon.ts` (design code, zero-pixel web change) |
| `Badge`, `Chevron`, `Stage`, `EmptyState` | `ui.tsx` 252, 380–417 | |
| `SegmentedControl` | `ui.tsx` 212 | selected chip solid ink, others stepped outline frames |
| `MonthNav` | `month-nav.tsx` | months from server `month`, `shiftMonth` only for navigation keys |
| `Select` / `Field` | `ui.tsx` `Select`, `fieldClass`, `labelClass`; `brand/controls.tsx` `Field` | native picker in a sheet with the web's field frame |

- [ ] **Step 1: Write failing tests** asserting geometry from the web classes, e.g.:

```tsx
// mobile/components/ui/ui.test.tsx (excerpt; host mocks from test/native-hosts.ts)
import { create } from "react-test-renderer";
import { HubRow } from "./hub-list";
import { textStyle } from "../../lib/brand/type";
it("HubRow is the web row: 40px tile, 16px gap, 15/24 label, chevron, testID", () => {
  const r = create(<HubRow testID="hub-goals" label="Savings goals" icon="goals" value="2 goals" onPress={() => {}} />);
  const row = r.root.findByProps({ testID: "hub-goals" });
  expect(row.props.style).toMatchObject({ flexDirection: "row", alignItems: "center", columnGap: 16, paddingVertical: 8 });
  // the label uses the TypeRoleName whose textStyle() is 15/24 Geist 500 (look the name up in src/lib/brand/tokens.ts)
  expect(textStyle(r.root.findByProps({ testID: "hub-goals-label" }).props.variant)).toMatchObject({ fontSize: 15, lineHeight: 24 });
});
```

- [ ] **Step 2:** Run `npx vitest run components/ui` → FAIL (modules missing).
- [ ] **Step 3:** Implement each atom from its web source, using only `components/brand/{PixelFrame,Text,Icon,Button}` and `ROLE`/`SPACE` tokens from `lib/brand/shared`. Every atom accepts `testID` and sets the same id the web gets in Task P2.
- [ ] **Step 4:** Tests PASS; `npm run typecheck` PASS.
- [ ] **Step 5:** Add every atom to `lib/brand/specimen.ts` so `budgts://dev/brand` shows them (parity capture of the atoms themselves). Commit `feat(mobile): shared UI atoms from the web components`.

### Task F3: App shell (header, bottom tabs, banners, realtime)

**Files:** Create `mobile/components/shell/{app-header,bottom-tabs,status-banners,screen}.tsx`, `mobile/lib/status/use-status.ts`, `mobile/lib/realtime/use-realtime-refresh.ts`; Modify `mobile/app/(app)/(tabs)/_layout.tsx`; register the `more` tab (`(tabs)/more.tsx`), whose content is Task C1, done by the same agent immediately after F3 so the two land together for Checkpoint 1; Delete `mobile/assets/brand/logo-mark.png`, `wordmark.png`.

**Interfaces:** Produces `<Screen header? scroll? onRefresh? skeleton?>` (safe areas, 24px gutter, `pb` above tabs, pull-to-refresh, page-enter), `useStatus(): { needsCategoryCount, review, deletionInProgress }`, `useRealtimeRefresh(tables: string[])`.

- [ ] **Step 1: Failing test** for the tab bar:

```tsx
// mobile/components/shell/bottom-tabs.test.tsx
import { TABS, activeTab } from "./bottom-tabs";
it("is the web's four tabs in the web's order", () => {
  expect(TABS.map((t) => [t.name, t.label, t.icon])).toEqual([
    ["index", "Home", "home"], ["budgets", "Budgets", "budgets"], ["activity", "Activity", "activity"], ["more", "More", "more"],
  ]);
});
it("keeps More lit for every screen reached through More (bottom-nav.tsx MORE)", () => {
  for (const p of ["/more", "/goals", "/accounts", "/insights", "/settings/profile", "/help/how-it-works", "/about", "/connected-banks"])
    expect(activeTab(p)).toBe("more");
});
```

- [ ] **Step 2:** FAIL. **Step 3:** Implement: `Tabs tabBar={(p) => <BottomTabs {...p} />}`; bar = surface fill, 2px `hairline` top, 4 equal columns, `pt-3 pb-2`, icon 24 + 13/16 label, active: red icon (`COLOR.signal`), ink semibold label, `pip` 16×4 accent marker at top −2 that snaps in (Reanimated `steps`), `Pressable` press scale 0.98 + `Haptics.selectionAsync()`. Bottom inset `max(4, insets.bottom)`. `AppHeader`: 56px, bg `bg/90`, `<Robin size={22}/>` + Dogica Bold wordmark at `Math.max(8, round(22*0.62/8)*8)`px (from `logo.tsx`), bell (web `needs-category-bell.tsx`) → Activity. `StatusBanners` renders the web deletion and review banners verbatim from `/api/mobile/status`. `useRealtimeRefresh` subscribes to `transactions` for the signed-in user and calls `invalidate()` debounced like `realtime-refresh-listener.tsx`.
- [ ] **Step 4:** Tests PASS; remove `(tabs)/_layout.tsx` from `LEGACY_ALLOWED` if listed. **Step 5:** Commit `feat(mobile): the web's header, four tabs, banners and realtime refresh`.

### Task F4: Motion + progress cells (web `.px-bar`, `reveal.tsx`, `rolling-amount.tsx`, `press`)

**Files:** Create `mobile/lib/ui/cells.ts` + test, `mobile/components/ui/progress-bar.tsx`, `mobile/components/motion/{reveal,rolling-amount,press,page-enter}.tsx` + tests.

**Interfaces:** `cellLayout(width: number, opts: { cellH?: number; gap?: number; share: number; minLit: 0|1; sweep: number }): { n: number; pitch: number; lit: number; shown: number; xs: number[] }`; `<ProgressBar pct tone start cellHeight cells testID>`; `<Reveal i>`; `<RollingAmount value currency>`.

- [ ] **Step 1: Failing test** (the CSS math, `globals.css` 353–380, as a pure function):

```ts
// mobile/lib/ui/cells.test.ts
import { cellLayout } from "./cells";
it("fits as many 8px cells with >=2px gaps as the bar holds, flush at both ends", () => {
  const l = cellLayout(342, { share: 0.5, minLit: 1, sweep: 1 });
  expect(l.n).toBe(Math.floor((342 + 2) / (8 + 2) + 1e-6)); // 34
  expect(l.pitch).toBeCloseTo((342 - 8) / (l.n - 1));
  expect(l.xs[l.n - 1] + 8).toBeCloseTo(342);
  expect(l.lit).toBe(17);
});
it("lights at least one cell once anything counts, none at zero", () => {
  expect(cellLayout(100, { share: 0.001, minLit: 1, sweep: 1 }).lit).toBe(1);
  expect(cellLayout(100, { share: 0, minLit: 0, sweep: 1 }).lit).toBe(0);
});
it("rounds half up like CSS round(nearest) and sweeps whole cells", () => {
  expect(cellLayout(90, { share: 0.5, minLit: 1, sweep: 1 }).lit).toBe(5); // n=9, 4.5 → 5
  expect(cellLayout(90, { share: 1, minLit: 1, sweep: 0.34 }).shown).toBe(4); // ceil(0.34*9)
});
```

- [ ] **Step 2:** FAIL. **Step 3:** Implement:

```ts
// mobile/lib/ui/cells.ts
export function cellLayout(width: number, o: { cellH?: number; gap?: number; share: number; minLit: 0 | 1; sweep: number }) {
  const h = o.cellH ?? 8, gap = o.gap ?? 2;
  const n = Math.max(1, Math.floor((width + gap) / (h + gap) + 0.000001));
  const pitch = (width - h) / Math.max(1, n - 1);
  const lit = Math.max(o.minLit, Math.floor(o.share * n + 0.5));
  const shown = Math.ceil(o.sweep * n);
  return { n, pitch, lit, shown, xs: Array.from({ length: n }, (_, i) => i * pitch) };
}
```

`ProgressBar` draws one `Svg` per bar (track cells, then lit cells), `x` snapped with `lib/brand/snap.ts` to whole device pixels, `shapeRendering="crispEdges"`; fill = `fill-under` / `pos` / `fill-over` tokens per `ui.tsx` 179. Sweep: shared value 0→1 over 352ms with `steps(n)`, delayed `start` steps; over-tone flashes twice when full (`cells-over`). `Reveal`: waits until on screen (`onLayout` + scroll position from `<Screen>` context), then plays children's cells/reels. `RollingAmount`: per-digit reels clipped to the digit ink band, left to right, ones and cents a full lap, then glide (web `rolling-amount.tsx` timings). All respect `useReducedMotion()` → rest frame.
- [ ] **Step 4:** PASS; add ProgressBar states to the specimen. **Step 5:** Commit `feat(mobile): progress cells, reveal, rolling figures`.

### Task F5: Loading, error, offline, not found

**Files:** Create `mobile/components/feedback/{skeleton,skeletons,error-state,offline-state}.tsx`, `mobile/app/+not-found.tsx`; Modify `mobile/app/_layout.tsx` (NetInfo offline state).

- [ ] Skeleton = web `.skeleton` block with its sweep (opacity/translate only). `skeletons.tsx` exports one skeleton per screen shaped like `(dashboard)/loading.tsx` (Home) and each screen's own lead card + list.
- [ ] `ErrorState` = `src/app/error.tsx` (copy, robin, Try again); `OfflineState` = `src/app/offline/page.tsx` (Stage, robin, Badge); not-found = `not-found-view.tsx`.
- [ ] Test: each renders the web's exact copy (import the strings; if copy lives inline in the web page, move it to a pure `*-copy.ts` beside the web page first, zero-pixel web change) and a Try again that calls the retry prop. Commit `feat(mobile): skeletons, error, offline and not-found states`.

### Task F6: Bottom sheet, row menu, keyboard-safe forms

**Files:** Create `mobile/components/ui/{overlay,row-menu,form-sheet}.tsx` + tests; Modify `mobile/lib/keyboard.ts` (reuse `scrollTargetAboveKeyboard`).

- [ ] `Overlay` = web `overlay.tsx` (title, close, stepped sheet frame, scrim) as RN `Modal` + Reanimated slide, Android back closes, focus trapped. `RowMenu` = `row-menu.tsx`. `FormSheet` = Overlay + `KeyboardAvoidingView behavior="padding"` on **both** platforms (Android edge-to-edge no longer resizes, roadmap Phase 3 checklist) + `ScrollView keyboardShouldPersistTaps="handled"` scrolling the focused field and the submit button above the keyboard.
- [ ] Test: with a mocked `keyboardDidShow` of 300px on a 640-high window, the submit button's bottom ≤ 340. Commit `feat(mobile): web sheets, row menu, keyboard-safe forms`.

### Task F7: Cell charts (web `spending-overview.tsx`)

**Files:** Create `mobile/components/charts/{spending-trend-card,spending-breakdown-card}.tsx` + tests.
- [ ] Port `SpendingTrendCard` and `SpendingBreakdownCard` markup as SVG cells; `sharesOf` is imported from a pure module (move `sharesOf` out of the `.tsx` into `src/lib/brand/shares.ts` only if it is presentation math; it is: the share of already-server-computed amounts for drawing). Inputs are `MobileSpendingCards` from `/api/mobile/home` and `/api/mobile/insights`. Stepped `cell-in` per column, tags `pop` after their column.
- [ ] Commit `feat(mobile): the web's cell charts`.

**Checkpoint 1 (owner sees on the emulator, end of Wave 0 + C1):** new header with Crystal and the Dogica wordmark, the web's four tabs with pixel icons, the More hub and Settings hub, skeletons instead of spinners.

---

## Parity tooling lane (P) — parallel with Wave 0; owner: a second agent (web/tools; the native bits in P4 go to `budgts-architect`)

Exists today: `tools/screenshot.mjs` (single-page PNG), `playwright.config.ts` (Desktop Chrome only), `tests/e2e/helpers/test-user.ts` (admin user create + `magicTokenHash`), `tests/e2e/helpers/onboard.ts`, `mobile/.maestro/flows/*` (6 flows, never run; Maestro CLI not installed on this machine), `mobile/app/dev/brand.tsx` (specimen), `tools/db/target-safety.ts` (refuses non-staging), the sandbox-only Plaid seed route (`PLAID_TEST_SEED_ENABLED`), `tests/e2e/mobile-data-api.spec.ts` (web-vs-API number parity). New: everything under `tools/parity/`, the web harness route, `data-testid`s, pixelmatch/pngjs.

### Task P1: Seeded staging parity users (`tools/parity/seed.ts`)

- [ ] Refuse unless the target ref is `uvowywszaiojboaxdmoz` (reuse `tools/db/target-safety.ts`); read `.env.staging` only.
- [ ] Users (emails `parity+<name>@budgts.test`, deleted and recreated each run, disposable): `firstrun` (no currency), `tour` (onboarded, `tour_seen_at` null), `empty` (onboarded, tour seen, nothing else), `full`, `over`, `banks` (Plaid Sandbox item via the sandbox seed route: connected, one needing review, needs-category rows, limited history), `deleting` (deletion lock set, read-only banner).
- [ ] Data design for `full`/`over` (USD, `America/New_York`, fixed): 3 manual accounts (Everyday checking, Travel card, Rainy-day savings); the standard category seed; budgets on 6 categories for the current month; 42 transactions this month + 5 prior months (trend chart) on fixed day-of-month offsets relative to the user's current month, fixed cent amounts, including a refund, a transfer pair, income on the 1st and 15th, one 40-character merchant; 2 goals (one near target, one `$1,234,567.89` target for the figure-size step-down); `over` pushes Dining out to 130% and Groceries to 92%.
- [ ] All writes go through the app's own shared commands as the signed-in user (a Supabase session minted with `magicTokenHash`), never raw inserts into financial tables: no financial logic duplicated, RLS applies.
- [ ] Output `.tmp/parity/users.json` (email → token_hash for sign-in on both sides). Test: `tools/parity/seed.test.ts` checks the target guard refuses a non-staging ref.

### Task P2: Web test ids + harness (zero-pixel web change)

- [ ] Add `data-testid` to the web's shared components (PageHeader, SectionHead, HubRow, BottomNav items, ProgressBar, cards, list rows, sheets, figures) with the same ids the native atoms use; list them in `tools/parity/screens.ts` (screen → route, native deep link, states, ids).
- [ ] `src/app/parity-harness/[state]/page.tsx`: renders `(dashboard)/loading.tsx`, `error.tsx`, `not-found-view.tsx` for capture; `notFound()` unless `process.env.PARITY_HARNESS === "1"` (never set in Vercel).
- [ ] Prove zero pixels changed: capture every screen before/after with P3 and diff = 0. Commit `test(web): parity test ids and a dev-only state harness`.

### Task P3: Web reference captures (`tools/parity/capture-web.ts`)

- [ ] Run the web from the Phase 3 worktree with `.env.staging` on port **3100** (never 3000; own `.next`, local bench traps), `PARITY_HARNESS=1`.
- [ ] Playwright contexts: Android 412×915 @2.625 (primary, matches the emulator), iPhone 390×844 @3 (for when iOS is reachable); `reducedMotion: "reduce"` set 1 (motion-off rest frames); set 2 motion frozen: `page.clock.install()` and `document.getAnimations().forEach(a => { a.pause(); a.currentTime = T; })` at the per-screen `T` in `screens.ts`.
- [ ] Per screen × state: `web/<device>/<screen>-<state>.png` + `web/<device>/<screen>-<state>.json` (`[data-testid]` → boundingBox in CSS px). Before the first run, capture the main folder's live-equivalent build once and diff it against the Phase 3 worktree build: must be 0 (proves the reference is the approved PWA).

### Task P4: Native captures (`tools/parity/capture-native.ts`, `mobile/lib/dev/fault.ts`, `mobile/lib/motion/parity-clock.ts`)

- [ ] Install Maestro CLI (free; Java 17 is present). One AVD `parity-412` (1080×2400, 420dpi → 412×915dp). The emulator is shared: a lock file `.tmp/parity/emulator.lock` serialises lanes.
- [ ] Dev build points at the local web: `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3100` (Android host alias), Metro on 8082+ (never 8081).
- [ ] Deep links per screen (`budgts://budgets`, …) and `__DEV__`-only params: `?fail=<endpoint>` (authFetch returns 503 for that path → error state), `?hold=<endpoint>` (request never resolves → skeleton), `?clock=<ms>` (ParityClock provider pins every Reanimated timeline / `useSteppedClock` to `ms`). All three compile out of release (`if (!__DEV__) return`), with a unit test proving they are inert when `__DEV__` is false.
- [ ] Reduce motion on: `adb shell settings put global transition_animation_scale 0` etc. (RN reports reduce motion) for set 1; offline: `adb shell cmd connectivity airplane-mode enable`.
- [ ] Maestro flow `tools/parity/capture.yaml`: open the sign-in deep link with the user's token_hash, open the screen link, `takeScreenshot`, then `maestro hierarchy` → JSON (Android `resource-id` = RN `testID`, bounds in px ÷ density = dp).

### Task P5: Compare + report (`tools/parity/compare.ts`)

- [ ] Crop: native to the `testID="screen-root"` rect (excludes status bar and gesture inset); web to the same logical rect.
- [ ] Geometry: every id present on both sides; |Δx|,|Δy|,|Δw|,|Δh| ≤ 1pt. Missing id on either side = fail.
- [ ] Colours: for ids tagged in `screens.ts` with a token role, the centre pixel equals the token hex exactly.
- [ ] Pixels: `pixelmatch` (threshold 0.1) on the cropped images; fail above `budgets.json[screen][state]` (start 0.6% of pixels; text anti-aliasing differs between Chrome and Android Skia, so 0 is not reachable; lowering a budget is allowed, raising one needs the reviewer's sign-off in the commit note).
- [ ] Output `.tmp/parity/report.html` (web | native | diff per screen/state, geometry table) and a non-zero exit on any breach. `npm run parity -- --screen home` runs P3+P4+P5 for one screen.

---

## Wave 1 — Parallel lanes (start when F1–F4 are merged into `phase-m/phase3`; F5–F7 land during Wave 1, lanes pick them up by rebasing)

Lane rules: each lane owns only the files listed; shared atoms change only through a small PR to `phase-m/phase3` reviewed by the Foundation owner; each lane removes its files from `LEGACY_ALLOWED`; each lane owns its Maestro flows under `mobile/.maestro/flows/<lane>-*.yaml`.

### Lane A — First run (owner sees first). Owns `app/(app)/onboarding.tsx`, `app/(app)/tour.tsx`, `app/(app)/_layout.tsx` (gate), `components/tour/**`, `components/brand/robin.tsx` motion, `app/sign-in.tsx` motion only, `lib/profile/*` (tourSeen parse).

- **A1 Onboarding cards** ← `onboarding-wizard-content.tsx`, `components/tour/{tour-card,tour-wizard,guide-copy}`: cards crystal → welcome → auto-capture → currency (step ids from `/api/mobile/tour?phase=onboarding`), progress cells continuous across onboarding + tour (`totalVisible`), currency set once via the existing `chooseCurrency`. Import `guide-copy.ts` directly (shared copy, no retyping). Delete `get-started.tsx`.
- **A2 Welcome guide** ← `tour-wizard-content.tsx`: cards bank → auto-sort → money-left → plan → done from `/api/mobile/tour`; Skip and the last card `POST /api/mobile/tour`; the **bank card runs native Plaid Link** through the existing `lib/plaid/link-flow.ts` and shows the web's mapping sheet (E1's `AccountMappingSheet`; until E1 lands, A2 consumes it from E1's first commit, E1 does that component first).
- **A3 Gate** ← `firstRunRedirect` (`src/lib/tour/gate.ts`, imported, not copied): `(app)/_layout.tsx` routes not onboarded → onboarding, not tourSeen → tour, else tabs; tour replay from More opens `tour` with intro cards. Tests: the three branches + failed profile load shows `ErrorState` with retry (never guesses "seen").
- **A4 Scenes** ← `components/tour/scenes.tsx` + `guide.module.css`: each scene acts out its feature (Crystal drops in, purchases land, "?" flips to its category, Money Left counts up, a saving lands on a goal, confetti + the four tabs); card enters from the direction of travel, heading rises word by word. Resting state = finished state (motion off). Heaviest motion item: build static rest frames first (Checkpoint 2), motion second.
- **A5 Robin + sign-in stage motion**: blink (single then double every 4.8s), chirp every 4s, hop; sign-in stage 8s beat, "+$", wordmark ripple, typed savings ticker (`BRAND_GUIDELINES` Motion table). Reused by header logo, More, About, Help.
- Maestro: `first-run.yaml` (fresh user → cards → currency → tour skip → Home), `tour-replay.yaml`.

### Lane B — Home. Owns `app/(app)/(tabs)/index.tsx`, `components/home/**`, `components/crystal/**`, `lib/home/*` (view mapping only).

- **B1 Layout + figures** ← `dashboard-view.tsx`: Greeting (`local-time.tsx` `Greeting`, name from profile, "today" from server), MonthNav, Money left hero (`RollingAmount`, `figureSize` step-down, savings rate line), Add income (`income-tile.tsx`), BudgetOverAlert, "Where it went" rows + category chips, Savings, Recent activity, Add transaction button (opens D2's sheet), `Reveal` cascade indices as on the web. Data: `MobileHome` only.
- **B2 CrystalPerch** ← `crystal-perch.tsx` + `src/lib/crystal/roam.ts` (imported): flutter-down landing (`wingUp`), squash + dust, hi + month note (`crystalLines`/`crystalCheers`: move these two pure functions from the `.tsx` into `src/lib/crystal/lines.ts`, zero-pixel web change), roam 2–4 hops of 36px, 4.5–8.5s rests, pecks, turn at ends, "+$" while saving, cheers at most every 8s, tap: jump/flap/chirp/hearts/sparkles + next line, bubble toward card middle, pauses off-screen / app backgrounded, motion off = sits middle with note. One Reanimated worklet timeline driven by `useSteppedClock`, no JS-thread timers per frame.
- **B3 Setup + charts**: "Get set up" steps (Connect your bank → tour/Connected banks, Add this month's income, Give categories a budget), "Spending · 6 months" + "Where your money goes" (F7).
- **B4 States**: skeleton (Home `loading.tsx` shape), empty, full, over, error, offline; pull-to-refresh; realtime refresh.
- Maestro: `home.yaml` (month nav, tap Crystal, open over-budget alert → Budgets).

### Lane C — Hubs, settings, help. Owns `app/(app)/(tabs)/more.tsx`, `app/(app)/settings/**`, `app/(app)/help/**`, `app/(app)/about.tsx`, `app/account-deleted.tsx`, `components/settings/**`.

- **C1 More + Settings hubs** ← `more/page.tsx`, `settings/page.tsx`: More = Play welcome guide card (robin tile, accent play tile), Your money, Banks & settings, Help, footer robin + Track : Plan : Grow; counts from `/api/mobile/hub`. Settings = Your account / Your money / Data (Export CSV via `/api/mobile/export/transactions` → file → share sheet) / Connected banks / App / Sign out (danger button). Delete `(tabs)/settings.tsx`, `diagnostics.tsx`, `paywall.tsx`. (Front-loaded: lands right after F3 for Checkpoint 1.)
- **C2 Profile, Security, Appearance** ← their pages: email + CopyButton (expo-clipboard), currency, time zone, sign-in methods (`/api/mobile/profile`); Security static copy; Appearance Light Active, "Dark mode isn't available yet."
- **C3 Categories** ← `category-manager.tsx`, `category-form.tsx` over `/api/mobile/settings/categories` + `/api/mobile/categories/[id]`; form in `FormSheet`.
- **C4 Help, How Budgts works, About** ← `help/page.tsx`, `help/how-it-works/page.tsx`, `about/page.tsx`; legal rows open the web legal pages in `expo-web-browser` via `useLegalLinks` (they stay on budgts.com after §13a).
- **C5 Delete account + account deleted** ← `delete-account-flow.tsx` (explain, fresh sign-in after 10 minutes, type DELETE, progress, every failure with a way out), `account-deleted/page.tsx`; sentence-case "Connected banks" (Stage 1 follow-up). Existing `lib/account/delete-account.ts` kept.
- Maestro: `settings.yaml`, `delete-account.yaml` (disposable seed user only), `export.yaml`.

### Lane D — Money screens (two agents: D-1 Activity, D-2 Budgets/Goals/Insights). Owns `app/(app)/(tabs)/activity.tsx`, `components/activity/**`, `lib/transactions/*` (view only) | `app/(app)/(tabs)/budgets.tsx`, `app/(app)/goals.tsx`, `app/(app)/insights.tsx`, `components/{budgets,goals,insights}/**`.

- **D1 Activity list** ← `transactions/page.tsx`, `transaction-list.tsx`: MonthNav, search, All/Spending/Income/Transfers segmented control (client filter over loaded pages exactly as the web: search + kind across every row), day groups with `RelativeDay`, row menu (edit, delete), ConnectBank card, LimitedHistoryBanner and NeedsCategory groups from `/api/mobile/activity`, keyset paging with a skeleton row footer.
- **D2 Add / edit sheet** ← `add-transaction.tsx`, `transaction-form.tsx`: `FormSheet`, existing `lib/transactions/form.ts` validation and idempotent request id kept; delete `app/(app)/transaction.tsx`. Keyboard on both platforms (Review Focus 4).
- **D3 Needs a category** ← `plaid/needs-category.tsx`: categorize a merchant group via `/api/mobile/transactions/[id]/categorize`; rescan.
- **D4 Budgets** ← `budgets-view.tsx`, `copy-budgets.tsx`: hero with 12px cells, This month / All time, rows with cascading cells (`start = index*2`), detail sheet with the category's transactions, New budget sheet, Copy budgets; `/api/mobile/budgets`, `/budgets/copy`.
- **D5 Goals** ← `goals-view.tsx`, `goal-form.tsx`, `contribution-form.tsx`: row menu, add money sheet, growth-tone cells.
- **D6 Insights** ← `insights/page.tsx`, `insights-view.tsx`: MonthNav, charts (F7), income sources, idea lamp motion.
- Maestro: `add-transaction.yaml`, `edit-transaction.yaml`, `categorize.yaml`, `budget.yaml`, `goal-contribution.yaml`.

### Lane E — Banks and accounts. Owns `app/(app)/connected-banks.tsx`, `app/(app)/accounts.tsx`, `components/banks/**`, `lib/plaid/*` UI glue (not the pipeline).

- **E1 Connected banks** ← `plaid/bank-connections.tsx`, `connected-banks.tsx`, `account-mapping.tsx`, `reconnect-button.tsx`, `connect-bank.tsx`: first commit is `AccountMappingSheet` (A2 consumes it); status per bank, reconnect via native Link update mode, disconnect confirm sheet (history kept, per product rules), importing / exclude / review toggles over `/api/mobile/plaid/*`. Delete `map-accounts.tsx`.
- **E2 Accounts** ← `account-manager.tsx`: groups by bank, by hand, archived (`/api/mobile/accounts/overview`), add / rename / archive in sheets.
- **E3 OAuth return** on Android (`PLAID_NATIVE_OAUTH_REDIRECT_URI`, app link) with a Sandbox OAuth institution; iOS deferred (see Risks).
- Maestro: `connect-bank.yaml` (Sandbox, launches Link and returns), `accounts.yaml`.

### Task Z1: Close-out (serial, after all lanes)

- [ ] `LEGACY_ALLOWED` is `[]`; delete `mobile/lib/theme.ts`, `components/ui.tsx`, `components/parts.tsx`, `assets/favicon.png` if unused; guard test keeps `SPINNER` + `LEGACY` rules forever.
- [ ] Full suite: root `npm run lint`, `typecheck`, `test`, `build`; `npm run test:e2e` against staging for the mobile API specs; `mobile` `typecheck` + `test`; `expo-doctor`; every Maestro flow on the emulator; `npm run parity` for all screens × states green.
- [ ] Docs: `mobile/README.md`, `docs/roadmap.md` Phase 3 row, `docs/workflow.md`, `docs/BRAND_GUIDELINES.md` native table (new component map), `mobile/.maestro/README.md`.

---

## Per-screen definition of done (every task in Lanes A–E)

1. `npm run parity -- --screen <id>` green on Android 412×915 for every state that screen has (empty, full, over budget, loading, error, offline, first run where applicable), both motion-off and frozen-time sets; `report.html` attached to the commit note.
2. Component tests (Vitest + react-test-renderer host mocks, the existing `mobile/test/native-hosts.ts` pattern) for every stateful piece; `testID`s match the web's `data-testid`s.
3. A Maestro flow for the screen's journey, passing on the emulator.
4. Number parity: the screen's figures come from one `/api/mobile/*` payload; `tests/e2e/mobile-data-api.spec.ts` covers that endpoint against the web view for the `full` and `over` users.
5. Scorecard /10 (visual parity, functional correctness, motion fidelity, performance: no dropped frames in the Perf Monitor while Crystal/cells run, accessibility: TalkBack labels + 44pt targets + contrast, premium polish), first and final recorded; iterate to 9.5 on every criterion.
6. Independent review by a fresh `budgts-architect` agent that did not build it (reads web source + report + scorecard); findings 🔴/🟡 fixed before merge into `phase-m/phase3`.
7. Guard test green (the lane's files removed from `LEGACY_ALLOWED`), `typecheck`, `test`, local commit.

---

## Order, checkpoints and lanes

| When (working days, agent time) | Serial / parallel | Owner sees on the emulator |
| --- | --- | --- |
| Day 0.5–1.5 | F1–F4 (1 agent) ‖ P1–P2 (1 agent) ‖ C1 hubs right after F3 | **Checkpoint 1:** new header, four web tabs, More + Settings hubs, skeletons |
| Day 1.5–3.5 | Lanes A, B, C, D-1, D-2, E in parallel (6 agents) ‖ P3–P5 + F5–F7 | **Checkpoint 2 (~day 3):** Get Started cards, welcome guide (rest frames), Home with rolling Money Left and cells |
| Day 3.5–6 | Lanes continue; parity runs per screen as tooling lands | **Checkpoint 3 (~day 6):** every screen in the new design, Crystal roaming, tour scenes animated |
| Day 6–9 | Iteration to 9.5, independent reviews, Z1 | **Checkpoint 4:** parity green on Android, scorecards 9.5+ |

Front-loading: C1 (More/Settings hubs) and the Home static layout (B1 without B2) are the fastest visible wins and go first inside their lanes. The emulator is a single shared resource: lanes develop against unit tests and their own Metro port, and take the `.tmp/parity/emulator.lock` for device runs.

## Effort estimate (honest, agent working time, including the 9.5 iteration)

| Lane | Build | Parity + iteration + review | Total |
| --- | --- | --- | --- |
| F Foundation (F1–F7) | 1.5 d | 0.5 d | **2 d** |
| P Parity tooling (P1–P5) | 1.5 d | 0.5 d (flake-proofing captures) | **2 d** |
| A First run (tour scenes are the biggest motion port) | 2 d | 1 d | **3 d** |
| B Home (CrystalPerch 366 lines of behaviour) | 2 d | 1 d | **3 d** |
| C Hubs, settings, help, delete | 2 d | 0.5 d | **2.5 d** |
| D-1 Activity + sheet + needs-category | 1.5 d | 0.5 d | **2 d** |
| D-2 Budgets, Goals, Insights | 2 d | 0.5 d | **2.5 d** |
| E Banks + accounts (+ Sandbox device runs) | 1.5 d | 0.5 d | **2 d** |
| Z1 close-out | | | **0.5 d** |
| iOS parity (blocked, see Risks) | | | **+2–3 d later** |

Calendar with six parallel lanes: about **8–10 working days** to Android parity at 9.5; first visible change on the emulator in about **1 day**. The long poles are Crystal (B2), the tour scenes (A4) and getting the pixel budgets to hold across Chrome vs Skia text rendering.

## Risks

- 🔴 **Base not ready:** `phase-m/stage2` integration is mid-merge (conflict in `docs/roadmap.md` at planning time). Phase 3 cannot branch until it is committed and green.
- 🔴 **Staging API for the device:** the dev build must reach the 2B endpoints. Plan uses the local web on port 3100 with `.env.staging` (`10.0.2.2:3100`), no push needed; the staging Vercel deployment lacks 2B until the owner approves a push.
- 🟡 **Reanimated performance:** Crystal, cells sweeps and reels on many rows at once. Mitigation: one SVG per bar, worklet-driven stepped clocks (`useSteppedClock`), no per-frame JS, pause off-screen/background; measure on a low-end AVD (API 30, 2GB) as part of the performance score.
- 🟡 **SVG crispness:** fractional dp at 2.625 density blurs cells and pixel frames. Mitigation: every rect through `lib/brand/snap.ts`, `crispEdges`, cell x positions snapped per device pixel (tested in F4).
- 🟡 **Fonts:** Dogica must stay on its 8px grid and Geist tabular figures must match Chrome's metrics; Android adds font padding. Mitigation: `includeFontPadding: false`, `textStyle()` from 2A, geometry check on every text id.
- 🟡 **Text rendering differences** (Chrome vs Skia anti-aliasing, kerning) make a 0-pixel diff impossible; per-screen budgets must be tight enough to catch layout drift. Geometry ±1pt is the real gate.
- 🟡 **Native Plaid Link and OAuth return:** Sandbox OAuth institutions on Android need the app link verified (`ANDROID_CERT_SHA256` for the dev keystore on staging). iOS OAuth waits for the Apple account and a real device.
- 🟡 **iOS while Apple enrollment is pending** (D-U-N-S secured; enrollment is the owner's next step): no Mac on this machine, so no iOS Simulator captures, no Sign in with Apple test, no TestFlight. Android parity first; iOS 390×844@3 captures need a Mac (or a paid cloud Mac, needs owner approval). Layout code is platform-neutral; platform-specific risks (keyboard, safe areas, swipe-back) are listed for the iOS pass.
- 🟡 **Keyboard on both platforms:** Android edge-to-edge no longer resizes the window; every text field lives in `FormSheet`/`Screen` with padding on both platforms, tested on a 360×640 AVD (roadmap Phase 3 checklist, `transaction.tsx` pads iOS only today).
- 🟡 **Dev client rebuilds:** adding native modules mid-phase costs a rebuild and stalls every lane; F1 adds them all at once.
- 🟢 **Shared emulator contention:** six lanes, one emulator; the lock file serialises device runs.

## Conflicts flagged (not silently resolved)

- Spec §15a names "React Native Testing Library component tests"; the app's established harness is Vitest + react-test-renderer host mocks (`mobile/test/native-hosts.ts`, Stage 2A). This plan keeps the existing harness (no new major dependency); switch only if the owner wants RNTL specifically.
- `get-started.tsx`'s doc comment cites "Get Started with no forced tour" as the approved direction; the owner's 2026-09-30 rule (the PWA is approved: onboarding → welcome guide) supersedes it. The spec §7 already lists "onboarding and the welcome guide" for mobile v1.
- The PWA's More page has "Install app" (`install-app.tsx`); it is a PWA install prompt with no native meaning and is omitted natively.
- Paywall / subscription UI is native-only by design (spec §9, Phase 4) and is removed from Phase 3 so the app matches the PWA until Phase 4 builds it in this design.

---

## Wave 0 as built: shared contracts (for the lanes and the parity agent)

Deviations from the plan text above, decided while building (the plan's intent is unchanged):

- **Atoms live in `mobile/components/kit/`**, not `components/ui/`: a `components/ui/` folder beside the legacy `components/ui.tsx` makes `../components/ui` ambiguous to the resolver and to the legacy guard. `IconTile` stays in `components/brand/controls.tsx` (now sized); `categoryIcon` moved to `src/lib/brand/category-icon.ts`, shared with the web.
- **`Select` moves from F2 to F6** (it opens in the sheet F6 builds).
- **Motion uses Reanimated 4 CSS animations** (`animationName` keyframes, `animationDuration`, `steps(n, "jump-end")` for the web's `steps(n, end)`), a direct port of the web's `@keyframes`; `useReducedMotion()` drops the animation and leaves the rest frame. The test host mock returns `steps()` as `{ steps, modifier }`.
- **Routes:** each tab is a route group with its own stack under the shared header: `app/(app)/(tabs)/(home)/index.tsx` → `/`, `(budgets)/budgets.tsx` → `/budgets`, `(activity)/activity.tsx` → `/activity`, `(more)/more.tsx` → `/more`. Screens reached through More live in `(more)/` (`settings/index.tsx` → `/settings`, `accounts.tsx`, `connected-banks.tsx`; later `settings/profile.tsx`, `goals.tsx`, `insights.tsx`, `help/…`, `about.tsx`), so More stays lit. Modals (`transaction`, `map-accounts`) and full-screen flows (`delete-account`, onboarding, tour) stay in `app/(app)/`.
- **Every tab screen renders its body in `<Screen>`** (`components/shell/screen.tsx`): banners, 24px gutter, 8px top, the web's 112px bottom clearance minus the bar, pull to refresh. The header comes from the stack (`components/shell/tab-stack.tsx`).
- **Button pending state** is the web's (disabled frame, muted label; pass the pending label), never a spinner.

Test ids the parity tool can match (web `data-testid` of the same name to be added by P2):

| id | what |
| --- | --- |
| `screen-root` | the scrolling body of every signed-in screen (crop rect) and of `+not-found` |
| `app-header`, `header-home`, `needs-category-bell`, `needs-category-count` | header, lockup, bell, bell badge |
| `bottom-tabs`, `tab-home`, `tab-budgets`, `tab-activity`, `tab-more`, `tab-pip` | tab bar, tabs, active marker |
| `status-banners`, `deletion-banner`, `review-excluded`, `review-advisory` | banners |
| `page-header`, `page-header-title`, `page-back` | page header |
| `month-nav`, `month-nav-label`, `month-nav-prev`, `month-nav-next` | month switcher |
| `segmented`, `segmented-<value>` | segmented control (screens pass their own id) |
| `more-view`, `more-play-guide`, `more-goals`, `more-accounts`, `more-insights`, `more-banks`, `more-settings`, `more-help`, `more-about` | More |
| `settings-view`, `settings-profile`, `settings-security`, `settings-delete-account`, `settings-categories`, `settings-budgets`, `settings-goals`, `settings-connected-banks`, `settings-accounts`, `settings-appearance`, `settings-help`, `settings-about`, `settings-export`, `settings-export-button`, `settings-sign-out` | Settings |
| `<row-id>-label`, `<row-id>-value` | a hub row's label and value |
| `not-found`, `not-found-home`, `not-found-help` | not found |

Native deep links for captures (Expo Router paths): `budgts:///`, `budgts:///budgets`, `budgts:///activity`, `budgts:///more`, `budgts:///settings`, `budgts:///accounts`, `budgts:///connected-banks`. The dev-only `?fail=`, `?hold=` and `?clock=` hooks (P4) land with F5 (`mobile/lib/dev/fault.ts`) and F4 (`mobile/lib/motion/parity-clock.ts`).

### F4 as built (the lanes' motion API)

- `components/kit/progress-bar.tsx` `<ProgressBar pct tone="under|near|over|growth" start cellHeight cells testID>`: geometry `lib/ui/cells.ts` (`cellLayout`, `cellsPath`), one SVG per bar; the sweep is a `steps(n, "jump-start")` width animation on a clip window whose every step edge falls in a gap (tested), the over flash is `cell-alarm` on `steps(1)`.
- `components/motion/reveal.tsx` `<Reveal i style testID>` and `usePlay()`: a block below the fold waits (opacity 0, descendants' entrances off) until it is 10% up the screen, then rises in 640ms. Any new animated component must read `usePlay()` and `useReducedMotion()`.
- `components/motion/rolling-amount.tsx` `<RollingAmount value currency variant color testID>`: per-digit reels clipped to the digits' ink band (Geist) or line box (Dogica), spin-in 1.4s at 45ms a column after 120ms, later values glide 900ms.
- `lib/motion/css.ts`: `EASE_OUT`, `PAGE_ENTER`, `RISE_IN`, `CELL_ALARM` and the delay helpers, straight from `globals.css`.
- `lib/motion/parity-clock.tsx` (P4 hook): development builds read `?clock=<ms>` in the root layout; `useMotionTiming(delayMs)` returns `animationDelay` + `animationPlayState`, paused at the frozen instant. Every animation must take its delay from `useMotionTiming`.
- `<Screen>` makes its header translucent (`bg` at 90%, the web's `bg-bg/90`) with the content scrolling under it, and plays `page-enter` on arrival; Android stack transitions are off (the web has none), iOS keeps its slide for swipe-back. The web's `backdrop-blur-xl` is not reproduced: it needs `expo-blur` (a native module, one more dev-client rebuild). Decision deferred to the Home parity check.

### F5 as built (loading, failure, dev faults)

- `components/feedback/skeleton.tsx`: `<Skeleton width height>` (the web's `.skeleton` sweep, still under Reduce Motion) and `<ScreenSkeleton>`, the web's one `(dashboard)/loading.tsx` shape. The web has a single loading shape for every dashboard page, so every signed-in screen uses `<ScreenSkeleton>` inside `<Screen>` while its data loads; no per-screen skeletons.
- `components/feedback/states.tsx`: `<ErrorState onRetry onHome>` (web `error.tsx`), `<OfflineState onRetry>` (web `offline/page.tsx`, retries by itself on a NetInfo offline→online change), and `<LoadFailure kind onRetry onHome onSignOut>`, which every screen renders for a failed `LoadState`: `network` → offline, `auth` → signs out (the web redirects to sign-in), anything else → error. Deviation: natively these render inside `<Screen>`, so the header and tabs stay, one more exit; the web's error page replaces the whole layout.
- Dev-only faults (P4): `lib/dev/fault.ts`, applied in `authFetch`. The root layout reads `?fail=<endpoint>` (503), `?fail=<endpoint>:offline` (dropped connection) and `?hold=<endpoint>` (never answers → skeleton); `<endpoint>` matches `/api/mobile/<endpoint>` and below. Inert in release builds (tested).
- `expo-blur` is in `package.json` (`9f40aec`) but not imported until the post-F7 dev-client rebuild; the header stays at a solid 90% until then.

### F6 as built (sheets, menus, forms)

- `components/kit/overlay.tsx` `<Overlay title onClose testID>`: the web's bottom sheet (ink scrim at 40%, `px-card-raised`, pixel title, square close, at most 90% of the screen, scrolls inside), rising 32px over 300ms. Closes on the scrim, the close button and Android back. **It is the one form sheet** (no separate FormSheet): `KeyboardAvoidingView` padding on both platforms, and a focused field scrolls itself `KEYBOARD_MARGIN` above the keyboard through `useSheetFocus()`, which the brand `Field` and the kit `Select` already call. Lanes put every form in an `<Overlay>` and use `Field` / `Select`; nothing else is needed for the keyboard.
- `components/kit/row-menu.tsx` `<RowMenu label items testID>`: the kebab (40px) opens the web's lifted menu under it, right-aligned, `pop-in` on steps(3); closes on a pick, outside press or back. Item ids: `<testID>-<label-slug>`.
- `components/kit/select.tsx` `<Select label value options onChange placeholder invalid disabled testID>`: the web's framed select; opens a sheet of options (`<testID>-option-<value>`), the chosen one ticked.
- The test setup now mocks `react-native-safe-area-context` for every test (insets 0; a test can mock it itself).

### D1 as built (Activity: the route contract other lanes link to)

- **Route:** `/activity` (`app/(app)/(tabs)/(activity)/activity.tsx`), params `m` (`YYYY-MM`) and `category` (category uuid), the web's `/transactions?m=&category=`. Link with `router.push({ pathname: "/activity", params: { m, category } })`; either may be omitted (no `m` = the user's current month from `/api/mobile/profile`). An invalid value is ignored, as on the web.
- **Category:** narrows the rows server-side (`GET /api/mobile/transactions?category=`), shows the web's "Showing <name> · Clear" band (`category-band`, `category-band-clear`), hides the connect prompt; Clear drops only `category`. Search and the All / Spending / Income / Transfers control apply on top, as on the web.
- **Rows:** every page of the month is read (keyset, 100 a page, first page shown at once) so search, kind and each day's net cover every row like the web's `fetchAllRows`; rendering is sliced 60 at a time with the web's "Show N more" (auto within 600px of the bottom).
- **Test ids (native; web `data-testid`s to add in P2):** `activity-view`, `activity-add`, `activity-search`, `segmented` / `segmented-<kind>`, `activity-list`, `txn-day`, `txn-day-label`, `txn-day-total`, `txn-row`, `txn-title`, `txn-meta`, `txn-amount`, `show-more-rows`, `activity-empty`, `activity-no-match`, `connect-bank-card`, `connect-bank`, `category-band`, `limited-history-banner`, `needs-category`, `needs-category-title`, `needs-category-total`, `needs-category-group`, `needs-category-label`, `needs-category-more`.
- **Web behaviour kept over the plan text:** a row opens the web's "Transaction" detail sheet (Edit, Mark as transfer), not a row menu; day bands read "Tue, Sep 29" (the web list's `dayLabel`), not `RelativeDay`.
