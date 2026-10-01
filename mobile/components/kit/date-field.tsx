import { useContext, useRef, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { COLOR, PLACEHOLDER, ROLE, SPACE } from "../../lib/brand/shared";
import { ProfileContext } from "../../lib/profile/profile-hooks";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { Overlay, useSheetFocus } from "./overlay";
import { pressStyle } from "./press";

/** `2026-09-30` → `09/30/2026`: what the web's `<input type="date">` shows on Android Chrome. */
export function formatDateInput(value: string): string {
  const [y, m, d] = value.split("-");
  return `${m}/${d}/${y}`;
}

/** A calendar day (`YYYY-MM-DD`) as a local Date at midnight, so the picker opens on that day in any time zone. */
export function dayToDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** The picker's local Date back to the server's `YYYY-MM-DD`. */
export function dateToDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Every date input (web `<input type="date" class={fieldClass}>` under `labelClass`): the field's stepped frame, 44px,
 * showing the day as Android Chrome does (mm/dd/yyyy). Android opens the Material date dialog (the dialog Chrome opens
 * for the web's input); iOS opens the system calendar in a sheet. It always answers the server's `YYYY-MM-DD`.
 */
export function DateField({
  label,
  value,
  onChange,
  minimumDate,
  maximumDate,
  placeholder = "mm/dd/yyyy",
  invalid = false,
  disabled = false,
  testID,
}: {
  label: string;
  /** `YYYY-MM-DD`, or null when nothing is chosen (an optional target date) */
  value: string | null;
  onChange: (value: string) => void;
  minimumDate?: string;
  maximumDate?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const field = useRef<View>(null);
  const revealInSheet = useSheetFocus();
  // With nothing chosen the picker opens on the user's own today (the server's, in their profile's zone), never the
  // device's. Read without throwing: while the profile reloads it is missing, and an empty field waits, disabled,
  // instead of failing on a tap. A field with a value opens on that value and never needs it.
  const profile = useContext(ProfileContext);
  const today = profile?.state.status === "ready" ? profile.state.profile.today : null;
  const off = disabled || (!value && !today);
  const state = off ? "" : invalid ? "[data-invalid='true']" : open ? ":focus-within" : "";
  const shown = value ? formatDateInput(value) : placeholder;
  /** The day the picker opens on: the value, or with nothing chosen the user's today. Only called while enabled. */
  const initialDate = (): Date => dayToDate(value ?? today!);
  const bounds = {
    minimumDate: minimumDate ? dayToDate(minimumDate) : undefined,
    maximumDate: maximumDate ? dayToDate(maximumDate) : undefined,
  };

  function openPicker() {
    if (off) return;
    revealInSheet?.(field.current);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initialDate(),
        mode: "date",
        ...bounds,
        onChange: (event: DateTimePickerEvent, date?: Date) => {
          if (event.type === "set" && date) onChange(dateToDay(date));
        },
      });
      return;
    }
    setOpen(true);
  }

  return (
    <View style={{ gap: 6 }}>
      <Text variant="formLabel" color={COLOR.graphite}>
        {label}
      </Text>
      <Pressable
        ref={field}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ? shown : "not set"}`}
        accessibilityState={{ disabled: off, expanded: open }}
        disabled={off}
        onPress={openPicker}
      >
        {({ pressed }) => (
          <PixelFrame
            frame="px-field"
            state={state}
            style={[{ height: SPACE.field, justifyContent: "center", paddingHorizontal: 8 }, pressStyle(pressed)]}
          >
            <Text variant="input" color={off ? ROLE.muted : value ? ROLE.ink : PLACEHOLDER} style={{ fontVariant: ["tabular-nums"] }}>
              {shown}
            </Text>
          </PixelFrame>
        )}
      </Pressable>
      {open && !off ? (
        <Overlay title={label} onClose={() => setOpen(false)} testID={testID ? `${testID}-sheet` : undefined}>
          <DateTimePicker
            value={initialDate()}
            mode="date"
            display="inline"
            {...bounds}
            accentColor={COLOR.signal}
            onChange={(event: DateTimePickerEvent, date?: Date) => {
              if (event.type === "set" && date) {
                setOpen(false);
                onChange(dateToDay(date));
              }
            }}
          />
        </Overlay>
      ) : null}
    </View>
  );
}
