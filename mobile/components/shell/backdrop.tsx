import { createContext, memo, useContext, useMemo, type ReactNode } from "react";
import { PixelRatio, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BACKDROP_CELL, BACKDROP_SKY, backdropPaths, backdropSize, type BackdropSize } from "../../lib/brand/backdrop";

/** The grid, and where its top edge sits from the window's top: the scene ends at the window's bottom edge. */
type Placed = { size: BackdropSize; top: number };
const Placement = createContext<Placed | null>(null);

/**
 * The backdrop's grid for the signed-in shell: the window below the status bar (the web's viewport, which never
 * holds system UI, so band 0 holds the whole header and the first band step lands below it), the meadow
 * BACKDROP_LAND_GAP above the tab bar, whose real height (safe area included) `barHeight` is. It changes only when the window (rotation, split screen) or
 * the bar (font size) does, so nothing below redraws on a scroll or a tab switch.
 */
export function BackdropProvider({ barHeight, children }: { barHeight: number; children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const statusBar = useSafeAreaInsets().top;
  const placed = useMemo(() => {
    const size = backdropSize(width, height - statusBar, barHeight);
    return { size, top: height - size.rows * BACKDROP_CELL };
  }, [width, height, statusBar, barHeight]);
  return <Placement.Provider value={placed}>{children}</Placement.Provider>;
}

/**
 * Crystal's sunset forest (option B, "Full backdrop", owner-approved 2026-10-02; web src/components/backdrop.tsx):
 * behind every screen of the tab shell, never scrolling. The scene ends at the window's bottom edge, so the forest and
 * the lake sit just above the tab bar and an odd-sized window loses at most a cell of sky; it is placed from the
 * window's top, so a copy in a box that stops at the bar (a pushed screen's, components/shell/tab-stack.tsx) lands on
 * exactly the same pixels. The box under it is the top band, so the status-bar area above the scene (edge to edge) continues band 0 into the
 * header.
 * Drawn once per size (lib/brand/backdrop.ts).
 */
export const Backdrop = memo(function Backdrop() {
  const placed = useContext(Placement);
  if (!placed) throw new Error("<Backdrop> is drawn inside <BackdropProvider>");
  const { size, top } = placed;
  const ratio = PixelRatio.get();
  const paths = useMemo(() => backdropPaths(size, ratio), [size, ratio]);
  return (
    <View
      testID="backdrop"
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden", backgroundColor: BACKDROP_SKY[0] }}
    >
      <Svg width={size.cols * BACKDROP_CELL} height={size.rows * BACKDROP_CELL} style={{ position: "absolute", left: 0, top }}>
        {paths.map(([fill, d]) => (
          <Path key={fill} d={d} fill={fill} />
        ))}
      </Svg>
    </View>
  );
});
