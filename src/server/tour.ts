"use server";

import { revalidateUserData } from "@/server/revalidate";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { markTourSeen } from "@/lib/tour/load-tour";

export type TourState = { error?: string };

/** Mark the first-run tour seen — called on both the final "See my finances"
 * step and Skip. No form input, so no Zod schema (see
 * docs/specs/2026-09-15-first-run-tour-design.md). */
export async function completeTour(_prev: TourState, _formData: FormData): Promise<TourState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  // The write is shared with the native app's POST /api/mobile/tour. A missing profile row goes on to "/", where the
  // first-run gate sends it to onboarding, exactly as before the move.
  const result = await markTourSeen(supabase, user.id);
  if (!result.ok && result.error === "failed") return { error: "Something went wrong. Try again." };

  // The dashboard layout gate (onboarded/tour redirects) was rendered into the
  // client router cache before this flag flipped; with staleTimes.dynamic that
  // stale gate would bounce the user back. Purge it before navigating on.
  revalidateUserData();
  redirect("/");
}
