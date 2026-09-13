import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { AccountManager, type AccountItem } from "@/components/account-manager";

export const metadata: Metadata = { title: "Accounts" };

/** "What money do I currently have?" (design spec §31). Reuses the existing
 * `AccountManager` component and server actions verbatim — this route only
 * relocates it out of the Settings kitchen-sink page into its own screen. */
export default async function AccountsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, type, is_archived")
    .order("name");

  return (
    <div className="pt-1">
      <PageHeader title="Accounts" back="/more" />
      <AccountManager accounts={(accounts ?? []) as AccountItem[]} />
    </div>
  );
}
