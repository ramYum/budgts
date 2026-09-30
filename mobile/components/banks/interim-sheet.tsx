import { useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, View } from "react-native";
import Animated, { cubicBezier, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { pressStyle } from "../kit/press";

/*
 * INTERIM (Lane E): the web's bottom sheet (`src/components/overlay.tsx`) and
 * select field (`ui.tsx` `Select`), only until Foundation's F6 lands
 * `components/kit/overlay.tsx` and its `Select`. At that rebase this file is
 * deleted and its two importers switch to the kit; their props stay the same.
 */

const SHEET_EASE = cubicBezier(0.16, 1, 0.3, 1);
const SHEET_RISE = { from: { opacity: 0, transform: [{ translateY: 32 }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } };

/** A bottom sheet in the raised card frame: the title in pixel type, a square close, a scrim that closes it, Android back closes it. */
export function Sheet({ title, onClose, children, testID = "sheet" }: { title: string; onClose: () => void; children: ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  return (
    <Modal transparent visible animationType={reduced ? "none" : "fade"} statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(17, 17, 17, 0.4)" }}>
          <Pressable
            testID={`${testID}-scrim`}
            accessibilityLabel="Close"
            onPress={onClose}
            style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}
          />
          <Animated.View
            accessibilityViewIsModal
            aria-modal
            accessibilityLabel={title}
            style={[
              { maxHeight: "90%", marginTop: insets.top },
              reduced ? null : { animationName: SHEET_RISE, animationDuration: "300ms", animationTimingFunction: SHEET_EASE },
            ]}
          >
            <PixelFrame testID={testID} frame="px-card-raised" style={{ flexShrink: 1 }}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: Math.max(16, insets.bottom) }}
              >
                <View style={{ marginBottom: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <Text testID={`${testID}-title`} variant="pxFigure" color={ROLE.ink} accessibilityRole="header" style={{ flexShrink: 1 }}>
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
                {children}
              </ScrollView>
            </PixelFrame>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type SelectOption<T extends string> = { value: T; label: string; disabled?: boolean };

/**
 * A select in the field frame with the pixel chevron (web `Select`). Tapping it
 * lists the options under the field, the chosen one in ink with a check.
 */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  testID,
  style,
  accessibilityLabel,
}: {
  /** the visible label above the field; omit for a field the row labels (the screen reader still hears `accessibilityLabel`) */
  label?: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  testID: string;
  style?: object;
  accessibilityLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={[{ gap: 6 }, style]}>
      {label ? (
        <Text variant="formLabel" color={COLOR.graphite}>
          {label}
        </Text>
      ) : null}
      <Pressable
        testID={testID}
        accessibilityRole="combobox"
        accessibilityLabel={label ?? accessibilityLabel}
        accessibilityValue={{ text: current?.label ?? "" }}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
      >
        <PixelFrame
          frame="px-field"
          state={open ? ":focus-within" : ""}
          style={{ height: 44, flexDirection: "row", alignItems: "center", paddingLeft: 8, paddingRight: 6 }}
        >
          <Text variant="input" color={ROLE.ink} numberOfLines={1} style={{ flex: 1 }}>
            {current?.label ?? ""}
          </Text>
          <Icon name="chevron-down" color={COLOR.graphite} />
        </PixelFrame>
      </Pressable>
      {open ? (
        <PixelFrame frame="px-card" testID={`${testID}-options`}>
          {options.map((o) => {
            const chosen = o.value === value;
            return (
              <Pressable
                key={o.value}
                testID={`${testID}-${o.value}`}
                accessibilityRole="menuitem"
                accessibilityLabel={o.label}
                accessibilityState={{ selected: chosen, disabled: !!o.disabled }}
                disabled={o.disabled}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  minHeight: 44,
                  paddingHorizontal: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  backgroundColor: pressed ? ROLE.tint : undefined,
                })}
              >
                <Text variant={chosen ? "bodyStrong" : "body"} color={o.disabled ? ROLE.muted : ROLE.ink} numberOfLines={1} style={{ flex: 1 }}>
                  {o.label}
                </Text>
                {chosen ? <Icon name="check" color={ROLE.ink} /> : null}
              </Pressable>
            );
          })}
        </PixelFrame>
      ) : null}
    </View>
  );
}
