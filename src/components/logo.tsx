/** Budgts logo. Mark inherits `currentColor`; wordmark uses the display font.
 * See brand/Branding-guidelines.png for placement, clearspace and misuse. */

const MARK_PATH =
  "M12 7h40v5h-40zM7 12h5v40h-5zM52 12h5v40h-5zM12 52h40v5h-40zM19.5 17h5v22.5h-5zM24.5 17h15v5h-15zM24.5 39.5h15v7.5h-15zM39.5 22h7.5v7.5h-7.5zM32 29.5h7.5v5h-7.5zM39.5 34.5h7.5v5h-7.5z";

export function LogoMark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Budgts"
      className={className}
    >
      <path d={MARK_PATH} fill="currentColor" />
    </svg>
  );
}

export function Logo({
  size = 22,
  wordmark = true,
  className,
}: {
  size?: number;
  wordmark?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-accent ${className ?? ""}`}
    >
      <LogoMark size={size} />
      {wordmark ? (
        <span className="font-display text-[1.05rem] font-bold tracking-tight text-text">
          budgts
        </span>
      ) : null}
    </span>
  );
}
