import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import {
  ArrowRight,
  ArrowsLeftRight,
  Briefcase,
  Car,
  ForkKnife,
  GameController,
  Heart,
  House,
  ShieldCheck,
  Tag,
  TrendUp,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

/** Shared design-system primitives. Components consume the semantic tokens in
 * globals.css, never raw colors. Shape rule: cards 16px, controls 12px,
 * selected chips/tags use the stepped `pixel-corners` edge. */

type ButtonBaseProps = { arrow?: boolean; className?: string; children: ReactNode };

const primaryClass =
  "press inline-flex items-center justify-center gap-2 rounded-xl bg-primary-btn px-4 py-3 text-sm font-medium text-on-primary-btn hover:brightness-95 disabled:opacity-50";

export function PrimaryButton({
  arrow,
  className,
  children,
  ...rest
}: ButtonBaseProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`${primaryClass} ${className ?? ""}`} {...rest}>
      {children}
      {arrow ? <ArrowRight aria-hidden className="h-4 w-4" /> : null}
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
      {arrow ? <ArrowRight aria-hidden className="h-4 w-4" /> : null}
    </Link>
  );
}

const CELLS = 16;

/** Progress as a row of square cells (the Budgts data mark): filled cells in
 * ink, or in the accent once a budget is near/over. Cells step in one by one,
 * `start` steps after the page's first (so stacked rows cascade); an over
 * row flashes twice once it's full. `pct` only picks how many cells light
 * up; the number itself is shown as text beside it, never read off the bar. */
export function ProgressBar({
  pct,
  tone = "under",
  className,
  cells = CELLS,
  start = 0,
}: {
  pct: number;
  tone?: "under" | "near" | "over";
  className?: string;
  cells?: number;
  start?: number;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  const lit = tone === "over" ? cells : clamped > 0 ? Math.max(1, Math.round((clamped / 100) * cells)) : 0;
  const fill = tone === "under" ? "bg-fill-under" : "bg-fill-over";
  return (
    <div
      className={`grid gap-[3px] ${tone === "over" ? "cells-over" : ""} ${className ?? ""}`}
      style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))`, ["--alarm" as string]: start + cells }}
      aria-hidden
    >
      {Array.from({ length: cells }, (_, i) => (
        <span
          key={i}
          className={`cell aspect-square rounded-[1px] ${i < lit ? fill : "bg-track"}`}
          style={{ ["--d" as string]: start + i }}
        />
      ))}
    </div>
  );
}

/** Chip-row toggle ("This month" / "All time"). The selected chip is solid
 * ink with the stepped pixel edge; the rest are quiet outlines. */
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
    <div className="flex flex-wrap items-center gap-1.5 text-[13px]" role="group">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`press px-3.5 py-2 font-medium ${
              on
                ? "pixel-corners bg-ink text-on-primary"
                : "rounded-[10px] border border-hairline bg-surface text-muted hover:border-silver hover:text-text"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const CATEGORY_ICON: Record<string, Icon> = {
  Housing: House,
  Transportation: Car,
  "Food / Groceries": ForkKnife,
  Entertainment: GameController,
  "Personal Care": Heart,
  Insurances: ShieldCheck,
  Salary: Briefcase,
  "Other Income": TrendUp,
  Transfer: ArrowsLeftRight,
};

/** A category's line icon on a quiet square tile. Monochrome on purpose: the
 * accent is reserved for state, so category identity is carried by the icon
 * and the name, never by a hue. Unmapped/custom categories get a tag glyph. */
export function CategoryIcon({
  name,
  size = 36,
  tone = "tile",
}: {
  name: string;
  color?: string;
  size?: number;
  tone?: "tile" | "bare";
}) {
  const Glyph = CATEGORY_ICON[name] ?? Tag;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center text-ink ${
        tone === "tile" ? "rounded-xl bg-surface-2" : ""
      }`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Glyph style={{ width: size * 0.52, height: size * 0.52 }} />
    </span>
  );
}

/** A composed empty state: what's missing, and one clear next action. */
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
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-hairline px-6 py-10 text-center">
      <p className="text-sm font-medium text-text">{title}</p>
      {body ? <p className="max-w-xs text-sm text-muted">{body}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
