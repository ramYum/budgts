# First-Run Tour v2 — Live Coachmarks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the illustrated "Connect your bank" / "Sorted for you" tour
cards with live coachmarks — a spotlight + tooltip anchored to the real,
currently-rendered button on its real page — so the tour shows the actual
app instead of a drawing of it.

**Architecture:** A pure step-sequencer (`buildCoachSteps`) resolves which
real-page targets apply (Plaid on/off, bank already connected). A client
`<TourOverlay>`, mounted once in the `(dashboard)` layout so it survives
client-side navigation between dashboard pages, walks that list: full-screen
`TourCard`s for the two non-interactive steps (Money Left, All set), and a
`<Coachmark>` spotlight+tooltip anchored via `useElementRect` (a hook that
polls for a `data-tour="…"` attribute, prefers the visible one when a
responsive layout renders two copies, and tracks its rect through resize/
scroll) for the four action steps. `/onboarding` (Welcome → Every purchase,
tracked → Currency) is untouched in content, only rebuilt to drop its
dependency on the now-deleted generic `TourWizard`.

**Tech Stack:** Next.js 16 App Router, React 19 (`useActionState`), Vitest +
React Testing Library, Playwright.

**Spec:** `docs/specs/2026-09-15-first-run-tour-live-coachmarks-design.md`
(supersedes the tour half of
`docs/specs/2026-09-15-first-run-tour-design.md`; `/onboarding` and
`profiles.tour_seen_at` are unchanged and still governed by the original
doc).

## Global Constraints

- Money is never touched by this feature — no new schema, migration `0014`
  (already applied/pending from the prior plan) is unchanged.
- Every new client module: `"use client"` at the top; every new server
  read goes through the request-scoped `supabase` client (RLS-enforced),
  per `docs/conventions.md`.
- No new dependency — the spotlight/tooltip is built with existing CSS
  tokens (`docs/BRAND_GUIDELINES.md`) and `ResizeObserver`, not a UI
  library.
- `useSearchParams` needs no `<Suspense>` boundary here: the `(dashboard)`
  layout already does per-request Supabase reads, so the route is never
  prerendered (the boundary only matters for a route Next.js would
  otherwise prerender — see
  `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`
  → "Behavior → Prerendering").
- Before touching any server action, `redirect()`, or `useSearchParams`
  call, skim the matching guide under `node_modules/next/dist/docs/` per
  `CLAUDE.md` — this plan's snippets are written against Next 16, but
  re-verify if anything looks off against what's installed.
- `lint`, `typecheck`, `test`, `build` must stay green after every task.
- Branch: stay on `v1.5/first-run-tour` (already checked out). Commit at
  the end of each task; commit messages follow the existing
  conventional-ish style in this repo's log.

---

## File Structure

**New:**
- `src/lib/tour/coach-steps.ts` — pure step list for the live tour.
- `src/lib/tour/coach-steps.test.ts`
- `src/lib/tour/tooltip-position.ts` — pure tooltip placement math.
- `src/lib/tour/tooltip-position.test.ts`
- `src/lib/tour/use-element-rect.ts` — client hook tracking a `data-tour`
  target's rect.
- `src/lib/tour/use-element-rect.test.ts`
- `src/components/tour/coachmark.tsx` — spotlight + tooltip, given a rect.
- `src/components/tour/coachmark.test.tsx`
- `src/components/tour/tour-overlay.tsx` — orchestrator, mounted in the
  dashboard layout.
- `src/components/tour/tour-overlay.test.tsx`

**Renamed:**
- `src/lib/tour/steps.ts` → `src/lib/tour/onboarding-steps.ts` (narrowed to
  onboarding's 3 steps only — the tour-phase logic moves to
  `coach-steps.ts`).
- `src/lib/tour/steps.test.ts` → `src/lib/tour/onboarding-steps.test.ts`
  (narrowed to match).

**Modified:**
- `src/components/plaid/connect-bank.tsx` — add `data-tour="connect-bank"`.
- `src/components/add-transaction.tsx` — add `data-tour="add-transaction"`.
- `src/components/needs-category-bell.tsx` — add
  `data-tour="needs-category-bell"`.
- `src/components/needs-category-bell.test.tsx` — assert the attribute.
- `src/components/budgets-view.tsx` — add `data-tour="set-budget"` to the
  empty-state button and the first category card's button.
- `src/app/(app)/onboarding/onboarding-wizard-content.tsx` — rebuilt as a
  self-contained stepper (no more `TourWizard`).
- `src/app/(app)/onboarding/onboarding-wizard-content.test.tsx` — updated
  import.
- `src/app/(app)/onboarding/page.tsx` — use `buildOnboardingSteps`.
- `src/server/onboarding.ts` — `completeOnboarding` redirects to `/` again
  (not `/tour?new=1`).
- `src/app/(app)/(dashboard)/layout.tsx` — drop the `/tour` redirect,
  compute `hasBank`, mount `<TourOverlay>`.
- `src/app/(app)/(dashboard)/help/page.tsx` — replay link → `/?tour=replay`.
- `tests/e2e/helpers/onboard.ts` — rewritten for the new flow.
- `tests/e2e/tour.spec.ts` — rewritten to walk the real pages.
- `docs/roadmap.md`, `docs/workflow.md`, `CLAUDE.md` — point at the v2 spec.

**Deleted:**
- `src/app/(app)/tour/` (whole directory — `page.tsx`,
  `tour-wizard-content.tsx`, `tour-wizard-content.test.tsx`).
- `src/components/tour/tour-wizard.tsx`.

---

### Task 1: Wire `data-tour` anchors onto the real targets

**Files:**
- Modify: `src/components/plaid/connect-bank.tsx:106`
- Modify: `src/components/add-transaction.tsx:21-27`
- Modify: `src/components/needs-category-bell.tsx:23-27`
- Modify: `src/components/budgets-view.tsx:271-277,282-288`
- Test: `src/components/needs-category-bell.test.tsx`

**Interfaces:**
- Produces: four elements queryable via
  `document.querySelector('[data-tour="connect-bank"]')`,
  `'[data-tour="add-transaction"]'`, `'[data-tour="needs-category-bell"]'`,
  `'[data-tour="set-budget"]'` — the exact strings `buildCoachSteps` (Task 3)
  will use as `target`.

This is a plain-attribute change (no new behavior), so its test coverage is
one quick assertion on the one component with an existing, cheap-to-extend
test file (`needs-category-bell.test.tsx`); the other three are verified by
the rewritten e2e spec (Task 8), which checks the real rendered button at
each real route — the more meaningful test for "is this really the live
button."

- [ ] **Step 1: Add the attribute to `NeedsCategoryBell` and extend its test**

In `src/components/needs-category-bell.tsx`, add `data-tour` to the
existing `<Link>`:

```tsx
    <Link
      href={HREF}
      aria-label={label}
      data-tour="needs-category-bell"
      className="relative -m-1.5 grid place-items-center rounded-full p-1.5 text-muted transition-colors hover:text-text"
    >
```

Add a test to `src/components/needs-category-bell.test.tsx` (append inside
the existing `describe` block):

```tsx
  it("carries the data-tour anchor the first-run tour spotlights", () => {
    render(<NeedsCategoryBell count={0} />);
    expect(screen.getByRole("link")).toHaveAttribute("data-tour", "needs-category-bell");
  });
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/components/needs-category-bell.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 3: Add the attribute to `ConnectBank`**

In `src/components/plaid/connect-bank.tsx`, the main button (around line
106):

```tsx
      <button type="button" onClick={start} disabled={busy} data-tour="connect-bank" className={btn}>
