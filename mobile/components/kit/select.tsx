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
  plaidHint,
  fitOptions = false,
  testID,
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
  /**
   * Plaid's own guess at the category (web Needs a category): up to 12 characters it sits inside the field before the
   * chevron ("Plaid: Other"); a longer one gets its own line under the field ("Plaid suggests: Food and drink").
   */
  plaidHint?: string | null;
  /**
   * Size the field like a browser's auto-width select: as wide as its widest option, so no option is ever cut short
   * (the field's own box sets any minimum). Off, the field fills its box and a long label truncates.
   */
  fitOptions?: boolean;
  /** a test id for the field; its options get `<testID>-option-<value>` */
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const field = useRef<View>(null);
  const revealInSheet = useSheetFocus();
  const chosen = options.find((o) => o.value === value) ?? null;
  const hintInside = !!plaidHint && plaidHint.length <= 12;
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
            {fitOptions ? (
              <View style={{ flexGrow: 1, flexShrink: 0 }}>
                {/* the sizing layer: every option's label, unseen, so the field takes the widest one's width */}
                <View testID={testID ? `${testID}-sizer` : undefined} style={{ height: 0, overflow: "hidden" }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  {options.map((o) => (
                    <Text key={o.value} variant="input" color={ROLE.ink}>
                      {o.label}
                    </Text>
                  ))}
                </View>
                <Text variant="input" color={disabled ? ROLE.muted : chosen ? ROLE.ink : PLACEHOLDER} numberOfLines={1}>
                  {chosen?.label ?? placeholder}
                </Text>
              </View>
            ) : (
              <Text variant="input" color={disabled ? ROLE.muted : chosen ? ROLE.ink : PLACEHOLDER} numberOfLines={1} style={{ flex: 1 }}>
                {chosen?.label ?? placeholder}
              </Text>
            )}
            {hintInside ? (
              <Text variant="small" color={ROLE.muted} style={{ marginRight: 8 }}>
                {`Plaid: ${plaidHint}`}
              </Text>
            ) : null}
            <Icon name="chevron-down" color={COLOR.graphite} />
          </PixelFrame>
        )}
      </Pressable>
      {plaidHint && !hintInside ? (
        <Text variant="small" color={ROLE.muted} style={{ marginTop: 2 }}>
          {`Plaid suggests: ${plaidHint}`}
        </Text>
      ) : null}
      {open ? (
        <Overlay title={label} onClose={() => setOpen(false)}>
          <View accessibilityRole="radiogroup" accessibilityLabel={label}>
            {options.map((o) => {
              const on = o.value === value;
              return (
                <Pressable
                  key={o.value}
                  testID={testID ? `${testID}-option-${o.value}` : undefined}
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
