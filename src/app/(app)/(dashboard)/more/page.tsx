import type { Metadata } from "next";
import Link from "next/link";
import { NavIcon, type NavGlyph } from "@/components/nav-icons";

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
        <Row href="/help/how-it-works" label="How Budgts Works" glyph="help" />
        <Row href="/help" label="Help" glyph="help" />
        <Row href="/about" label="About Budgts" glyph="about" />
      </ul>
    </div>
  );
}
