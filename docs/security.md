# Security review — Phase 1 (2026-09-07)

> **Updates since this review (2026-09-25):** `getSessionUser` and the proxy
> now use `auth.getClaims()` — the JWT signature is verified locally against
> the project's ES256 JWKS instead of a network `getUser()` call (trade-off:
> a session revoked elsewhere stays valid until its access token expires;
> a few write actions still call `getUser()`). The Plaid pipeline
> (`src/server/plaid/*`, webhook/cron routes) uses Drizzle over
> `DATABASE_URL` as the DB owner, so it **bypasses RLS** and scopes every
> query by `user_id`/`item_id` explicitly; Plaid access tokens are AES-256
> encrypted at rest (`PLAID_TOKEN_ENC_KEY`). PNG icons now ship. The
> sections below are the original Phase 1 review, kept as a record.

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
  page. Navigations are network-first; no user data is cached.
- **CI** builds with placeholder env, no secrets; `npm ci` from the lockfile.

## Fixed in this checkpoint

| Sev | Finding | Fix |
| --- | --- | --- |
| Medium | Open redirect: `/auth/callback?next=//host` / `/\host` passed the `startsWith("/")` check | `src/lib/safe-redirect.ts` `safeNextPath()` rejects `//`, `/\`, and non-`/` values; unit-tested |
| Low | CSV formula injection: a transaction description like `=HYPERLINK(...)` would execute in Excel | `csvCell` prefixes `'` when a cell starts with `= + - @` / tab / CR |
| Low | `proxy.ts` `isPublic` used a loose `startsWith(prefix)` — `/sign-inX` would be treated as public | tightened to `startsWith(prefix + "/")` |

## Mobile apps — requirements (launch track, 2026-09-26)

Design authority: `docs/specs/2026-09-17-mobile-app-launch-design.md` §4, §8.
Each item needs a test or an explicit check before store submission.

- **Only public credentials in the app bundle:** the Supabase publishable
  key, the RevenueCat public SDK keys, the API base URL. Never the service
  key, a Plaid secret or access token, or the RevenueCat webhook secret.
  Checked by scanning the built bundle.
- **Sessions:** the Supabase session lives in secure storage (the archive's
  `large-secure-store`, which chunks SecureStore). PKCE for OAuth. The auth
  callback deep link is allowlisted and validated.
- **API:** Bearer tokens are verified server-side, and data access runs
  under the user's JWT so RLS stays the isolation guard. Tests cover
  missing, invalid, expired and cross-user tokens.
- **Entitlement is server truth:** bank sync (link-token, exchange, sync) is
  gated on the server's entitlement mirror, never on a client "purchase
  succeeded" signal. The RevenueCat webhook is authenticated, idempotent
  and logged.
- **Crash and analytics data carry no financial data:** Sentry scrubs
  amounts, merchant names, account names and emails.
- **Account deletion** revokes sessions, removes Plaid Items and deletes
  personal data per `docs/specs/2026-09-19-account-deletion-design.md`.
- **Before selling:** add the Content-Security-Policy below. (Rotating the
  Supabase DB password and the Google client secret was declined by the
  owner, 2026-09-26.)

## Server logs carry no credentials (fixed 2026-09-27)

- **Finding** (review of the build fix): when a Plaid call failed, the
  exchange, link-token and test-seed routes and the refresh nudge logged the
  raw error. A Plaid SDK (axios) error carries its whole request, so
  `PLAID-CLIENT-ID`, `PLAID-SECRET` and the access or public token could
  reach Vercel's runtime logs. The recurring scan and some DB paths logged
  raw errors too, and a DB error can quote the failing row.
- **Fix:** on the server an error reaches a log only through
  `describePlaidError(e)` (`src/lib/plaid/error-policy.ts`). For a Plaid or
  app error it keeps the message and stack plus Plaid's own `error_code` /
  `error_type` / `request_id`, never the request, headers or response body.
  For a database error (Drizzle puts the failed SQL *and its parameters* in
  its message; Postgres messages can quote input) it logs a fixed "database
  query failed", the stack frames, and only the code, table and constraint.
  `tests/unit/log-safety.test.ts` is the tripwire: it reads every server
  `console.error` / `warn` / `log` / `info` call and fails on anything
  error-shaped outside `describePlaidError`, including interpolated template
  strings.
- **Owner:** earlier failures may have left `PLAID_SECRET` in Vercel's
  runtime logs. Rotating it in the Plaid dashboard (then updating Vercel
  Production) closes that; also check that no log drain forwards Vercel logs
  elsewhere.

## Deferred (not blocking deploy)

- **Content-Security-Policy** — none set. Add a `headers()` block in
  `next.config.ts` (`connect-src` must include the Supabase origin + `wss:` for
  realtime; fonts are self-hosted by `next/font`). Do in a hardening pass.
- **PNG PWA icons** — manifest uses SVG (fine for Android/Chrome; iOS prefers
  PNG `apple-touch-icon`).
