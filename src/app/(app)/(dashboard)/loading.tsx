/** Shown instantly while a dashboard page's data loads, so a tap never feels
 * dead. Shaped like the screen it stands in for, with a light sweep. */
export default function Loading() {
  return (
    <div className="space-y-5 pt-1" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2">
        <div className="skeleton h-7 w-48 rounded-lg" />
        <div className="skeleton h-4 w-32 rounded-md" />
      </div>
      <div className="skeleton h-44 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
      <div className="skeleton h-40 rounded-2xl" />
    </div>
  );
}
