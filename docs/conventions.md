# Conventions & SOPs

Repeatable rules for building this app. Read the relevant section before
starting work. `CLAUDE.md` has the short version; this is the detail.

---

## Building a feature — the layer order

Every feature that touches data, an API, or the UI is built bottom-to-top in
this order. Each layer is finished (and tested where noted) before the next is
started. Reordering is how RLS gaps and float-money bugs get in.

1. **Schema + migration** — `src/lib/db/schema.ts` → `supabase/migrations/NNNN_*.sql`
   - Edit `schema.ts` first (schema-first). Money columns are `integer` (minor
     units). Run `npm run db:generate` to emit the SQL migration from the diff.
   - Hand-append what drizzle-kit cannot generate to that same migration file:
     the **RLS policy** for every new table (scoped to `auth.uid()` — the
     migration is not done without it), plus any trigger / seed SQL.
   - Must be reversible. Apply with `npm run db:migrate` (uses `DIRECT_URL`,
     the non-pooled connection) against a local or branch database.
2. **Zod schema** — `src/lib/validation/*.ts`
   - One schema per input shape, imported by both client and server.
   - Amounts validated as positive integers.
   - Unit-test the schema (valid + invalid cases).
3. **Domain logic** — `src/lib/budget/*.ts` (or `src/lib/ingestion/`)
   - Pure functions over already-fetched rows. **No DB calls inside.**
   - **Write failing unit tests first** (`superpowers:test-driven-development`),
     then implement.
   - Bucket transactions by `occurred_at` (when it happened), never
     `created_at`. Exclude `is_transfer` rows and non-`confirmed` rows from
     spend/income math.
4. **Server action / route** — `src/server/*.ts`
   - Parse input with the Zod schema.
   - Use the **request-scoped `supabase` server client** (the user's session) for
     all reads and writes. RLS enforces per-user isolation at the database — it
     is the guard, not a backstop. Still set `user_id` explicitly on inserts
     (the RLS `WITH CHECK` requires it to match `auth.uid()`).
   - Drizzle is for migrations and the **server-only Plaid pipeline**
     (`src/server/plaid/*`, webhook/cron routes, the page-view refresh
     nudge). It connects as the DB owner and bypasses RLS, so every Drizzle
     query scopes by `user_id`/`item_id` explicitly. Never use it for
     ordinary user-facing reads/writes.
   - Call the domain function; return typed data. No raw 500 to the client.
5. **UI** — `src/app/**`, `src/components/**`
   - Mobile-first. Show inline Zod errors. A failed write keeps the form open
     with its data (no loss).
   - Light-only for now (no dark palette is shipped; Settings → Appearance
     doesn't offer a Dark option because of this — don't show one until a
     dark palette actually exists). Brand tokens live in
     `src/app/globals.css` (semantic roles: `bg`, `surface`, `text`, `muted`,
     `border`, `accent`/`accent-ink`, `pos`/`neg`/`warn`/`info`). Style with
     those utilities (`bg-surface`, `text-muted`, `border-border`,
     `bg-accent`…), never raw Tailwind colours or `dark:` variants — this
     keeps a future dark palette a one-file change. One `bg-accent` (signal red)
     action per screen. Amounts get
     `tabular-nums`. Labelled inputs, keyboard-reachable, visible focus ring.
   - Logo: `<Logo>` / `<LogoMark>` from `src/components/logo.tsx`.
   - For live data, render `<RealtimeRefresh tables={[...]}>` (debounced,
     one trailing refresh) — never a hand-rolled channel that calls
     `router.refresh()` per event. After a mutation, don't refresh on the
     client at all — the server action's `revalidateUserData()` already
     re-rendered the page. See "Performance rules" below.
   - Reference: **`docs/BRAND_GUIDELINES.md`** — the source of truth for
     color, type, logo, mascot, iconography, and component styling.
     `docs/specs/2026-09-13-ui-redesign-brand-guidelines-spec.md` still
     holds the screen-by-screen IA/behavior spec (see that file's header
     for which of its sections are superseded). `public/brand/` holds the
     current logo/mascot/decorative assets — the real brand artwork, never
     hand-redrawn or auto-cropped. Check UI visually with
     `npm run screenshot -- <url> <label>` (see `tools/README.md`).
6. **E2E** — `tests/e2e/*.spec.ts`
   - One Playwright test through the new UI, happy path. Add a
     multi-device/sync assertion when the feature writes shared data.

### Every screen serves two clients — loaders, commands, native routes

The web pages and the native app (`/api/mobile/*`) read and write through the
same code, so their numbers can never disagree (Stage 0 port, Stage 2B). A new
screen, or a new read or mutation on an existing one, follows this shape:

- **Loader** — `src/lib/<area>/load-<screen>.ts` (`loadHome`, `loadGoals`,
  `loadInsights`, `loadBudgets`, `loadCategorySettings`,
  `loadAccountsOverview`, `loadTour`, ...). Framework-free: no `next/*`
  import. Takes the caller's Supabase client (the web's cookie client or the
  native Bearer client; RLS scopes both), the user id, the user's time zone
  (month and today come from `currentMonthKey` / `todayDateKey`, never
  `new Date()` on the server), and `plaidEnabled`. Independent reads in one
  `Promise.all`; transaction and history reads through `fetchAllRows` (or a
  `.limit()`, a head-only count, `.single()`). It calls the pure money math in
  `src/lib/budget/*` and computes nothing of its own. A read that feeds a
  total either throws or is named in `degraded`: the web page may render
  around a degraded side query, the native route answers 503 instead of a
  partial number.