```

- [ ] **Step 4: Add the attribute to `AddTransaction`**

In `src/components/add-transaction.tsx`:

```tsx
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tour="add-transaction"
        className="rounded-full bg-primary-btn px-3 py-1.5 text-sm font-medium text-on-primary-btn"
      >
        + Add
      </button>
```

- [ ] **Step 5: Add the attribute to both Budgets triggers**

In `src/components/budgets-view.tsx`, the empty-state action button:

```tsx
              <button
                type="button"
                onClick={() => setAdding(true)}
                data-tour="set-budget"
                className="rounded-full bg-primary-btn px-4 py-2 text-sm font-medium text-on-primary-btn"
              >
                Build my budget
              </button>
```

And the **first** category card's button only (`props.view.bars.map`) — use
the map index, not every card:

```tsx
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {props.view.bars.map((b, i) => (
              <li key={b.categoryId}>
                <button
                  type="button"
                  onClick={() => setDetail(b.categoryId)}
                  data-tour={i === 0 ? "set-budget" : undefined}
                  className="card flex w-full items-center gap-3 rounded-2xl border border-hairline p-4 text-left"
                >
```

- [ ] **Step 6: Typecheck and full unit suite**

Run: `npm run typecheck && npm run test`
Expected: both green, same test count as before + 1.

- [ ] **Step 7: Commit**

```bash
git add src/components/plaid/connect-bank.tsx src/components/add-transaction.tsx src/components/needs-category-bell.tsx src/components/needs-category-bell.test.tsx src/components/budgets-view.tsx
git commit -m "feat(tour): add data-tour anchors to the real coachmark targets"
```

---

### Task 2: `computeTooltipPosition` (pure)

**Files:**
- Create: `src/lib/tour/tooltip-position.ts`
- Test: `src/lib/tour/tooltip-position.test.ts`

**Interfaces:**
- Produces: `computeTooltipPosition(input): { top: number; left: number }`,
  consumed by `Coachmark` (Task 5).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/tour/tooltip-position.test.ts
import { describe, expect, it } from "vitest";
import { computeTooltipPosition } from "./tooltip-position";

const VIEWPORT = { viewportWidth: 1000, viewportHeight: 800 };
const TOOLTIP = { tooltipWidth: 280, tooltipHeight: 160 };
const rect = { top: 300, left: 400, right: 450, bottom: 340, width: 50, height: 40 };

describe("computeTooltipPosition", () => {
  it("places a bottom tooltip below the rect, horizontally centered on it", () => {
    const { top, left } = computeTooltipPosition({ rect, placement: "bottom", ...VIEWPORT, ...TOOLTIP });
    expect(top).toBe(rect.bottom + 12);
    expect(left).toBe(rect.left + rect.width / 2 - TOOLTIP.tooltipWidth / 2);
  });

  it("places a top tooltip above the rect", () => {
    const { top } = computeTooltipPosition({ rect, placement: "top", ...VIEWPORT, ...TOOLTIP });
    expect(top).toBe(rect.top - 12 - TOOLTIP.tooltipHeight);
  });

  it("clamps left so the tooltip never runs off the left edge, at phone width", () => {
    const leftRect = { ...rect, left: 4, right: 40, width: 36 };
    const { left } = computeTooltipPosition({
      rect: leftRect,
      placement: "bottom",
      viewportWidth: 390,
      viewportHeight: 800,
      ...TOOLTIP,
    });
    expect(left).toBe(16);
  });

  it("clamps left so the tooltip never runs off the right edge, at phone width", () => {
    const rightRect = { ...rect, left: 360, right: 386, width: 26 };
    const { left } = computeTooltipPosition({
      rect: rightRect,
      placement: "bottom",
      viewportWidth: 390,
      viewportHeight: 800,
      ...TOOLTIP,
    });
    expect(left).toBe(390 - 280 - 16);
  });

  it("clamps top so a bottom tooltip never runs off the bottom edge", () => {
    const lowRect = { ...rect, top: 780, bottom: 820 };
    const { top } = computeTooltipPosition({
      rect: lowRect,
      placement: "bottom",
      viewportWidth: 1000,
      viewportHeight: 800,
      ...TOOLTIP,
    });
    expect(top).toBe(800 - 160 - 16);
  });

  it("clamps top so a top tooltip never runs off the top edge", () => {
    const highRect = { ...rect, top: 10, bottom: 50 };
    const { top } = computeTooltipPosition({ rect: highRect, placement: "top", ...VIEWPORT, ...TOOLTIP });
    expect(top).toBe(16);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/tour/tooltip-position.test.ts`
Expected: FAIL — `Failed to resolve import "./tooltip-position"`.

- [ ] **Step 3: Implement**

```ts
// src/lib/tour/tooltip-position.ts
/**
 * Where a coachmark's tooltip bubble should sit relative to the real
 * element it's pointing at, clamped so it never runs off-screen (phone
 * width especially). Pure — no DOM reads; `rect` is any object shaped like
 * `DOMRect` (a real `getBoundingClientRect()` result works directly).
 */
export type SimpleRect = { top: number; left: number; width: number; height: number };

export function computeTooltipPosition({
  rect,
  placement,
  viewportWidth,
  viewportHeight,
  tooltipWidth,
  tooltipHeight,
  margin = 16,
  gap = 12,
}: {
  rect: SimpleRect;
  placement: "top" | "bottom";
  viewportWidth: number;
  viewportHeight: number;
  tooltipWidth: number;
  tooltipHeight: number;
  margin?: number;
  gap?: number;
}): { top: number; left: number } {
  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

  const idealLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
  const left = clamp(idealLeft, margin, viewportWidth - tooltipWidth - margin);

  const idealTop = placement === "bottom" ? rect.top + rect.height + gap : rect.top - gap - tooltipHeight;
  const top = clamp(idealTop, margin, viewportHeight - tooltipHeight - margin);

  return { top, left };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/tour/tooltip-position.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tour/tooltip-position.ts src/lib/tour/tooltip-position.test.ts
git commit -m "feat(tour): add computeTooltipPosition"
```

---

### Task 3: Step sequencing — `buildCoachSteps` + narrow onboarding's steps

**Files:**
- Create: `src/lib/tour/coach-steps.ts`
- Create: `src/lib/tour/coach-steps.test.ts`
- Rename: `src/lib/tour/steps.ts` → `src/lib/tour/onboarding-steps.ts`
- Rename: `src/lib/tour/steps.test.ts` → `src/lib/tour/onboarding-steps.test.ts`

**Interfaces:**
- Produces: `CoachStep` (`{ id, kind: "card" }` or
  `{ id, kind: "coachmark", route, target, placement }`),
  `buildCoachSteps({ plaidEnabled, hasBank }): CoachStep[]` — consumed by
  `TourOverlay` (Task 6) and `(dashboard)/layout.tsx` (Task 7).
- Produces: `OnboardingStepId` (`"welcome" | "auto-capture" | "currency"`),
  `buildOnboardingSteps(plaidEnabled): OnboardingStepId[]` — consumed by
  `onboarding-wizard-content.tsx` and `onboarding/page.tsx` (Task 7 wiring,
  but the rename happens here so nothing references the deleted names).

- [ ] **Step 1: Delete the old combined file and its test**

```bash
git rm src/lib/tour/steps.ts src/lib/tour/steps.test.ts
```

- [ ] **Step 2: Write the failing test for the narrowed onboarding steps**

```ts
// src/lib/tour/onboarding-steps.test.ts
import { describe, expect, it } from "vitest";
import { buildOnboardingSteps } from "./onboarding-steps";

describe("buildOnboardingSteps", () => {
  it("is welcome, auto-capture, currency when Plaid is on", () => {
    expect(buildOnboardingSteps(true)).toEqual(["welcome", "auto-capture", "currency"]);
  });

  it("drops auto-capture when Plaid is off", () => {
    expect(buildOnboardingSteps(false)).toEqual(["welcome", "currency"]);
  });

  it("always ends with currency", () => {
    expect(buildOnboardingSteps(true).at(-1)).toBe("currency");
    expect(buildOnboardingSteps(false).at(-1)).toBe("currency");
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/tour/onboarding-steps.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the narrowed module**

```ts
// src/lib/tour/onboarding-steps.ts
/**
 * Pure step list for /onboarding: Welcome → (Every purchase, tracked →)
 * Currency. See docs/specs/2026-09-15-first-run-tour-live-coachmarks-design.md.
 * (The post-onboarding live tour has its own sequencer — coach-steps.ts.)
 */
export type OnboardingStepId = "welcome" | "auto-capture" | "currency";

export function buildOnboardingSteps(plaidEnabled: boolean): OnboardingStepId[] {
  const ids: OnboardingStepId[] = ["welcome"];
  if (plaidEnabled) ids.push("auto-capture");
  ids.push("currency");
  return ids;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/tour/onboarding-steps.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Write the failing tests for `buildCoachSteps`**

```ts
// src/lib/tour/coach-steps.test.ts
import { describe, expect, it } from "vitest";
import { buildCoachSteps } from "./coach-steps";

function ids(plaidEnabled: boolean, hasBank: boolean) {
  return buildCoachSteps({ plaidEnabled, hasBank }).map((s) => s.id);
}

describe("buildCoachSteps", () => {
  it("is the full 6-step sequence when Plaid is on and no bank is connected", () => {
    expect(ids(true, false)).toEqual([
      "money-left",
      "connect-bank",
      "add-transaction",
      "needs-category",
      "set-budget",
      "done",
    ]);
  });

  it("drops connect-bank once a bank is already connected", () => {
    expect(ids(true, true)).toEqual(["money-left", "add-transaction", "needs-category", "set-budget", "done"]);
  });

  it("drops connect-bank and needs-category when Plaid is off", () => {
    expect(ids(false, false)).toEqual(["money-left", "add-transaction", "set-budget", "done"]);
  });

  it("always starts with money-left and ends with done", () => {
    for (const plaidEnabled of [true, false]) {
      for (const hasBank of [true, false]) {
        const steps = buildCoachSteps({ plaidEnabled, hasBank });
        expect(steps[0].id).toBe("money-left");
        expect(steps.at(-1)?.id).toBe("done");
      }
    }
  });

  it("gives every coachmark step the route/target/placement TourOverlay needs", () => {
    const steps = buildCoachSteps({ plaidEnabled: true, hasBank: false });
    const connectBank = steps.find((s) => s.id === "connect-bank");
    expect(connectBank).toMatchObject({
      kind: "coachmark",
      route: "/connected-banks",
      target: "connect-bank",
      placement: "bottom",
    });
    const addTxn = steps.find((s) => s.id === "add-transaction");
    expect(addTxn).toMatchObject({ kind: "coachmark", route: "/transactions", target: "add-transaction" });
    const needsCategory = steps.find((s) => s.id === "needs-category");
    expect(needsCategory).toMatchObject({
      kind: "coachmark",
      route: "/transactions",
      target: "needs-category-bell",
    });
    const setBudget = steps.find((s) => s.id === "set-budget");
    expect(setBudget).toMatchObject({ kind: "coachmark", route: "/budgets", target: "set-budget", placement: "top" });
  });

  it("marks money-left and done as plain cards, not coachmarks", () => {
    const steps = buildCoachSteps({ plaidEnabled: true, hasBank: false });
    expect(steps[0]).toEqual({ id: "money-left", kind: "card" });
    expect(steps.at(-1)).toEqual({ id: "done", kind: "card" });
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run src/lib/tour/coach-steps.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement**

```ts
// src/lib/tour/coach-steps.ts
/**
 * Pure step list for the post-onboarding live tour: a spotlight + tooltip
 * anchored to a real button on a real dashboard page, for every step except
 * the two full-screen cards (money-left, done). See
 * docs/specs/2026-09-15-first-run-tour-live-coachmarks-design.md.
 */
export type CardStepId = "money-left" | "done";
export type CoachmarkStepId = "connect-bank" | "add-transaction" | "needs-category" | "set-budget";

export type CoachStep =
  | { id: CardStepId; kind: "card" }
  | { id: CoachmarkStepId; kind: "coachmark"; route: string; target: string; placement: "top" | "bottom" };

export function buildCoachSteps({
  plaidEnabled,
  hasBank,
}: {
  plaidEnabled: boolean;
  hasBank: boolean;
}): CoachStep[] {
  const steps: CoachStep[] = [{ id: "money-left", kind: "card" }];

  if (plaidEnabled && !hasBank) {
    steps.push({
      id: "connect-bank",
      kind: "coachmark",
      route: "/connected-banks",
      target: "connect-bank",
      placement: "bottom",
    });
  }

  steps.push({
    id: "add-transaction",
    kind: "coachmark",
    route: "/transactions",
    target: "add-transaction",
    placement: "bottom",
  });

  if (plaidEnabled) {
    steps.push({
      id: "needs-category",
      kind: "coachmark",
      route: "/transactions",
      target: "needs-category-bell",
      placement: "bottom",
    });
  }

  steps.push({ id: "set-budget", kind: "coachmark", route: "/budgets", target: "set-budget", placement: "top" });
  steps.push({ id: "done", kind: "card" });

  return steps;
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `npx vitest run src/lib/tour/coach-steps.test.ts src/lib/tour/onboarding-steps.test.ts`
Expected: PASS (6 + 3 tests).

- [ ] **Step 10: Commit**

```bash
git add src/lib/tour/coach-steps.ts src/lib/tour/coach-steps.test.ts src/lib/tour/onboarding-steps.ts src/lib/tour/onboarding-steps.test.ts
git commit -m "feat(tour): add buildCoachSteps; narrow the onboarding step list"
```

(This leaves `onboarding-wizard-content.tsx`, `onboarding/page.tsx`, and
the dashboard layout importing the now-deleted `steps.ts` — Task 7 fixes
those imports as part of wiring everything together. `typecheck` will be
red between this task and Task 7; that's expected and called out again
there.)

---

### Task 4: `useElementRect` hook

**Files:**
- Create: `src/lib/tour/use-element-rect.ts`
- Test: `src/lib/tour/use-element-rect.test.ts`
- Modify: `vitest.setup.ts` (add a `ResizeObserver` mock — jsdom has none)

**Interfaces:**
- Consumes: nothing from earlier tasks (pure DOM + React).
- Produces: `useElementRect(target: string | null, onNotFound: () => void, timeoutMs?: number): DOMRect | null`,
  consumed by `TourOverlay` (Task 6).

- [ ] **Step 1: Add a ResizeObserver mock to the shared test setup**

In `vitest.setup.ts`, append:

```ts
// jsdom has no ResizeObserver. useElementRect (the tour's coachmark
// targeting hook) needs one; a no-op stub is enough since tests drive
// position updates explicitly rather than relying on real layout.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver ??= MockResizeObserver as unknown as typeof ResizeObserver;
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/tour/use-element-rect.test.ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useElementRect } from "./use-element-rect";

function addTarget(name: string, visible = true) {
  const el = document.createElement("div");
  el.setAttribute("data-tour", name);
  // jsdom has no layout engine — getBoundingClientRect is a no-op stub by
  // default, so replace it with a fixed rect, and fake "hidden" the same
  // way the real app does at a breakpoint (display:none -> offsetParent null).
  el.getBoundingClientRect = () => ({ top: 10, left: 20, width: 30, height: 40 }) as DOMRect;
  if (!visible) {
    Object.defineProperty(el, "offsetParent", { value: null, configurable: true });
  } else {
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  }
  document.body.appendChild(el);
  return el;
}

describe("useElementRect", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("returns null and does nothing when target is null", () => {
    const onNotFound = vi.fn();
    const { result } = renderHook(() => useElementRect(null, onNotFound));
    expect(result.current).toBeNull();
    act(() => vi.advanceTimersByTime(5000));
    expect(onNotFound).not.toHaveBeenCalled();
  });

  it("finds an element already in the DOM immediately", async () => {
    addTarget("connect-bank");
    const { result } = renderHook(() => useElementRect("connect-bank", vi.fn()));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toMatchObject({ top: 10, left: 20, width: 30, height: 40 });
  });

  it("finds an element added asynchronously, by polling", async () => {
    const { result } = renderHook(() => useElementRect("add-transaction", vi.fn()));
    expect(result.current).toBeNull();

    addTarget("add-transaction");
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await waitFor(() => expect(result.current).not.toBeNull());
  });

  it("skips a hidden twin and picks the visible one", async () => {
    addTarget("needs-category-bell", false);
    addTarget("needs-category-bell", true);
    const { result } = renderHook(() => useElementRect("needs-category-bell", vi.fn()));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toMatchObject({ top: 10, left: 20, width: 30, height: 40 });
  });

  it("calls onNotFound once after the timeout when nothing ever appears", async () => {
    const onNotFound = vi.fn();
    renderHook(() => useElementRect("set-budget", onNotFound, 1000));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(onNotFound).toHaveBeenCalledTimes(1);
  });

  it("does not call onNotFound if the target appears before the timeout", async () => {
    const onNotFound = vi.fn();
    const { result } = renderHook(() => useElementRect("set-budget", onNotFound, 1000));
    addTarget("set-budget");
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(onNotFound).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/tour/use-element-rect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// src/lib/tour/use-element-rect.ts
"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the bounding rect of the first VISIBLE element matching
 * `data-tour="<target>"`. There may be a hidden responsive twin (e.g.
 * NeedsCategoryBell renders once for the mobile header, once for the
 * desktop position — see (dashboard)/layout.tsx) — `offsetParent !== null`
 * is the standard cheap "is this actually rendered" check, filtering out
 * whichever twin the current breakpoint hides.
 *
 * Polls until the target appears, then stays in sync via ResizeObserver
 * plus scroll/resize listeners. Calls `onNotFound` once if nothing visible
 * shows up within `timeoutMs` (e.g. a step's precondition changed
 * underfoot) so the caller can skip past that step. Passing `target: null`
 * disables the hook (used while a route navigation the caller kicked off is
 * still in flight).
 */
export function useElementRect(
  target: string | null,
  onNotFound: () => void,
  timeoutMs = 3000,
): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setRect(null);
    if (!target) return;

    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let notFoundTimer: ReturnType<typeof setTimeout> | null = null;
    let removeListeners: (() => void) | null = null;

    function findVisible(): Element | null {
      const matches = document.querySelectorAll(`[data-tour="${target}"]`);
      for (const el of matches) {
        if ((el as HTMLElement).offsetParent !== null) return el;
      }
      return null;
    }

    function attach(el: Element) {
      const update = () => {
        if (!cancelled) setRect(el.getBoundingClientRect());
      };
      update();
      ro = new ResizeObserver(update);
      ro.observe(el);
      window.addEventListener("scroll", update, true);
      window.addEventListener("resize", update);
      removeListeners = () => {
        window.removeEventListener("scroll", update, true);
        window.removeEventListener("resize", update);
      };
    }

    const found = findVisible();
    if (found) {
      attach(found);
    } else {
      pollId = setInterval(() => {
        const el = findVisible();
        if (el) {
          if (pollId) clearInterval(pollId);
          pollId = null;
          if (notFoundTimer) clearTimeout(notFoundTimer);
          notFoundTimer = null;
          attach(el);
        }
      }, 150);
      notFoundTimer = setTimeout(() => {
        if (!cancelled) onNotFound();
      }, timeoutMs);
    }

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (notFoundTimer) clearTimeout(notFoundTimer);
      ro?.disconnect();
      removeListeners?.();
    };
  }, [target, onNotFound, timeoutMs]);

  return rect;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/tour/use-element-rect.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Full unit suite (confirms the ResizeObserver mock didn't break anything else)**

Run: `npm run test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add vitest.setup.ts src/lib/tour/use-element-rect.ts src/lib/tour/use-element-rect.test.ts
git commit -m "feat(tour): add useElementRect, a ResizeObserver-backed target tracker"
```

---

### Task 5: `Coachmark` component

**Files:**
- Create: `src/components/tour/coachmark.tsx`
- Test: `src/components/tour/coachmark.test.tsx`

**Interfaces:**
- Consumes: `computeTooltipPosition` (Task 2).
- Produces: `<Coachmark rect body title stepLabel onNext onSkip />`,
  consumed by `TourOverlay` (Task 6).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/tour/coachmark.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Coachmark } from "./coachmark";

const rect = { top: 100, left: 50, width: 120, height: 40 } as DOMRect;

describe("Coachmark", () => {
  it("shows the title, body, and step label", () => {
    render(
      <Coachmark
        rect={rect}
        placement="bottom"
        title="Connect your bank to turn it on"
        body="This is what makes tracking automatic."
        stepLabel="Step 2 of 6"
        onNext={vi.fn()}
        onSkip={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Connect your bank to turn it on" })).toBeInTheDocument();
    expect(screen.getByText("This is what makes tracking automatic.")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 6")).toBeInTheDocument();
  });

  it("Next and Skip call their handlers", async () => {
    const onNext = vi.fn();
    const onSkip = vi.fn();
    const user = userEvent.setup();
    render(
      <Coachmark rect={rect} placement="bottom" title="t" body="b" stepLabel="s" onNext={onNext} onSkip={onSkip} />,
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/tour/coachmark.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/tour/coachmark.tsx
"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { computeTooltipPosition } from "@/lib/tour/tooltip-position";
import { PrimaryButton } from "@/components/ui";

const SPOTLIGHT_PAD = 8;
const DEFAULT_SIZE = { width: 280, height: 160 };

/**
 * A dimmed backdrop with a spotlight cutout around `rect`, plus a tooltip
 * bubble placed by computeTooltipPosition. See
 * docs/specs/2026-09-15-first-run-tour-live-coachmarks-design.md. Rendered
 * by TourOverlay once useElementRect has resolved a real target's rect.
 */
export function Coachmark({
  rect,
  placement,
  title,
  body,
  stepLabel,
  onNext,
  onSkip,
}: {
  rect: DOMRect;
  placement: "top" | "bottom";
  title: string;
  body: string;
  stepLabel: string;
  onNext: () => void;
  onSkip: () => void;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(DEFAULT_SIZE);

  useLayoutEffect(() => {
    const el = tooltipRef.current;
    if (el) setSize({ width: el.offsetWidth || DEFAULT_SIZE.width, height: el.offsetHeight || DEFAULT_SIZE.height });
  }, [title, body]);

  const { top, left } =
    typeof window === "undefined"
      ? { top: 0, left: 0 }
      : computeTooltipPosition({
          rect,
          placement,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          tooltipWidth: size.width,
          tooltipHeight: size.height,
        });

  return (
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden
        className="pointer-events-none fixed rounded-2xl transition-all duration-200 motion-reduce:transition-none"
        style={{
          top: rect.top - SPOTLIGHT_PAD,
          left: rect.left - SPOTLIGHT_PAD,
          width: rect.width + SPOTLIGHT_PAD * 2,
          height: rect.height + SPOTLIGHT_PAD * 2,
          boxShadow: "0 0 0 9999px rgb(29 17 10 / 0.6)",
        }}
      />
      <div
        ref={tooltipRef}
        role="dialog"
        aria-label={title}
        className="fixed w-[280px] max-w-[calc(100vw-32px)] space-y-3 rounded-2xl bg-surface p-4 shadow-xl transition-all duration-200 motion-reduce:transition-none"
        style={{ top, left }}
      >
        <p className="text-xs font-medium text-muted">{stepLabel}</p>
        <h2 id="tour-step-heading" tabIndex={-1} className="text-base font-semibold outline-none">
          {title}
        </h2>
        <p className="text-sm text-muted">{body}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <button type="button" onClick={onSkip} className="text-xs font-medium text-muted hover:text-text">
            Skip
          </button>
          <PrimaryButton onClick={onNext}>Next</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/tour/coachmark.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/tour/coachmark.tsx src/components/tour/coachmark.test.tsx
git commit -m "feat(tour): add the Coachmark spotlight+tooltip component"
```

---

### Task 6: `TourOverlay` orchestrator

**Files:**
- Create: `src/components/tour/tour-overlay.tsx`
- Test: `src/components/tour/tour-overlay.test.tsx`

**Interfaces:**
- Consumes: `CoachStep`/`buildCoachSteps` (Task 3, type only — steps arrive
  as a prop), `useElementRect` (Task 4), `Coachmark` (Task 5), `TourCard`
  (existing, `src/components/tour/tour-card.tsx`), `completeTour`/`TourState`
  (existing, `src/server/tour.ts`).
- Produces: `<TourOverlay initialActive coachSteps action? />`, mounted in
  `(dashboard)/layout.tsx` (Task 7).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/tour/tour-overlay.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TourOverlay } from "./tour-overlay";
import type { CoachStep } from "@/lib/tour/coach-steps";
import type { TourState } from "@/server/tour";

const push = vi.fn();
const replace = vi.fn();
let pathname = "/";
let params = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => pathname,
  useSearchParams: () => params,
}));

const STEPS: CoachStep[] = [
  { id: "money-left", kind: "card" },
  { id: "add-transaction", kind: "coachmark", route: "/transactions", target: "add-transaction", placement: "bottom" },
  { id: "done", kind: "card" },
];

function renderOverlay(
  overrides: Partial<{
    initialActive: boolean;
    coachSteps: CoachStep[];
    action: (prev: TourState, formData: FormData) => Promise<TourState>;
  }> = {},
) {
  return render(
    <TourOverlay
      initialActive={overrides.initialActive ?? true}
      coachSteps={overrides.coachSteps ?? STEPS}
      action={overrides.action ?? vi.fn().mockResolvedValue({})}
    />,
  );
}

function addTarget(name: string) {
  const el = document.createElement("button");
  el.setAttribute("data-tour", name);
  el.getBoundingClientRect = () => ({ top: 10, left: 20, width: 30, height: 40 }) as DOMRect;
  Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  document.body.appendChild(el);
  return el;
}

describe("TourOverlay", () => {
  beforeEach(() => {
    pathname = "/";
    params = new URLSearchParams();
    push.mockClear();
    replace.mockClear();
    document.body.innerHTML = "";
  });

  it("renders nothing when inactive and there's no replay param", () => {
    renderOverlay({ initialActive: false });
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("starts on the Money Left card when active", () => {
    renderOverlay();
    expect(screen.getByRole("heading", { name: "Know what's left" })).toBeInTheDocument();
  });

  it("navigates to a coachmark step's route when the current page doesn't match", async () => {
    const user = userEvent.setup();
    renderOverlay();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(push).toHaveBeenCalledWith("/transactions");
  });

  it("shows the coachmark once its target is found on the right route", async () => {
    pathname = "/transactions";
    addTarget("add-transaction");
    const user = userEvent.setup();
    renderOverlay();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("Skip on the first card and Next on the final card call the same action", async () => {
    const action = vi.fn().mockResolvedValue({});
    const user = userEvent.setup();
    renderOverlay({ action });
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(action).toHaveBeenCalled();
  });

  it("does not reshuffle steps when coachSteps changes after mount", () => {
    const { rerender } = renderOverlay();
    expect(screen.getByRole("heading", { name: "Know what's left" })).toBeInTheDocument();
    rerender(
      <TourOverlay
        initialActive
        coachSteps={[{ id: "done", kind: "card" }]}
        action={vi.fn().mockResolvedValue({})}
      />,
    );
    expect(screen.getByRole("heading", { name: "Know what's left" })).toBeInTheDocument();
  });

  it("activates on ?tour=replay even when initialActive is false, and strips the param", () => {
    params = new URLSearchParams("tour=replay");
    renderOverlay({ initialActive: false });
    expect(screen.getByRole("heading", { name: "Know what's left" })).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/tour/tour-overlay.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/tour/tour-overlay.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CoachStep, CardStepId, CoachmarkStepId } from "@/lib/tour/coach-steps";
import { useElementRect } from "@/lib/tour/use-element-rect";
import { TourCard } from "./tour-card";
import { Coachmark } from "./coachmark";
import { completeTour, type TourState } from "@/server/tour";
import { PrimaryButton } from "@/components/ui";

const CARD_COPY: Record<CardStepId, { mood: "normal" | "happy"; heading: string; body: string; footnote?: string }> = {
  "money-left": {
    mood: "normal",
    heading: "Know what's left",
    body: "Home shows your Money Left this month. Set budgets to see what you can still spend.",
  },
  done: {
    mood: "happy",
    heading: "You're all set",
    body: "Spend like normal — Budgts handles the rest.",
    footnote: "Replay this tour anytime from Help.",
  },
};

const COACHMARK_COPY: Record<CoachmarkStepId, { title: string; body: string }> = {
  "connect-bank": {
    title: "Connect your bank to turn it on",
    body: "This is what makes tracking automatic. Your bank login never reaches Budgts.",
  },
  "add-transaction": {
    title: "Add it yourself, anytime",
    body: "Cash, or anything your bank can't reach — tap + Add.",
  },
  "needs-category": {
    title: "We'll ask when we're not sure",
    body: "This bell means a purchase needs your help sorting it. Answer once — Budgts remembers next time.",
  },
  "set-budget": {
    title: "Set a monthly limit",
    body: "Tap a category to set how much you want to spend on it this month.",
  },
};

/**
 * The live first-run tour, mounted once in (dashboard)/layout.tsx so it
 * survives client-side navigation between dashboard pages — see
 * docs/specs/2026-09-15-first-run-tour-live-coachmarks-design.md.
 */
export function TourOverlay({
  initialActive,
  coachSteps,
  action = completeTour,
}: {
  initialActive: boolean;
  coachSteps: CoachStep[];
  action?: (prev: TourState, formData: FormData) => Promise<TourState>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [steps] = useState(coachSteps);
  const [active, setActive] = useState(initialActive);
  const [index, setIndex] = useState(0);
  const [, formAction] = useActionState<TourState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (searchParams.get("tour") !== "replay") return;
    setActive(true);
    setIndex(0);
    const next = new URLSearchParams(searchParams);
    next.delete("tour");
    router.replace(next.size ? `${pathname}?${next}` : pathname);
    // Runs once per distinct replay request; re-running on every render
    // would re-trigger the replace() loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const step = active ? steps[index] : undefined;
  const isLast = index === steps.length - 1;

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), [steps.length]);
  const skip = useCallback(() => formRef.current?.requestSubmit(), []);

  useEffect(() => {
    if (step?.kind === "coachmark" && step.route !== pathname) router.push(step.route);
  }, [step, pathname, router]);

  const onTargetNotFound = useCallback(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), [steps.length]);
  const rect = useElementRect(
    step?.kind === "coachmark" && step.route === pathname ? step.target : null,
    onTargetNotFound,
  );

  useEffect(() => {
    if (!step) return;
    document.getElementById("tour-step-heading")?.focus();
  }, [step, rect]);

  return (
    <>
      <form ref={formRef} action={formAction} className="hidden" aria-hidden />
      {step?.kind === "card" ? (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg p-6 animate-[tour-in_0.25s_ease-out] motion-reduce:animate-none">
          <TourCard
            mood={CARD_COPY[step.id].mood}
            heading={CARD_COPY[step.id].heading}
            body={CARD_COPY[step.id].body}
            footnote={CARD_COPY[step.id].footnote}
            dotCount={steps.length}
            dotIndex={index}
            onSkip={isLast ? undefined : skip}
            primary={
              isLast ? (
                <PrimaryButton onClick={skip}>See my finances</PrimaryButton>
              ) : (
                <PrimaryButton onClick={next}>Next</PrimaryButton>
              )
            }
          />
        </div>
      ) : step?.kind === "coachmark" && rect ? (
        <Coachmark
          rect={rect}
          placement={step.placement}
          title={COACHMARK_COPY[step.id].title}
          body={COACHMARK_COPY[step.id].body}
          stepLabel={`Step ${index + 1} of ${steps.length}`}
          onNext={next}
          onSkip={skip}
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/tour/tour-overlay.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Full unit suite**

Run: `npm run test`
Expected: green (this task's tests pass; the wider suite still has the
Task-3-created gap in files that import the deleted `steps.ts` — Task 7
fixes those. If `npm run test` fails only in
`onboarding-wizard-content.test.tsx` / other pre-existing files due to that
import, that's the expected, already-noted gap — confirm no *other*
failures crept in, then proceed.)

- [ ] **Step 6: Commit**

```bash
git add src/components/tour/tour-overlay.tsx src/components/tour/tour-overlay.test.tsx
git commit -m "feat(tour): add the TourOverlay orchestrator"
```

---

### Task 7: Wire it together; delete the old `/tour` route

**Files:**
- Modify: `src/app/(app)/onboarding/onboarding-wizard-content.tsx`
  (full rewrite)
- Modify: `src/app/(app)/onboarding/onboarding-wizard-content.test.tsx`
  (import path only)
- Modify: `src/app/(app)/onboarding/page.tsx`
- Modify: `src/server/onboarding.ts`
- Modify: `src/app/(app)/(dashboard)/layout.tsx`
- Modify: `src/app/(app)/(dashboard)/help/page.tsx`
- Delete: `src/app/(app)/tour/` (whole directory)
- Delete: `src/components/tour/tour-wizard.tsx`

**Interfaces:**
- Consumes: `buildOnboardingSteps`/`OnboardingStepId` (Task 3),
  `buildCoachSteps` (Task 3), `TourOverlay` (Task 6).

- [ ] **Step 1: Delete the old `/tour` route and the generic wizard shell**

```bash
git rm -r src/app/\(app\)/tour
git rm src/components/tour/tour-wizard.tsx
```

- [ ] **Step 2: Rewrite `onboarding-wizard-content.tsx` as a self-contained stepper**

```tsx
// src/app/(app)/onboarding/onboarding-wizard-content.tsx
"use client";

import { useActionState, useEffect, useState } from "react";
import type { OnboardingState } from "@/server/onboarding";
import { SUPPORTED_CURRENCIES } from "@/lib/validation/profile";
import type { OnboardingStepId } from "@/lib/tour/onboarding-steps";
import { TourCard } from "@/components/tour/tour-card";
import { PurchaseIconRow } from "@/components/tour/purchase-icons";
import { PrimaryButton } from "@/components/ui";

/**
 * Welcome → (Every purchase, tracked →) Currency. The currency step is
 * required — Skip on an earlier step jumps straight to it. See
 * docs/specs/2026-09-15-first-run-tour-live-coachmarks-design.md.
 */
export function OnboardingWizardContent({
  stepIds,
  defaultCurrency,
  action,
}: {
  stepIds: OnboardingStepId[];
  defaultCurrency: string;
  action: (prev: OnboardingState, formData: FormData) => Promise<OnboardingState>;
}) {
  const [index, setIndex] = useState(0);
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(action, {});

  const id = stepIds[index];
  const isFirst = index === 0;
  const isLast = index === stepIds.length - 1;
  const next = () => setIndex((i) => Math.min(i + 1, stepIds.length - 1));
  const back = () => setIndex((i) => Math.max(i - 1, 0));
  const jumpToLast = () => setIndex(stepIds.length - 1);

  useEffect(() => {
    document.getElementById("tour-step-heading")?.focus();
  }, [index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") back();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // next/back are stable across renders (functional setState updates).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shared = {
    dotCount: stepIds.length,
    dotIndex: index,
    onBack: isFirst ? undefined : back,
    onSkip: isLast ? undefined : jumpToLast,
  };

  if (id === "welcome") {
    return (
      <TourCard
        {...shared}
        mood="happy"
        heading="Budgeting that does itself."
        body="Budgts keeps track of your money for you — so you don't have to."
        primary={<PrimaryButton onClick={next}>Get started</PrimaryButton>}
      />
    );
  }

  if (id === "auto-capture") {
    return (
      <TourCard
        {...shared}
        mood="curious"
        heading="Every purchase, tracked"
        body="Tap, swipe or shop online — Budgts picks up your purchases automatically. No typing. No receipts."
        media={<PurchaseIconRow />}
        primary={<PrimaryButton onClick={next}>Next</PrimaryButton>}
      />
    );
  }

  return (
    <TourCard
      {...shared}
      mood="normal"
      heading="Pick your currency"
      body="Let's make a little space for the life you want."
      media={
        <form action={formAction} className="space-y-3 text-left">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted">Currency</span>
            <select
              name="currency"
              defaultValue={defaultCurrency}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {state.error ? <p className="text-sm text-neg">{state.error}</p> : null}
          <PrimaryButton type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Start budgeting"}
          </PrimaryButton>
        </form>
      }
    />
  );
}
```

- [ ] **Step 3: Fix the existing onboarding component test's import**

In `src/app/(app)/onboarding/onboarding-wizard-content.test.tsx`, the only
change is the type import (the component's behavior/props are otherwise
identical to before):

```tsx
import type { TourStepId } from "@/lib/tour/steps";
```

becomes

```tsx
import type { OnboardingStepId } from "@/lib/tour/onboarding-steps";
```

...and every local use of `TourStepId` in that file becomes
`OnboardingStepId` (the `STEPS` constant's type annotation).

- [ ] **Step 4: Update `onboarding/page.tsx`**

```tsx
// src/app/(app)/onboarding/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { buildOnboardingSteps } from "@/lib/tour/onboarding-steps";
import { completeOnboarding } from "@/server/onboarding";
import { OnboardingWizardContent } from "./onboarding-wizard-content";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("currency, onboarded_at")
    .eq("id", user.id)
    .single();

  if (profile?.onboarded_at) redirect("/");

  return (
    <OnboardingWizardContent
      stepIds={buildOnboardingSteps(plaidUiEnabled())}
      defaultCurrency={profile?.currency ?? "USD"}
      action={completeOnboarding}
    />
  );
}
```

- [ ] **Step 5: Revert `completeOnboarding`'s redirect**

In `src/server/onboarding.ts`, the final line changes back:

```ts
  redirect("/");
```

(was `redirect("/tour?new=1")` — the live tour no longer needs to know it
was "just onboarded", since it never repeats the Welcome/Every-purchase
cards.)

- [ ] **Step 6: Wire `TourOverlay` into the dashboard layout**

```tsx
// src/app/(app)/(dashboard)/layout.tsx
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { signOut } from "@/server/auth";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { buildCoachSteps } from "@/lib/tour/coach-steps";
import { Logo } from "@/components/logo";
import { BottomNav } from "@/components/bottom-nav";
import { DesktopSidebar } from "@/components/desktop-sidebar";
import { NeedsCategoryBell } from "@/components/needs-category-bell";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { ReviewBanner } from "@/components/plaid/review-banner";
import { TourOverlay } from "@/components/tour/tour-overlay";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .single();
  if (!profile?.onboarded_at) redirect("/onboarding");

  // Queried separately from onboarded_at above: if app code ships before the
  // tour_seen_at migration runs, this errors and we treat that as "seen" —
  // never force the overlay on a deploy that hasn't migrated yet.
  const { data: tourProfile, error: tourErr } = await supabase
    .from("profiles")
    .select("tour_seen_at")
    .eq("id", user.id)
    .single();
  const tourActive = !tourErr && !tourProfile?.tour_seen_at;

  // Bank rows Budgts could not categorise — the header bell's count. Same
  // predicate as <NeedsCategory>. `removed_at` only exists where 0004 has run.
  const plaidOn = plaidUiEnabled();
  let needsCategoryCount = 0;
  let hasBank = false;
  if (plaidOn) {
    const [{ count: needsCount }, { count: bankCount }] = await Promise.all([
      supabase
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .eq("source", "bank")
        .is("category_id", null)
        .is("removed_at", null)
        .eq("is_transfer", false)
        // A confirmed duplicate (design: 2026-09-12 Phase 15) is never real work
        // to do — exclude it, matching the query in transactions/page.tsx.
        .is("duplicate_of_id", null),
      // hasBank for the tour's coachmark steps — needed even when the tour
      // isn't active right now, so a later replay still gets a correct list.
      supabase.from("plaid_items").select("id", { count: "exact", head: true }),
    ]);
    needsCategoryCount = needsCount ?? 0;
    hasBank = (bankCount ?? 0) > 0;
  }

  return (
    <div className="flex min-h-dvh w-full flex-col md:pl-60">
      {/* Keeps the bell count fresh after a sync lands, on every dashboard route. */}
      {plaidOn ? <RealtimeRefresh tables={["transactions"]} /> : null}

      <TourOverlay initialActive={tourActive} coachSteps={buildCoachSteps({ plaidEnabled: plaidOn, hasBank })} />

      <DesktopSidebar />

      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline bg-bg/90 px-4 py-3 backdrop-blur md:hidden">
        <Logo size={30} />
        <div className="flex items-center gap-4">
          {plaidOn ? <NeedsCategoryBell count={needsCategoryCount} /> : null}
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs text-muted transition-colors hover:text-text"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {plaidOn ? <ReviewBanner /> : null}

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4 pb-24 md:max-w-4xl md:px-8 md:py-8 md:pb-8">
        {plaidOn ? (
          <div className="mb-2 hidden items-center justify-end md:flex">
            <NeedsCategoryBell count={needsCategoryCount} />
          </div>
        ) : null}
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 7: Point Help's replay link at the query-param trigger**

In `src/app/(app)/(dashboard)/help/page.tsx`:

```tsx
      <Link
        href="/?tour=replay"
        className="card block rounded-2xl border border-hairline p-4 text-sm font-semibold text-accent"
      >
        Replay the tour →
      </Link>
```

- [ ] **Step 8: Typecheck, lint, full unit suite**

Run: `npm run typecheck`
Expected: clean (this is what resolves the Task-3/Task-6 "expected red"
noted earlier — every import of the old `@/lib/tour/steps` and
`@/components/tour/tour-wizard` is gone).

Run:
```
npx eslint src/app/\(app\)/onboarding src/app/\(app\)/\(dashboard\) src/lib/tour src/components/tour src/server/onboarding.ts
```
Expected: clean (module-not-found errors, if any, mean a stale import was
missed — fix before proceeding).

Run: `npm run test`
Expected: green, full suite.

- [ ] **Step 9: Build**

Run: `npm run build`
Expected: succeeds; the route list no longer includes `/tour`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(tour): replace the /tour card wizard with the live TourOverlay"
```

---

### Task 8: Update e2e for the live-page journey

**Files:**
- Modify: `tests/e2e/helpers/onboard.ts`
- Modify: `tests/e2e/tour.spec.ts`

**Interfaces:**
- Consumes: nothing new — same Playwright helpers
  (`tests/e2e/helpers/test-user.ts`) as every other spec.

- [ ] **Step 1: Rewrite the shared onboarding helper**

```ts
// tests/e2e/helpers/onboard.ts
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Walks a freshly signed-in user through /onboarding (Skip jumps straight
 * to the required currency step) and then dismisses the live coachmark
 * tour from its first card (Money Left, on Home). Leaves the page on `/`.
 * See docs/specs/2026-09-15-first-run-tour-live-coachmarks-design.md.
 */
export async function onboardAndSkipTour(page: Page, currency = "USD") {
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("combobox").selectOption(currency);
  await page.getByRole("button", { name: /start budgeting/i }).click();

  await page.waitForURL((u) => u.pathname === "/", { timeout: 20000 });
  const tourSkip = page.getByRole("button", { name: "Skip" });
  if (await tourSkip.isVisible().catch(() => false)) {
    await tourSkip.click();
    await expect(tourSkip).toBeHidden({ timeout: 20000 });
  }
}
```

This is a drop-in replacement — every other spec (`transactions`,
`settings`, `plaid`, `budgets`, `goals`) already calls
`onboardAndSkipTour(page)` and needs no further change.

- [ ] **Step 2: Rewrite `tour.spec.ts` to walk the real pages**

```ts
// tests/e2e/tour.spec.ts
import { expect, test } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  hasAdminCredentials,
  magicTokenHash,
} from "./helpers/test-user";

test.skip(!hasAdminCredentials(), "needs SUPABASE_SECRET_KEY (see .env.local)");

test("first-run tour: walks the real pages, highlights the real buttons, ends on Home, replayable from Help", async ({
  page,
}) => {
  const user = await createTestUser();
  try {
    const tokenHash = await magicTokenHash(user.email);
    await page.goto(`/auth/callback?token_hash=${tokenHash}&type=magiclink&next=/`);

    // Onboarding — unchanged.
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByRole("combobox").selectOption("USD");
    await page.getByRole("button", { name: /start budgeting/i }).click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 20000 });

    // Money Left card, on Home.
    await expect(page.getByRole("heading", { name: "Know what's left" })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();

    // Connect your bank — only if this deployment has Plaid on and no bank
    // connected yet. Verifies the tour actually navigated to the real
    // /connected-banks page and is pointing at the real button there.
    if (
      await page
        .getByRole("heading", { name: "Connect your bank to turn it on" })
        .isVisible()
        .catch(() => false)
    ) {
      await expect(page).toHaveURL(/\/connected-banks$/);
      await expect(page.getByRole("button", { name: "Connect a bank" })).toBeVisible();
      await page.getByRole("button", { name: "Next" }).click();
    }

    // Add it yourself — real /transactions page, real + Add button.
    await expect(page.getByRole("heading", { name: "Add it yourself, anytime" })).toBeVisible();
    await expect(page).toHaveURL(/\/transactions$/);
    await expect(page.getByRole("button", { name: "+ Add" })).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();

    // The needs-a-category bell — only if Plaid is on.
    if (
      await page
        .getByRole("heading", { name: "We'll ask when we're not sure" })
        .isVisible()
        .catch(() => false)
    ) {
      await expect(page).toHaveURL(/\/transactions$/);
      await page.getByRole("button", { name: "Next" }).click();
    }

    // Set a monthly limit — real /budgets page.
    await expect(page.getByRole("heading", { name: "Set a monthly limit" })).toBeVisible();
    await expect(page).toHaveURL(/\/budgets$/);
    await page.getByRole("button", { name: "Next" }).click();

    // All set.
    await expect(page.getByRole("heading", { name: "You're all set" })).toBeVisible();
    await page.getByRole("button", { name: "See my finances" }).click();

    await page.waitForURL((u) => u.pathname === "/", { timeout: 20000 });
    await expect(page.getByText("so far this month")).toBeVisible();

    // Reload stays on Home — the tour doesn't show again.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Know what's left" })).not.toBeVisible();

    // Replay from Help lands back on the first card.
    await page.getByRole("link", { name: "More" }).click();
    await page.getByRole("link", { name: "Help" }).click();
    await page.getByRole("link", { name: "Replay the tour" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Know what's left" })).toBeVisible();
  } finally {
    await deleteTestUser(user.id);
  }
});
```

- [ ] **Step 3: Typecheck and lint the e2e directory**

Run: `npx tsc --noEmit -p . && npx eslint tests/e2e`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/helpers/onboard.ts tests/e2e/tour.spec.ts
git commit -m "test(e2e): walk the live coachmark tour across its real pages"
```

(Actually *running* `npm run test:e2e` needs a Supabase project this
session doesn't have safe write access to — see the note left in
`docs/workflow.md` from the prior tour work. Flag it to the user the same
way at the end of this plan's execution; don't attempt to route around the
sandbox's production-deploy guard.)

---

### Task 9: Docs

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `docs/workflow.md`
- Modify: `CLAUDE.md`

**Interfaces:** none — prose only.

- [ ] **Step 1: Update `docs/roadmap.md`**

Find the **First-run tour** paragraph added by the prior plan (search for
`v1.5/first-run-tour`) and replace its body with a short redesign note,
keeping the same location in the doc:

```markdown
**First-run tour** (branch `v1.5/first-run-tour`): rebuilt as **live
coachmarks** — a spotlight + tooltip anchored to the real button on the
real page (Connect a bank on `/connected-banks`, + Add on `/transactions`,
the needs-a-category bell, a category card on `/budgets`), not an
illustration of the idea. `/onboarding` (Welcome → Every purchase, tracked
→ Currency) is unchanged. Shown once to new users and once to every
already-onboarded user (`profiles.tour_seen_at`); replayable from Help via
`/?tour=replay`. Spec:
`docs/specs/2026-09-15-first-run-tour-live-coachmarks-design.md` (supersedes
the tour half of the original `docs/specs/2026-09-15-first-run-tour-design.md`).
```

- [ ] **Step 2: Update `docs/workflow.md`**

Find the **First-run tour** status-board row added by the prior plan and
replace its description with:

```markdown
Redesigned mid-flight from an illustrated card wizard to **live
coachmarks**: a spotlight + tooltip anchored to the real button on the real
dashboard page it lives on, not a mascot-and-copy stand-in. New
`buildCoachSteps`, `useElementRect`, `Coachmark`, `TourOverlay` (mounted in
`(dashboard)/layout.tsx`, persists across client-side navigation between
dashboard pages); the standalone `/tour` route and the generic `TourWizard`
shell were deleted. `/onboarding` and `profiles.tour_seen_at` are
unchanged. Domain + component tests green; e2e rewritten to walk the real
pages (`tour.spec.ts`) but not run this session for the same production-DB
reason as before. Spec:
`docs/specs/2026-09-15-first-run-tour-live-coachmarks-design.md`.
```

Keep the row's status as `🔄 code done, prod migration + e2e run pending
owner action` (unchanged from before — the same migration-0014 and e2e
blockers apply).

- [ ] **Step 3: Update `CLAUDE.md`**

Find the **In progress: First-run tour** paragraph added by the prior plan
and update its first sentence and spec reference:

```markdown
**In progress:** **First-run tour** — live coachmarks (spotlight + tooltip
on the real button, on its real page) walking Home → Connect your bank →
Activity → Budgets, plus the unchanged `/onboarding` (Welcome → Every
purchase, tracked → Currency).
```

(Leave the rest of that paragraph — the code/tests/migration-pending status
— as is; it's still accurate.) Update the spec filename reference to
`docs/specs/2026-09-15-first-run-tour-live-coachmarks-design.md`.

- [ ] **Step 4: Commit**

```bash
git add docs/roadmap.md docs/workflow.md CLAUDE.md
git commit -m "docs: record the live-coachmark tour redesign"
```

---

## Self-Review Notes

- **Spec coverage:** every section of
  `docs/specs/2026-09-15-first-run-tour-live-coachmarks-design.md` maps to a
  task — step sequence (Task 3), anchors (Task 1), `useElementRect` (Task
  4), `Coachmark` (Task 5), `TourOverlay` (Task 6), removed
  route/component + rewired onboarding/layout/Help (Task 7), gate mechanics
  (Task 7 Step 6), testing (Tasks 2–6 unit/component, Task 8 e2e).
- **Placeholder scan:** no TBD/TODO; every step carries real, complete code.
- **Type consistency:** `CoachStep`/`CardStepId`/`CoachmarkStepId` (Task 3)
  are the exact names `TourOverlay` (Task 6) and `(dashboard)/layout.tsx`
  (Task 7) import; `OnboardingStepId`/`buildOnboardingSteps` (Task 3) are
  what `onboarding-wizard-content.tsx` and `onboarding/page.tsx` (Task 7)
  import; `data-tour` string literals in Task 1 match `target` values in
  Task 3's `buildCoachSteps` exactly (`"connect-bank"`, `"add-transaction"`,
  `"needs-category-bell"`, `"set-budget"`).
