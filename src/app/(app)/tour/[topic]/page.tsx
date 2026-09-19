import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { plaidUiEnabled } from "@/lib/plaid/ui-flag";
import { getTopic } from "@/lib/tour/topics";
import { TopicDemo } from "@/components/tour/topic-demo";
import { TourStep } from "@/components/tour/tour-step";

export const metadata: Metadata = { title: "How Budgts Works" };

/**
 * One step of the "How Budgts Works" walkthrough, at `/tour/<topic>`.
 *
 * Deliberately outside the `(dashboard)` group: that layout redirects anyone
 * who hasn't seen the tour to `/tour`, so a step living inside it would loop.
 * Reached three ways — the first-run gate (via `/tour`), "Replay"/topic links
 * from Help and Settings, and a direct link to a single explanation.
 */
export default async function TourTopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic: slug } = await params;
  const topic = getTopic(slug);
  if (!topic) notFound();

  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", user.id)
    .single();
  if (!profile?.onboarded_at) redirect("/onboarding");

  // Queried separately, exactly like the dashboard gate: if code ships before
  // the tour_seen_at migration, the query errors and we treat the tour as
  // already seen (a revisit) rather than trapping the user in a first run.
  const { data: tourProfile, error: tourErr } = await supabase
    .from("profiles")
    .select("tour_seen_at")
    .eq("id", user.id)
    .single();
  const firstRun = !tourErr && !tourProfile?.tour_seen_at;

  const plaidEnabled = plaidUiEnabled();

  // Only the live "connect a bank" step touches real data.
  let accounts: { id: string; name: string }[] = [];
  if (topic.id === "connect-bank" && plaidEnabled) {
    const { data } = await supabase
      .from("accounts")
      .select("id, name")
      .eq("is_archived", false)
      .order("name");
    accounts = data ?? [];
  }

  return (
    <TourStep topicId={topic.id} firstRun={firstRun}>
      <TopicDemo topic={topic.id} accounts={accounts} plaidEnabled={plaidEnabled} />
    </TourStep>
  );
}