- **Command** — `src/lib/<area>/commands.ts` (Plaid ones in
  `src/server/plaid/commands.ts`). Validates with the shared Zod schema,
  returns `{ ok: true } | invalid | missing | failed`
  (`src/lib/command-result.ts`), never throws for an expected outcome, never
  redirects or revalidates. A write that could run twice on a retry takes an
  optional client `requestId` (a UUID used as the row key, or a `source_ref`)
  so the retry returns the row that landed.
- **Web adapter** — the page calls the loader; the Server Action calls the
  command and keeps `revalidateUserData()` and the form wording.
- **Native route** — `src/app/api/mobile/<screen>/route.ts` through
  `mobileRoute` (Bearer only, identity from the verified token, never from the
  request; `private, no-store`; a thrown error is a generic 503 logged through
  `describePlaidError`). It validates query and body shape
  (`readObject`, `MONTH_RE`, `UUID_RE`), maps command results with
  `mobileCommandError` / `mobilePlaidReply`, and returns a view-model built
  in `src/lib/mobile/*` (explicit fields, integer minor units, a `version`).
  Adding a field keeps the version; removing or changing one bumps it.
- **Derived figures** a card prints beside a chart (shares, deltas, progress)
  live in a shared pure module (`src/lib/insights/figures.ts`), called by the
  component and the view-model builder alike; never recomputed in either.
- **Tests** — unit tests for the loader and command (fake PostgREST:
  `tests/unit/helpers/fake-supabase.ts`), route tests (mocked loader or
  command), a staging integration test proving the API equals the web
  loader's output for the same user and that another user's ids are 404s
  (`tests/integration/mobile-*.test.ts`), and a contract e2e
  (`tests/e2e/mobile-*-api.spec.ts`). The existing web tests pass unchanged.

### E2E against Supabase — required posture

The e2e suite drives one real Supabase project, whose auth server rate-limits
and cold-starts. Configured accordingly, and keep it this way:

- `playwright.config.ts`: `workers: 1` (serial), `retries: 1`,
  `reuseExistingServer: false` (a stale dev server serves a wrong build).
- Tests that need a session use `tests/e2e/helpers/test-user.ts` — admin
  `createUser` + a magic-link `token_hash` through `/auth/callback`; the
  `finally` block deletes the user (FK cascade cleans its rows). A timed-out
  test skips `finally`, so orphans accumulate — sweep them with a
  `listUsers` + delete pass when the suite starts misbehaving.
