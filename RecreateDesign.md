# Recreate Design — working guide

Not a product doc — a scratch log of what was asked for in this redesign
session and the step-by-step plan being executed against it. The actual
brand source of truth is `docs/BRAND_GUIDELINES.md` once written; this file
just tracks the instructions and progress so the work doesn't drift.

## What was asked (in order)

1. Don't like how `docs/specs/2026-09-13-ui-redesign-brand-guidelines-spec.md`
   was implemented. Study **`Budgts Reference V2.png`** and make the UI look
   *exactly the same or similar* to it.
2. Create a **new branding guidelines `.md` file** — the highest truth for
   branding going forward.
3. **`Assets V2.svg`** supplies the logo + font only — never treat it as a
   branding-guidelines source.
4. UI, UI guidelines, branding guidelines and overall style all come from
   **`Budgts Reference V2.png`**.
5. Replace the `.md` files connected to the old design; remove old branding
   folders/photos that are no longer used.
6. Once done: implement it, then commit and push to production
   (`budgts.com`).
7. Also use the `/frontend-design:frontend-design` skill while doing this.
8. Clarified via questions (answers given):
   - A third file, `Branding guidelines V2.png`, was found alongside
     `Assets V2.svg` — **not used**. Colors/type are derived only from
     `Budgts Reference V2.png` (cross-checked against `Assets V2.svg` only
     for the logo lockup and the Poppins typeface, per point 3).
   - Bottom navigation: **keep the current 4-tab nav** (Home, Budgets,
     Activity, More) — do not switch to the brand sheet's 5-icon
     Home/Insights/Add/Goals/Settings nav.
   - Scope: **full app now** — restyle every existing screen with the new
     system, not just the 4 screens the reference depicts.
   - Deploy path: **merge straight to `main` and push** (Vercel
     auto-deploys `budgts.com`) — no PR gate.
9. Mid-session correction: this project's `.md` files (`docs/conventions.md`,
   the old spec) point at the *previous* brand guideline images/spec —
   **override that**. The new guidelines doc, built from studying
   `Budgts Reference V2.png`, becomes the one source of truth, and every
   file that referenced the old one must be amended to match.
10. Mid-session correction: **do not hand-draw a new cat/logo.** The mark,
    wordmark, mascot expressions, and decorative shapes must be the actual
    artwork extracted from `Assets V2.svg` (which is a raster PNG embedded
    in an SVG wrapper — extraction means cropping that PNG, not redrawing
    vector paths from scratch).
11. This file: keep a running log of the above plus the step-by-step plan,
    and use it as the guide for execution.

## Non-negotiables carried over from `CLAUDE.md` / `docs/conventions.md`

- Presentation-layer only. Do not touch financial semantics, the domain
  layer, schema, or server actions.
- Preserve the existing `ProgressBar` under/near/over budget-status
  semantic (real UX value) rather than recoloring bars purely by category
  the way the reference mockup does.
- Keep the current 4-destination nav + overlay-modal "detail screen"
  pattern (no new routes) — the redesign changes tokens/visuals, not
  information architecture or routing.
- Style only through the semantic Tailwind tokens in `globals.css`
  (`bg-surface`, `text-muted`, `border-border`, `bg-accent`, …) — never raw
  hex or one-off colors in components.

## Derived design decisions (from studying the reference)

- Palette (sampled from the reference's own swatch + verified against
  screen elements): Cream `#FFF8F0` bg, Ink `#0F0F0F` text, Coral `#FF7B61`
  accent/action, Sun `#FFD166`, Sage `#A7C7A1` (green), Sky `#A7D8FF`
  (blue), Lavender `#CDB8FF` (purple), plus a Pink hue for the Entertainment
  category not in the 7-swatch legend, sampled directly off the mockup.
  Category icons/progress use a pale tint background + a deeper, more
  saturated version of the same hue for the glyph/fill (sampled from the
  reference's icon glyphs and insights-donut legend, since the swatch
  values alone are all pale).
