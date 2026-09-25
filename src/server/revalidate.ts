import { revalidatePath } from "next/cache";

/**
 * The one refresh after a user's own edit. Every mutating server action calls
 * this last: it re-renders the page the user is on inside the action's own
 * response (no client `router.refresh()` needed) and invalidates every other
 * page in the client router cache, so a tab visited moments ago is fresh when
 * tapped again. Scoped to the root layout on purpose — an edit shows on
 * Home, Activity, Budgets, the header bell, etc., and every page is dynamic
 * per-user, so there is no server cache to over-purge.
 *
 * Changes the tab didn't make itself (bank sync, another device) come in via
 * `<RealtimeRefresh>` instead, which skips the echo of these edits.
 */
export function revalidateUserData(): void {
  revalidatePath("/", "layout");
}
