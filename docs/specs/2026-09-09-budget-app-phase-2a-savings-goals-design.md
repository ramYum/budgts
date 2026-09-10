# Phase 2a Design — Savings goals

Date: 2026-09-09
Status: approved (planning), implementing on `phase-2/savings-goals`

## Purpose

A user can create named **savings goals** with a target amount (and optional
target date), log **contributions** toward them, and see per-goal progress —
live across devices. First sub-checkpoint of Phase 2, which completes the v1
feature set.

## Non-goals for 2a

- Recurring / subscription / bill detection (now **V1.5**, over synced
  transaction data — no `recurring_rules` table).
- Paired transfer detection (now **V1.5**, after V1 Plaid ingestion).
- Any link between a contribution and a `transactions` row, an `accounts`
  balance, or the derived monthly "Net savings" tile. Contributions are their
  own ledger, full stop.
- Interest, projections, "on track vs target date" pacing (could come later).
- Multi-currency (v1 is single-currency per user).

## Data model

Two RLS-scoped tables, same idiom as the Phase 1 tables (`uuid` PK
`gen_random_uuid()`, `user_id uuid`, money as `integer` minor units,
`timestamptz`).

### `savings_goals`
| col | type | notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid | FK `auth.users` on delete cascade |
| `name` | text | 1–60 chars (enforced in Zod) |
| `target_amount` | integer | minor units, CHECK `> 0` |
| `target_date` | date | nullable |
| `is_archived` | boolean | default false |
| `created_at` | timestamptz | default now() |

Index: `savings_goals_user_idx` on `user_id`.

### `savings_contributions`
| col | type | notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `user_id` | uuid | FK `auth.users` on delete cascade |
| `goal_id` | uuid | FK `savings_goals.id` on delete cascade |
| `amount` | integer | minor units, CHECK `<> 0`. Positive = added, negative = withdrawn/corrected. Set by the server action, never typed with a sign. |
| `occurred_at` | timestamptz | when it happened |
| `note` | text | nullable |
| `created_at` | timestamptz | default now() |

Indexes: `savings_contributions_user_idx` on `user_id`,
`savings_contributions_goal_idx` on `goal_id`.

