import { View } from "react-native";
import { ROBIN_H, ROLE } from "../../lib/brand/shared";
import { Robin } from "./robin";
import { Text } from "./text";

/** Dogica is drawn on an 8px grid: the wordmark snaps to the nearest multiple of the mark's size (web `Logo`). */
export function wordmarkSize(markSize: number): number {
  return Math.max(8, Math.round((markSize * 0.62) / 8) * 8);
}

/**
 * The Budgts lockup (web src/components/logo.tsx): the pixel robin and the
 * wordmark set in Dogica Bold, 8px apart. `size` is the robin's height and
 * must be a whole number of art rows (22, 44, 66…), so every cell stays whole.
 */
export function Logo({ size = 22, testID }: { size?: number; testID?: string }) {
  const type = wordmarkSize(size);
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel="Budgts" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Robin scale={size / ROBIN_H} />
      <Text variant="pxTitle" color={ROLE.ink} style={{ fontSize: type, lineHeight: type }}>
        Budgts
      </Text>
    </View>
  );
}
