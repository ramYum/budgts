import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, ReactNode, Ref, SelectHTMLAttributes } from "react";
import { Icon, type IconName } from "./icon";

/** Shared design-system primitives. Components consume the semantic tokens in
 * globals.css and the stepped frames in pixel-frames.css, never raw colors.
 * Shape rule: every frame steps on the 2px cell grid (cards r3, controls r2,
 * chips r1). Reading text and button labels stay in Geist; Dogica is for
 * titles, tags and figures. */

/* ─── Buttons ──────────────────────────────────────────────────────────── */

type Variant = "primary" | "secondary" | "danger";

const BUTTON: Record<Variant, string> = {
  // the one primary per view: solid red on a raised edge
  primary: "px-btn-primary px-raise text-white",
  // everything else: an ink frame, or a red one when it destroys something
  secondary: "px-btn press text-ink",
  danger: "px-btn-danger press text-signal-ink",
};

type Size = "md" | "lg";

const SIZE: Record<Size, string> = {
  // 36px: a 6px frame around a 24px line
  md: "h-9 px-1.5",
  // 44px: a screen's closing action (Sign out), a full touch target
  lg: "h-11 px-3",
};

/** A stepped-frame button, label 15px semibold. */
export function buttonClass(variant: Variant = "primary", className = "", size: Size = "md") {
  return `inline-flex items-center justify-center gap-2 whitespace-nowrap text-[15px] font-semibold leading-6 disabled:cursor-not-allowed disabled:text-muted ${SIZE[size]} ${BUTTON[variant]} ${className}`;
}

type ButtonBaseProps = {
  variant?: Variant;
  size?: Size;
  /** a leading icon */
  icon?: IconName;
  /** a trailing icon (a chevron for "show more") */
  iconAfter?: IconName;
  /** a trailing arrow, for "go on" steps */
  arrow?: boolean;
  className?: string;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size,
  icon,
  iconAfter,
  arrow,
  className,
  children,
  ...rest
}: ButtonBaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
  return (
    <button type="button" className={buttonClass(variant, className, size)} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} /> : null}
      {arrow ? <Icon name="forward" /> : null}
    </button>
  );
}

export function LinkButton({
  variant = "primary",
  size,
  icon,
  iconAfter,
  arrow,
  className,
  children,
  href,
  ...rest
}: ButtonBaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <Link href={href} className={buttonClass(variant, className, size)} {...rest}>
      {icon ? <Icon name={icon} /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} /> : null}
      {arrow ? <Icon name="forward" /> : null}
    </Link>
  );
}

/** The primary action (kept as named exports: the welcome guide uses them). */
export function PrimaryButton(props: Omit<ButtonBaseProps, "variant"> & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button {...props} variant="primary" />;
}

export function PrimaryLinkButton(
  props: Omit<ButtonBaseProps, "variant"> & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string },
) {
  return <LinkButton {...props} variant="primary" />;
}

/** A quiet text action with an icon ("Copy last month", "Withdraw"). */
export function TextButton({
  icon,
  iconAfter,
  className,
  children,
  ...rest
}: { icon?: IconName; iconAfter?: IconName; className?: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`press inline-flex min-h-9 items-center gap-1.5 text-[15px] leading-6 hover:text-ink disabled:opacity-50 ${className ?? "text-muted"}`}
      {...rest}
    >
      {icon ? <Icon name={icon} /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} /> : null}
    </button>
  );
}

/* ─── Form fields ──────────────────────────────────────────────────────── */

/** A text input / textarea in a stepped frame, 44px tall (a touch target);
 * the frame thickens to ink on focus and to red when `data-invalid`. 16px
 * type, so iOS never zooms the page on focus. */
export const fieldClass =
  "px-field w-full bg-transparent px-2 py-1 text-base leading-6 text-ink placeholder:text-[#767676] disabled:text-muted";

/** A field's label: a quiet line above it. */
export const labelClass = "block space-y-1.5 text-sm font-medium leading-5 text-graphite";

/** A native select in a stepped frame, with a pixel chevron. */
export function Select({
  className,
  children,
  ...rest
}: { className?: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={`${fieldClass} appearance-none pr-10 ${className ?? ""}`} {...rest}>
        {children}
      </select>
      <Icon name="chevron-down" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-graphite" />
    </span>
  );
}

/* ─── Data marks ───────────────────────────────────────────────────────── */

/** Progress as a row of square cells (the Budgts data mark): ink when on
 * track, the accent once near/over, green for money kept toward a goal. Each
 * cell is as wide as the bar is tall (`cellHeight`, 8px by default) and as
 * many fit as the bar is long, so the bar keeps its size at any width;
 * globals.css (.px-bar) counts them and lights round(share × count), at least
 * one once anything counts. Cells step in left to right, `start` steps after
 * the page's first (so stacked rows cascade); an over row flashes twice once
 * it's full. `cells` fixes the count instead (a step tracker) and sizes the
 * bar to fit them. `pct` only picks how many cells light up; the figure
 * itself is always printed as text beside it. */
