import { forwardRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { COLOR, MOTION, PLACEHOLDER, ROLE, SPACE, type IconName } from "../../lib/brand/shared";
import { textStyle } from "../../lib/brand/type";
import { Icon } from "./icon";
import { PixelFrame } from "./pixel-frame";
import { Text } from "./text";

/**
 * The web's controls (src/components/ui.tsx) from the same frames and tokens:
 * a stepped-frame button, a framed field, a quiet text action, an icon tile.
 * A tap reads as the web's press: the primary sinks onto its raised edge, the
 * others draw their hover line and shrink to 0.98.
 */

type Variant = "primary" | "secondary" | "danger";
const FRAME: Record<Variant, string> = { primary: "px-btn-primary", secondary: "px-btn", danger: "px-btn-danger" };

export type ButtonProps = Omit<PressableProps, "children" | "style"> & {
  variant?: Variant;
  size?: "md" | "lg";
  /** a leading icon */
  icon?: IconName;
  /** a trailing arrow, for "go on" steps */
  arrow?: boolean;
  /** shows a spinner in place of the icons and keeps the label */
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  children: string;
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  arrow,
  loading = false,
  disabled,
  style,
  children,
  ...rest
}: ButtonProps) {
  const off = !!disabled || loading;
  const labelColor = variant === "primary" ? COLOR.white : variant === "danger" ? COLOR.signalInk : ROLE.ink;
  const color = off && !loading ? ROLE.muted : labelColor;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={children}
      accessibilityState={{ disabled: off, busy: loading }}
      disabled={off}
      hitSlop={size === "md" ? (SPACE.touch - SPACE.buttonMd) / 2 : undefined}
      style={style}
      {...rest}
    >
      {({ pressed }) => {
        const state = off && !loading ? ":disabled" : pressed && variant !== "primary" ? ":hover" : "";
        const sunk = pressed && variant === "primary";
        return (
          <PixelFrame
            frame={FRAME[variant]}
            state={state}
            raise={variant === "primary" && !off && !sunk}
            style={{
              height: size === "lg" ? SPACE.buttonLg : SPACE.buttonMd,
              paddingHorizontal: size === "lg" ? 12 : 6,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transform: sunk ? [{ translateY: 2 }] : pressed ? [{ scale: MOTION.pressScale }] : undefined,
            }}
          >
            {loading ? <ActivityIndicator size="small" color={labelColor} /> : icon ? <Icon name={icon} color={color} /> : null}
            <Text variant="button" color={color} numberOfLines={1}>
              {children}
            </Text>
            {arrow && !loading ? <Icon name="forward" color={color} /> : null}
          </PixelFrame>
        );
      }}
    </Pressable>
  );
}

export type FieldProps = Omit<TextInputProps, "style" | "placeholderTextColor"> & {
  label: string;
  invalid?: boolean;
  testID?: string;
};

/** A labelled text field in a stepped frame, 44px tall; the frame thickens to ink on focus and to red when invalid. */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, invalid = false, onFocus, onBlur, editable = true, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const state = invalid ? "[data-invalid='true']" : focused ? ":focus-within" : "";
  return (
    <View style={{ gap: 6 }}>
      <Text variant="formLabel" color={COLOR.graphite} nativeID={`${rest.testID ?? label}-label`}>
        {label}
      </Text>
      <PixelFrame frame="px-field" state={state} style={{ height: SPACE.field }}>
        <TextInput
          ref={ref}
          {...rest}
          editable={editable}
          accessibilityLabel={label}
          aria-labelledby={`${rest.testID ?? label}-label`}
          placeholderTextColor={PLACEHOLDER}
          cursorColor={ROLE.ink}
          selectionColor={COLOR.signal}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            textStyle("input"),
            {
              flex: 1,
              paddingHorizontal: 8,
              paddingVertical: 4,
              color: editable ? ROLE.ink : ROLE.muted,
              // Android pads text inputs by default; the web field doesn't
              textAlignVertical: "center",
              includeFontPadding: false,
            },
          ]}
        />
      </PixelFrame>
    </View>
  );
});

/** A quiet text action ("Use a different email"), a full 44px touch target. */
export function TextButton({
  icon,
  children,
  color = ROLE.muted,
  onPress,
  disabled,
  testID,
}: {
  icon?: IconName;
  children: string;
  color?: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={children}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        minHeight: 36,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        opacity: disabled ? 0.5 : 1,
        transform: pressed ? [{ scale: MOTION.pressScale }] : undefined,
      })}
    >
      {({ pressed }) => (
        <>
          {icon ? <Icon name={icon} color={pressed ? ROLE.ink : color} /> : null}
          <Text variant="body" color={pressed ? ROLE.ink : color}>
            {children}
          </Text>
        </>
      )}
    </Pressable>
  );
}

type TileTone = "gray" | "wash" | "accent" | "ink" | "growth";
const TILE: Record<TileTone, { frame: string; color: string }> = {
  gray: { frame: "px-tile", color: ROLE.ink },
  wash: { frame: "px-tile-wash", color: COLOR.signal },
  accent: { frame: "px-tile-accent", color: COLOR.white },
  ink: { frame: "px-tile-ink", color: COLOR.white },
  growth: { frame: "px-tile-growth", color: ROLE.pos },
};

/** An icon on a quiet stepped tile, 32px; the icon stays 24px so its cells stay whole. */
export function IconTile({ name, tone = "gray" }: { name: IconName; tone?: TileTone }) {
  return (
    <PixelFrame
      frame={TILE[tone].frame}
      style={{ width: SPACE.tile, height: SPACE.tile, alignItems: "center", justifyContent: "center" }}
    >
      {/* 24px in a 20px frame interior, centred as on the web: 4px from each edge */}
      <Icon name={name} color={TILE[tone].color} />
    </PixelFrame>
  );
}

/** A 1px rule (`.px-rule`). */
export function Rule({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: COLOR.divider }, style]} />;
}