- Typography: **Poppins** (per `Assets V2.svg`'s own type specimen),
  replacing Nunito Sans. Same numeric type scale as before (H1 32 / H2 24 /
  H3 20 / Body 16 / Small 14 / Caption 12), just the new family.
- Primary CTA is a **solid ink-black pill** (literally what the reference's
  "Get started" button is) — not a coral or blue button. Coral is reserved
  for accents: active nav, the "+" add action, progress emphasis.
- Segmented control (This month / All time, Spending / Income) uses a pale
  coral tint for the active segment, flat neutral-gray track — not the old
  solid primary-color pill.
- Bottom nav active state is just coral icon + label text, no filled pill
  behind it (reference has no pill).
- Logo/mascot art is cropped directly from the decoded `Assets V2.svg`
  raster: the peeking-cat wordmark lockup, the icon badge, and the four
  mood expressions (Neutral/Happy/Curious/Sleepy) already match the app's
  existing `Mascot` component's four moods exactly.

## Step-by-step plan

1. [x] Read the old spec + `docs/conventions.md` to know what's being
   superseded and what design conventions must survive.
2. [x] Decode `Assets V2.svg` (it's an embedded base64 PNG, not real vector
   paths) and inspect `Branding guidelines V2.png` to know it exists (then
   set aside per the answered question).
3. [x] Crop and inspect each of the 4 screens in `Budgts Reference V2.png`
   at high zoom; sample exact colors off icons, progress bars, the
   insights donut legend, nav states, and the hero screen.
4. [x] Map the current codebase's design system and screen/component
   inventory (tokens, `ui.tsx` primitives, nav components, screens,
   `public/brand/*` usage) via an Explore pass — done once, not repeated.
5. [x] Rewrite `src/app/globals.css` tokens to the new palette + semantic
   roles (kept the same semantic role *names* so components didn't need
   structural changes, only their consumed values changed).
6. [x] Swap the font: `src/app/layout.tsx` now loads Poppins instead of
   Nunito Sans; removed the now-unneeded light/dark theme-color split
   (no dark palette is shipped).
7. [x] Fix every call site still holding a raw old-palette token
   (`income-tile.tsx`, `overlay.tsx`, `ui.tsx` category map + `CatMessage`,
   `transaction-form.tsx` checkbox accent) — grepped for `var(--yellow`
   etc. across `src/` to find all five, not guessed.
8. [x] Restyle shared primitives in `ui.tsx` / nav components to match the
   reference exactly: `SegmentedControl` (coral tint active state),
   `CategoryIcon` (pale-tint bg + deep glyph per hue), `BottomNav` (coral
   text/icon, no pill), `DesktopSidebar` (coral tint active row).
   `PrimaryButton` needed no code change — it already reads `--primary`,
   which now resolves to ink-black.
9. [x] Crop the real logo/mascot/decorative artwork out of the decoded
    `Assets V2.svg` PNG (wordmark+tagline, icon badge, 4 mood faces, 4 icon
    color variants, 3 decorative blobs, sparkle) using gap-detection
    cropping (not manual guessing) to avoid bleed between adjacent
    artwork — no hand-drawn replacements. Replaced `public/brand/*` with
    these crops; rewired `logo.tsx` / `mascot.tsx` (mood filenames
    unchanged, so no prop/key changes needed); regenerated
    `public/icon-512.png`, `public/icon-maskable.png`, `src/app/icon.png`,
    `src/app/apple-icon.png` from `mark-default.png`. Deleted the
    superseded `app-icon.png`, `mascot-hero.png`, `decorative-blobs.png`,
    and the entire legacy top-level `brand/` folder (older Volt-Lime
    identity, already self-documented as retired and unreferenced).
10. [x] Applied the new tokens/components across every screen by fixing
    the shared primitives + the 5 files still holding raw old-palette
    tokens (found via grep, not assumed complete) — then verified via a
    real authenticated session (throwaway Supabase test user, seeded data,
    magic-link sign-in through Playwright) on Home, Budgets, Insights,
    Activity, Goals (empty state), More, and sign-in at 390px. Fixed one
    real issue this surfaced: the Home "Money Left" card's mascot overlay
    was removed since a black cat silhouette disappears on the new solid
    ink `--primary` background. Added migration `0013` so new signups get
    category colors matching the new palette (existing users' stored
    colors are untouched).
11. [x] Wrote `docs/BRAND_GUIDELINES.md`.
12. [x] Amended `docs/conventions.md` (now points at the new doc, fixed a
    stale "lime accent" / "dark theme from the start" claim while there),
    added a supersession header to the old spec marking exactly which
    sections are void vs. still-current IA documentation, updated
    `CLAUDE.md`'s roadmap summary, `docs/roadmap.md`'s UI Redesign section,
    and `docs/workflow.md` (changelog entry + summary table row), and
    fixed `tools/README.md`'s example pointing at the now-deleted
    `brand/Branding-guidelines.html`.
13. [x] Cleanup done (see #9). Root reference images
    (`Budgts Reference V2.png`, `Assets V2.svg`, etc.) left in place —
    untracked local working references either way.
14. [x] `npx eslint src/` clean (the repo-wide `npm run lint` reports
    ~29k pre-existing errors from a stale, gitignored
    `.worktrees/money-left-dashboard-ui/.next` build directory that
    `eslint.config.mjs`'s `.next/**` ignore doesn't match at that nesting
    depth — unrelated to this work, worth a separate fix); `npm run
    typecheck` clean; `npm run test` 476/476 passing; `npm run build`
    succeeds; `npm run test:e2e` 9 passed / 1 skipped (Plaid, sandbox-gated,
    pre-existing skip condition).
15. [ ] Commit in logical chunks on `v1-plaid-beta`, merge into `main`,
    push `main` — Vercel auto-deploys `budgts.com`.

Update the checkboxes above as steps complete; don't re-plan from scratch
if the session gets interrupted — resume from the first unchecked step.
