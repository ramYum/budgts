/**
 * The user's categorization workload window (design: 2026-09-16 Advancial
 * follow-up). Deliberately independent of Plaid's own historical recall
 * window (`days_requested` in `/api/plaid/link-token`) — recall controls how
 * far back data is imported at all; this controls how much of that imported
 * history becomes a "needs a category" task for the user. A transaction the
 * resolver chain couldn't auto-file stays imported (kept for budgets,
 * history, and CSV export) forever; it only becomes user work if it also
 * falls inside this window.
 *
 * Window = the first day of the user's signup month through their signup
 * date, both inclusive by calendar day. Half-open interval [start, end) in
 * UTC — mirroring transactions/page.tsx's monthBounds — so `end` is the day
 * AFTER the signup date, which includes the whole signup day regardless of
 * what time of day the user actually signed up.
 */
export function categorizationWindow(signupAt: string | Date): { start: string; end: string } {
  const signup = new Date(signupAt);
  const start = new Date(Date.UTC(signup.getUTCFullYear(), signup.getUTCMonth(), 1));
  const end = new Date(Date.UTC(signup.getUTCFullYear(), signup.getUTCMonth(), signup.getUTCDate() + 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/** The subset of a Supabase/PostgREST query builder this module needs to filter on. */
export interface NeedsCategoryFilterChain {
  eq(column: string, value: unknown): NeedsCategoryFilterChain;
  is(column: string, value: null): NeedsCategoryFilterChain;
  gte(column: string, value: string): NeedsCategoryFilterChain;
  lt(column: string, value: string): NeedsCategoryFilterChain;
  or(filters: string): NeedsCategoryFilterChain;
}

/**
 * event_role values whose budget_effect (budget-effect.ts) is "NONE"
 * regardless of direction, and which category-map.ts deliberately never
 * assigns a category to — a CARD_PAYMENT (paying off a credit card) or
 * CASH_ADVANCE row will *never* get a category_id, so leaving it in the
 * "needs a category" queue only confuses the user. TRANSFER is the third
 * NONE-effect role but is already excluded by the `is_transfer` filter below
 * (it's only ever assigned when isTransfer is true), so it's omitted here to
 * avoid re-hiding a row after the user explicitly flips isTransfer back to
 * false (design: 2026-09-16 needs-category / event-role gap).
 */
const NO_CATEGORY_EVENT_ROLES = ["CARD_PAYMENT", "CASH_ADVANCE"];

/**
 * The single, authoritative "needs a category" predicate — source, category,
 * removed, transfer, and confirmed-duplicate gates, PLUS the categorization
 * window above. The header bell count (layout.tsx) and the actual queue
 * (transactions/page.tsx) both call this one function on their own query
 * builder so the two can never drift onto different filters.
 *
 * `T` is intentionally unconstrained — bounding it against
 * `NeedsCategoryFilterChain` directly (`T extends NeedsCategoryFilterChain`)
 * makes TypeScript try to structurally unify it with Supabase-js's own
 * deeply-generic `PostgrestFilterBuilder` and blow its instantiation-depth
 * limit (TS2589) at every call site. The cast below is the only place that
 * trades static checking for that; `NeedsCategoryFilterChain` still documents
 * (and the unit tests still exercise) the exact method contract relied on.
 */
export function applyNeedsCategoryFilter<T>(query: T, signupAt: string | Date): T {
  const { start, end } = categorizationWindow(signupAt);
  const chain = query as unknown as NeedsCategoryFilterChain;
  return chain
    .eq("source", "bank")
    .is("category_id", null)
    .is("removed_at", null)
    .eq("is_transfer", false)
    // A confirmed duplicate (design: 2026-09-12 Phase 15) is never real work
    // to do — it doesn't route through countsForMonth, so it must be
    // excluded here explicitly. Duplicate containment itself is untouched by
    // this module; this only reads the flag it sets.
    .is("duplicate_of_id", null)
    // Precedence mirrors qualify.ts's countsForMonth exactly: the user's own
    // explicit transfer decision (transferUserSet) outranks the
    // machine-resolved event_role, so a CARD_PAYMENT/CASH_ADVANCE row the
    // user deliberately pulled back into "real spend" still surfaces here —
    // it's the only place they could ever assign it a category.
    .or(`event_role.is.null,event_role.not.in.(${NO_CATEGORY_EVENT_ROLES.join(",")}),transfer_user_set.eq.true`)
    .gte("occurred_at", start)
    .lt("occurred_at", end) as T;
}
