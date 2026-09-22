# Security

The first section is the Phase 1 manual review (2026-09-07). "Since Phase 1" below records the controls added
by later work (Plaid, mobile, account deletion, monetization) and what is still open. Update it when a control changes.

## Phase 1 review (2026-09-07)

Manual review (the `security-review` skill needs a git remote, which this repo
does not have yet). Scope: auth, RLS, the service key, the CSV export route,
the service worker, CI.

## Verified sound

- **RLS on every table** (`profiles`, `accounts`, `categories`, `transactions`,
  `budgets`) — `FOR ALL TO authenticated USING/WITH CHECK (auth.uid() = owner)`.
  No `anon` grants. Confirmed by direct query against the live DB.
- **`handle_new_user`** is `SECURITY DEFINER` with `SET search_path = ''` and
  fully schema-qualified — the standard safe pattern.
- **Secret key** (`SUPABASE_SECRET_KEY`) is referenced only in
  `tests/e2e/helpers/` — the app never imports it. All request-time access is
  through the user's session + the publishable key, so RLS is always in force.
- **Server actions** parse input with Zod, then act via the user's supabase
  client. `update`/`delete` on `.eq("id", …)` are RLS-guarded (a foreign id
  matches zero rows). `user_id` is set from the session on every insert.
- **`getSessionUser`** calls `auth.getUser()` (validates the JWT with Supabase),
  not a bare cookie decode.
- **Service worker** caches only same-origin GETs — static assets + the offline
  page. Navigations are network-first; no user data is cached. (Retires with the PWA.)
- **CI** builds with placeholder env, no secrets; `npm ci` from the lockfile.

## Fixed in this checkpoint

| Sev | Finding | Fix |
| --- | --- | --- |
| Medium | Open redirect: `/auth/callback?next=//host` / `/\host` passed the `startsWith("/")` check | `src/lib/safe-redirect.ts` `safeNextPath()` rejects `//`, `/\`, and non-`/` values; unit-tested |
| Low | CSV formula injection: a transaction description like `=HYPERLINK(...)` would execute in Excel | `csvCell` prefixes `'` when a cell starts with `= + - @` / tab / CR |
| Low | `proxy.ts` `isPublic` used a loose `startsWith(prefix)` — `/sign-inX` would be treated as public | tightened to `startsWith(prefix + "/")` |

## Deferred (not blocking deploy)

- **Content-Security-Policy** — none set. Add a `headers()` block in
  `next.config.ts` (`connect-src` must include the Supabase origin + `wss:` for
  realtime; fonts are self-hosted by `next/font`). Do in a hardening pass.
- ~~**PNG PWA icons**~~ — done, and moot: the PWA is being retired, so no further icon work is planned.
- **Rotate** the Supabase DB password and Google client secret (shown in chat
  during setup) — see `docs/deploy.md`.

## Since Phase 1 (state at 2026-09-21)

Verified by tests and, for the live paths, end to end against the staging project (`Budgets-Staging-3`).

- **Machine-to-machine endpoints authenticate themselves.** The Plaid webhook is signature-verified. Cron endpoints
  (`/api/plaid/sync-due`, `/api/billing/reconcile/due`) require `CRON_SECRET` as a bearer, compared
  with `timingSafeEqual`. The RevenueCat webhook requires an HMAC-SHA256 signature (`t=<unix s>,v1=<hex>` over the raw body, 5-minute
  tolerance) and optionally an Authorization value; unconfigured means 503, never open. None of them reads a user id from a request
  body or URL — the affected user comes from the verified payload.
- **Environment fence.** `BILLING_ENVIRONMENT` makes a deployment quarantine (log, never apply) provider events from the other
  environment, so a sandbox purchase cannot grant production access or write a production ledger row.
- **Mobile auth.** `/api/mobile/*` and `/api/account/delete` accept a Supabase access token as a Bearer token, verified by
  Supabase (`getUser`), with cookies ignored on the Bearer path; a tampered token is a 401. The deep link is `budgts://auth/callback`,
  which must be in the project's redirect allow-list. Sign in with Apple uses Supabase's native ID-token path (a hashed nonce to
  Apple, the raw nonce to Supabase) and needs no deep link.
- **The native data API is one Bearer boundary with RLS as defense in depth.** Every `/api/mobile/*` data route goes through the
  same wrapper: a verified user, a Supabase client carrying the caller's own JWT, no-store responses, and a generic 503 that leaks
  nothing. Writes call the shared domain commands, so validation and ledger rules are the same as the web's. The list cursor is
  validated strictly before it reaches a PostgREST filter. Cross-user isolation (another user's transaction / account id looks
  identical to a missing one, and their data never appears in a list) is verified live against staging by
  `tests/e2e/mobile-data-api.spec.ts`.
- **Account deletion is fail-closed and step-up protected.** Requires a recent real sign-in (403 `reauth_required` otherwise); the
  first step of a deletion locks the account read-only via a database-side write guard, so a late write cannot resurrect or orphan data;
  Auth errors are never treated as "already deleted"; Plaid Item removal is strict. No response reveals which server setting is missing.
- **The money ledger is immutable.** Enforced by database triggers (append-only facts, narrow allowed updates) and RESTRICT foreign keys, so
  a deletion that must keep the ledger anonymizes the account instead. RLS is on every table (25 public tables, checked on staging).
- **Entitlement cannot be forged from the client.** Premium is decided server-side by `hasPremium(entitlement, now)`; the mobile purchase
  flow only asks the server to re-read the provider's state. Billing responses use a stable view-model, never raw provider rows.
- **The web surface is shrinking.** Budgts is mobile-only and the web/PWA UI will be retired once native covers the launch-required
  functionality (`docs/specs/2026-09-21-mobile-only-transition-design.md`). The service worker, the cookie-session Server Actions
  and the CSV route are in scope only while they exist. The retained surface is the Bearer and machine-to-machine routes above,
  `/auth/callback`, the public `/manage-subscription` page and the web deletion entry — re-review it when the UI is removed.
- **Secrets.** Only names are documented; values live in git-ignored `.env.*` files and Vercel. A scan on 2026-09-21 found no staging or
  old-project secret value in the working tree or any git history.

### Still open

- **Content-Security-Policy** (above) — still not set.
- **Rotate credentials that were pasted into chat sessions:** the production Supabase DB password and Google client secret (see
  `docs/deploy.md`), and the Budgets-Staging-3 database password. Revoke the stale Supabase access token in `.env.staging` (it is
  scoped to a deleted project and unused).
- **Production-side items not yet done** (release preparation, not started): applying migrations 0017–0022, and configuring production
  RevenueCat credentials with their own separate values.
