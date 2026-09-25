import type { Metadata } from "next";
import Link from "next/link";
import { Play } from "@phosphor-icons/react/dist/ssr";
import { NavIcon, type NavGlyph } from "@/components/nav-icons";
import { InstallApp } from "@/components/install-app";
import { Robin } from "@/components/mascot";

export const metadata: Metadata = { title: "More" };

function Row({ href, label, glyph }: { href: string; label: string; glyph: NavGlyph }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-surface-2"
      >
        <NavIcon glyph={glyph} className="h-5 w-5 text-muted" />
        <span className="flex-1">{label}</span>
        <NavIcon glyph="back" className="h-4 w-4 rotate-180 text-muted" />
      </Link>
    </li>
  );
}

/** Secondary hub — everything not in the primary Home/Budgets/Activity tabs
 * (design spec §42). Desktop already surfaces Goals/Accounts/Insights/Settings
 * in the sidebar, so this route mainly serves mobile, but stays reachable
 * everywhere for consistency. */
export default function MorePage() {
  return (
    <div className="space-y-6 pt-1">
      <h1 className="text-xl font-semibold">More</h1>

      {/* Replays the welcome guide (/tour without ?new=1 opens with Crystal's
       * introduction; finishing or skipping it lands back on Home). */}
      <Link
        href="/tour"
        className="press lift card flex items-center gap-3.5 rounded-2xl border border-hairline p-4"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-signal-wash">
          <Robin size={30} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-text">Play welcome guide</span>
          <span className="mt-0.5 block text-xs text-muted">A one-minute tour with Crystal.</span>
        </span>
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-btn text-on-primary-btn"
        >
          <Play weight="fill" className="h-4 w-4" />
        </span>
      </Link>

      <InstallApp />

      <ul className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
        <Row href="/goals" label="Savings Goals" glyph="goals" />
        <Row href="/accounts" label="Accounts" glyph="accounts" />
        <Row href="/insights" label="Insights" glyph="insights" />
      </ul>

      <ul className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
        <Row href="/connected-banks" label="Connected Banks" glyph="connected-banks" />
        <Row href="/settings" label="Settings" glyph="settings" />
      </ul>

      <ul className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
        <Row href="/help" label="Help" glyph="help" />
        <Row href="/about" label="About Budgts" glyph="about" />
      </ul>

      <div className="flex flex-col items-center gap-3 pt-6 pb-2">
        <Robin size={36} mood="normal" />
        <p className="font-pixel text-[8px] uppercase text-muted">
          Track <span className="text-accent">:</span> Plan <span className="text-accent">:</span> Grow
        </p>
      </div>
    </div>
  );
}
