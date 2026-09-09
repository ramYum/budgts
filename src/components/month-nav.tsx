import Link from "next/link";
import { monthKey } from "@/lib/budget/month";

/** ‹ September 2026 › — server component, links change the `?m=` param.
 * `tone="dark"` for use inside the Deep Pine dashboard hero. */
export function MonthNav({
  base,
  month,
  tone = "light",
}: {
  base: string;
  month: string;
  tone?: "light" | "dark";
}) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const prev = monthKey(new Date(Date.UTC(y, m - 2, 1)));
  const next = monthKey(new Date(Date.UTC(y, m, 1)));
  const label = first.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const chevron =
    tone === "dark"
      ? "rounded-md px-2 py-1 text-sm text-on-dark-dim hover:text-on-dark"
      : "rounded-md px-2 py-1 text-sm text-muted hover:text-text";

  return (
    <div className="flex items-center gap-1">
      <Link href={`${base}?m=${prev}`} className={chevron} aria-label="Previous month">
        ‹
      </Link>
      <h1
        className={`min-w-[9.5ch] text-center text-base font-semibold ${
          tone === "dark" ? "text-on-dark" : ""
        }`}
      >
        {label}
      </h1>
      <Link href={`${base}?m=${next}`} className={chevron} aria-label="Next month">
        ›
      </Link>
    </div>
  );
}
