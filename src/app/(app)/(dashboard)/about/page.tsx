import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { LogoMark } from "@/components/logo";

export const metadata: Metadata = { title: "About Budgt" };

/** Static about screen (design spec §44). Version reflects the roadmap tier
 * (`docs/roadmap.md`) rather than a fabricated semver — this app has none. */
export default function AboutPage() {
  return (
    <div className="space-y-6 pt-1">
      <PageHeader title="About Budgt" back="/more" />

      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <LogoMark size={64} />
        <div>
          <p className="text-lg font-bold">Simple money.</p>
          <p className="text-lg font-bold">Brighter tomorrows.</p>
        </div>
        <p className="max-w-xs text-sm text-muted">
          Budgt helps you take control of your money with simple tools, clear insights, and a little
          encouragement along the way.
        </p>
      </div>

      <div className="card space-y-2 rounded-2xl border border-hairline p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Version</span>
          <span className="font-medium">V1</span>
        </div>
      </div>
    </div>
  );
}
