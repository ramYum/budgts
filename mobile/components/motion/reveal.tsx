import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { EASE_OUT, REVEAL_SHOWN_MS, RISE_IN, revealDelayMs } from "../../lib/motion/css";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { MOTION } from "../../lib/brand/shared";
import { useScrollWatch } from "./scroll-context";

/**
 * Whether the entrances inside a block may play now. False while a block
 * waits below the fold (the web's `.reveal[data-reveal="armed"] *` turns every
 * descendant animation off); its cells and reels start once it scrolls in.
 */
const PlayContext = createContext(true);
export const usePlay = () => useContext(PlayContext);

export type RevealPhase = "rest" | "armed" | "shown";

/** A block whose top is at or past the viewport's bottom starts armed. */
export function startsBelowFold(top: number, viewport: { height: number; y: number }): boolean {
  return top >= viewport.y + viewport.height;
}

/** It plays once it is a little way up the screen (the web's rootMargin "0px 0px -10% 0px"). */
export function scrolledIntoView(top: number, viewport: { height: number; y: number }): boolean {
  return top < viewport.y + viewport.height * 0.9;
}

/**
 * One block of a screen's entrance cascade (web src/components/reveal.tsx,
 * globals.css `.reveal`), ordered by `i`: a block on screen rises in with the
 * page, 70ms after the one before; a block that starts below the fold waits,
 * hidden, and plays as it scrolls into view. Motion off: it simply shows.
 */
export function Reveal({ i, children, style, testID }: { i: number; children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const reduced = useReducedMotion();
  const watch = useScrollWatch();
  const parentPlays = usePlay();
  const ref = useRef<View>(null);
  const top = useRef<number | null>(null);
  const [phase, setPhaseState] = useState<RevealPhase>("rest");
  const phaseRef = useRef<RevealPhase>("rest");
  const setPhase = (next: RevealPhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };
  const decided = useRef(false);
  const checkRef = useRef<() => void>(() => {});
  const restTiming = useMotionTiming(revealDelayMs(i));
  const shownTiming = useMotionTiming(0);

  useEffect(() => {
    // listens only while there is something left to decide: until the first measure says "rest", or until an armed block shows
    if (reduced || !watch || (decided.current && phaseRef.current !== "armed")) return;
    let unsubscribe: (() => void) | null = null;
    const stop = () => {
      unsubscribe?.();
      unsubscribe = null;
    };
    const check = () => {
      if (top.current === null) return;
      const vp = watch.viewport();
      if (vp.height <= 0) return;
      if (!decided.current) {
        decided.current = true;
        if (startsBelowFold(top.current, vp)) setPhase("armed");
        else stop();
        return;
      }
      if (phaseRef.current === "armed" && scrolledIntoView(top.current, vp)) {
        setPhase("shown");
        stop();
      }
    };
    checkRef.current = check;
    unsubscribe = watch.subscribe(check);
    return stop;
  }, [reduced, watch]);

  function onLayout() {
    if (reduced || !watch || top.current !== null) return;
    const content = watch.contentRef.current;
    if (!ref.current || !content) return;
    ref.current.measureLayout(content, (_x, y) => {
      top.current = y;
      checkRef.current();
    });
  }

  if (reduced) {
    return (
      <View testID={testID} style={style}>
        {children}
      </View>
    );
  }

  const animation =
    phase === "armed"
      ? { opacity: 0 }
      : {
          animationName: RISE_IN,
          animationDuration: `${phase === "shown" ? REVEAL_SHOWN_MS : MOTION.riseInMs}ms`,
          ...(phase === "shown" ? shownTiming : restTiming),
          animationTimingFunction: EASE_OUT,
          animationFillMode: "backwards" as const,
        };

  return (
    <Animated.View testID={testID} style={animation}>
      {/* a plain host view measures the block (the transform above never moves its layout) */}
      <View ref={ref} onLayout={onLayout} collapsable={false} style={style}>
        <PlayContext.Provider value={parentPlays && phase !== "armed"}>{children}</PlayContext.Provider>
      </View>
    </Animated.View>
  );
}
