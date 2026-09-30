import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { COLOR, PLACEHOLDER, ROLE, SPACE } from "../../lib/brand/shared";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { Overlay, useSheetFocus } from "./overlay";
import { pressStyle } from "./press";

export type SelectOption<T extends string> = { value: T; label: string; disabled?: boolean };

/**
 * A labelled choice (web `Select` under a `labelClass` label): the field's
 * stepped frame, 44px tall, the chosen label and a pixel chevron. Where the
 * web opens the system's list, the app opens a sheet of the options, the
 * chosen one ticked; picking one closes it.
 */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose…",
  invalid = false,
  disabled = false,
  hideLabel = false,
  testID = "select",
}: {
  /** the label above the field, the sheet's title and what a screen reader hears */
  label: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** no visible label: a field its row already explains (web `aria-label` on the select) */
  hideLabel?: boolean;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const field = useRef<View>(null);
  const revealInSheet = useSheetFocus();
  const chosen = options.find((o) => o.value === value) ?? null;
  const state = disabled ? "" : invalid ? "[data-invalid='true']" : open ? ":focus-within" : "";

  return (
    <View style={{ gap: 6 }}>
      {hideLabel ? null : (
        <Text variant="formLabel" color={COLOR.graphite}>
          {label}
        </Text>
      )}
      <Pressable
        ref={field}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${chosen?.label ?? placeholder}`}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => {
          revealInSheet?.(field.current);
          setOpen(true);
        }}
      >
        {({ pressed }) => (
          <PixelFrame
            frame="px-field"
            state={state}
            style={[{ height: SPACE.field, flexDirection: "row", alignItems: "center", paddingLeft: 8, paddingRight: 6 }, pressStyle(pressed)]}
          >
            <Text variant="input" color={disabled ? ROLE.muted : chosen ? ROLE.ink : PLACEHOLDER} numberOfLines={1} style={{ flex: 1 }}>
              {chosen?.label ?? placeholder}
            </Text>
            <Icon name="chevron-down" color={COLOR.graphite} />
          </PixelFrame>
        )}
      </Pressable>
      {open ? (
        <Overlay title={label} onClose={() => setOpen(false)} testID={`${testID}-sheet`}>
          <View accessibilityRole="radiogroup" accessibilityLabel={label}>
            {options.map((o) => {
              const on = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  testID={`${testID}-option-${o.value}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled: !!o.disabled }}
                  accessibilityLabel={o.label}
                  disabled={o.disabled}
                  onPress={() => {
                    setOpen(false);
                    if (!on) onChange(o.value);
                  }}
                  style={({ pressed }) => [
                    { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, minHeight: 44 },
                    pressed ? { backgroundColor: ROLE.surface2 } : null,
                    pressStyle(pressed),
                  ]}
                >
                  <Text variant={on ? "bodyStrong" : "body"} color={o.disabled ? ROLE.muted : ROLE.ink} style={{ flex: 1 }}>
                    {o.label}
                  </Text>
                  {on ? <Icon name="check" color={ROLE.ink} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Overlay>
      ) : null}
    </View>
  );
}
