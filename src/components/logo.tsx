import { Robin } from "./mascot";

/** Budgts lockup: the pixel robin + the wordmark set in Dogica Bold (a live
 * text wordmark, so it stays crisp, selectable and accessible). The robin is
 * alive wherever the logo shows: it blinks and chirps on a loop. */

export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return <Robin size={size} className={className} />;
}

export function Logo({
  size = 22,
  mark = true,
  wordmark = true,
  className,
}: {
  size?: number;
  /** `false` to render just the wordmark, e.g. below a bigger hero mark. */
  mark?: boolean;
  wordmark?: boolean;
  className?: string;
}) {
  // Dogica is drawn on an 8px grid: snap the wordmark to the nearest multiple.
  const type = Math.max(8, Math.round((size * 0.62) / 8) * 8);
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      {mark ? <Robin size={size} /> : null}
      {wordmark ? (
        <span className="font-pixel-bold leading-none text-ink" style={{ fontSize: type }}>
          Budgts
        </span>
      ) : (
        <span className="sr-only">Budgts</span>
      )}
    </span>
  );
}
