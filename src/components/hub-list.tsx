import Link from "next/link";
import type { ReactNode } from "react";
import type { IconName } from "./icon";
import { Chevron, IconTile, SectionHead } from "./ui";

/** A hub section (More, Settings): a pixel heading over one card of rows. */
export function HubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <SectionHead title={title} />
      <ul className="px-card px-rows px-2 py-0.5 md:px-4 md:py-1">{children}</ul>
    </section>
  );
}

/** One destination: its icon, its name, what's there (a count, a setting),
 * and a chevron. The whole row is the link. */
export function HubRow({
  href,
  label,
  icon,
  value,
}: {
  href: string;
  label: string;
  icon: IconName;
  /** a quiet summary on the right ("2 goals", "Light") */
  value?: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="press group flex items-center gap-4 py-2">
        <IconTile name={icon} />
        <span className="flex-[1_0_auto] whitespace-nowrap text-[15px] font-medium leading-6 text-ink group-hover:underline">
          {label}
        </span>
        {value !== undefined && value !== null ? (
          <span className="tnum min-w-0 shrink truncate text-[13px] leading-5 text-muted">{value}</span>
        ) : null}
        <Chevron className="-mr-1" />
      </Link>
    </li>
  );
}