export function ProgressBar({
  pct,
  tone = "under",
  className,
  cells,
  start = 0,
  cellHeight,
}: {
  pct: number;
  tone?: "under" | "near" | "over" | "growth";
  className?: string;
  cells?: number;
  start?: number;
  /** cell size (and so bar thickness), in px (default 8) */
  cellHeight?: number;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const over = tone === "over";
  const fill = tone === "under" ? "var(--fill-under)" : tone === "growth" ? "var(--pos)" : "var(--fill-over)";
  return (
    <div
      className={`px-cells ${over ? "cells-over" : ""} ${className ?? ""}`}
      style={
        {
          "--share": over ? 1 : clamped / 100,
          "--min-lit": over || clamped > 0 ? 1 : 0,
          "--fill": fill,
          "--start": start,
          ...(cellHeight ? { "--cell-h": `${cellHeight}px` } : {}),
          ...(cells ? { width: `calc(${cells} * var(--cell-h) + ${cells - 1} * var(--gap))` } : {}),
        } as CSSProperties
      }
      aria-hidden
    >
      <span className="px-bar" />
    </div>
  );
}

/** The size for a screen's one money figure: the hero size, stepping down
 * past 13 characters on a phone rather than run out of its card. */
export function figureSize(text: string): string {
  if (text.length <= 13) return "t-num-xl";
  return "t-num-lg md:text-[48px] md:leading-[56px]";
}

/* ─── Chips, tags, badges ──────────────────────────────────────────────── */

/** Chip-row toggle ("This month" / "All time"). The selected chip is solid
 * ink; the rest are quiet stepped outlines. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`px-chip press h-8 px-2 text-[15px] leading-6 ${on ? "font-semibold text-white" : "text-graphite hover:text-ink"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

type BadgeTone = "gray" | "growth" | "wash" | "ink";
const BADGE: Record<BadgeTone, string> = {
  gray: "px-badge text-graphite",
  growth: "px-badge-growth text-pos",
  wash: "px-badge-wash text-signal-ink",
  ink: "px-badge-ink text-white",
};

/** A small status chip in pixel type: "CONNECTED", "21%", "SANDBOX". */
export function Badge({
  tone = "gray",
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: IconName;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`t-label-strong inline-flex h-6 items-center gap-1 whitespace-nowrap px-1.5 leading-none ${BADGE[tone]} ${className ?? ""}`}
    >
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

/** A section's heading (sentence case), an optional count, and one link on the right. */
export function SectionHead({
  title,
  count,
  href,
  action,
  aside,
  as: As = "h2",
  className,
}: {
  title: string;
  count?: number;
  href?: string;
  action?: string;
  /** anything else on the right (a badge, a quiet note) */
  aside?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={`flex min-h-6 items-center justify-between gap-3 ${className ?? ""}`}>
      <As className="t-head text-ink">
        {title}
        {count !== undefined ? <span className="tnum ml-2 font-medium text-muted">{count}</span> : null}
      </As>
      {href && action ? (
        <Link href={href} className="press -my-1 flex items-center text-[15px] leading-6 text-muted hover:text-ink">
          {action}
          <Icon name="chevron-right" className="-mr-1.5" />
        </Link>
      ) : (
        aside
      )}
    </div>
  );
}

/* ─── Icons on tiles ───────────────────────────────────────────────────── */

type TileTone = "gray" | "wash" | "accent" | "ink" | "growth";
const TILE: Record<TileTone, string> = {
  gray: "px-tile text-ink",
  wash: "px-tile-wash text-signal",
  accent: "px-tile-accent text-white",
  ink: "px-tile-ink text-white",
  growth: "px-tile-growth text-pos",
};

/** An icon on a quiet stepped tile: 32px on a phone and 40px from md unless
 * sized. The icon stays 24px at any tile size, so its cells stay whole. */
export function IconTile({
  name,
  tone = "gray",
  size,
  className,
}: {
  name: IconName;
  tone?: TileTone;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${size === undefined ? "h-8 w-8 md:h-10 md:w-10" : ""} ${TILE[tone]} ${className ?? ""}`}
      style={size === undefined ? undefined : { width: size, height: size }}
      aria-hidden
    >
      <Icon name={name} />
    </span>
  );
}

const CATEGORY_ICON: Record<string, IconName> = {
  Housing: "home",
  Transportation: "car",
  "Food / Groceries": "cart",
  Entertainment: "gamepad",
  "Personal Care": "heart",
  Insurances: "shield",
  Salary: "briefcase",
  "Other Income": "trending-up",
  Transfer: "transfer",
};

/** A category's glyph: the standard categories have their own, anything
 * custom (or unmapped) gets a tag. */
export function categoryIcon(name: string): IconName {
  return CATEGORY_ICON[name] ?? "tag";
}

/** A category's icon on a quiet tile. Monochrome on purpose: the accent is
 * reserved for state (`tone="wash"` marks an over/unplanned category), so
 * category identity is carried by the icon and the name, never by a hue. */
export function CategoryIcon({
  name,
  size,
  tone = "gray",
}: {
  name: string;
  color?: string;
  size?: number;
  tone?: TileTone;
}) {
  return <IconTile name={categoryIcon(name)} tone={tone} size={size} />;
}

/** A card-row chevron: the row opens something. */
export function Chevron({ className }: { className?: string }) {
  return <Icon name="chevron-right" className={`text-silver ${className ?? ""}`} />;
}

/** An illustration stage: a white card on a grid of 2px dots, centred. */
export function Stage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`px-card ${className ?? ""}`}>
      <div className="px-dots flex flex-col items-center justify-center gap-3 px-4 py-10">{children}</div>
    </div>
  );
}

/* ─── Empty states ─────────────────────────────────────────────────────── */

/** A composed empty state: what's missing, and one clear next action. */
export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  icon?: IconName;
  className?: string;
}) {
  return (
    <div className={`px-card flex flex-col items-start gap-2 p-4 ${className ?? ""}`}>
      {icon ? <IconTile name={icon} className="mb-2" /> : null}
      <p className="text-[15px] font-medium leading-6 text-ink">{title}</p>
      {body ? <p className="max-w-md text-sm leading-5 text-muted">{body}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
