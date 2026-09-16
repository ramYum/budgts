"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase
    .from("profiles")
    .update({ tour_seen_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: "Something went wrong. Try again." };

  redirect("/");
}
