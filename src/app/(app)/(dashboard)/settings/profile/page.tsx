import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Profile" };

/** Basic account information — no internal identifiers exposed (design spec
 * §37). Currency is set once at onboarding; there is no currency-change flow
 * today, so this stays informational rather than offering an edit action
 * that would need to touch financial semantics. */
export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("currency")
    .eq("id", user.id)
    .single();

  return (
    <div className="pt-1">
      <PageHeader title="Profile" back="/settings" />
      <dl className="card space-y-3 rounded-2xl border border-hairline p-4 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Email</dt>
          <dd className="text-right">{user.email}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">Currency</dt>
          <dd className="text-right">{profile?.currency ?? "USD"}</dd>
        </div>
      </dl>
    </div>
  );
}
