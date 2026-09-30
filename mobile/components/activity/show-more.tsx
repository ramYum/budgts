import { useEffect, useRef } from "react";
import { View } from "react-native";
import { useScrollWatch } from "../motion/scroll-context";
import { Button } from "../brand/controls";

/** How far below the screen the button starts adding rows (the web's rootMargin "0px 0px 600px 0px"). */
export const AHEAD = 600;

/** Whether a block whose top is at `top` is within `AHEAD` of the viewport's bottom. */
export function withinReach(top: number, viewport: { height: number; y: number }): boolean {
  return viewport.height > 0 && top <= viewport.y + viewport.height + AHEAD;
}

/**
 * The end of the rendered rows (web `MoreRows`): it adds the next slice when it scrolls within reach, well before it is on
 * screen, or when tapped. It measures itself again after every slice, so a screen tall enough to still show it keeps
 * filling without a scroll. Event-driven: it listens to the screen's scroll, nothing polls.
 */
export function ShowMore({ remaining, slice, onMore }: { remaining: number; slice: number; onMore: () => void }) {
  const watch = useScrollWatch();
  const ref = useRef<View>(null);
  const top = useRef<number | null>(null);
  const onMoreRef = useRef(onMore);
  useEffect(() => {
    onMoreRef.current = onMore;
  });
  const fired = useRef(false);

  useEffect(() => {
    // a new slice (fewer remaining) is a new button position: allow one more reach
    fired.current = false;
    top.current = null;
  }, [remaining]);

  useEffect(() => {
    if (!watch) return;
    return watch.subscribe(() => {
      if (top.current === null || fired.current) return;
      if (withinReach(top.current, watch.viewport())) {
        fired.current = true;
        onMoreRef.current();
      }
    });
  }, [watch]);

  function onLayout() {
    const content = watch?.contentRef.current;
    if (!watch || !ref.current || !content) return;
    ref.current.measureLayout(content, (_x, y) => {
      top.current = y;
      if (!fired.current && withinReach(y, watch.viewport())) {
        fired.current = true;
        onMoreRef.current();
      }
    });
  }

  return (
    <View ref={ref} onLayout={onLayout} collapsable={false}>
      <Button testID="show-more-rows" variant="secondary" onPress={onMore}>
        {`Show ${Math.min(remaining, slice)} more`}
      </Button>
    </View>
  );
}
