# Budgts — AGENTS.md

## Purpose

This file defines how AI agents should divide work on **Budgts** so the project keeps high engineering quality without using the most expensive model for every task.

The routing principle is:

> Use the least expensive agent that can complete the task reliably. Escalate when the task has architectural risk, ambiguity, financial-correctness risk, high blast radius, or is expensive to reverse.

Do not sacrifice correctness, test coverage, architecture, financial integrity, security, or maintainability to save tokens.

**Mobile exception (owner decision):** all Expo / React Native mobile implementation belongs to `budgts-architect` (Opus 5.5 Medium), even when the task is straightforward. This covers anything that creates, modifies, debugs, reviews, or materially affects the native mobile app, Expo Router, React Native UI, native authentication/deep links, native Plaid Link, RevenueCat/mobile billing integration, native configuration, EAS configuration that changes app behavior, device-specific behavior, mobile API integration, secure storage, Android/iOS native wiring, and mobile tests that exercise runtime behavior. The least-expensive-agent principle still applies to non-mobile work. Native mobile is currently **on hiatus** (paused, not abandoned — see `CLAUDE.md`); its code is archived on branches, not on `main`, so the mobile rules here apply when that work resumes.

---

## Project authority

Agents must follow project documents in this order when relevant:

1. `CLAUDE.md`
2. `AGENTS.md`
3. Authoritative feature/design specs under `docs/specs/`
4. `docs/roadmap.md`
5. `docs/workflow.md` and/or `workflows/*`
6. Implementation-specific supporting documentation

### Important scope rule

A design/spec document may describe long-term or future behavior. The roadmap and explicit owner instructions determine what belongs in the current task or milestone.

Do not pull future systems into the current milestone merely because they are described somewhere in the repository.

If documents conflict, do not silently choose a new direction. Surface the conflict to the owner.

---

# Routing summary (Claude Code subagents)

- **Main/default:** Sonnet 5 Medium handles normal non-mobile engineering, planning/coordination, documentation/spec work, ordinary web UI, data/config, and supporting tooling directly.
- **All mobile implementation, plus high-risk or architectural work** -> `budgts-architect` (Opus 5.5 Medium).
- **Bulk mechanical/low-risk work** -> `budgts-utility` (Haiku 4.5 Low).

Definitions:

- `.claude/agents/budgts-architect.md`
- `.claude/agents/budgts-utility.md`

Rules:

- Use the least expensive capable agent for non-mobile work.
- Expo / React Native implementation always goes to `budgts-architect`.
- Do not use Opus for routine non-mobile coding unless a high-risk trigger applies.
- Do not use Haiku for architecture, financial logic, security, auth, database design, Plaid behavior, monetization, or production-infrastructure decisions.
- Do not delegate tiny trivial operations when delegation overhead would cost more than doing them directly.
- If a task contains separable low-risk work, delegate that portion to `budgts-utility` only when it is bulk-sized.

---

## Delegation cost rule

Spawning a subagent has a fixed cost: it starts cold, re-reads context, and reports back.

> When delegation overhead is likely larger than the task itself, Sonnet should perform the task directly.

Do NOT delegate just because a task technically matches another agent's category.

Sonnet handles directly:

- single-file searches
- a few grep/rg queries
- trivial renames
- one or two JSON/config edits
- small documentation edits
- simple test execution
- tiny localized web changes
- tasks likely to take only a few minutes

Use `budgts-utility` only when the mechanical task is large enough that context isolation or bulk processing materially helps.

Good utility examples:

- inventorying many files or routes
- searching many files across the repository
- bulk documentation cleanup
- repetitive test-fixture generation
- large test/log summaries
- broad mechanical repository audits
- repetitive validation across many files
- mechanical migrations after the architecture and exact transformation are already defined
- comparing schemas/configurations against explicit rules
- large lint/style cleanup with no behavior change

Bad utility examples:

