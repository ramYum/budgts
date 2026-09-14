/** Budgt logo. The mark is the black-cat mascot on its cream/coral/lavender
 * badge — the real artwork from the brand's own Logo Assets, not a crop
 * (see docs/BRAND_GUIDELINES.md). */

const MARK_SRC = "/brand/logo-mark.png";

export function LogoMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- fixed brand raster, sized well below its native resolution
    <img
      src={MARK_SRC}
      alt=""
      width={size}
      height={size}
      className={`inline-block shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size }}
    />
  );
}

export function Logo({
  size = 22,
  mark = true,
  wordmark = true,
  onDark = false,
  className,
}: {
  size?: number;
  /** `false` to render just the "Budgt" wordmark, e.g. below a bigger hero mark. */
  mark?: boolean;
  wordmark?: boolean;
  /** `true` when the logo sits on a dark ground — flips the wordmark to white. */
  onDark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      {mark ? <LogoMark size={size} /> : null}
      {wordmark ? (
        <span
          className={`font-display text-[1.05rem] font-bold tracking-tight ${
            onDark ? "text-white" : "text-text"
          }`}
        >
          Budgt
        </span>
      ) : null}
    </span>
  );
}
