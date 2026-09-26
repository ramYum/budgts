import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Badge, IconTile } from "@/components/ui";

export const metadata: Metadata = { title: "Appearance" };

/** Design spec §40 explicitly says not to show a fake Dark/System toggle if
 * dark mode isn't implemented — it isn't, so this reports the true, single
 * current state rather than offering options that would do nothing. */
export default function AppearancePage() {
  return (
    <>
      <PageHeader title="Appearance" back="/settings" />
      <div className="md:max-w-[720px]">
        <div className="px-card flex items-center gap-4 p-2 md:p-4">
          <IconTile name="appearance" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium leading-6 text-ink">Light</p>
            <p className="text-[13px] leading-5 text-muted">Dark mode isn&apos;t available yet.</p>
          </div>
          <Badge tone="ink">Active</Badge>
        </div>
      </div>
    </>
  );
}
