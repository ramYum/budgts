/** Shown instantly while a dashboard page's data loads, so a tap never feels dead. */
export default function Loading() {
  return (
    <div className="space-y-4 pt-1" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-6 w-32 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
      <div className="h-24 animate-pulse rounded-2xl bg-surface-2" />
    </div>
  );
}
