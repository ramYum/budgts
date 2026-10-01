import type { MutationOutcome } from "../api/load";

/** The web's savings messages (src/server/savings.ts). */
export const GOAL_GONE = "That goal no longer exists. Refresh and try again.";

/**
 * A goal sheet's save, as the sheet reads it: null once saved, `{ replayed: true }` when a create's request id had
 * already landed (saved by an earlier try; this one's values were not applied, and the sheet says so), or the line to
 * show under the form.
 */
export type Submitted = null | { replayed: true } | string;

/** A save's outcome as the web's form line reads it (server/savings.ts `toState`), plus the replay. */
export function submittedOf(out: MutationOutcome, invalidFallback: string): Submitted {
  if (out.status === "ok") return out.replayed ? { replayed: true } : null;
  if (out.status === "invalid") return Object.values(out.fieldErrors)[0] ?? invalidFallback;
  if (out.status === "missing") return GOAL_GONE;
  return out.status === "error" ? out.message : "Something went wrong. Please try again.";
}
