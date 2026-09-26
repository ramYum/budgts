import Link from "next/link";
import { monthKey } from "@/lib/budget/month";
import { Icon } from "./icon";

/** September 2026 ‹ › : server component, links change the `?m=` param. */
export function MonthNav({ base, month }: { base: string; month: string }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const prev = monthKey(new Date(Date.UTC(y, m - 2, 1)));
  const next = monthKey(new Date(Date.UTC(y, m, 1)));
  const label = first.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const step = "px-step press flex h-9 w-9 items-center justify-center text-ink";

  return (
    <div className="flex items-center gap-3">
      <p className="tnum whitespace-nowrap text-[15px] font-semibold leading-6 text-ink">{label}</p>
      <div className="flex items-center gap-2">
        <Link href={`${base}?m=${prev}`} className={step} aria-label="Previous month">
          <Icon name="chevron-left" />
        </Link>
        <Link href={`${base}?m=${next}`} className={step} aria-label="Next month">
          <Icon name="chevron-right" />
        </Link>
      </div>
    </div>
  );
}
