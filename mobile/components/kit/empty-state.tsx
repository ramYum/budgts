import { useMemo, useState, type ReactNode } from "react";
import { PixelRatio, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { ROLE, type IconName } from "../../lib/brand/shared";
import { snap } from "../../lib/brand/snap";
import { IconTile } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";

/** The web's `.px-dots`: a 2px dot every 16px, at (7, 7) in each tile, #dcdcdc. */
export const DOT = { pitch: 16, at: 7, size: 2, color: "#dcdcdc" } as const;

/** One path for every dot that fits `width × height`, each edge on a whole device pixel. */
export function dotsPath(width: number, height: number, ratio: number): string {
  let d = "";
  for (let y = DOT.at; y + DOT.size <= height; y += DOT.pitch) {
    for (let x = DOT.at; x + DOT.size <= width; x += DOT.pitch) {
      const x0 = snap(x, ratio);
      const y0 = snap(y, ratio);
      const x1 = snap(x + DOT.size, ratio);
      const y1 = snap(y + DOT.size, ratio);
      d += `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
    }
  }
  return d;
}

/** An illustration stage (web `Stage`): a white card on a grid of 2px dots, its content centred. */
export function Stage({ children }: { children: ReactNode }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const ratio = PixelRatio.get();
  const d = useMemo(() => (size ? dotsPath(size.width, size.height, ratio) : ""), [size, ratio]);
  function measure(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }
  return (
    <PixelFrame testID="stage" frame="px-card">
      <View onLayout={measure} style={{ alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 40 }}>
        {d ? (
          <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
            <Svg width="100%" height="100%">
              <Path d={d} fill={DOT.color} />
            </Svg>
          </View>
        ) : null}
        {children}
      </View>
    </PixelFrame>
  );
}

/** A composed empty state (web `EmptyState`): what's missing, and one clear next action. */
export function EmptyState({
  title,
  body,
  action,
  icon,
  testID = "empty-state",
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: IconName;
  testID?: string;
}) {
  return (
    <PixelFrame testID={testID} frame="px-card" style={{ alignItems: "flex-start", gap: 8, padding: 16 }}>
      {icon ? (
        <View style={{ marginBottom: 8 }}>
          <IconTile name={icon} />
        </View>
      ) : null}
      <Text testID="empty-state-title" variant="listName" color={ROLE.ink}>
        {title}
      </Text>
      {body ? (
        <Text variant="body" color={ROLE.muted} style={{ fontSize: 14, lineHeight: 20, maxWidth: 448 }}>
          {body}
        </Text>
      ) : null}
      {action ? <View style={{ paddingTop: 8 }}>{action}</View> : null}
    </PixelFrame>
  );
}
