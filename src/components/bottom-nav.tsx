"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon, type NavGlyph } from "./nav-icons";

const NAV: { href: string; label: string; glyph: NavGlyph }[] = [
  { href: "/", label: "Home", glyph: "home" },
  { href: "/budgets", label: "Budgets", glyph: "budgets" },
  { href: "/transactions", label: "Activity", glyph: "activity" },
  { href: "/more", label: "More", glyph: "more" },
];

/** Fixed bottom tab bar, mobile only (the desktop sidebar takes over at `md`).
 * The active tab is the one red element in the bar: filled icon, red label,
 * and a single pixel marker that pops in above it. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t border-hairline bg-surface/90 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-4">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`press relative flex flex-col items-center gap-1 pt-3 pb-1 text-[11px] font-medium ${
                active ? "text-accent" : "text-muted hover:text-text"
              }`}
            >
              {active ? <span className="pip absolute top-0 h-[3px] w-6 bg-accent" aria-hidden /> : null}
              <NavIcon glyph={item.glyph} weight={active ? (item.glyph === "more" ? "bold" : "fill") : "regular"} className="h-[22px] w-[22px]" />
              <span className={active ? "text-neg" : undefined}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
