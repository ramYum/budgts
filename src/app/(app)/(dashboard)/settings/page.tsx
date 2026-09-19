import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { signOut } from "@/server/auth";
import { NavIcon, type NavGlyph } from "@/components/nav-icons";

export const metadata: Metadata = { title: "Settings" };

function Row({ href, label, glyph }: { href: string; label: string; glyph: NavGlyph }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-surface-2">
        <NavIcon glyph={glyph} className="h-4.5 w-4.5 text-muted" />
        <span className="flex-1">{label}</span>
        <NavIcon glyph="back" className="h-4 w-4 rotate-180 text-muted" />
      </Link>
    </li>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</h2>
      <ul className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
        {children}
      </ul>
    </section>
  );
}

/** Organized into clear sections per design spec §36 — every row is a real
 * navigation destination (no dead-end rows), grouped the way the spec lays
 * out "Your account / Your money / Connected banks / App". */
export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="space-y-6 pt-1">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Section label="Your account">
        <Row href="/settings/profile" label="Profile" glyph="settings" />
        <Row href="/settings/security" label="Security" glyph="connected-banks" />
      </Section>

      <Section label="Your money">
        <Row href="/settings/categories" label="Categories" glyph="budgets" />
        <Row href="/budgets" label="Budgets" glyph="budgets" />
        <Row href="/goals" label="Savings goals" glyph="goals" />
      </Section>

      <Section label="Connected banks">
        <Row href="/connected-banks" label="Connected banks" glyph="connected-banks" />
        <Row href="/accounts" label="Manage accounts" glyph="accounts" />
      </Section>

      <Section label="App">
        <Row href="/settings/appearance" label="Appearance" glyph="settings" />
        <Row href="/help/how-it-works" label="How Budgts Works" glyph="help" />
        <Row href="/help" label="Help" glyph="help" />
        <Row href="/about" label="About Budgts" glyph="about" />
      </Section>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Data</h2>
        <div className="card space-y-2 rounded-2xl border border-hairline p-4">
          <p className="text-sm text-muted">Download every transaction as a CSV file.</p>
          <a
            href="/api/export/transactions"
            download
            className="inline-block rounded-full border border-hairline px-3 py-2 text-sm font-medium hover:bg-surface-2"
          >
            Export transactions (CSV)
          </a>
        </div>
      </section>

      <form action={signOut}>
        <button
          type="submit"
          className="rounded-full border border-border px-3 py-2 text-sm font-medium hover:bg-surface-2"
        >
          Sign out
        </button>
      </form>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Danger zone</h2>
        <ul className="card divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline">
          <li>
            <Link
              href="/settings/delete-account"
              className="flex items-center gap-3 px-4 py-3 text-sm text-neg hover:bg-surface-2"
            >
              <span className="flex-1">Delete account</span>
              <NavIcon glyph="back" className="h-4 w-4 rotate-180" />
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
