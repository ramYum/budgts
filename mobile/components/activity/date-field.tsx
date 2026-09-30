import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { COLOR, PLACEHOLDER, ROLE, SPACE } from "../../lib/brand/shared";
import { shiftMonth } from "../../lib/dates";
import { formatMonthLabel } from "../../lib/home/format";
import { Icon } from "../brand/icon";
import { PixelFrame } from "../brand/pixel-frame";
import { Text } from "../brand/text";
import { Overlay, useSheetFocus } from "../kit/overlay";
import { pressStyle } from "../kit/press";

/** A `YYYY-MM-DD` day as the browser's date field shows it ("09/29/2026" in en-US), read in UTC so it never shifts a day. */
export function dateFieldLabel(day: string, locale?: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" });
}

/** The month's calendar, Sunday first: blanks before the 1st, then each day's `YYYY-MM-DD`, in rows of seven. */
export function monthGrid(month: string): (string | null)[][] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function Step({ icon, label, onPress, testID }: { icon: "chevron-left" | "chevron-right"; label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}>
      {({ pressed }) => (
        <PixelFrame frame="px-step" state={pressed ? ":hover" : ""} style={[{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }, pressStyle(pressed)]}>
          <Icon name={icon} color={ROLE.ink} />
        </PixelFrame>
      )}
    </Pressable>
  );
}

/** The month of days in the date sheet: step months, tap a day to choose it. */
export function Calendar({ value, onPick, testID = "date-calendar" }: { value: string; onPick: (day: string) => void; testID?: string }) {
  const [month, setMonth] = useState(value.slice(0, 7));
  return (
    <View testID={testID} style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text testID={`${testID}-month`} variant="bodyStrong" color={ROLE.ink}>
          {formatMonthLabel(month)}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Step testID={`${testID}-prev`} icon="chevron-left" label="Previous month" onPress={() => setMonth((m) => shiftMonth(m, -1))} />
          <Step testID={`${testID}-next`} icon="chevron-right" label="Next month" onPress={() => setMonth((m) => shiftMonth(m, 1))} />
        </View>
      </View>
      <View style={{ flexDirection: "row" }}>
        {WEEKDAYS.map((d) => (
          <Text key={d} variant="tLabel" color={ROLE.muted} style={{ flex: 1, textAlign: "center" }}>
            {d}
          </Text>
        ))}
      </View>
      <View style={{ gap: 4 }}>
        {monthGrid(month).map((week, r) => (
          <View key={r} style={{ flexDirection: "row", gap: 4 }}>
            {week.map((day, c) =>
              day ? (
                <Pressable
                  key={day}
                  testID={`${testID}-${day}`}
                  accessibilityRole="button"
                  accessibilityLabel={new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}
                  accessibilityState={{ selected: day === value }}
                  onPress={() => onPick(day)}
                  style={{ flex: 1 }}
                >
                  {({ pressed }) => (
                    <PixelFrame
                      frame="px-chip"
                      state={day === value ? "[aria-pressed='true']" : pressed ? ":hover" : ""}
                      style={[{ height: SPACE.touch, alignItems: "center", justifyContent: "center" }, pressStyle(pressed)]}
                    >
                      <Text variant={day === value ? "bodyStrong" : "body"} color={day === value ? COLOR.white : ROLE.ink} style={{ fontVariant: ["tabular-nums"] }}>
                        {String(Number(day.slice(8)))}
                      </Text>
                    </PixelFrame>
                  )}
                </Pressable>
              ) : (
                <View key={`blank-${c}`} style={{ flex: 1 }} />
              ),
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * The form's Date (web `<input type="date">` in the field frame): the chosen day as the browser shows it; a tap opens the
 * month in a sheet, the way the phone's browser opens its date picker.
 */
export function DateField({
  label,
  value,
  onChange,
  invalid = false,
  testID = "date-field",
}: {
  label: string;
  value: string;
  onChange: (day: string) => void;
  invalid?: boolean;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const field = useRef<View>(null);
  const revealInSheet = useSheetFocus();
  const state = invalid ? "[data-invalid='true']" : open ? ":focus-within" : "";
  return (
    <View style={{ gap: 6 }}>
      <Text variant="formLabel" color={COLOR.graphite}>
        {label}
      </Text>
      <Pressable
        ref={field}
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ? dateFieldLabel(value) : "not set"}`}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          revealInSheet?.(field.current);
          setOpen(true);
        }}
      >
        {({ pressed }) => (
          <PixelFrame frame="px-field" state={state} style={[{ height: SPACE.field, justifyContent: "center", paddingHorizontal: 8 }, pressStyle(pressed)]}>
            <Text testID={`${testID}-value`} variant="input" color={value ? ROLE.ink : PLACEHOLDER} numberOfLines={1}>
              {value ? dateFieldLabel(value) : "mm/dd/yyyy"}
            </Text>
          </PixelFrame>
        )}
      </Pressable>
      {open ? (
        <Overlay title={label} onClose={() => setOpen(false)}>
          <Calendar
            value={value}
            testID={`${testID}-calendar`}
            onPick={(day) => {
              onChange(day);
              setOpen(false);
            }}
          />
        </Overlay>
      ) : null}
    </View>
  );
}
