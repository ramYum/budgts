# "How Budgts Works" guide

**Status: REMOVED from the release path (2026-09-20, commit `7468365` on `mobile/native-home`).** Budgts ships with no app tour for now; a replacement will be built separately. This document is kept as **history and input for that replacement**, not as a description of the app. The pre-removal code is on the local archive branches `archive/native-home-with-claude-tour` and `archive/claude-tour-redesign`. Originally: shipped as a static content page (`/help/how-it-works`, now a 404).

## Problem

New users could see *where* the buttons are (the first-run tour) but had
nowhere permanent to read *how the whole workflow fits together* — connect
→ transactions arrive → auto-categorize → review exceptions → budget →
Money Left → track progress — or why it's designed to take less of their
time than a spreadsheet. Product positioning: "The app does the
bookkeeping. The user reviews, corrects, and plans."

## What shipped

A static page, `src/app/(app)/(dashboard)/help/how-it-works/page.tsx`,
reachable from a new entry card at the top of `/help` (above the existing
"Replay the tour" link) and from a link on the live tour's final card. No
DB reads, no client state — plain server-rendered content, same shape as
the existing Help FAQ list.

Core message, stated at the top and echoed in the closing card: **"You
spend. Budgts keeps track."** The full pitch: "Connect your accounts, spend
normally, and Budgts automatically keeps track of your transactions and
organizes your spending — so you don't have to."

Seven steps (icon + heading + 1–2 sentences each, `NavIcon` glyphs —
`connected-banks`, `activity`, and three new ones added to that shared set,
`categorize`/`review`/`money-left`, plus the existing `budgets`/`insights`):

1. Connect your accounts
2. Transactions arrive automatically
3. Budgts sorts them for you
4. You review the exceptions
5. Set your budgets
6. See your Money Left
7. Track your progress

Money Left is described exactly as the rest of the product already
describes it — "your income minus your spending so far this month... not
your savings-account balance" — matching the Help FAQ and the dashboard
hero card. No new financial semantics.

Closes with a link to the guided tour (`/tour`) as an optional, hands-on
follow-up — never a gate, never mandatory reading before using the app.

## Relationship to the tour(s) — important status note

**As of this guide shipping, only the original (v1) first-run tour is
live**: `/tour` route, `TourWizardContent`/`TourWizard`, illustrated cards
including "Connect your bank to turn it on" and "Sorted for you." The **live
coachmark tour (v2)** — spotlight + tooltip anchored to the real button on
the real page — described in
`docs/specs/2026-09-15-first-run-tour-live-coachmarks-design.md` and
`docs/superpowers/plans/2026-09-15-first-run-tour-coachmarks.md` is **still
only a plan**; none of its 9 tasks have been executed. Do not treat that
spec/plan as describing current behavior until the plan's tasks are
actually checked off.

This guide was deliberately built against the **current, live** tour, not
the planned one, and its terminology (connect your accounts, automatic
transaction tracking, automatic categorization, review exceptions, set a
budget, Money Left, savings rate) was chosen to already match the v2 plan's
own copy — so if/when that plan is executed, no rework is needed here
beyond re-pointing the one existing link (currently `/tour`, would become
`/?tour=replay` per that plan's design) and, optionally, adding an
equivalent "see the whole workflow" link on the coachmark tour's own final
card, mirroring what this change already did for v1.

## What this deliberately does not duplicate

The tour (either version) teaches **where** the real controls are — this
page teaches **how the workflow fits together and why it's convenient**.
Neither page repeats the other's content; both use the same vocabulary.

## Out of scope

No change to financial calculations, transaction semantics, categorization
logic, database schema, or Plaid ingestion. No new dependency. The v1 tour
itself is untouched except for the one footnote link addition on its final
card.
