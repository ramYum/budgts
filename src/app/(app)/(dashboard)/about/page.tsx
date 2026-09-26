import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Robin } from "@/components/mascot";

export const metadata: Metadata = { title: "About Budgts" };

const DETAILS: [string, string][] = [
  // the roadmap tier (docs/roadmap.md), not a made-up semver: this app has none
  ["Version", "V1"],
  ["Bank connections", "Plaid"],
  ["Pixel type", "Dogica by Roberto Mocci · OFL"],
  ["Icons", "Pixelarticons · MIT"],
];

/** Static about screen (design spec §44): the brand on its stage, the one
 * line it stands for, and the facts behind it (version, partners, credits). */
export default function AboutPage() {
  return (
    <>
      <PageHeader title="About" back="/more" />
      <div className="space-y-8 md:max-w-[720px]">
        <section className="px-card">
          <div className="px-dots flex flex-col items-center gap-2 px-4 py-6 md:py-8">
            <Robin size={88} mood="normal" />
            <span className="h-1 w-20 bg-hairline" aria-hidden />
            <p className="px-title mt-2 text-ink">Budgts</p>
            <p className="px-tag text-muted">
              Track <span className="text-accent">:</span> Plan <span className="text-accent">:</span> Grow
            </p>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="px-figure text-ink">A brighter way to budget.</h2>
          <p className="text-[15px] leading-6 text-muted">
            Budgts helps you take control of your money with simple tools, clear insights and a little encouragement
            along the way.
          </p>
        </section>

        <dl className="px-card px-rows p-3 md:p-4">
          {DETAILS.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
              <dt className="text-[15px] leading-6 text-muted">{label}</dt>
              <dd className="text-right text-[15px] font-medium leading-6 text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
