import type { ReactNode } from "react";
import { View } from "react-native";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { formatMoney, RING, RING_DOT, RING_NEUTRALS, RING_PITCH, RING_SIZE, ringSlices } from "../../lib/shared";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { Rise } from "../motion/rise";
import { RollingAmount } from "../motion/rolling-amount";
import { Cell } from "./cell";

/** The ring's colours: the largest slice in the accent, the rest down a neutral ramp by size. */
export const RING_RAMP = [COLOR.signal, ...RING_NEUTRALS];

/**
 * "Where your money goes" (web `SpendingBreakdownCard`, phone layout): a part-to-whole ring of cells over its legend.
 * The slices, their amounts and whole-percent shares come from the server (`breakdown`, largest first, the rest folded
 * into "Other"); the ring only draws them, building clockwise from 12, and the legend names every slice with its amount
 * and share, so no number is readable only from a colour. Nothing to show when nothing was spent.
 */
export function SpendingBreakdownCard({
  breakdown,
  totalSpent,
  currency,
  header,
  testID = "spending-breakdown-card",
}: {
  breakdown: readonly { name: string; amount: number; share: number }[];
  totalSpent: number;
  currency: string;
  /** what heads the card, inside its frame (Insights: tag, figure, toggle) */
  header?: ReactNode;
  testID?: string;
}) {
  if (breakdown.length === 0 || totalSpent <= 0) return null;
  const slices = breakdown.map((s, i) => ({ ...s, color: RING_RAMP[i]! }));
  const sliceOf = ringSlices(
    slices.map((s) => s.amount),
    totalSpent,
  );

  return (
    <PixelFrame testID={testID} frame="px-card" style={{ padding: 8 }}>
      {header}
      <View style={{ gap: 24 }}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Spending breakdown: ${slices.map((s) => `${s.name} ${formatMoney(s.amount, currency)}`).join(", ")}`}
          style={{ width: RING_SIZE, height: RING_SIZE, alignSelf: "center" }}
        >
          {RING.map((cell, i) => (
            <Cell
              key={i}
              d={Math.floor(i / 4)}
              color={slices[sliceOf[i]!]!.color}
              style={{ position: "absolute", left: cell.x * RING_PITCH, top: cell.y * RING_PITCH, width: RING_DOT, height: RING_DOT }}
            />
          ))}
          <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", gap: 4 }}>
            <Text variant="tLabel" color={ROLE.muted}>
              Total
            </Text>
            <RollingAmount value={totalSpent} currency={currency} variant="bodyStrong" lineHeight={20} testID={`${testID}-total`} />
          </View>
        </View>
        <View style={{ gap: 12 }}>
          {slices.map((s, k) => (
            <Rise key={s.name} at={k * 70 + 300} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 12, height: 12, backgroundColor: s.color }} />
              <Text variant="body" color={ROLE.ink} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                {s.name}
              </Text>
              <Text variant="body" color={ROLE.ink} style={{ fontVariant: ["tabular-nums"] }}>
                {formatMoney(s.amount, currency)}
              </Text>
              <Text variant="tLabel" color={ROLE.muted} style={{ width: 36, textAlign: "right", fontVariant: ["tabular-nums"] }}>
                {`${s.share}%`}
              </Text>
            </Rise>
          ))}
        </View>
      </View>
    </PixelFrame>
  );
}
