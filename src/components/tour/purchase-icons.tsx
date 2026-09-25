import { CreditCard, DeviceMobile, ShoppingBag } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

/** The "every purchase, tracked" row: phone tap, card, online order, drawn
 * with the app's one icon family on the same quiet tiles as category icons. */
type PurchaseGlyph = "tap" | "card" | "online";

const ICONS: Record<PurchaseGlyph, Icon> = {
  tap: DeviceMobile,
  card: CreditCard,
  online: ShoppingBag,
};

const LABELS: Record<PurchaseGlyph, string> = {
  tap: "Phone tap",
  card: "Card",
  online: "Online order",
};

export function PurchaseIconRow({ className }: { className?: string }) {
  const glyphs: PurchaseGlyph[] = ["tap", "card", "online"];
  return (
    <div className={`flex items-center justify-center gap-6 ${className ?? ""}`}>
      {glyphs.map((glyph) => {
        const Glyph = ICONS[glyph];
        return (
          <div key={glyph} className="flex flex-col items-center gap-2">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2 text-ink">
              <Glyph aria-hidden className="h-6 w-6" />
            </span>
            <span className="text-xs font-medium text-muted">{LABELS[glyph]}</span>
          </div>
        );
      })}
    </div>
  );
}