- Wait on observable state, not tight URL regexes: `page.waitForURL(u => u.pathname === "/", { timeout: 20000 })` after a server-action redirect, and
  wait for a post-mutation UI signal (a flipped button label) before navigating.

### Quick reference

| Layer | Location | Gate before moving on |
| --- | --- | --- |
| Schema + migration | `src/lib/db/schema.ts` → `supabase/migrations/` | `db:generate` clean; RLS policy in the migration; applies + rolls back |
| Zod | `src/lib/validation/` | schema unit-tested |
| Domain | `src/lib/budget/` \| `src/lib/ingestion/` | tests written first, now green |
| Server action | `src/server/` | uses the user's `supabase` server client (RLS-enforced); input Zod-parsed; `user_id` set on inserts |
| UI | `src/app/`, `src/components/` | inline errors; no data loss on failure |
| E2E | `tests/e2e/` | happy path green in CI |

### Definition of done

See `CLAUDE.md` → "Definition of done". In short: `lint`/`test`/`build` green,
one e2e, RLS on any new table, money in integer minor units end to end, doc
updated if something surprised you.

### Common mistakes

- Building the component before the domain function it calls exists and is
  tested. Build the domain layer first; the UI just renders it.
- A new table without an RLS policy in the same migration.
- Using Drizzle (admin role — bypasses RLS) for a request-time query. Drizzle
  is migrations only; requests use the user's `supabase` client.
