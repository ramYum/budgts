import Link from "next/link";
import { NavIcon } from "./nav-icons";

/** Secondary/detail-screen header with a clear back affordance on mobile
 * (design spec §5 Back behavior). The desktop sidebar is always present, so
 * the back link is hidden at `md` — it would be redundant there. */
export function PageHeader({ title, back }: { title: string; back: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Link
        href={back}
        aria-label="Back"
        className="-ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-text md:hidden"
      >
        <NavIcon glyph="back" className="h-5 w-5" />
      </Link>
      <h1 className="text-xl font-semibold">{title}</h1>
    </div>
  );
}
