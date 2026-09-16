/** Three small glyphs illustrating the "every purchase, tracked" card —
 * phone tap, card, online order — matching the stroke conventions in
 * src/components/nav-icons.tsx. */
export type PurchaseGlyph = "tap" | "card" | "online";

const common = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PATHS: Record<PurchaseGlyph, React.ReactNode> = {
  tap: (
    <>
      <path {...common} d="M8 20.5V9a1.5 1.5 0 0 1 3 0v5.5" />
      <path {...common} d="M11 13V6a1.5 1.5 0 0 1 3 0v7.5" />
      <path {...common} d="M14 12.5V7a1.5 1.5 0 0 1 3 0v9" />
      <path {...common} d="M17 12v-2a1.5 1.5 0 0 1 3 0v6a5.5 5.5 0 0 1-5.5 5.5h-2A6.5 6.5 0 0 1 6 15v-1.2" />
      <path {...common} d="M17.5 3.5c1.6 1.1 2.6 2.9 2.6 5" />
      <path {...common} d="M20 2c2.2 1.4 3.6 3.9 3.6 6.7" />
    </>
  ),
  card: (
    <>
      <path {...common} d="M3.5 7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17Z" />
      <path {...common} d="M3.5 10.5h17" />
      <path {...common} d="M6.5 14.5h4" />
    </>
  ),
  online: (
    <>
      <path {...common} d="M4 7.5h16l-1.4 10.2a1.5 1.5 0 0 1-1.5 1.3H6.9a1.5 1.5 0 0 1-1.5-1.3Z" />
      <path {...common} d="M8.5 7.5V6a3.5 3.5 0 0 1 7 0v1.5" />
    </>
  ),
};

const LABELS: Record<PurchaseGlyph, string> = {
  tap: "Phone tap",
  card: "Card",
  online: "Online order",
};

export function PurchaseIcon({ glyph, className = "h-6 w-6" }: { glyph: PurchaseGlyph; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      {PATHS[glyph]}
    </svg>
  );
}

/** The full row used on the "every purchase, tracked" card. */
export function PurchaseIconRow({ className }: { className?: string }) {
  const glyphs: PurchaseGlyph[] = ["tap", "card", "online"];
  return (
    <div className={`flex items-center justify-center gap-6 ${className ?? ""}`}>
      {glyphs.map((glyph) => (
        <div key={glyph} className="flex flex-col items-center gap-1.5 text-accent">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2">
            <PurchaseIcon glyph={glyph} />
          </span>
          <span className="text-xs font-medium text-muted">{LABELS[glyph]}</span>
        </div>
      ))}
    </div>
  );
}
