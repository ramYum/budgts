"use client";

import { useActionState, type ReactNode } from "react";
import { completeTour, type TourState } from "@/server/tour";
import { PrimaryButton } from "@/components/ui";

/**
 * First-run only: marks the tour seen (the existing `completeTour` action —
 * `profiles.tour_seen_at`, then redirect to Home). Used for BOTH Skip and the
 * final Finish, exactly as the previous tour did, so leaving the first-run
 * walkthrough any way can never trap the user behind the dashboard's
 * "tour not seen yet" gate. A failure is shown, never swallowed.
 */
export function CompleteTourButton({
  children,
  tone = "primary",
}: {
  children: ReactNode;
  tone?: "primary" | "text";
}) {
  const [state, formAction, pending] = useActionState<TourState, FormData>(completeTour, {});

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      {tone === "primary" ? (
        <PrimaryButton type="submit" disabled={pending}>
          {children}
        </PrimaryButton>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-medium text-muted hover:text-text disabled:opacity-50"
        >
          {children}
        </button>
      )}
      {state.error ? (
        <p role="alert" className="text-xs text-neg">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
