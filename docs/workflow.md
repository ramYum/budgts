## How we work

Claude is the primary implementation agent for this repository.

The owner defines product direction and makes consequential business/product decisions. Claude is expected to make normal engineering decisions independently and continue working without requesting approval for routine implementation choices.

### Claude may act independently

Claude may, when reasonably necessary:

* inspect and modify the codebase
* choose implementation details and internal architecture
* refactor existing code
* add, remove, or update normal dependencies
* create and modify tests
* create database migrations
* apply migrations to staging/test environments
* configure staging and sandbox services
* create test data and clean it up
* run development, test, lint, typecheck, build, integration, and e2e commands
* create working branches
* commit completed work
* push feature branches
* create or update draft pull requests
* investigate and fix failures discovered during implementation
* update project documentation

Claude does not need owner approval for each of these actions.

Use judgment. Prefer reversible actions and preserve existing working behavior unless there is a clear reason to change it.

### Documentation authority

Project documentation is a living source of truth.

Claude is authorized and expected to update documentation whenever implementation or an approved decision makes existing documentation inaccurate, following the notice rule below.

This includes:

* `CLAUDE.md`
* `docs/roadmap.md`
* `docs/workflow.md`
* `docs/conventions.md`
* `docs/Thirdparties.md`
* relevant files under `docs/specs/`

Do not leave known-stale documentation behind simply because updating documentation was not explicitly requested.

Documentation responsibilities:

* `CLAUDE.md` — durable engineering and project rules
* `roadmap.md` — product direction and major priorities
* `workflow.md` — current execution state, active work, blockers, and important decisions
* `specs/` — detailed feature/design decisions
* `Thirdparties.md` — external-service state
* `conventions.md` — reusable engineering conventions

When implementation supersedes an old plan, update the authoritative document rather than preserving contradictory instructions.

Do not silently override a locked owner decision. If implementation reveals that a locked decision should change, surface the conflict to the owner.

### Documentation change notice

Before editing any `.md` file, Claude must first tell the owner:

* which file(s) it intends to change
* why the update is needed
* what will be added, removed, or corrected

For routine documentation maintenance, Claude may proceed after giving that notice and does not need to wait for approval.

Claude must stop and get owner approval first if the documentation change would alter:

* product direction
* pricing
* trial duration
* monetization policy
* revenue-share terms
* major UX direction
* major architecture decisions
* locked owner decisions

Recording a decision the owner has already made is routine maintenance. Changing or extending what was decided is not.

### Work continuously

Do not stop after every checkpoint solely to request permission to continue.

Continue through logically related work while:

* the direction is already established
* the actions are reversible
* tests remain meaningful
* no owner-gated boundary is crossed

Use checkpoints for verification and reporting, not automatic stopping points.

At meaningful checkpoints:

1. run the relevant quality gates
2. fix problems within scope
3. update affected documentation
4. commit the coherent work
5. continue if the next work is already authorized

### Owner-gated actions

Stop and request owner approval before:

* merging into `main`
* deploying to production
* applying production database migrations
* modifying or deleting production customer data
* force-pushing or rewriting shared Git history
* making irreversible production/external-service changes
* purchasing services or changing paid plans
* changing pricing, trial periods, commissions, or monetization policy
* making significant product/UX-direction changes
* making a major architecture change with substantial long-term cost or lock-in
* making a documentation change that alters any area listed under "Documentation change notice"

If uncertain whether something crosses one of these boundaries, explain the decision and ask.

### Decision making

For ordinary technical questions, Claude should decide rather than ask the owner to choose between implementation details they should not need to manage.

Before choosing:

1. inspect the existing implementation
2. check the relevant specs and conventions
3. consider maintainability, security, cost, and product scale
4. choose the simplest sound solution
5. test it
6. document meaningful decisions

When several approaches are reasonable, Claude may select one and explain the tradeoff afterward.

Escalate only when the choice materially affects product behavior, business policy, production safety, cost, or long-term architecture.

### Reporting

At meaningful checkpoints, report:

* what changed
* important decisions Claude made and why
* documentation updated
* tests and verification performed
* known risks or unresolved issues
* anything requiring owner approval
* what Claude intends to work on next

Do not turn routine implementation details into owner decisions.

### Current execution state

*Snapshot 2026-09-21; direction lives in `docs/roadmap.md`.*

* **Active work:** Mobile Launch. The monetization + staging block is pushed on `mobile/native-home` (PR #1, draft). The native
  app has sign-in and a read-only Home; the rest of the launch-required native surface is not built. Audit and proposed scope:
  `docs/specs/2026-09-21-mobile-only-transition-design.md`.
* **Blockers / open:** the native transport gap (web mutations are cookie-only Server Actions and the Plaid routes are cookie-only,
  so each native mutation needs a Bearer route or direct RLS access); no native currency onboarding; native Plaid needs an EAS
  dev build, and iOS builds need an Apple Developer enrolment that has not been done; no device or emulator on the dev machine;
  privacy / terms / support / web-deletion pages and universal-link files do not exist.
* **Owner decisions (2026-09-21):** the web/PWA is retired only after native covers all launch-required functionality and it is tested;
  launch scope approved with Goals, category management and in-app CSV export deferred; "web stays free" superseded; Sign in with
  Apple added to iOS scope; native testing model approved (no paid infrastructure); compliance / native-link infrastructure approved
  to build. Still the owner's: the final Privacy Policy and Terms wording.
* **Native architecture:** Bearer route handlers over shared `src/lib` domain services; the device uses Supabase for auth only
  (`docs/specs/2026-09-21-mobile-only-transition-design.md` §4A).
* **Not started (owner-gated):** production migrations 0017–0022 and deploy; RevenueCat, Resend and store-product setup.

### Infrastructure observations

* **Production statement timeouts (2026-09-16, not acted on).** A local e2e run against a production-backed build hit Postgres `canceling statement due to statement timeout` twice, and two specs (`budgets`, `goals`) went flaky waiting on a mutation to reflect. Suspected cause: Nano-tier shared-compute contention on the single production database, possibly amplified by `/budgets` re-running its full multi-query fetch after every mutation. The query itself is cheap (indexed, plain `auth.uid()` RLS), and manual SQL-editor queries were running on the same database at the time, so this is one data point, not a conclusion. Risk: latency or timeouts under load on the current tier. Response: measure first (Scale & Infrastructure in `docs/roadmap.md`), then upgrade the plan or fix the fetch if the data justifies it.
