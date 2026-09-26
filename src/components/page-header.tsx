import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./icon";

/** A square back arrow for screens reached from a hub (More, Settings, Help). */
export function BackLink({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label="Back"
      className={`px-step press flex h-9 w-9 shrink-0 items-center justify-center ${className ?? ""}`}
    >
      <Icon name="back" />
    </Link>
  );
}

/**
 * Every screen's header: the pixel title, then the month and the screen's one
 * action. Desktop keeps it to one row (and leaves the top-right corner to the
 * layout's bell); a phone gives the month its own row under the title.
 */
export function PageHeader({
  title,
  back,
  backOnDesktop = true,
  month,
  action,
  subtitle,
  children,
}: {
  title: ReactNode;
  /** a quiet line right under the title */
  subtitle?: ReactNode;
  /** where the back arrow goes; screens reached from a hub have one */
  back?: string;
  /** false for a screen the sidebar lists: on desktop the sidebar is the way back */
  backOnDesktop?: boolean;
  /** a <MonthNav> */
  month?: ReactNode;
  /** the screen's primary action */
  action?: ReactNode;
  /** a line under the title */
  children?: ReactNode;
}) {
  return (
    <header className="mb-5 md:mb-14 md:pr-14">
      {/* The phone's second row exists only with a month: an empty row would
          still take the row gap. */}
      <div
        className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:gap-x-4 md:[grid-template-areas:'title_month_action'] ${
          month ? "[grid-template-areas:'title_action'_'month_month']" : "[grid-template-areas:'title_action']"
        }`}
      >
        <div className="flex min-h-10 min-w-0 items-center gap-2 [grid-area:title] md:gap-4">
          {back ? <BackLink href={back} className={backOnDesktop ? "" : "md:hidden"} /> : null}
          <div className="min-w-0">
            <h1 className="px-title text-ink">{title}</h1>
            {subtitle ? <p className="mt-1 text-[15px] leading-5 text-muted">{subtitle}</p> : null}
          </div>
        </div>
        {month ? <div className={`[grid-area:month] ${subtitle ? "md:self-start" : ""}`}>{month}</div> : null}
        {action ? <div className="[grid-area:action]">{action}</div> : null}
      </div>
      {children}
    </header>
  );
}
