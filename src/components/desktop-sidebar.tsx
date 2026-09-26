"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { displayName } from "@/lib/user/display-name";
import { Icon, type IconName } from "./icon";
import { Logo } from "./logo";

type Item = { href: string; label: string; icon: IconName };

const PRIMARY: Item[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/budgets", label: "Budgets", icon: "budgets" },
  { href: "/transactions", label: "Activity", icon: "activity" },
];

const SECONDARY: Item[] = [
  { href: "/goals", label: "Goals", icon: "goals" },
  { href: "/accounts", label: "Accounts", icon: "accounts" },
  { href: "/insights", label: "Insights", icon: "insights" },
];

// "More" holds what the rows above don't: the welcome guide, Help, About and
// connected banks (the same page as the phone's More tab).
const TERTIARY: Item[] = [
  { href: "/settings", label: "Settings", icon: "settings" },
  { href: "/more", label: "More", icon: "more" },
];

// Pages reached from More light up More, the way the phone's More tab does,
// so there's always one current row.
const UNDER_MORE = ["/more", "/help", "/about", "/connected-banks"];

function Row({ item, active }: { item: Item; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`px-nav press relative flex items-center gap-2.5 px-2 py-0.5 text-[15px] leading-6 ${
        active ? "font-medium text-text" : "text-graphite hover:text-text"
      }`}
    >
      {/* the current page's marker sits on the sidebar's own edge */}
      {active ? <span className="pip absolute -left-[22px] top-1 h-5 w-1 bg-accent" aria-hidden /> : null}
      <Icon name={item.icon} className={active ? "text-accent" : ""} />
      {item.label}
    </Link>
  );
}

/** Persistent left sidebar, `md` and up. Quiet by default: the current row
 * is the one place the accent appears. The signed-in person sits at the foot. */
export function DesktopSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : href === "/more"
        ? UNDER_MORE.some((p) => pathname.startsWith(p))
        : pathname.startsWith(href);
  const name = displayName(email);

  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r-2 border-hairline bg-surface px-4 pb-6 pt-8 md:flex">
      <Link href="/" className="press mb-8 flex h-6 w-fit items-center px-3.5" aria-label="Budgts home">
        <Logo size={22} />
      </Link>
      <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
        {PRIMARY.map((item) => (
          <Row key={item.href} item={item} active={isActive(item.href)} />
        ))}
        <div className="px-rule mx-4 my-3" aria-hidden />
        {SECONDARY.map((item) => (
          <Row key={item.href} item={item} active={isActive(item.href)} />
        ))}
        <div className="px-rule mx-4 my-3" aria-hidden />
        {TERTIARY.map((item) => (
          <Row key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>
      <p className="px-tag mb-4 px-2 text-muted">
        Track <span className="text-accent">:</span> Plan <span className="text-accent">:</span> Grow
      </p>
      <Link
        href="/settings/profile"
        className="px-nav press flex items-center gap-3 px-1 py-0.5"
        aria-label={`Profile: ${email}`}
      >
        <span className="px-tile-ink flex h-8 w-8 items-center justify-center" aria-hidden>
          <span className="px-tag-bold leading-none tracking-normal text-white">{(name || email || "?")[0]}</span>
        </span>
        <span className="min-w-0" aria-hidden>
          <span className="block truncate text-[15px] leading-5 text-text">{name || "You"}</span>
          <span className="block truncate text-[13px] leading-4 text-muted">{email}</span>
        </span>
      </Link>
    </aside>
  );
}
