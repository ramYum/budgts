import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
  type TextInput as TextInputType,
} from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ROLE } from "../../lib/brand/shared";
import { EASE_OUT } from "../../lib/motion/css";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { scrollTargetAboveKeyboard } from "../../lib/keyboard";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { pressStyle } from "./press";

/** The web's scrim: ink at 40%. */
export const SCRIM = "rgba(17, 17, 17, 0.4)";
/** The web's `transition … duration-300`. */
export const SHEET_MS = 300;

/** The sheet's `translate-y-8 opacity-0` → `translate-y-0 opacity-100`. */
export const SHEET_IN = { from: { opacity: 0, transform: [{ translateY: 32 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } };
const SCRIM_IN = { from: { opacity: 0 }, to: { opacity: 1 } };

/**
 * A field in a sheet asks the sheet to keep it in view when it takes focus
 * (brand `Field` and kit `Select` call it). The browser does this by itself on
 * the web; natively the sheet scrolls the field above the keyboard.
 */
type Reveal = (input: TextInputType | View | null) => void;
const SheetFocus = createContext<Reveal | null>(null);
export const useSheetFocus = () => useContext(SheetFocus);

/**
 * The bottom sheet (web src/components/overlay.tsx, phone): the ink scrim,
 * then the lifted card rising from the bottom edge, its pixel title and a
 * square close button, at most 90% of the screen and scrolling inside.
 * Closes on the scrim, the close button, or Android's back. Keyboard-safe
 * on both platforms: the sheet pads above the keyboard (Android's
 * edge-to-edge window no longer resizes for it) and scrolls the focused
 * field into view, `KEYBOARD_MARGIN` above the keyboard.
 */
export function Overlay({ title, onClose, children, testID = "overlay" }: { title: string; onClose: () => void; children: ReactNode; testID?: string }) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const timing = useMotionTiming(0);
  const scroll = useRef<ScrollView>(null);
  const content = useRef<View>(null);
  const viewport = useRef(0);

  const reveal = useCallback<Reveal>((input) => {
    const box = content.current;
    if (!input || !box || !scroll.current) return;
    (input as View).measureLayout(box, (_x, y, _w, h) => {
      const target = scrollTargetAboveKeyboard(y + h, viewport.current);
      if (target > 0) scroll.current?.scrollTo({ y: target, animated: !reduced });
    });
  }, [reduced]);

  // When the keyboard opens, the field that opened it scrolls into what is left of the sheet.
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => reveal(TextInput.State.currentlyFocusedInput() as TextInputType | null));
    return () => sub.remove();
  }, [reveal]);

  const motion = reduced
    ? null
    : ({ animationDuration: `${SHEET_MS}ms`, animationTimingFunction: EASE_OUT, animationFillMode: "backwards", ...timing } as const);
  const scrimIn = motion ? { ...motion, animationName: SCRIM_IN } : null;
  const sheetIn = motion ? { ...motion, animationName: SHEET_IN } : null;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Animated.View style={[{ flex: 1, justifyContent: "flex-end", backgroundColor: SCRIM }, scrimIn]}>
          <Pressable testID={`${testID}-scrim`} accessibilityLabel="Close" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} />
          <Animated.View style={sheetIn}>
            <PixelFrame
              testID={testID}
              frame="px-card-raised"
              accessibilityViewIsModal
              accessibilityLabel={title}
              style={{ maxHeight: 0.9 * height }}
            >
              <ScrollView
                ref={scroll}
                keyboardShouldPersistTaps="handled"
                onLayout={(e) => (viewport.current = e.nativeEvent.layout.height)}
                contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: Math.max(16, insets.bottom) }}
              >
                <View ref={content} collapsable={false}>
                  <View style={{ marginBottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <Text variant="pxFigure" color={ROLE.ink} accessibilityRole="header" style={{ flexShrink: 1 }}>
                      {title}
                    </Text>
                    <Pressable testID={`${testID}-close`} accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={4}>
                      {({ pressed }) => (
                        <PixelFrame
                          frame="px-step"
                          state={pressed ? ":hover" : ""}
                          style={[{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }, pressStyle(pressed)]}
                        >
                          <Icon name="close" color={ROLE.ink} />
                        </PixelFrame>
                      )}
                    </Pressable>
                  </View>
                  <SheetFocus.Provider value={reveal}>{children}</SheetFocus.Provider>
                </View>
              </ScrollView>
            </PixelFrame>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
