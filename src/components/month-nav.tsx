import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { monthKey } from "@/lib/budget/month";

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

  const step =
    "press flex h-8 w-8 items-center justify-center rounded-lg border border-hairline bg-surface text-muted hover:border-silver hover:text-text";

  return (
    <div className="flex items-center gap-2">
      <h1 className="min-w-[9.5ch] text-[17px] font-semibold tracking-tight">{label}</h1>
      <div className="flex items-center gap-1.5">
        <Link href={`${base}?m=${prev}`} className={step} aria-label="Previous month">
          <CaretLeft aria-hidden className="h-4 w-4" />
        </Link>
        <Link href={`${base}?m=${next}`} className={step} aria-label="Next month">
          <CaretRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
