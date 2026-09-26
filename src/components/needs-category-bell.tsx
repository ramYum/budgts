import Link from "next/link";
import { Icon } from "./icon";

const HREF = "/transactions#needs-category";

/**
 * Header indicator: Budgts has bank transactions it could not categorise
 * automatically and needs the user's help. Tapping it lands on the existing
 * "Needs a category" workflow at `/transactions`.
 *
 * `count` is the number of `source='bank' AND category_id IS NULL AND
 * removed_at IS NULL AND is_transfer=false` rows — the same set that drives
 * <NeedsCategory>. Because the resolver chain auto-files everything it is
 * confident about, this is only ever genuine ambiguity.
 */
export function NeedsCategoryBell({ count }: { count: number }) {
  const n = Math.max(0, Math.trunc(count));
  const label =
    n === 0
      ? "Categories up to date"
      : `${n} ${n === 1 ? "transaction needs" : "transactions need"} a category`;

  return (
    <Link
      href={HREF}
      aria-label={label}
      className="press relative grid h-10 w-10 place-items-center text-ink hover:text-graphite"
    >
      <Icon name="bell" />
      {n > 0 ? (
        <span
          data-testid="needs-category-count"
          aria-hidden
          className="px-badge-accent pip absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center"
        >
          <span className="tnum text-[11px] font-semibold leading-none text-white">{n > 9 ? "9+" : n}</span>
        </span>
      ) : null}
    </Link>
  );
}
