# Manual subscription grant: how to grant

A **permanent manual grant** gives an account Premium (bank connect and
refresh included) without a store subscription. Launch spec §9: "The owner's
existing accounts are grandfathered by a manual entitlement grant, recorded as
such." Only the owner runs it against production.

## What it writes

One `entitlements` row per account, in the 0024 columns (no migration):
`state = 'active'`, `provider = 'manual'`, `access_until = 9999-12-31`,
`will_renew = false`, store, product, customer id and price all null.
`hasPremium` is true with the ordinary rules. A finite far-future date is used
rather than Postgres `'infinity'`, which the drivers return as text that turns
into an Invalid Date.

`provider = 'manual'` is what protects it: the reducer refuses every RevenueCat
event and reconcile snapshot on that row (`reason: "manual_grant"`, logged on
the event), the scheduled reconcile never selects it, and the lapse sweep
excludes it. Only this tool changes it.

Every grant or revoke also writes one `billing_events` row (`provider =
'manual'`, `event_type` `MANUAL_GRANT` / `MANUAL_GRANT_REVOKED`, status
`processed`) whose payload records the reason, who ran it (`--by`, default the
OS user name), the access end and the row it replaced. That row is the audit
trail, and `billing_events` is immutable.

## Running it

```
BILLING_GRANT_CONFIRM_REF=<project-ref> npm run billing:grant -- \
  --ref <project-ref> --email <a> [--email <b> ...] --reason "<text>" \
  [--apply] [--revoke] [--env-file <path>] [--by <who>]
```

- **Dry run by default.** It prints each email resolved to its user id, the
  current entitlement and the row it would write. Nothing is written without
  `--apply`.
- **Target confirmation**, as `predb:migrate` does (`tools/db/target-safety.ts`):
  the project ref in the database URL must equal both `--ref` and
  `BILLING_GRANT_CONFIRM_REF`. Retired staging projects are refused.
- The URL is `DIRECT_URL` (else `DATABASE_URL`) from the shell, then from
  `--env-file` (default `.env.local`, which is PRODUCTION; use
  `--env-file .env.staging` for staging).
- **All or nothing on input.** An unknown or ambiguous email, an account whose
  deletion has started, or an account with a live store subscription (a grant
  would overwrite it) stops the run before anything is written.
- **Idempotent.** Re-running on a granted account says "already granted:
  nothing changed" and writes no second audit row.
- `--revoke` ends a manual grant now (`state = 'expired'`, `provider = null`)
  so purchases apply normally again. An ended entitlement is then subject to
  the lapse sweep like any other (its banks are removed 7 days later once
  billing is on), so revoke only on purpose.

## Production (the owner's accounts)

```
# 1. dry run: read the printed user ids and planned rows
BILLING_GRANT_CONFIRM_REF=wsmhstqpvbbcqpqhiqyp npm run billing:grant -- --ref wsmhstqpvbbcqpqhiqyp \
  --email <owner-email-1> --email <owner-email-2> --email <owner-email-3> \
  --reason "Owner accounts grandfathered (launch spec §9)" --by "<owner name>"

# 2. apply: the same command with --apply
BILLING_GRANT_CONFIRM_REF=wsmhstqpvbbcqpqhiqyp npm run billing:grant -- --ref wsmhstqpvbbcqpqhiqyp \
  --email <owner-email-1> --email <owner-email-2> --email <owner-email-3> \
  --reason "Owner accounts grandfathered (launch spec §9)" --by "<owner name>" --apply
```

Run it from the repo root on a checkout that has the tool. Production needs
only migration `0024` for it. In PowerShell, set the variable first with
`$env:BILLING_GRANT_CONFIRM_REF = "wsmhstqpvbbcqpqhiqyp"`. Running step 2 a
second time must print `already_granted=3`.