- find one symbol
- grep one file
- rename one variable
- change one JSON value
- run one test command
- edit one documentation sentence

Decision model:

```text
Any Expo / React Native implementation (any size)
  -> budgts-architect (Opus 5.5 Medium)

Tiny/simple non-mobile task
  -> Sonnet directly

Normal non-mobile web/tooling work
  -> Sonnet directly

Large mechanical / repetitive / context-heavy task
  -> budgts-utility (Haiku 4.5 Low)

High-risk / architectural / expensive-to-reverse task
  -> budgts-architect (Opus 5.5 Medium)
```

The cost rule does not lower quality bars: high-risk work still goes to `budgts-architect`, however small the edit looks.

---

# Model routing

## Tier 1 — Mobile Implementation Owner + Senior Architect / Reviewer

**Preferred model:** Opus 5.5  
**Preferred effort:** Medium

Owns all Expo / React Native implementation and is used wherever stronger reasoning materially reduces project risk.

Use for:

- all native mobile implementation
- Expo Router and React Native UI/runtime behavior
- mobile authentication and deep-link architecture
- secure storage/session handling
- native Plaid Link integration
- RevenueCat / Apple IAP / Google Play Billing integration
- Android/iOS native configuration that materially affects behavior
- EAS build/runtime architecture
- mobile/backend trust boundaries
- financial correctness and transaction semantics
- Plaid ingestion/sync architecture
- pending -> posted identity behavior
- reconnect/disconnect semantics
- transfer detection and pairing
- recurring/subscription/bill detection when financial behavior changes
- database schema changes and migrations
- RLS/security-sensitive changes
- authentication architecture
- account deletion, data retention, and de-identification
- monetization and entitlement architecture
- influencer attribution / commission ledger
- immutable financial-record behavior
- production architecture changes
- major dependency choices
- difficult cross-system bugs
- conflicting specifications
- milestone/launch architecture review
- decisions expensive to reverse

Do **not** normally use Opus for routine non-mobile work such as:

- simple web styling
- small documentation edits
- ordinary non-financial forms
- repetitive data/config edits
- bulk cleanup
- simple searches
- routine test execution

Expected workflow:

1. Analyze.
2. Identify affected systems and risks.
3. Define invariants and acceptance criteria.
4. Add or update tests first where practical.
5. Implement the smallest correct change that follows the existing architecture.
6. Run relevant validation.
7. Run the broader/full suite for high-risk or milestone-level work.
8. Review only when the change warrants senior review.

---

## Tier 2 — Primary Engineer

**Preferred model:** Sonnet 5  
**Preferred effort:** Medium by default; Low for straightforward work

This is the main/default session for everything except mobile implementation and architect-level risk.

Use for:

- planning and coordination
- writing targeted handoffs to `budgts-architect`
- documentation/spec work
- normal Next.js web UI and forms
- ordinary server-side application work that does not cross a high-risk boundary
- data/config changes
- supporting scripts and tooling
- tests for routine non-mobile changes
- repository maintenance
- operational documentation

Sonnet may read mobile, financial, Plaid, schema, security, auth, and monetization files for context, but must delegate implementation whenever the task falls under architect ownership.

Rule: follow the existing architecture. If the task reveals architectural uncertainty, financial-integrity risk, conflicting requirements, migration risk, security implications, or a large cross-system decision, escalate instead of inventing a new architecture.

---

## Tier 3 — Utility Engineer

**Preferred model:** Haiku 4.5  
**Preferred effort:** Low

Use for narrow, mechanical, low-risk tasks with explicit requirements, only when the task is bulk-sized.

Use for:

- broad repository searches
- finding symbols/files/references across many files
- TODO/FIXME inventories
- repetitive config/data edits
- documentation formatting/cleanup
- naming-consistency checks
- repetitive test-fixture generation
- running and summarizing large test suites/logs
- checking output against explicit requirements
- lint/style cleanup with no behavior change
- simple validation scripts
- comparing explicit lists/configurations
- mechanical migrations whose design and transformation are already fully specified