- An insert that omits `user_id` (or sets someone else's) — the RLS
  `WITH CHECK` rejects it, but set it right the first time.
- Float money. Store and compute in minor units; format only at the display
  edge.
- Bucketing by `created_at` instead of `occurred_at`.
- Counting `is_transfer` rows, or non-`confirmed` rows, in spend/income totals.
- Treating a refund as its own concept instead of a `credit` in the same
  expense category that nets against spend.
- Rendering clock- or time-zone-dependent text in a client component's first
  render: `Date.now()`-relative labels ("5 min ago"), or `toLocaleDateString`
  without `timeZone`. Vercel server-renders in UTC, so every non-UTC viewer
  hits React #418 (hydration mismatch). Format stored dates with
  `timeZone: "UTC"`; show relative time only after hydration
  (`useSyncExternalStore` with a `false` server snapshot, see
  `connected-banks.tsx`). Test with `src/test-utils/hydration.tsx`: server
  render under one `process.env.TZ`, hydrate under another.
- Reading a required secret when a module loads (a top-level
  `if (!process.env.X) throw`, or a client built at import). `next build`
  imports every route module to collect page data, and CI and Vercel Preview
  builds carry no secrets, so the build fails. Create clients on first use
  (`db()` in `src/lib/db`, `plaidClient()`) and read settings when called
  (`loadPlaidConfig()`). What production must have is checked once, at its
  build: add a new required secret to `src/lib/env/production-env.ts`.
- Logging a caught error object on the server (`console.error("…", e)`). A
  Plaid SDK error carries its request, secret header and token included, and
  a DB error can quote the failing row. Log `describePlaidError(e)`
  (`src/lib/plaid/error-policy.ts`); `tests/unit/log-safety.test.ts` enforces
  it.
- Deciding "today" or "this month" from the server clock or a fixed zone.
  Pass the user's zone: `todayDateKey(await requireTimeZone(user.id))` /
  `currentMonthKey(...)` (`src/lib/budget/month.ts`). It follows their
  device (`<TimeZoneSync>`), so a user in Tokyo gets Tokyo's month.

---

## Adding a transaction source — the ingestion-adapter contract

All transaction sources (manual, email, receipt, bank) implement one interface
and insert through one shared function. Adding a source in a later phase is
"write an adapter + a receiver", nothing else.

```ts
type TransactionSource = 'manual' | 'email' | 'receipt' | 'bank'

interface NormalizedTxn {
  accountId: string
  categoryId: string | null       // null = uncategorized
  amount: number                  // minor units, positive
  direction: 'debit' | 'credit'   // debit = money out
  occurredAt: string              // ISO 8601
  description: string
  note?: string
  isTransfer: boolean             // between the user's own accounts; excluded from rollups
  source: TransactionSource
  sourceRef?: string              // stable id from the source, for dedupe
  status: 'confirmed' | 'pending_review'
}

interface IngestionAdapter {
  source: TransactionSource
  normalize(raw: unknown): NormalizedTxn   // source payload -> common shape
  dedupeKey(n: NormalizedTxn): string | null
}
```

### Rules

- **One insert path.** `landTransaction(supabase, userId, n: NormalizedTxn)` in
  `src/lib/ingestion/land.ts` is the only place a transaction row is created.
  It applies the `(user_id, source, source_ref)` partial unique index (on
  conflict → no-op, return existing row) and inserts via the user's supabase
  client. `normalize()` stays pure and is unit-tested; `landTransaction` is a
  thin reviewed wrapper.
- **`status`**: `manual` and `bank` land as `confirmed`. `email` and `receipt`
  land as `pending_review` until the user confirms/fixes them in a queue.
- **`dedupeKey`** returns `null` for `manual` (never deduped). For automatic
  sources it returns a stable string written to `source_ref` — the bank
  transaction id, or for email the `Message-ID` (fall back to a content hash
  only to split several transactions parsed from one message, never to
  identify the message itself).
- **Categorization** is best-effort inside/after `normalize`; `null` is always
  acceptable and the user can set it later.
- **Transfers**: `isTransfer` is set by the user (manual toggle) or inferred by
  an adapter (e.g. a recognised credit-card payment). Transfer rows never enter
  `monthlyActuals` or `rollup`.
- **Refunds** need no special handling — a refund is a `credit` row in the
  original expense category; `monthlyActuals` nets it against spend.
- **Location**: `src/lib/ingestion/<source>.ts` for the adapter; the receiver
  (form handler, webhook, upload handler) lives in `src/server/` or
  `src/app/api/`.
- **Tests first**: `normalize` and the `landTransaction` dedupe path get unit
  tests before implementation.

### Adapter status by tier

- Shipped: `ManualAdapter` only (now the fallback path).
- **V1:** `PlaidAdapter` — Plaid Link + `/transactions/sync`; the primary
  automatic path.
- **V2:** `EmailAdapter` (inbound-email webhook) and `ReceiptAdapter` (camera
  upload + confirmation popup) for cash, split bills, and institutions Plaid
  can't reach.

---

## Supabase specifics

- **Data access.** The app talks to Postgres only through `supabase-js` with
  the user's session (PostgREST + RLS). Drizzle + the `DATABASE_URL` /
  `DIRECT_URL` connection strings exist **only** for `db:generate` /
  `db:migrate`. `DIRECT_URL` (port 5432) is what migrations use — the pooled
  `DATABASE_URL` (6543) runs PgBouncer in transaction mode and breaks some DDL.
- **Signup seed is a trigger.** `handle_new_user()` on `auth.users`
  (`security definer`) creates the `profiles` row, default `categories`, and a
  starter `accounts` row in one shot. Never rely on client code to seed a new
  account.
- **Realtime respects RLS** and only fires for tables added to the
  `supabase_realtime` publication. Add `transactions` and `budgets` in a
  migration; subscriptions still filter by `user_id`.
- **Storage** (V2 receipts) uses a private bucket with per-user path
  prefixes and a policy scoped to `auth.uid()`.

---

## Performance rules

**Why:** on 2026-09-24 the live app became extremely slow. Root causes
(fixed in `885f20c`, `9f9c915`, `e1bf32c`, `d86f6e6` and follow-ups): two
network `auth.getUser()` round trips to Supabase Auth on every page; Home
fetching the same transactions three times; `RealtimeRefresh` calling
`router.refresh()` once per row event during a Plaid sync (hundreds of full
server renders); no `loading.tsx` and a 0s client router cache, so every tab
tap waited on the server with no feedback; recharts in Home's first-load
bundle. A 2026-09-25 audit also found the Activity page pulling a user's
entire bank history (capped at 1000 rows) to find one date per account, and
serial awaits on Budgets/Insights/Transactions. A later 2026-09-25 pass,
measured on staging with a heavy bank feed (~1,250 rows a month), found
`fetchAllRows` fetching its 1000-row pages one after another (8 in a row for
Home's 6-month window: 1.0s → 0.37s once parallel); the Activity list
rendering every row of the month (9,800 DOM nodes, a 2 MB page, 400ms+ per
tap or keystroke on a mid-range phone); Zod (~370 KB) and the Supabase
browser client (~250 KB) in first-load bundles; the robin drawn as ~170
`<rect>`s per copy; and functions running in `iad1` while the database is in
`us-east-2`.

`tests/unit/performance-guardrails.test.ts` enforces the checkable rules; a
failure there names the rule it protects.

1. **Identity on read paths comes from `getSessionUser()`** — a local JWT
   check (`getClaims()` against the cached JWKS, one per request via
   `cache()`). Native Bearer requests verify the same way
   (`getClaims(token)`, `src/lib/auth/get-request-user.ts`); only account
   deletion re-checks with the network `getUser()`
   (`src/server/privileged-user.ts`, allow-listed in the guardrail). Never `auth.getUser()`/`getSession()` in pages, layouts,
   components or `src/lib`; only allow-listed write actions may re-check
   against Auth. This relies on the project's **asymmetric (ES256) JWT
   signing keys** — with a legacy HS256 secret `getClaims()` silently falls
   back to a network call, so never switch back.
2. **Independent reads go in one `Promise.all`.** If a read needs another's
   result, chain it off that promise (`profilePromise.then(...)`) so it still
   runs alongside everything else — never `await` A, then start B.
3. **Every query is bounded.** Month/window reads use `fetchAllRows` with a
   unique `order("id")`, and the page builder passes `count` to its select
   (`.select(cols, { count })`): the first page returns the total, so every
   remaining page is fetched at once (two round trips for any size, not one
   per 1000 rows); lists use `.limit()`; "the earliest/latest X" is
   `order(...).limit(1)`, never "fetch everything and scan"; counts use
   `{ count: "exact", head: true }`. No `select("*")` — name the columns.
4. **Fetch a row set once per request.** Derive per-month slices in memory
   from one window fetch (Home) instead of re-querying; share per-request
   lookups with React `cache()` (the header bell count).
5. **Slow or optional UI streams.** Every dashboard route is covered by
   `(dashboard)/loading.tsx`; banners and badges that need their own queries
   sit in `<Suspense fallback={null}>` so they never block the page.
6. **Realtime is coalesced, and only for changes this tab didn't make**
   (background bank sync, another device). Only `<RealtimeRefresh>`
   subscribes (server wrapper passes `renderedAt` = `renderStartedAt()`, the
   time the render first opened a Supabase client — before any query, never
   a later `Date.now()`, or a change committed mid-render is dropped; the client listener
   ignores events whose `commit_timestamp` the latest render already covers —
   the echo of the user's own edit); it debounces a burst into one trailing
   `router.refresh()` and defers while the tab is hidden. Don't add a second
   refresh path for the same table.
7. **Client router cache stays on** (`experimental.staleTimes.dynamic: 30` in
   `next.config.ts`). Every mutating server action's `revalidateUserData()`
   invalidates it, so a tab visited moments ago is fresh when tapped again.
8. **No chart library; heavy client libraries load lazily.** Charts are
   server-rendered square-cell markup (`spending-overview.tsx`, no client JS);
   Plaid Link only mounts once a link token exists. Zod is server-only:
   client components take option lists from Zod-free modules
   (`src/lib/accounts/account-types.ts`, `src/lib/categories/options.ts`,
   `src/lib/budget/currencies.ts`), never from `src/lib/validation`. The
   Supabase browser client is imported lazily inside the realtime listener's
   effect, so it isn't in any page's first bundle. The robin draws one
   `<path>` per colour per layer (`mascot.tsx`), not a `<rect>` per run.
9. **Page-view background work is throttled and non-blocking.** `after()` +
   `nudgeRefresh` costs one conditional `UPDATE … RETURNING` per Home /
   Transactions view and calls Plaid at most once per 25 min per Item.
   Anything new in `after()` must be equally cheap or throttled.
10. **Service worker caches only content-hashed assets cache-first**
    (`/_next/static/`); un-hashed files (`/brand/*`, icons) are
    stale-while-revalidate. Bump `CACHE` in `public/sw.js` when its strategy
    changes. Navigations use navigation preload (enabled on activate), so a
    phone that stopped the idle worker doesn't hold the page request until
    the worker boots.
11. **Plaid sync is event-driven, one run per Item.** Every sync — the webhook
    (right after its 200, via `after()`), Sync now / account mapping / resume
    import, and the `/api/plaid/sync-due` reconciliation sweep (pg_cron every
    10 min) — goes through `src/lib/plaid/sync-runner.ts`, which takes the
    Item's lease (`claimItemForSync`: one conditional `UPDATE … RETURNING`)
    before syncing and releases it after. Never call `syncItem()` directly,
    and don't add a faster poll: latency comes from the webhook, the sweep is
    only for failed/killed runs and lost webhooks. `needs_sync` is the durable
    queue flag: the claim sets it in the same UPDATE, and only
    `releaseSyncClaim` settles it (false unless the run failed, left pages, or
    a webhook landed after the claim) — so a run killed between the two, from
    any trigger, is retried by the sweep once its lease expires. The lease is
    `SYNC_LEASE_SECONDS` = `FUNCTION_MAX_DURATION_SECONDS` (300s, Vercel Fluid
    default and Hobby maximum, which also bounds server actions) + 60s; no
    `maxDuration` in `src/app` may exceed that ceiling (pinned by
    `performance-guardrails.test.ts`), and raising it means raising the lease.
    An Item with an `unmapped` account is never claimable (a sync would skip
    those rows and advance the cursor past them for good).
12. **One server render per edit.** A mutating server action ends with
    `revalidateUserData()` (`src/server/revalidate.ts`, the only
    `revalidatePath` call): it re-renders the page the user is on inside the
    action's own response. Client code never follows an action with
    `router.refresh()` (that was a second full render, and realtime's echo a
    third). The only client refreshes: the realtime listener, and ConnectBank
    closing the mapping dialog unsaved (the exchange route handler can't
    update the page). Pinned by `performance-guardrails.test.ts` and the
    "exactly one server render" test in `tests/e2e/router-cache.spec.ts`.
13. **Long lists render in slices.** A month of bank rows can be 1,000+.
    The Activity list (`transaction-list.tsx`) renders 60 rows, then 60 more
    as its end comes within 600px (an `IntersectionObserver`, rebuilt per
    slice, plus a "Show N more" button as the reachable exit); search and
    the filters still run over every row. Rows are a memoized component, so
    opening a transaction's sheet doesn't re-render the list behind it.
14. **Functions run next to the database.** `vercel.json` pins functions to
    `cle1` (Cleveland = AWS `us-east-2`, the production Supabase region), so
    each sequential query doesn't cross from `iad1`. If the database ever
    moves region, move this with it (Hobby allows one region).

**If it gets slow again, look at:** Vercel → Observability / Logs for the
slow route's function duration; Supabase → Query Performance (slowest and
most-called statements) and the API request count per minute; whether a Plaid
sync was running at the time (realtime bursts, `/api/plaid/sync-due` runs);
and the browser Network tab for how many RSC requests a single tap triggers.

---

## AI extraction (V2 — email / receipt) — placeholder

When email/receipt parsing is built, add the extraction contract here (output
JSON schema, model, prompt structure, confidence → `pending_review` handling,
eval harness, cost notes). API mechanics: consult the `claude-api` skill.
