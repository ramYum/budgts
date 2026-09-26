import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hubCounts, plural } from "@/lib/hub-counts";
import { Icon } from "@/components/icon";
import { InstallApp } from "@/components/install-app";
import { Robin } from "@/components/mascot";
import { PageHeader } from "@/components/page-header";
import { HubRow, HubSection } from "@/components/hub-list";

export const metadata: Metadata = { title: "More" };

/** Secondary hub — everything not in the primary Home/Budgets/Activity tabs
 * (design spec §42). Desktop already surfaces Goals/Accounts/Insights/Settings
 * in the sidebar, so this route mainly serves mobile, but stays reachable
 * everywhere for consistency. */
export default async function MorePage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const counts = await hubCounts(await createClient());

  return (
    <>
      <PageHeader title="More" />
      <div className="space-y-8 md:max-w-[720px]">
        {/* Replays the welcome guide (/tour without ?new=1 opens with Crystal's
         * introduction; finishing or skipping it lands back on Home). */}
        <Link href="/tour" className="px-card-ink press group flex items-center gap-4 p-3 md:p-4">
          <span className="px-tile-wash flex h-14 w-14 shrink-0 items-center justify-center" aria-hidden>
            <Robin size={44} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium leading-6 text-ink group-hover:underline">
              Play welcome guide
            </span>
            <span className="block text-[13px] leading-5 text-muted">A one-minute tour with Crystal.</span>
          </span>
          <span className="px-tile-accent flex h-10 w-10 shrink-0 items-center justify-center text-white" aria-hidden>
            <Icon name="play" />
          </span>
        </Link>

        <InstallApp />

        <HubSection title="Your money">
          <HubRow href="/goals" label="Savings goals" icon="goals" value={plural(counts.goals, "goal", "goals")} />
          <HubRow href="/accounts" label="Accounts" icon="accounts" value={counts.accounts} />
          <HubRow href="/insights" label="Insights" icon="insights" />
        </HubSection>

        <HubSection title="Banks & settings">
          <HubRow
            href="/connected-banks"
            label="Connected banks"
            icon="bank"
            value={counts.banks === null ? undefined : plural(counts.banks, "bank", "banks")}
          />
          <HubRow href="/settings" label="Settings" icon="settings" />
        </HubSection>

        <HubSection title="Help">
          <HubRow href="/help" label="Help" icon="help" />
          <HubRow href="/about" label="About Budgts" icon="about" value="V1" />
        </HubSection>

        <div className="flex flex-col items-center gap-3 pb-2 pt-4" aria-hidden>
          <Robin size={44} mood="normal" />
          <p className="px-tag text-muted">
            Track <span className="text-accent">:</span> Plan <span className="text-accent">:</span> Grow
          </p>
        </div>
      </div>
    </>
  );
}
