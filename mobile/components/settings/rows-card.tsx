import { Children, type ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { COLOR } from "../../lib/brand/shared";
import { PixelFrame } from "../brand/pixel-frame";

/**
 * A card of rows divided by 1px rules (web `px-card px-rows p-2`), each row
 * `pad` above and below except the first's top and the last's bottom (the
 * web's `py-* first:pt-0 last:pb-0`).
 */
export function RowsCard({ pad, children, testID }: { pad: number; children: ReactNode; testID?: string }) {
  const rows = Children.toArray(children);
  return (
    <PixelFrame testID={testID} frame="px-card" style={{ padding: 8 }}>
      {rows.map((row, i) => {
        const style: ViewStyle = { paddingTop: i === 0 ? 0 : pad, paddingBottom: i === rows.length - 1 ? 0 : pad };
        if (i > 0) Object.assign(style, { borderTopWidth: 1, borderTopColor: COLOR.divider });
        return (
          <View key={i} style={style}>
            {row}
          </View>
        );
      })}
    </PixelFrame>
  );
}
