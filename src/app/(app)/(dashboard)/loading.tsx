/** Shown instantly while a dashboard page's data loads, so a tap never feels
 * dead. Shaped like the screen it stands in for (a title, the lead card, then
 * a list), with a light sweep. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="mb-6 space-y-2 md:mb-14">
        <div className="skeleton h-6 w-48 md:h-8 md:w-72" />
        <div className="skeleton h-4 w-40" />
      </div>
      <div className="px-card-raised space-y-4 p-2 md:p-6">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-10 w-56 md:h-12 md:w-72" />
        <div className="skeleton h-3 w-full max-w-[444px]" />
      </div>
      <div className="mt-10 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="px-card space-y-5 p-2 md:p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-10 w-10 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-2/5" />
                <div className="skeleton h-2 w-full" />
              </div>
            </div>
          ))}
        </div>
        <div className="px-card hidden space-y-4 p-2 md:p-4 xl:block">
          <div className="skeleton h-8 w-40" />
          <div className="skeleton h-2 w-full" />
          <div className="skeleton h-4 w-3/5" />
        </div>
      </div>
    </div>
  );
}
