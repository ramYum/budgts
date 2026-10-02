import { useMemo } from "react";
import { PixelRatio } from "react-native";
import Svg, { Path } from "react-native-svg";
import { ICONS, ROLE, type IconName, type IconSize } from "../../lib/brand/shared";
import { snapPath } from "../../lib/brand/snap";
import { useRoleColor } from "./on-backdrop";

/**
 * A pixel icon from the web's icon table (src/lib/brand/icons.ts): the same
 * Pixelarticons, at the same 12 / 24 / 36 / 48 sizes, each cell edge on a
 * whole device pixel (the web's crispEdges; lib/brand/snap.ts). Decorative,
 * like the web's <Icon>: whatever holds it carries the accessible name. A
 * muted icon reads deeper straight on the sunset backdrop (./on-backdrop.ts).
 */
export function Icon({
  name,
  size = 24,
  color = ROLE.ink,
  testID,
}: {
  name: IconName;
  size?: IconSize;
  color?: string;
  testID?: string;
}) {
  const fill = useRoleColor(color);
  const ratio = PixelRatio.get();
  const paths = useMemo(() => ICONS[name].d.map((d) => snapPath(d, { unit: size / 24, ratio })), [name, size, ratio]);
  return (
    <Svg
      testID={testID}
      width={size}
      height={size}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {paths.map((d) => (
        <Path key={d} d={d} fill={fill} />
      ))}
    </Svg>
  );
}
