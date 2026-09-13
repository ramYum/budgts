import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

/** Shared design-system primitives (design: 2026-09-13 UI redesign spec §48).
 * Kept intentionally small — components consume the same tokens `globals.css`
 * defines, never raw Tailwind colors. */

type ButtonBaseProps = { arrow?: boolean; className?: string; children: ReactNode };

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12h14m-6-6 6 6-6 6"
      />
    </svg>
  );
}

const primaryClass =
  "inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50";
const secondaryClass =
  "inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-2 disabled:opacity-50";

export function PrimaryButton({
  arrow,
  className,
  children,
  ...rest
}: ButtonBaseProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`${primaryClass} ${className ?? ""}`} {...rest}>
      {children}
      {arrow ? <ArrowIcon /> : null}
    </button>
  );
}

export function PrimaryLinkButton({
  arrow,
  className,
  children,
  href,
  ...rest
}: ButtonBaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link href={href} className={`${primaryClass} ${className ?? ""}`} {...rest}>
      {children}
      {arrow ? <ArrowIcon /> : null}
    </Link>
  );
}

export function SecondaryButton({
  className,
  children,
  ...rest
}: ButtonBaseProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`${secondaryClass} ${className ?? ""}`} {...rest}>
      {children}
    </button>
  );
}

export function SecondaryLinkButton({
  className,
  children,
  href,
  ...rest
}: ButtonBaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link href={href} className={`${secondaryClass} ${className ?? ""}`} {...rest}>
      {children}
    </Link>
  );
}

/** A restrained horizontal progress bar. `tone` maps to the same fill tokens
 * budget bars already use, so a category card and a goal card read the same way. */
export function ProgressBar({
  pct,
  tone = "under",
  className,
}: {
  pct: number;
  tone?: "under" | "near" | "over";
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const fill = tone === "over" ? "bg-fill-over" : tone === "near" ? "bg-fill-near" : "bg-fill-under";
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-track ${className ?? ""}`}>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${tone === "over" ? 100 : clamped}%` }} />
    </div>
  );
}

/** Simple pill-tab segmented control — "This month" / "All time" style toggles. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-gray p-0.5 text-sm">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`rounded-full px-3 py-1.5 font-semibold transition-colors ${
            value === o.value ? "bg-coral-tint text-coral-strong" : "text-muted hover:text-text"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const CATEGORY_ICON_MAP: Record<string, { glyph: CategoryGlyph; bg: string; fg: string }> = {
  Housing: { glyph: "home", bg: "var(--lavender)", fg: "var(--lavender-strong)" },
  Transportation: { glyph: "car", bg: "var(--sky)", fg: "var(--sky-strong)" },
  "Food / Groceries": { glyph: "cart", bg: "var(--sage)", fg: "var(--sage-strong)" },
  Entertainment: { glyph: "play", bg: "var(--pink)", fg: "var(--pink-strong)" },
  "Personal Care": { glyph: "heart", bg: "var(--coral-tint)", fg: "var(--coral-strong)" },
  Insurances: { glyph: "shield", bg: "var(--sun-tint)", fg: "var(--sun-strong)" },
  Salary: { glyph: "trend", bg: "var(--sage)", fg: "var(--sage-strong)" },
  "Other Income": { glyph: "trend", bg: "var(--sun-tint)", fg: "var(--sun-strong)" },
};

type CategoryGlyph = "home" | "car" | "cart" | "play" | "heart" | "shield" | "trend" | "tag";

const GLYPH_PATHS: Record<CategoryGlyph, ReactNode> = {
  home: <path d="m3.5 9.5 8.5-7 8.5 7v9.5a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1Z" />,
  car: (
    <>
      <path d="M4 16V11.5l1.8-4.2A2 2 0 0 1 7.65 6h8.7a2 2 0 0 1 1.85 1.3L20 11.5V16" />
      <path d="M4 16h16v2.5a.7.7 0 0 1-.7.7h-1.6a.7.7 0 0 1-.7-.7V17H7v1.5a.7.7 0 0 1-.7.7H4.7a.7.7 0 0 1-.7-.7Z" />
      <circle cx="7.5" cy="13" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="13" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  cart: (
    <>
      <path d="M4 5h2l1.6 9.6a1.5 1.5 0 0 0 1.48 1.25h7.28a1.5 1.5 0 0 0 1.47-1.2L19.5 8.5H7" />
      <circle cx="9.5" cy="19.5" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="19.5" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5Z" strokeLinejoin="round" />,
  heart: (
    <path d="M12 19s-7-4.35-9-8.6C1.7 7.2 3.6 4.5 6.4 4.5c1.7 0 3.1.95 3.9 2.35a4.4 4.4 0 0 1 3.9-2.35c2.8 0 4.7 2.7 3.4 5.9C19 14.65 12 19 12 19Z" />
  ),
  shield: <path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6Z" />,
  trend: (
    <>
      <path d="M4 16.5 9.5 11l3.5 3.5L20 7" />
      <path d="M14.5 7H20v5.5" />
    </>
  ),
  tag: (
    <>
      <path d="M11.5 4H6a1 1 0 0 0-1 1v5.5a1 1 0 0 0 .3.7l9 9a1 1 0 0 0 1.4 0l5.5-5.5a1 1 0 0 0 0-1.4l-9-9a1 1 0 0 0-.7-.3Z" />
      <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
};

/** A soft-colored rounded container with a simple bold glyph — the brand's
 * app-icon language, keyed by category name (design spec §"App icon system").
 * Custom/unmapped categories fall back to a neutral tag glyph tinted by the
 * category's own stored color, so nothing ever renders unlabeled. */
export function CategoryIcon({
  name,
  color,
  size = 36,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  const mapped = CATEGORY_ICON_MAP[name];
  const bg = mapped?.bg ?? color ?? "var(--muted)";
  const fg = mapped?.fg ?? "#fff";
  const glyph = mapped?.glyph ?? "tag";
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: bg, color: fg }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={size * 0.55} height={size * 0.55} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {GLYPH_PATHS[glyph]}
      </svg>
    </span>
  );
}

/** A friendly empty state: what's missing, and one clear next action. Cat
 * mascot is optional and sparing — pass `mood` only where it earns its place. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <p className="text-sm font-medium text-text">{title}</p>
      {body ? <p className="max-w-xs text-sm text-muted">{body}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

/** A small speech-bubble message paired with the mascot — used sparingly for
 * contextual encouragement (design spec §45), never decoration on every card. */
export function CatMessage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`inline-flex max-w-xs items-center rounded-2xl rounded-bl-sm bg-tint px-3 py-2 text-sm text-text ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