Do not give the utility agent authority to:

- redesign architecture or service boundaries
- change financial semantics or budget effects
- change Plaid ingestion/sync behavior
- change database schema design
- weaken or redesign RLS/security
- change authentication architecture
- change account deletion/retention behavior
- change monetization, entitlements, commissions, or billing rules
- choose major dependencies
- modify native mobile runtime behavior
- resolve conflicting specifications
- make production-infrastructure decisions

If the task needs any of the above, stop and escalate.

---

# Escalation rules

Escalate to **Opus 5.5 Medium** when any of these are true:

1. The change affects 3+ major systems.
2. Existing specifications conflict.
3. Correct financial behavior is materially ambiguous.
4. Transaction identity/integrity could break.
5. Plaid sync/reconnect/pending-posted behavior changes.
6. A database schema or migration changes.
7. RLS, security, secrets, or trust boundaries change.
8. Authentication/session behavior changes.
9. Account deletion, retention, or de-identification changes.
10. Real-money purchases, subscriptions, entitlements, commissions, or monetization rules are involved.
11. A major dependency/plugin choice must be made.
12. A bug survives two reasonable implementation attempts.
13. The change would be expensive to reverse.
14. Production architecture materially changes.
15. A milestone is ready for final architecture review.
16. An implementation would break an existing hard rule.
17. Mobile implementation is required.

Otherwise, prefer **Sonnet 5** for normal non-mobile work.

For bulk mechanical/low-risk work, prefer **Haiku 4.5**.

---

# Token-efficiency rules

## Read only what is necessary

Do not repeatedly reread the whole repository.

Preferred context order:

1. `CLAUDE.md`
2. `AGENTS.md`
3. files directly relevant to the task
4. related interfaces/tests
5. relevant feature/design spec under `docs/specs/`
6. roadmap/workflow/supporting docs only when needed

A narrow task gets narrow context.

## Prefer targeted handoffs

Every delegation should include:

- exact task
- relevant files
- constraints
- acceptance criteria
- tests to run
- explicit out-of-scope items

Good:

> Fix the Android Magic Link return flow using the approved mobile-auth architecture. Preserve web Magic Link behavior, do not alter Google OAuth unless necessary, and verify the app receives `budgts://auth/callback` on a real-device-compatible build.

Bad:

> Read the whole project and improve mobile auth.

## Keep reports concise

Subagents should report only:

- files changed
- behavior changed
- tests/results
- failures/blockers
- architectural questions
- owner action required

Avoid long command transcripts unless debugging requires them.

---

# Standard workflow

```text
Sonnet plans/coordinates and handles normal non-mobile parts
        ↓
budgts-architect handles mobile and architect/high-risk parts
        ↓
Relevant tests + typecheck/lint/build
        ↓
Implementing agent fixes failures
        ↓
Full/broader suite for high-risk or milestone work
        ↓
Utility validation only for bulk mechanical checks when useful
        ↓
Separate architect review only when high-risk or milestone-level
```

Do not invoke a separate Opus review merely to repeat work already validated by tests unless the risk profile justifies it.

---

# Budgts routing examples

## Opus 5.5 Medium / `budgts-architect`

- Implement any Expo / React Native feature.
- Implement mobile Home, Accounts, Transactions, Budgets, Goals, or Money Left.
- Implement or debug mobile Magic Link/Google deep linking.
- Integrate native Plaid Link.
- Integrate RevenueCat.
- Change transaction qualification or budget-effect logic.
- Change transfer pairing.
- Change pending -> posted handling.
- Change reconnect/disconnect semantics.
- Change recurring/subscription/bill detection semantics.
- Add or change a database migration.
- Change RLS.
- Design account deletion/retention.
- Change entitlement or influencer-commission logic.
- Diagnose a bug spanning Plaid, DB, financial logic, and UI.
- Perform a launch/milestone architecture audit.