### Hand-appended to the migration (not drizzle-generated)
- `auth.users` FK for `user_id` on both tables (`ON DELETE cascade`).
- CHECK constraints above.
- `ENABLE ROW LEVEL SECURITY` + one `FOR ALL TO authenticated` policy per table,
  `USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) =
  user_id)` — copied verbatim from `0000_*.sql`.
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.savings_goals;` and
  `... public.savings_contributions;`.
- Rollback comment: `DROP POLICY … ; DROP TABLE savings_contributions; DROP
  TABLE savings_goals;` (publication membership drops with the table).

## Domain logic — `src/lib/budget/savings.ts`

Pure, no DB calls, unit-tested first.

- `goalProgress(goal, contributions)` →
  `{ id, name, target, saved, remaining, pct, complete, targetDate }`
  - `saved = Σ contribution.amount` (contributions already filtered to this goal)
  - `remaining = max(0, target - saved)`
  - `pct = target > 0 ? clamp(round(saved / target * 100), 0, 100) : 0`;
    `pct = 0` when `saved <= 0`
  - `complete = saved >= target`
- `goalsSummary(goals, contributions)` →
  `{ totalTarget, totalSaved, activeCount, completeCount }` over
  non-archived goals only.

## Validation — `src/lib/validation/savings.ts`

Reuse the money-string transform idiom from `src/lib/validation/budget.ts`
(`parseMoney` from `@/lib/budget/money`).

- `savingsGoalFormSchema`: `name` (trim, 1–60), `targetAmount` → positive minor
  units (reject `<= 0`), `targetDate` (`""` → `null`, else `YYYY-MM-DD`).
- `contributionFormSchema`: `goalId` (uuid), `amount` → **positive** minor units
  (the sign is applied server-side by the withdraw action), `occurredAt`
  (`YYYY-MM-DD`), `note` (max 200, `""` → `null`).

## Server actions — `src/server/savings.ts`

Shape copied from `src/server/categories.ts` (`withUser()`, `ActionState =
{ error?; fieldError?; ok? }`, Zod `safeParse`, user's supabase client, `user_id`
set on insert, `revalidatePath(["/", "/goals"])`).

- `createGoal`, `updateGoal`, `setGoalArchived`
- `addContribution` — inserts `amount` as parsed (positive)
- `withdrawFromGoal` — inserts `-amount` (same Zod schema; negation is the only
  difference), for taking money out or correcting a mistake
- `deleteContribution` — by `id`

## Screens

- **`/goals`** (`src/app/(app)/(dashboard)/goals/page.tsx`) — server component.
  Fetches non-archived `savings_goals` + all `savings_contributions` for the
  user; computes `goalProgress` per goal + `goalsSummary`. Renders `<GoalsView>`
  with `<RealtimeRefresh tables={["savings_goals","savings_contributions"]} />`.
- **`<GoalsView>`** — a summary line (`goalsSummary`), then one card per goal:
  name · `saved / target` (tabular) · progress bar (`bg-track` trough +
  `bg-fill-under` fill, reused from `dashboard-view.tsx`) · `remaining to go`
  or **"Reached"** when complete. Per card: **Add**, **Withdraw**, **Edit**,
  **Archive**. Top-level **"+ Add goal"** (`bg-primary` — the one primary
  action) opens `<Overlay>` + `<GoalForm>`. Empty state invites the first goal.
- **`<GoalForm>`** / **`<ContributionForm>`** — mirror
  `src/components/category-form.tsx` (`useActionState`, `field` const, inline
  `text-neg` errors, `bg-primary` submit + bordered Cancel). ContributionForm is
  reused for both Add and Withdraw (different `action` + title + submit label).
- **Bottom nav** — add a 5th tab `Goals` → `/goals` in
  `src/components/bottom-nav.tsx`.

Light + dark from brand tokens; `tabular-nums` on amounts; visible focus ring.

## Error handling

- Zod errors → inline field messages; no raw 500.
- Auth loss → redirect to sign-in.
- Write failure → toast/message, form stays open with its data.
- Withdraw that would take `saved` below 0 is **allowed** (it's a correction
  tool); the bar just clamps `pct` to 0.

## Testing — definition of done

- **Unit (Vitest):** `savingsGoalFormSchema` + `contributionFormSchema` (valid +
  invalid); `goalProgress` (partial, complete, over-target, over-withdrawn,
  zero-target guard); `goalsSummary` (archived excluded). Domain tests written
  first, watched fail.
- **Component (RTL):** `goals-view.test.tsx` — progress rendering, "Reached"
  state, empty state.
- **E2E (Playwright):** `tests/e2e/goals.spec.ts` — create goal → add
  contribution → assert `20%` / `$2,000.00 / $10,000.00` / `$8,000.00 to go`
  → withdraw → edit → archive. Follows the "E2E against Supabase — required
  posture" in `docs/conventions.md`.
- `lint`, `typecheck`, `test`, `build` green.

## Verification (end to end)

1. `npm run db:generate` → review the emitted SQL → hand-append
   RLS/CHECK/FK/publication → **do not apply to prod yet**.
2. `npm run lint && npm run typecheck && npm run build`; `npm run test`
   (unit + component) — all green. Domain tests were red first.
3. Apply the migration to a **non-prod** database (confirm which with the owner
   — no local Docker, so likely a temporary free Supabase project). Run
   `npm run test:e2e` against it — `goals.spec.ts` + existing suite green.
4. Only then: apply the migration to prod Supabase, verify `pg_policies` shows
   `own savings_goals` + `own savings_contributions`, commit, ff-merge `main`,
   push. Confirm the Vercel deploy is green and `https://budgts.com/goals`
   loads for a signed-in user.

## Open (not 2a)

- V1.5 recurring-transaction detection over synced Plaid data (detect →
  confirm / edit / mute), not a "generate when due" rule engine.
- ~~Email vs Plaid ingestion order~~ — resolved 2026-09-09: **Plaid first (V1)**;
  recurring intelligence V1.5; email / receipt V2. See `docs/roadmap.md`.
