import { useMemo, useState, type ReactNode } from "react";
import { PixelRatio, View, type LayoutChangeEvent, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { frameBorder, framePaths, frameSpec, type FrameName } from "../../lib/brand/frame-geometry";
import { RAISE } from "../../lib/brand/shared";
import { SHADOWS } from "../../lib/brand/type";
import { OnBackdrop } from "./on-backdrop";

/** The lead card and a card carry the web's shadows (`.px-card-raised`, `.px-card` in globals.css). */
const SHADOW_OF: Partial<Record<FrameName, keyof typeof SHADOWS>> = {
  "px-card": "card",
  "px-card-raised": "raised",
};

export type PixelFrameProps = Omit<ViewProps, "style" | "children"> & {
  /** a frame from the shared table (src/lib/brand/pixel-frame.ts FRAMES), e.g. "px-card" */
  frame: FrameName;
  /** the web state it draws, by selector suffix: "" at rest, ":focus-visible", "[data-invalid='true']"… */
  state?: string;
  /** the primary button's raised edge (`.px-raise`): the frame's own shape, 2px below it in the edge colour */
  raise?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * A stepped pixel frame: the web's `px-*` classes, drawn with react-native-svg
 * at the view's measured size from the same frame table, the way the web's
 * border-image stretches them. Like the web, the frame is a transparent border
 * of k cells, so padding inside it means the same on both. Every cell edge
 * lands on a whole device pixel, as the web's crispEdges does (snap.ts).
 * Every frame paints its own fill, so what it holds is off the sunset
 * backdrop: the muted role is the gray again (./on-backdrop.ts).
 */
export function PixelFrame({ frame, state = "", raise = false, style, children, onLayout, ...rest }: PixelFrameProps) {
  const spec = frameSpec(frame, state);
  const border = frameBorder(spec);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const ratio = PixelRatio.get();
  const paths = useMemo(() => (size ? framePaths(spec, size.width, size.height, ratio) : null), [spec, size, ratio]);
  const shadow = SHADOW_OF[frame];

  function measure(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    onLayout?.(event);
  }

  return (
    <View
      {...rest}
      onLayout={measure}
      style={[{ borderWidth: border, borderColor: "transparent" }, shadow ? { boxShadow: SHADOWS[shadow] } : null, style]}
    >
      {paths && size ? (
        // Pinned to the border box by insets, so it shares the view's rounded device-pixel edges.
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: -border, top: -border, right: -border, bottom: -border - (raise ? RAISE.y : 0) }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Svg width="100%" height="100%">
            {raise ? (
              <Path d={[paths.fill, paths.line].filter(Boolean).join("")} fill={RAISE.color} transform={`translate(0 ${RAISE.y})`} />
            ) : null}
            {paths.fill ? <Path d={paths.fill} fill={spec.fill} /> : null}
            {paths.line ? <Path d={paths.line} fill={spec.line} /> : null}
          </Svg>
        </View>
      ) : null}
      <OnBackdrop.Provider value={false}>{children}</OnBackdrop.Provider>
    </View>
  );
}
