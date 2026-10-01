import { useRef, useState } from "react";
import { Modal, Pressable, View, useWindowDimensions } from "react-native";
import Animated, { steps, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLOR, ROLE, type IconName } from "../../lib/brand/shared";
import { POP_IN, POP_MS } from "../../lib/motion/css";
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


/** A menu item's drawn height (8 + the 24px line + 8); `hitSlop` takes its touch target to 44. */
export const MENU_ITEM_H = 40;
const ITEM_SLOP = { top: 2, bottom: 2 } as const;
/** The menu before it has measured itself: its items, its 4px padding and the lifted frame's edge. */
export const estimateMenuHeight = (items: number) => items * MENU_ITEM_H + 2 * 4 + 4;

/**
 * Where the menu opens: under the kebab, its right edge on the kebab's, 4px down; kept inside the screen's 8px margin.
 * A kebab near the bottom (the menu would run past the screen or under the navigation bar) opens it above instead.
 */
export function menuPosition(
  anchor: { x: number; y: number; width: number; height: number },
  window: { width: number; height: number },
  menuHeight = 0,
  insetBottom = 0,
): { top: number; right: number; above: boolean } {
  const right = Math.max(8, window.width - (anchor.x + anchor.width));
  const below = anchor.y + anchor.height + 4;
  if (below + menuHeight <= window.height - insetBottom) return { top: below, right, above: false };
  return { top: Math.max(8, anchor.y - 4 - menuHeight), right, above: true };
}

/**
 * A row's overflow menu (web src/components/row-menu.tsx): the kebab opens a
 * small lifted list of actions (Edit, Archive…) under it. Closes on a pick,
 * on a press anywhere outside it, and on Android's back.
 */
export function RowMenu({ label, items, testID = "row-menu" }: { label: string; items: RowMenuItem[]; testID?: string }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [menuHeight, setMenuHeight] = useState(() => estimateMenuHeight(items.length));
  const kebab = useRef<View>(null);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const at = anchor ? menuPosition(anchor, window, menuHeight, insets.bottom) : null;
  const reduced = useReducedMotion();
  const timing = useMotionTiming(0);

  function open() {
    kebab.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
  }
  const close = () => setAnchor(null);

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
                { position: "absolute", top: at.top, right: at.right, transformOrigin: at.above ? "bottom right" : "top right" },
                reduced
                  ? null
                  : { animationName: POP_IN, animationDuration: `${POP_MS}ms`, animationTimingFunction: steps(3, "jump-end"), animationFillMode: "backwards", ...timing },
              ]}
            >
              <PixelFrame
                frame="px-card-raised"
                accessibilityRole="menu"
                accessibilityLabel={label}
                onStartShouldSetResponder={() => true}
                onLayout={(e) => {
                  const h = e.nativeEvent.layout.height;
                  setMenuHeight((prev) => (prev === h ? prev : h));
                }}
                style={{ minWidth: 176, padding: 4 }}
              >
                {items.map((it) => (
                  <Pressable
                    key={it.label}
                    accessibilityRole="menuitem"
                    accessibilityLabel={it.label}
                    accessibilityState={{ disabled: !!it.disabled }}
                    disabled={it.disabled}
                    hitSlop={ITEM_SLOP}
                    onPress={() => {
                      close();
                      it.onSelect();
                    }}
                    style={({ pressed }) => [
                      { height: MENU_ITEM_H, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, opacity: it.disabled ? 0.5 : 1 },
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
