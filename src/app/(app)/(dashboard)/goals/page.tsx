import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { loadGoals } from "@/lib/goals/load-goals";
import { GoalsView } from "@/components/goals-view";
import { RealtimeRefresh } from "@/components/realtime-refresh";

export const metadata: Metadata = { title: "Goals" };

export default async function GoalsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  // Every read and the progress math live in loadGoals, shared with the native
  // app's GET /api/mobile/goals so the two can never disagree.
  const { items, summary, currency } = await loadGoals(await createClient(), user.id);

  return (
    <div className="pb-2">
      <RealtimeRefresh tables={["savings_goals", "savings_contributions"]} />
      <GoalsView items={items} summary={summary} currency={currency} />
    </div>
  );
}
