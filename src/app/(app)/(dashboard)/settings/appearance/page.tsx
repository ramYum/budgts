import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Appearance" };

/** Design spec §40 explicitly says not to show a fake Dark/System toggle if
 * dark mode isn't implemented — it isn't, so this reports the true, single
 * current state rather than offering options that would do nothing. */
export default function AppearancePage() {
  return (
    <div className="space-y-4 pt-1">
      <PageHeader title="Appearance" back="/settings" />
      <div className="card flex items-center justify-between rounded-2xl border border-hairline p-4">
        <div>
          <p className="text-sm font-medium">Light</p>
          <p className="text-xs text-muted">Dark mode isn&apos;t available yet.</p>
        </div>
        <span className="rounded-full bg-tint px-2.5 py-1 text-xs font-medium text-primary">Active</span>
      </div>
    </div>
  );
}
