import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, fonts, radii } from "../lib/theme";

type ButtonProps = {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** The one primary action per screen: Sun-yellow pill, ink label
 * (docs/BRAND_GUIDELINES.md "Primary button" — mirrors web `PrimaryButton`). */
export function PrimaryButton({ children, onPress, disabled, loading, style }: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        styles.primary,
        inactive && styles.inactive,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onPrimaryBtn} />
      ) : (
        <Text style={[styles.label, { color: colors.onPrimaryBtn }]}>{children}</Text>
      )}
    </Pressable>
  );
}

/** Secondary action: hairline-outlined pill on the surface color. */
export function OutlineButton({ children, onPress, disabled, loading, style }: ButtonProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        styles.outline,
        inactive && styles.inactive,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Text style={[styles.label, { color: colors.text }]}>{children}</Text>
      )}
    </Pressable>
  );
}

/** Coral text link, like the web's `text-accent` links. */
export function TextLink({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8} style={styles.linkWrap}>
      <Text style={styles.link}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: radii.pill,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.primaryBtn },
  outline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inactive: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: { fontFamily: fonts.semibold, fontSize: 15 },
  linkWrap: { alignSelf: "center", paddingVertical: 8 },
  link: { fontFamily: fonts.semibold, fontSize: 14, color: colors.accent },
});
