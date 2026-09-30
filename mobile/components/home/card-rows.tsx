import type { ReactNode } from "react";
import { View } from "react-native";
import { COLOR } from "../../lib/brand/shared";
import { PixelFrame } from "../brand/pixel-frame";
import { Rise } from "../motion/rise";

export type CardRow = { key: string; node: ReactNode };

/**
 * Rows in one card, divided by 1px rules (web `px-card px-rows p-2`, rows
 * `rise py-3 first:pt-0 last:pb-0` with `--at: k·60 + base`): the card's 8px
 * padding, each row padded `paddingY` above and below except at the card's
 * own edges, and each row, its rule with it, rising 60ms after the one above
 * (when `riseFrom` is given).
 */
export function CardRows({ rows, paddingY, riseFrom, testID }: { rows: CardRow[]; paddingY: number; riseFrom?: number; testID?: string }) {
  return (
    <PixelFrame testID={testID} frame="px-card" style={{ padding: 8 }}>
      {rows.map((row, i) => {
        const style = {
          paddingTop: i === 0 ? 0 : paddingY,
          paddingBottom: i === rows.length - 1 ? 0 : paddingY,
          ...(i > 0 ? { borderTopWidth: 1, borderTopColor: COLOR.divider } : null),
        };
        // rows without an entrance of their own (the set-up steps) just sit in the card
        return riseFrom === undefined ? (
          <View key={row.key} style={style}>
            {row.node}
          </View>
        ) : (
          <Rise key={row.key} at={i * 60 + riseFrom} style={style}>
            {row.node}
          </Rise>
        );
      })}
    </PixelFrame>
  );
}