## Sonnet 5 Medium

- Plan a milestone and write a targeted architect handoff.
- Build ordinary web-only UI that does not alter financial semantics.
- Update help/documentation/specs.
- Implement routine non-mobile tooling.
- Make ordinary web form/layout changes.
- Update roadmap/workflow documentation.

## Sonnet directly (tiny mechanical non-mobile work)

- Add one config/documentation entry.
- Rename one low-risk variable.
- Find one symbol.
- Fix one documentation sentence.
- Run one test command.

## Haiku 4.5 / `budgts-utility` (bulk only)

- Inventory every route/component using a deprecated helper.
- Search hundreds of files for old API references.
- Generate many repetitive fixtures from an approved format.
- Clean a large batch of mechanical lint findings.
- Compare all migration filenames/metadata against an explicit rule.
- Summarize a large test or build log.
- Perform bulk documentation formatting.

---

# Engineering hard rules

## Financial semantics

Budgts measures spending from **economic activity, not bank-account movement**.

Preserve these invariants unless the owner explicitly changes the product model:

- Purchases/eligible fees/interest are expenses when economically appropriate.
- Transfers between the user's own accounts are not new spending.
- Credit-card payments are not new spending.
- Refunds reverse spending; they are not ordinary income.
- Income is distinct from transfers and payment movements.
- Duplicate source records must not become duplicate economic events.
- Pending -> posted transitions must remain one economic event.
- User categorization and explicit user overrides must survive ingestion/reconciliation changes.
- User-specific merchant/category choices must not be silently overwritten by machine behavior.
- No silent financial corrections.
- UI code must not independently re-implement authoritative financial formulas.

When financial meaning is uncertain, escalate rather than guessing.

## Plaid and ingestion

- Plaid access tokens remain server-only and encrypted at rest.
- Client code must never receive Plaid access tokens.
- Preserve source identity and idempotency.
- Reconnect/disconnect behavior must not destroy historical financial activity unless the user explicitly chooses destructive deletion.
- Disconnecting stops future sync while retaining already imported history under the established product rules.
- Pending/posted, duplicate containment, sign convention, transfer pairing, and recurring detection must remain deterministic and testable.
- Do not broaden transaction-history recall or user categorization workload without explicit product approval.

## Database and migrations

- Treat schema changes and migrations as high-risk.
- Verify the target environment before migration work.
- Do not casually weaken constraints, immutability, or foreign-key behavior to make a feature pass.
- Preserve migration-history safety checks and environment targeting.
- Never use production data as disposable test data.
- Financial/history tables designed as immutable must remain immutable except through explicitly designed adjustment/reversal mechanisms.
- Add migration/integration tests where appropriate.

## RLS and security

- Never weaken RLS merely to make a feature work.
- Mobile/web clients must never receive service-role credentials.
- Server-only secrets stay server-only.
- Derive authenticated user identity server-side for privileged operations.
- Treat authorization boundaries as part of correctness, not optional hardening.
- Avoid logging credentials, access tokens, secrets, or sensitive payloads.

## Authentication

- Preserve platform-appropriate auth behavior.
- Web auth must continue working when mobile auth changes, and vice versa.
- Mobile deep links/callbacks must not silently fall back to the wrong platform.
- Authentication/session changes require explicit tests for invalid/missing credentials and cross-user isolation.

## Mobile

All Expo / React Native implementation belongs to `budgts-architect`.

- Reuse authoritative backend/domain behavior rather than duplicating financial logic on-device.
- Mobile uses public/publishable credentials only.
- Secure tokens belong in approved secure storage.
- Native Plaid, RevenueCat, and similar integrations must stay behind clear boundaries.
- Demo/tour data must never contaminate or mutate real user financial data.
- Device-specific behavior must be tested with the most realistic available environment; do not treat browser-only verification as proof of native behavior.

## Monetization

