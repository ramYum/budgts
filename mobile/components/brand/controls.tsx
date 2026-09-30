import { forwardRef, useId, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import {
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
import { useSheetFocus } from "../kit/overlay";
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
  /** a trailing icon (a chevron for "show more", a sync for "re-scan"), in the label's colour */
  iconAfter?: IconName;
  /** a trailing arrow, for "go on" steps */
  arrow?: boolean;
  /** the web's pending state: the disabled frame and a muted label (pass the pending label, e.g. "Sending…"); busy to a screen reader */
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  children: string;
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconAfter,
  arrow,
  loading = false,
  disabled,
  style,
  children,
  ...rest
}: ButtonProps) {
  const off = !!disabled || loading;
  const labelColor = variant === "primary" ? COLOR.white : variant === "danger" ? COLOR.signalInk : ROLE.ink;
  const color = off ? ROLE.muted : labelColor;
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
        const state = off ? ":disabled" : pressed && variant !== "primary" ? ":hover" : "";
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
              // always an array: a transform that turns undefined on release reaches React Native's
              // style processor as null and crashes it (found on the emulator, 2026-09-29)
              transform: sunk ? [{ translateY: 2 }] : pressed ? [{ scale: MOTION.pressScale }] : [],
            }}
          >
            {icon ? <Icon name={icon} color={color} /> : null}
            <Text variant="button" color={color} numberOfLines={1}>
              {children}
            </Text>
            {iconAfter ? <Icon name={iconAfter} color={color} /> : null}
            {arrow && !loading ? <Icon name="forward" color={color} /> : null}
          </PixelFrame>
        );
      }}
    </Pressable>
  );
}

export type FieldProps = Omit<TextInputProps, "style" | "placeholderTextColor" | "multiline" | "numberOfLines"> & {
  /** the label above the field; a node for a label with emphasis ("Type **DELETE** to confirm") */
  label: string | ReactNode;
  /** what a screen reader hears when `label` is a node */
  accessibilityLabel?: string;
  invalid?: boolean;
  /** lines of a multi-line note (the web's `<textarea rows>`); a one-line field without it */
  rows?: number;
  testID?: string;
};

/** A field's frame height: 44px for one line (24px line, 4px padding, the 6px frame each side), 24px more per extra row. */
export const fieldHeight = (rows = 1) => SPACE.field + (rows - 1) * 24;

/**
 * A labelled text field in a stepped frame (web `fieldClass` under `labelClass`), 44px tall, or a `rows`-line note;
 * the frame thickens to ink on focus and to red when invalid.
 */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, accessibilityLabel, invalid = false, rows, onFocus, onBlur, editable = true, ...rest },
  ref,
) {
  const labelId = `field-label-${useId()}`;
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => input.current as TextInput);
  // In a bottom sheet, a focused field scrolls itself above the keyboard (kit/overlay.tsx).
  const revealInSheet = useSheetFocus();
  const state = invalid ? "[data-invalid='true']" : focused ? ":focus-within" : "";
  return (
    <View style={{ gap: 6 }}>
      <Text variant="formLabel" color={COLOR.graphite} nativeID={labelId}>
        {label}
      </Text>
      <PixelFrame frame="px-field" state={state} style={{ height: fieldHeight(rows) }}>
        <TextInput
          ref={input}
          {...rest}
          editable={editable}
          accessibilityLabel={typeof label === "string" ? label : accessibilityLabel}
          aria-labelledby={labelId}
          multiline={rows !== undefined && rows > 1}
          numberOfLines={rows}
          placeholderTextColor={PLACEHOLDER}
          cursorColor={ROLE.ink}
          selectionColor={COLOR.signal}
          onFocus={(e) => {
            setFocused(true);
            revealInSheet?.(input.current);
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
              // Android pads text inputs by default; the web field doesn't. A note starts at its top, like a textarea.
              textAlignVertical: rows !== undefined && rows > 1 ? "top" : "center",
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
  iconAfter,
  children,
  strong = false,
  color = strong ? ROLE.ink : ROLE.muted,
  onPress,
  disabled,
  testID,
}: {
  icon?: IconName;
  /** a trailing icon ("Show 12 more" ⌄) */
  iconAfter?: IconName;
  /** semibold ink, for a text action that leads its row ("Copy last month") */
  strong?: boolean;
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
        transform: pressed ? [{ scale: MOTION.pressScale }] : [],
      })}
    >
      {({ pressed }) => (
        <>
          {icon ? <Icon name={icon} color={pressed ? ROLE.ink : color} /> : null}
          <Text variant={strong ? "bodyStrong" : "body"} color={pressed ? ROLE.ink : color}>
            {children}
          </Text>
          {iconAfter ? <Icon name={iconAfter} color={pressed ? ROLE.ink : color} /> : null}
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

/** An icon on a quiet stepped tile, 32px unless sized; the icon stays 24px so its cells stay whole. */
export function IconTile({ name, tone = "gray", size = SPACE.tile }: { name: IconName; tone?: TileTone; size?: number }) {
  return (
    <PixelFrame
      testID="icon-tile"
      frame={TILE[tone].frame}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
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

