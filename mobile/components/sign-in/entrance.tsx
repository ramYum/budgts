import type { ReactNode } from "react";
import Animated from "react-native-reanimated";
import { MOTION } from "../../lib/brand/shared";
import { EASE_OUT, PAGE_ENTER } from "../../lib/motion/css";
import { useKeyframes } from "../motion/keyframes";
import { Reveal } from "../motion/reveal";

/**
 * The sign-in screen's arrival (web src/app/(auth)/layout.tsx): the brand stage comes in with the page (`page-enter`,
 * 420ms, rising 6px) and 32px above the card; then the card rises in (`.reveal`, `--i: 2`) and the legal line under it
 * (`--i: 3`), each i × 70 + 40ms in, over 560ms. Under Reduce Motion everything simply shows, the final frame.
 */
export function SignInEntrance({ stage, children, legal }: { stage: ReactNode; children: ReactNode; legal?: ReactNode }) {
  const enter = useKeyframes(PAGE_ENTER, { duration: MOTION.pageEnterMs, easing: EASE_OUT });
  return (
    <>
      <Animated.View style={[{ marginBottom: 32 }, enter]}>{stage}</Animated.View>
      <Reveal i={2}>{children}</Reveal>
      {legal ? <Reveal i={3}>{legal}</Reveal> : null}
    </>
  );
}
