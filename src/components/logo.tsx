/** Budgts logo. The mark is always Volt Lime on a Deep Pine rounded square so it
 * stays legible on any ground (the bare lime mark disappears on white).
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
  const inner = Math.round(size * 0.62);
  return (
    <span
      role="img"
      aria-label="Budgts"
      className={`inline-grid shrink-0 place-items-center rounded-[28%] bg-pine text-accent ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <svg width={inner} height={inner} viewBox="0 0 64 64" aria-hidden>
        <path d={MARK_PATH} fill="currentColor" />
      </svg>
    </span>
  );
}

export function Logo({
  size = 22,
  wordmark = true,
  onDark = false,
  className,
}: {
  size?: number;
  wordmark?: boolean;
  /** `true` when the logo sits on a dark ground — flips the wordmark to white. */
  onDark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={size} />
      {wordmark ? (
        <span
          className={`font-display text-[1.05rem] font-bold tracking-tight ${
            onDark ? "text-white" : "text-text"
          }`}
        >
          budgts
        </span>
      ) : null}
    </span>
  );
}
