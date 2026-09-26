import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { hubCounts, plural } from "@/lib/hub-counts";
import { signOut } from "@/server/auth";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { HubRow, HubSection } from "@/components/hub-list";
import { IconTile, SectionHead, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Settings" };

/** Organized into clear sections per design spec §36 — every row is a real
 * navigation destination (no dead-end rows), grouped the way the spec lays
 * out "Your account / Your money / Connected banks / App". Two columns on a
 * wide screen; a phone reads them in that order, then Data and Sign out. */
export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const counts = await hubCounts(await createClient());

  return (
    <>
      <PageHeader title="Settings" back="/more" backOnDesktop={false} />
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
        <div className="contents lg:flex lg:flex-col lg:gap-8">
          <div className="order-1 lg:order-none">
            <HubSection title="Your account">
              <HubRow href="/settings/profile" label="Profile" icon="profile" value={user.email} />
              <HubRow href="/settings/security" label="Security" icon="security" />
            </HubSection>
          </div>
          <div className="order-2 lg:order-none">
            <HubSection title="Your money">
              <HubRow href="/settings/categories" label="Categories" icon="categories" value={counts.categories} />
              <HubRow href="/budgets" label="Budgets" icon="budgets" value={`${counts.budgets} set`} />
              <HubRow href="/goals" label="Savings goals" icon="goals" value={counts.goals} />
            </HubSection>
          </div>
          <section className="order-5 space-y-3 lg:order-none">
            <SectionHead title="Data" />
            <div className="px-card flex items-center gap-3 p-3 md:gap-4 md:p-4">
              <IconTile name="download" />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium leading-6 text-ink">Export transactions</p>
                <p className="text-[13px] leading-5 text-muted">All of them, as a CSV file.</p>
              </div>
              <a href="/api/export/transactions" download className={buttonClass("secondary")}>
                <Icon name="download" />
                Export
              </a>
            </div>
          </section>
        </div>

        <div className="contents lg:flex lg:flex-col lg:gap-8">
          <div className="order-3 lg:order-none">
            <HubSection title="Connected banks">
              <HubRow
                href="/connected-banks"
                label="Connected banks"
                icon="bank"
                value={counts.banks === null ? undefined : plural(counts.banks, "bank", "banks")}
              />
              <HubRow href="/accounts" label="Manage accounts" icon="accounts" value={counts.accounts} />
            </HubSection>
          </div>
          <div className="order-4 lg:order-none">
            <HubSection title="App">
              <HubRow href="/settings/appearance" label="Appearance" icon="appearance" value="Light" />
              <HubRow href="/help" label="Help" icon="help" />
              <HubRow href="/about" label="About Budgts" icon="about" value="V1" />
            </HubSection>
          </div>
          <form action={signOut} className="order-6 lg:order-none">
            <button type="submit" className={buttonClass("danger", "w-full lg:w-auto", "lg")}>
              <Icon name="sign-out" />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
