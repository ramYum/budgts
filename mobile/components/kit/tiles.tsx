import { View } from "react-native";
import { COLOR, ROLE, categoryIcon, type IconName } from "../../lib/brand/shared";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";

import { IconTile } from "../brand/controls";

export { IconTile };

/** A category's icon on a quiet tile (web `CategoryIcon`): monochrome; `wash` marks an over or unplanned category. */
export function CategoryIcon({ name, size, tone = "gray" }: { name: string; size?: number; tone?: "gray" | "wash" }) {
  return <IconTile name={categoryIcon(name)} tone={tone} size={size} />;
}

/** A card-row chevron: the row opens something (web `Chevron`, silver). */
export function Chevron({ marginRight = 0 }: { marginRight?: number }) {
  return (
    <View style={{ marginRight }}>
      <Icon name="chevron-right" color={COLOR.silver} />
    </View>
  );
}

type BadgeTone = "gray" | "growth" | "wash" | "ink";
const BADGE: Record<BadgeTone, { frame: string; color: string }> = {
  gray: { frame: "px-badge", color: COLOR.graphite },
  growth: { frame: "px-badge-growth", color: ROLE.pos },
  wash: { frame: "px-badge-wash", color: COLOR.signalInk },
  ink: { frame: "px-badge-ink", color: COLOR.white },
};

/** A small status chip (web `Badge`): 24px tall, 12px semibold, an optional 12px icon. */
export function Badge({ tone = "gray", icon, children, testID }: { tone?: BadgeTone; icon?: IconName; children: string; testID?: string }) {
  const { frame, color } = BADGE[tone];
  return (
    <PixelFrame
      testID={testID}
      frame={frame}
      style={{ height: 24, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}
    >
      {icon ? <Icon name={icon} size={12} color={color} /> : null}
      <Text variant="tLabelStrong" color={color} numberOfLines={1} style={{ lineHeight: 12 }}>
        {children}
      </Text>
    </PixelFrame>
  );
}
