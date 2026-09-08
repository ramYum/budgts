# Security review — Phase 1 (2026-09-07)

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

## Deferred (not blocking deploy)

- **Content-Security-Policy** — none set. Add a `headers()` block in
  `next.config.ts` (`connect-src` must include the Supabase origin + `wss:` for
  realtime; fonts are self-hosted by `next/font`). Do in a hardening pass.
- **PNG PWA icons** — manifest uses SVG (fine for Android/Chrome; iOS prefers
  PNG `apple-touch-icon`).
- **Rotate** the Supabase DB password and Google client secret (shown in chat
  during setup) — see `docs/deploy.md`.
