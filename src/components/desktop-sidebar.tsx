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

// "More" holds what the rows above don't: the welcome guide, Help, About and
// connected banks (the same page as the phone's More tab).
const TERTIARY: Item[] = [
  { href: "/settings", label: "Settings", glyph: "settings" },
  { href: "/more", label: "More", glyph: "more" },
];

function Row({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`press relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
        active ? "bg-surface-2 font-medium text-text" : "text-muted hover:bg-surface-2 hover:text-text"
      }`}
    >
      {active ? <span className="pip absolute left-0 h-4 w-[3px] bg-accent" aria-hidden /> : null}
      <NavIcon
        glyph={item.glyph}
        weight={active ? "fill" : "regular"}
        className={`h-5 w-5 ${active ? "text-accent" : ""}`}
      />
      {item.label}
    </Link>
  );
}

/** Persistent left sidebar, `md` and up. Quiet by default: the active row is
 * the only place the accent appears. */
export function DesktopSidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col gap-8 border-r border-hairline bg-surface px-4 py-6 md:flex">
      <Link href="/" className="px-2">
        <Logo size={30} />
      </Link>
      <nav className="flex flex-1 flex-col gap-0.5">
        {PRIMARY.map((item) => (
          <Row key={item.href} item={item} active={isActive(item.href)} />
        ))}
        <div className="mx-3 my-3 h-px bg-hairline" />
        {SECONDARY.map((item) => (
          <Row key={item.href} item={item} active={isActive(item.href)} />
        ))}
        <div className="mx-3 my-3 h-px bg-hairline" />
        {TERTIARY.map((item) => (
          <Row key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
      <p className="font-pixel px-3 text-[8px] uppercase text-silver">Track : Plan : Grow</p>
    </aside>
  );
}
