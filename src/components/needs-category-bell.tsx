import Link from "next/link";

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
      className="relative -m-1.5 grid place-items-center rounded-full p-1.5 text-muted transition-colors hover:text-text"
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M6 9a6 6 0 0 1 12 0c0 3.6.9 5.4 1.8 6.4a.7.7 0 0 1-.52 1.16H4.72a.7.7 0 0 1-.52-1.16C5.1 14.4 6 12.6 6 9Z"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <path
          d="M9.5 19a2.5 2.5 0 0 0 5 0"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      </svg>
      {n > 0 ? (
        <span
          data-testid="needs-category-count"
          aria-hidden
          className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold leading-none text-on-primary"
        >
          {n > 9 ? "9+" : n}
        </span>
      ) : null}
    </Link>
  );
}
