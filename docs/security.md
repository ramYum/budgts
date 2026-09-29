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

> **Built in Stage 0 (2026-09-27, not deployed):** Bearer tokens are verified
> locally (`getClaims`) and every `/api/mobile/*` query runs through a client
> carrying the caller's own JWT, so RLS scopes it; only the publishable key is
> used. Cross-user isolation is proven on staging
> (`tests/integration/mobile-*.test.ts`, `tests/e2e/mobile-*.spec.ts`).
> Account deletion re-checks the session with the network `getUser()`.

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
- **Fix:** our own server log calls pass an error only through
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
- **Still open (follow-up):** an error nothing catches is logged by Next.js
  itself, message included. A few database calls in the Plaid routes and
  actions sit outside a `try` (the webhook's insert/update, `sync-due`'s
  candidate query, `recurring-scan`'s user and watermark queries, some server
  actions), so a failure there would log Drizzle's SQL and parameters: ids,
  dates and webhook fields, never tokens (transaction upserts sit inside
  `sync-item.ts`'s catch). Fix by giving those handlers one catch that logs
  `describePlaidError(e)` and returns a plain 500. Lower still: a few helpers
  re-throw a PostgREST message as a plain `Error` (`account-exclusion.ts`,
  `fetch-all-rows.ts`, `supabase-store.ts`, `transaction-update.ts`,
  `current-profile.ts`); re-throw with a fixed message and `{ cause }`.
- **Still open (follow-up, pre-existing; found in the Stage 0 review):** a
  write that names an account by id does not check the account belongs to the
  same user. Manual transactions (`landTransaction`, web and native) and
  account mapping's "existing" mode (`mapAccountsFor`) accept any account
  UUID; RLS checks the row's own `user_id`, and the foreign key only checks
  that the account exists. With a leaked account UUID, another user could
  point their own row at it, and the `ON DELETE RESTRICT` foreign key on
  `transactions.account_id` would then block the victim's account deletion
  (and leave the attacker's row referencing it). No data is exposed (RLS
  still hides the victim's rows). Fix in a future migration with a same-owner
  guarantee: a composite foreign key (`(account_id, user_id)` →
  `accounts(id, user_id)`) or a trigger. Not changed in the Stage 0 port.
- **Owner:** earlier failures may have left `PLAID_SECRET` in Vercel's
  runtime logs. Rotating it in the Plaid dashboard (then updating Vercel
  Production) closes that; also check that no log drain forwards Vercel logs
  elsewhere.

## App sign-in (Stage 2A, 2026-09-29, not deployed)

- **Token storage unchanged:** the session still lives in `large-secure-store`
  (SecureStore-chunked) and the client stays PKCE.
- **PKCE is real S256 on the phone** (fixed on the emulator run, 2026-09-29):
  Hermes has no Web Crypto, so supabase-js had been drawing the verifier from
  `Math.random` and sending it as a "plain" challenge (visible in the Google
  authorize URL). `mobile/lib/supabase/install-webcrypto.ts` now supplies
  secure random values and SHA-256 from expo-crypto before supabase-js loads.
- **The email hand-off page** (`/app/auth/callback`, public in `src/proxy.ts`,
  that one path only) never reads the link's code on the server: the server
  renders one static page, and the browser builds the `budgts://auth/callback`
  link from its own address. A code opened on the wrong device is useless
  there: exchanging it needs the PKCE verifier held in the requesting
  phone's secure storage. The page sets `referrer: no-referrer` and
  `noindex`, and forwards only `code`, `error`, `error_code` and
  `error_description` (never a `token_hash` or implicit-flow tokens).
- **Only PKCE codes the app started** (review fix, 2026-09-29): the app's
  callback refuses `token_hash` links and fragment tokens. A `token_hash` is
  bound to no device, so an attacker's own magic link opened on a signed-out
  victim's phone would sign it in to the attacker's account (login
  confusion). Launch spec §4.
- **No provider text reaches the screen:** every auth failure maps to a fixed
  message (`mobile/lib/auth/auth-errors.ts`), including the fragment errors
  Supabase returns for spent links.
- **Sign in with Apple** stays behind `EXPO_PUBLIC_APPLE_SIGN_IN` (off); the
  nonce flow is unchanged.
- The app bundle still holds only public values (the new flag included).

## Account deletion screens and legal pages (Phase 1, 2026-09-28)

- **The web deletion screen** (`/settings/delete-account`) decides nothing: `POST /api/account/delete` stays the only
  authority and re-checks the session, the 10-minute step-up and the lock itself. The page asks Supabase Auth over the
  network (`getPrivilegedCookieUser`, in the already allow-listed `src/server/privileged-user.ts`) only to pick its
  first state, and reads the write guard through the user's own `account_accepts_writes()` (no new grant).
- **Fresh sign-in** (`requestReauthLink`, `src/server/account.ts`): the link goes to the session's own verified email,
  never a form field, with `shouldCreateUser: false`; the return path is fixed (`/settings/delete-account?step=confirm`)
  and still passes `safeNextPath`. A switched Google account lands on the screen showing the address it would delete.
- **After success** the browser drops its copy of the (server-revoked) session with a local `signOut` and leaves with a
  full load to the public `/account-deleted`, which reads no account data.
- **Plaid failure** (`plaid_removal_failed`, 502): a new error code from the route, named only, with no Item id or
  Plaid text; the operator log is unchanged.
- **Newly public paths** (`src/proxy.ts`): the four legal pages, `/api/legal` (a boolean and four paths) and
  `/account-deleted`. None reads user data; while the switch is off the pages are 404s.
- **The read-only banner**: while the lock is held, every dashboard screen says so (writes refused by the guard
  otherwise fail silently for UPDATE/DELETE, which match no rows).
- **Unreadable answers are "uncertain", never "not deleted"** (web `src/lib/account/screen.ts`, native
  `mobile/lib/account/delete-account.ts`): only the route's own JSON `could not delete account` says the account
  wasn't deleted; a gateway 504, an HTML page or an unknown code says it may or may not have run and that retrying is
  safe (deletion is idempotent).
- **Obligation, not yet built: the retained-billing-record purge.** Privacy and `/account-deletion` say Path B's
  billing records are kept for `LEGAL_RECORD_RETENTION_YEARS` after deletion, "then deleted in line with our retention
  schedule". No job does that yet. It must exist before billing goes live (roadmap Phase 4), and it must use the
  ledger's explicit mechanisms, never weaken the RESTRICT keys or immutability triggers.
- **Retention 0 is a structural promise.** The owner set `LEGAL_RECORD_RETENTION_YEARS=0` (2026-09-28): the legal
  pages say deleting an account deletes its data right away. True today (billing off, production's ledger tables
  empty, so Path B cannot happen). The production build (`productionEnvProblems`, npm `prebuild`) refuses
  `billingLive()` with retention 0, so billing cannot ship until Path B's retention is decided (Phase 4).
- **`billing_events.payload` keeps the raw RevenueCat event on Path B.** The "email and sign-in details removed" claim
  holds only while the app never sets a RevenueCat `$email` (or any other personal) subscriber attribute. Rule: don't
  set one; if that ever changes, the payload needs scrubbing on deletion first.
- **Step-up uses the user-level `last_sign_in_at`**, so a fresh sign-in on any device lets every live session of that
  user delete for 10 minutes. Acceptable for V1 (each session is already that user); later, check the session's own
  `iat` / AAL instead.
- **`POST /api/account/delete` has no Origin check.** The cookie is `SameSite=Lax`, so a cross-site POST carries no
  session; an Origin/Referer check would be defense in depth for later.
- **"Our servers and database are in the United States"** (Privacy): production Supabase is in AWS `us-east-2` and
  Vercel functions run in `cle1` (`vercel.json`, `docs/deploy.md`). Re-check the sentence if either region moves.

## Deferred (not blocking deploy)

- **Content-Security-Policy** — none set. Add a `headers()` block in
  `next.config.ts` (`connect-src` must include the Supabase origin + `wss:` for
  realtime; fonts are self-hosted by `next/font`). Do in a hardening pass.
- **PNG PWA icons** — manifest uses SVG (fine for Android/Chrome; iOS prefers
  PNG `apple-touch-icon`).
