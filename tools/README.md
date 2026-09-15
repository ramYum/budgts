# tools/

Dev-only helper scripts. Not shipped, not imported by the app.

## screenshot.mjs

Render a page to a PNG so a change can be checked visually (Puppeteer + a
pinned headless Chrome).

```
npm run screenshot -- <url-or-path> [label] [width] [height] [scale]
```

- `<url-or-path>` — a running URL (`http://localhost:3000/dashboard`) **or** a
  local file path. Bare paths are resolved against the repo root and loaded
  as `file://`.
- `label` — optional; slugified into the filename.
- `width` / `height` — CSS viewport px. Default `1440 x 900`. `fullPage` is
  always on, so `height` only affects lazy/viewport-triggered content.
- `scale` — deviceScaleFactor. Default `2` (retina-crisp).

Output: `screenshots/screenshot-<n>[-<label>].png` in the repo root, auto
incrementing. That folder is git-ignored — the PNGs are working artifacts.

### Examples

```
npm run screenshot -- http://localhost:3000 home-mobile 390 844 3
npm run screenshot -- http://localhost:3000/budgets budgets-desktop
```

### First-time setup

`npm install` does **not** download Chrome for Puppeteer in this repo
(install scripts are disabled). Run once:

```
npx puppeteer browsers install chrome
```

## sign-convention-remediation-dryrun.ts

Read-only report for the one-time historical sign-convention migration
(design: 2026-09-12 North Star §10, workflow 2) — never run before
2026-09-15. Reuses the real `detectSignConvention` / `resolveEventRole`
against production, and reports, per Plaid account: the full-history sign
verdict, exactly which rows would change direction and/or `event_role`, and
before/after monthly spend/income totals. A second sweep separately finds
any confirmed row anywhere whose `event_role` doesn't match its own current
direction — this catches accounts that were already resolved before the
`finalizeSignConvention` event_role fix landed, which the first pass (scoped
to still-`unknown` accounts) doesn't see.

Writes nothing; requires `SUPABASE_SECRET_KEY` in `.env.local` and refuses to
run against anything but the production Supabase project.

```
npx tsx tools/sign-convention-remediation-dryrun.ts
```
