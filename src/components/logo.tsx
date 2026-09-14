/** Budgts logo. The mark is the robin mascot — the real artwork from the
 * brand's own Logo Assets V2, not a crop (see docs/BRAND_GUIDELINES.md). */

const MARK_SRC = "/brand/logo-mark.png";
const MARK_ASPECT = 306 / 288; // logo-mark.png's native w/h

const WORDMARK_SRC = "/brand/wordmark.png";
const WORDMARK_ASPECT = 700 / 350; // wordmark.png's native w/h

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
      style={{ width: size * MARK_ASPECT, height: size }}
    />
  );
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
  const wordmarkHeight = size * 0.9;
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      {mark ? <LogoMark size={size} /> : null}
      {wordmark ? (
        // eslint-disable-next-line @next/next/no-img-element -- fixed brand raster wordmark
        <img
          src={WORDMARK_SRC}
          alt="Budgts"
          width={wordmarkHeight * WORDMARK_ASPECT}
          height={wordmarkHeight}
          style={{ width: wordmarkHeight * WORDMARK_ASPECT, height: wordmarkHeight }}
        />
      ) : null}
    </span>
  );
}