- Web customer subscription checkout remains out of scope unless the owner explicitly changes that decision.
- Paid mobile functionality uses Apple/Google store billing with RevenueCat/approved entitlement architecture.
- Backend owns entitlement truth/mirror; client UI is not authoritative.
- Historical attribution and commercial terms are immutable once earned under the established ledger design.
- Refunds/reversals use explicit adjustment mechanisms rather than rewriting historical allocation records.
- Influencer commission logic must use actual commissionable proceeds under the approved terms, not guessed list-price math.
- Do not infer or fabricate store/payment events.

## Account deletion and retained records

- Account deletion must honor the established two-path lifecycle and retention requirements.
- Do not weaken immutable monetization records to simplify deletion.
- Delete operational/personal data when required while retaining only legitimately required financial records under the approved design.
- De-identification must not silently corrupt referential or financial integrity.

## Tour/demo data

- Product education should use isolated controlled/demo state.
- Demo/tour state must never write into or contaminate the user's real financial records.
- A real action may be entered from the tour only when intentionally designed.
- Do not build a second financial-calculation implementation solely for demo purposes.

## Scale and infrastructure

Engineer for scale, but do not prematurely add infrastructure complexity or paid upgrades without measured need or launch readiness.

- Prefer instrumentation and measurement before scaling changes.
- Avoid speculative distributed-systems complexity.
- Preserve bounded/idempotent background-work patterns.
- Treat Supabase/Vercel/Expo/etc. upgrades as operational decisions driven by measured limits or launch readiness, not assumptions.

---

# Finding severity

Use this classification when reviewing or reporting issues:

## 🔴 Must fix before launch / before proceeding

Examples:

- financial correctness
- data integrity
- security/RLS/auth boundary failures
- destructive behavior
- schema/migration safety defects
- entitlement/monetization correctness
- architecture contradictions that could corrupt or mis-handle user data
- broken core workflows

## 🟡 Should fix before launch

Examples:

- meaningful UX problems
- recurring reliability annoyances
- non-destructive performance issues
- confusing but recoverable flows

## 🟢 Later / polish

Examples:

- cosmetic polish
- non-material edge cases
- optional improvements without correctness or launch impact

Do not inflate severity. Base it on actual impact.

---

# Quality gates

A task is not complete just because code compiles.

## Testing policy

Use **relevant tests normally; run the broader/full suite for high-risk or milestone-level work.**

Relevant work should include, as applicable:

- unit tests / Vitest
- DB integration tests
- typecheck
- scoped or full lint
- production build
- E2E tests for affected critical flows
- mobile typecheck/tests for mobile work
- Expo Doctor / `eas config` when native/mobile config changes
- EAS build when the task's acceptance criteria require a real native artifact
- migration preflight/history verification for migration work
- staging verification for backend/DB/auth/Plaid flows when appropriate

High-risk/milestone work should run the broadest practical validation matrix, not merely the nearest unit test.

Do not hide or normalize unexplained failures. Distinguish pre-existing failures from regressions with evidence.

---

# Git policy

Agents may inspect Git status/diffs and prepare changes.

After a completed and validated task, agents **may create a local commit** when that fits the established workflow.

Agents must **not push, merge, tag, publish, or rewrite shared history without explicit owner approval**.

Do not include unrelated pre-existing changes in a commit.

Do not commit secrets, `.env` files, build artifacts, or temporary data.

---

# Review philosophy

Use:

```text
Haiku 4.5
    for bulk mechanical work

Sonnet 5
    for coordination and most normal non-mobile engineering

Opus 5.5 Medium
    for all Expo / React Native implementation,
    architecture, financial correctness, high-risk decisions,
    difficult reasoning, and senior review
```

The goal is:

> Opus-level quality for mobile and wherever judgment or financial integrity matters, Sonnet-level efficiency for normal web/tooling/coordination work, and Haiku-level efficiency for large repetitive tasks.
