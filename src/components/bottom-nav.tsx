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

/** Fixed bottom tab bar — mobile only (the desktop sidebar takes over at the
 * `md` breakpoint, see `DesktopSidebar`). Compact, friendly, easy to scan. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-md items-center justify-around border-t border-hairline bg-surface/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-xs shadow-[0_-6px_20px_rgb(29_17_89/0.06)] backdrop-blur md:hidden">
      {NAV.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-14 flex-col items-center gap-0.5 rounded-2xl px-2.5 py-1.5 font-semibold transition-colors ${
              active
                ? "bg-primary text-on-primary"
                : "text-muted hover:text-text"
            }`}
          >
            <NavIcon glyph={item.glyph} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
