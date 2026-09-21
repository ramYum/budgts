/**
 * The result shape shared by the domain command modules (`src/lib/<area>/commands.ts`) — the one implementation of each
 * mutation that both the web Server Action and the native `/api/mobile/*` route call
 * (docs/specs/2026-09-21-mobile-only-transition-design.md §4A). Commands never throw for an expected outcome and never redirect
 * or revalidate: that is the adapter's business.
 */
export type FieldErrors = Record<string, string>;

/** Input failed validation. `fieldErrors` is keyed by the first path segment (`amount`, `accountId`, ...). */
export type Invalid = { ok: false; error: "invalid"; fieldErrors: FieldErrors };

/** An unexpected storage failure; `message` is the underlying error's text for the adapter to show or hide. */
export type Failed = { ok: false; error: "failed"; message: string };

export function fieldErrorsOf(issues: readonly { path: readonly PropertyKey[]; message: string }[]): FieldErrors {
  const out: FieldErrors = {};
  for (const i of issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
}

export function invalid(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Invalid {
  return { ok: false, error: "invalid", fieldErrors: fieldErrorsOf(issues) };
}

export function failed(e: unknown, fallback: string): Failed {
  return { ok: false, error: "failed", message: e instanceof Error ? e.message : fallback };
}
