import type { ReactNode } from "react";

/** Keys match the `data-tour-target` attributes on the real components and the
 * `.tour-demo[data-tour-highlight=…]` rules in globals.css. */
export type TourHighlight = "money-left" | "activity" | "disconnect" | "review-notice" | "exclude";

/**
 * Shows a REAL Budgts component fed with controlled demo data (see
 * src/lib/tour/demo-data.ts) — safely.
 *
 * The children sit inside an `inert` region: nothing in it can be focused,
 * clicked, typed into or submitted, so a real server action (disconnect,
 * exclude, categorize, add income…) can never fire from an explanation, and
 * assistive tech reads the surrounding text instead of a fake interactive
 * screen. The bank-connection step is the one deliberate exception and does
 * not use this frame.
 */
export function DemoFrame({
  label,
  highlight,
  clip = false,
  children,
}: {
  /** What the viewer is looking at — also the figure's visible caption. */
  label: string;
  highlight?: TourHighlight;
  /** Crop a tall screen (the whole dashboard) with a soft fade. */
  clip?: boolean;
  children: ReactNode;
}) {
  return (
    <figure className="tour-demo space-y-2" data-tour-highlight={highlight}>
      <div className="relative overflow-hidden rounded-3xl border border-hairline bg-bg">
        <span className="absolute right-3 top-3 z-10 rounded-full bg-ink px-2.5 py-1 text-[11px] font-medium text-on-dark">
          Example
        </span>
        <div
          inert
          className={`pointer-events-none select-none p-3 pt-10 ${
            clip ? "tour-demo-fade max-h-[26rem] overflow-hidden" : ""
          }`}
        >
          {children}
        </div>
      </div>
      <figcaption className="text-xs text-muted">
        {label} — example data that isn&apos;t from your accounts.
      </figcaption>
    </figure>
  );
}
