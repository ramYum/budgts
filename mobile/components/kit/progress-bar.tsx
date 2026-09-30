import { useMemo, useState } from "react";
import { PixelRatio, View, type LayoutChangeEvent } from "react-native";
import Animated, { steps, useReducedMotion } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { MOTION, ROLE } from "../../lib/brand/shared";
import { alarmDelayMs, CELL_ALARM, CELL_ALARM_MS, sweepDelayMs } from "../../lib/motion/css";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { cellLayout, cellsPath } from "../../lib/ui/cells";
import { usePlay } from "../motion/reveal";

export type ProgressTone = "under" | "near" | "over" | "growth";

/** The fill per tone (web `ProgressBar`): ink under budget, red near and over, green for growth. */
export const TONE_FILL: Record<ProgressTone, string> = {
  under: ROLE.fillUnder,
  near: ROLE.fillOver,
  over: ROLE.fillOver,
  growth: ROLE.pos,
};

const GAP = 2;

/**
 * Progress as a row of square cells, the Budgts data mark (web src/components/ui.tsx
 * `ProgressBar`, globals.css `.px-cells`/`.px-bar`): as many cells as fit the
 * bar, round(share × count) lit, at least one once anything counts. The cells
 * step in left to right over 352ms whatever the bar's length, `start` steps
 * after the page's first so stacked rows cascade; an over row, once full,
 * flashes twice. `cells` fixes the count instead and sizes the bar to fit.
 * `pct` only picks how many light; the figure is always printed beside it.
 */
export function ProgressBar({
  pct,
  tone = "under",
  cells,
  start = 0,
  cellHeight = 8,
  testID,
}: {
  pct: number;
  tone?: ProgressTone;
  cells?: number;
  start?: number;
  cellHeight?: number;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const play = usePlay();
  const ratio = PixelRatio.get();
  const fixedWidth = cells ? cells * cellHeight + (cells - 1) * GAP : undefined;
  const [measured, setMeasured] = useState<number | null>(null);
  const width = fixedWidth ?? measured;

  const over = tone === "over";
  const clamped = Math.min(100, Math.max(0, pct));
  const layout = useMemo(
    () => (width ? cellLayout(width, { share: over ? 1 : clamped / 100, minLit: over || clamped > 0 ? 1 : 0, cellH: cellHeight, gap: GAP }) : null),
    [width, over, clamped, cellHeight],
  );
  const track = useMemo(() => (layout ? cellsPath(layout, layout.n, cellHeight, ratio) : ""), [layout, cellHeight, ratio]);
  const lit = useMemo(() => (layout ? cellsPath(layout, layout.lit, cellHeight, ratio) : ""), [layout, cellHeight, ratio]);

  function measure(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width;
    setMeasured((prev) => (prev === w ? prev : w));
  }

  const animate = play && !reduced && layout !== null;
  const alarmTiming = useMotionTiming(alarmDelayMs(start));
  const sweepTiming = useMotionTiming(sweepDelayMs(start));

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={fixedWidth ? undefined : measure}
      style={[
        { height: cellHeight, width: fixedWidth ?? "100%", overflow: "hidden" },
        animate && over
          ? {
              animationName: CELL_ALARM,
              animationDuration: `${CELL_ALARM_MS}ms`,
              ...alarmTiming,
              animationTimingFunction: steps(1, "jump-end"),
            }
          : null,
      ]}
    >
      {layout ? (
        <Animated.View
          testID={testID ? `${testID}-sweep` : undefined}
          style={[
            { height: cellHeight, width: layout.sweepWidth, overflow: "hidden" },
            animate
              ? {
                  animationName: { from: { width: 0 }, to: { width: layout.sweepWidth } },
                  animationDuration: `${MOTION.cellsSweepMs}ms`,
                  ...sweepTiming,
                  animationTimingFunction: steps(layout.n, "jump-start"),
                  animationFillMode: "backwards",
                }
              : null,
          ]}
        >
          <Svg width={width!} height={cellHeight}>
            <Path d={track} fill={ROLE.track} />
            {lit ? <Path d={lit} fill={TONE_FILL[tone]} /> : null}
          </Svg>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
