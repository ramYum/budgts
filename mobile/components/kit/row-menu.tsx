import { useRef, useState } from "react";
import { Modal, Pressable, View, useWindowDimensions } from "react-native";
import Animated, { steps, useReducedMotion } from "react-native-reanimated";
import { COLOR, ROLE, type IconName } from "../../lib/brand/shared";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { pressStyle } from "./press";

export type RowMenuItem = {
  label: string;
  icon: IconName;
  onSelect: () => void;
  /** a destructive action (archive) reads in the accent */
  danger?: boolean;
  disabled?: boolean;
};

/** `@keyframes pop-in` on steps(3, end), 300ms: the menu snaps in like a sprite. */
export const POP_IN = { from: { opacity: 0, transform: [{ scale: 0.4 }] }, to: { opacity: 1, transform: [{ scale: 1 }] } };

/** Where the menu opens: under the kebab, its right edge on the kebab's, 4px down; kept inside the screen's 8px margin. */
export function menuPosition(anchor: { x: number; y: number; width: number; height: number }, window: { width: number }) {
  const right = Math.max(8, window.width - (anchor.x + anchor.width));
  return { top: anchor.y + anchor.height + 4, right };
}

/**
 * A row's overflow menu (web src/components/row-menu.tsx): the kebab opens a
 * small lifted list of actions (Edit, Archive…) under it. Closes on a pick,
 * on a press anywhere outside it, and on Android's back.
 */
export function RowMenu({ label, items, testID = "row-menu" }: { label: string; items: RowMenuItem[]; testID?: string }) {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const kebab = useRef<View>(null);
  const window = useWindowDimensions();
  const reduced = useReducedMotion();
  const timing = useMotionTiming(0);

  function open() {
    kebab.current?.measureInWindow((x, y, width, height) => setAt(menuPosition({ x, y, width, height }, window)));
  }
  const close = () => setAt(null);

  return (
    <>
      <Pressable
        ref={kebab}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: at !== null }}
        onPress={open}
        hitSlop={2}
        style={({ pressed }) => [{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }, pressStyle(pressed)]}
      >
        {({ pressed }) => <Icon name="menu" color={pressed ? COLOR.graphite : ROLE.ink} />}
      </Pressable>
      {at ? (
        <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
          <Pressable accessibilityLabel="Close menu" style={{ flex: 1 }} onPress={close}>
            <Animated.View
              style={[
                { position: "absolute", top: at.top, right: at.right, transformOrigin: "top right" },
                reduced
                  ? null
                  : { animationName: POP_IN, animationDuration: "300ms", animationTimingFunction: steps(3, "jump-end"), animationFillMode: "backwards", ...timing },
              ]}
            >
              <PixelFrame frame="px-card-raised" accessibilityRole="menu" accessibilityLabel={label} onStartShouldSetResponder={() => true} style={{ minWidth: 176, padding: 4 }}>
                {items.map((it) => (
                  <Pressable
                    key={it.label}
                    accessibilityRole="menuitem"
                    accessibilityLabel={it.label}
                    accessibilityState={{ disabled: !!it.disabled }}
                    disabled={it.disabled}
                    onPress={() => {
                      close();
                      it.onSelect();
                    }}
                    style={({ pressed }) => [
                      { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, paddingVertical: 8, opacity: it.disabled ? 0.5 : 1 },
                      pressed ? { backgroundColor: ROLE.surface2 } : null,
                      pressStyle(pressed),
                    ]}
                  >
                    <Icon name={it.icon} color={it.danger ? COLOR.signalInk : ROLE.ink} />
                    <Text variant="body" color={it.danger ? COLOR.signalInk : ROLE.ink}>
                      {it.label}
                    </Text>
                  </Pressable>
                ))}
              </PixelFrame>
            </Animated.View>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}
