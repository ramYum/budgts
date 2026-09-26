"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icon";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/budgets", label: "Budgets", icon: "budgets" },
  { href: "/transactions", label: "Activity", icon: "activity" },
  { href: "/more", label: "More", icon: "more" },
];

// Everything the phone reaches through More keeps More lit.
const MORE = ["/more", "/goals", "/accounts", "/insights", "/settings", "/help", "/about", "/connected-banks"];

/** Fixed bottom tab bar, mobile only (the desktop sidebar takes over at `md`).
 * The current tab is the one red element in the bar: a red icon, an ink
 * label, and a pixel marker that pops in on the bar's top edge. */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-hairline bg-surface pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : item.href === "/more"
                ? MORE.some((p) => pathname.startsWith(p))
                : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`press relative flex flex-col items-center gap-1 pb-2 pt-3 text-[13px] leading-4 ${
                active ? "font-semibold text-text" : "text-muted hover:text-text"
              }`}
            >
              {active ? <span className="pip absolute -top-0.5 h-1 w-4 bg-accent" aria-hidden /> : null}
              <Icon name={item.icon} className={active ? "text-accent" : ""} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
