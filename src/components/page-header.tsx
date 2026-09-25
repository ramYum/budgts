import Link from "next/link";
import { NavIcon } from "./nav-icons";

/** Secondary/detail-screen header with a clear back affordance on mobile.
 * The desktop sidebar is always present, so the back link hides at `md`. */
export function PageHeader({ title, back }: { title: string; back: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <Link
        href={back}
        aria-label="Back"
        className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface text-text hover:border-silver md:hidden"
      >
        <NavIcon glyph="back" className="h-4 w-4" />
      </Link>
      <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
    </div>
  );
}
