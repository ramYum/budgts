"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { NavIcon, type NavGlyph } from "./nav-icons";

type Item = { href: string; label: string; glyph: NavGlyph };

const PRIMARY: Item[] = [
  { href: "/", label: "Home", glyph: "home" },
  { href: "/budgets", label: "Budgets", glyph: "budgets" },
  { href: "/transactions", label: "Activity", glyph: "activity" },
];

const SECONDARY: Item[] = [
  { href: "/goals", label: "Goals", glyph: "goals" },
  { href: "/accounts", label: "Accounts", glyph: "accounts" },
  { href: "/insights", label: "Insights", glyph: "insights" },
];

const TERTIARY: Item[] = [{ href: "/settings", label: "Settings", glyph: "settings" }];

function Row({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-tint text-primary" : "text-muted hover:bg-surface-2 hover:text-text"
      }`}
    >
      <NavIcon glyph={item.glyph} className="h-5 w-5" />
      {item.label}
    </Link>
  );
}

/** Persistent left sidebar, `md` breakpoint and up — replaces the bottom tab
 * bar entirely on desktop rather than stretching the mobile nav (design spec
 * §4 Desktop, §47). Stays visually quiet: no primary-color fills except the
 * active row's soft tint. */
export function DesktopSidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col gap-6 border-r border-hairline bg-surface px-4 py-6 md:flex">
      <Logo size={22} />
      <nav className="flex flex-1 flex-col gap-1">
        {PRIMARY.map((item) => (
          <Row key={item.href} item={item} active={isActive(item.href)} />
        ))}
        <div className="my-2 h-px bg-hairline" />
        {SECONDARY.map((item) => (
          <Row key={item.href} item={item} active={isActive(item.href)} />
        ))}
        <div className="my-2 h-px bg-hairline" />
        {TERTIARY.map((item) => (
          <Row key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
    </aside>
  );
}
