import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, fonts, radii } from "../lib/theme";
import { formatMonthLabel } from "../lib/home/format";
import { OutlineButton, PrimaryButton } from "./ui";

/** Previous / next month with the current month's name between — the Activity and Budgets header. */
export function MonthNav({ month, onPrev, onNext }: { month: string; onPrev: () => void; onNext: () => void }) {
  return (
    <View style={styles.monthNav}>
      <Pressable testID="month-prev" accessibilityRole="button" accessibilityLabel="Previous month" onPress={onPrev} hitSlop={10} style={styles.monthBtn}>
        <Text style={styles.monthArrow}>‹</Text>
      </Pressable>
      <Text style={styles.monthLabel} accessibilityRole="header" testID="month-label">
        {formatMonthLabel(month)}
      </Text>
      <Pressable testID="month-next" accessibilityRole="button" accessibilityLabel="Next month" onPress={onNext} hitSlop={10} style={styles.monthBtn}>
        <Text style={styles.monthArrow}>›</Text>
      </Pressable>
    </View>
  );
}

/** A labelled text input with its server / client error underneath. */
export function Field({ label, error, ...input }: { label: string; error?: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        {...input}
        style={[styles.input, error ? styles.inputError : null]}
      />
      {error ? (
        <Text style={styles.fieldError} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A selectable pill (account, category, account type, direction). */
export function Chip({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

/** A full-area spinner. */
export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.centered} accessibilityLabel={label}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

/** A visible, retryable error — never a blank screen. `secondary` gives a reachable exit (e.g. sign in again). */
export function ErrorBlock({
  title,
  message,
  onRetry,
  secondary,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  secondary?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.centered}>
      <View style={styles.card} accessibilityRole="alert">
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBody}>{message}</Text>
        {onRetry ? (
          <PrimaryButton testID="error-retry" onPress={onRetry}>
            Try again
          </PrimaryButton>
        ) : null}
        {secondary ? (
          <OutlineButton testID="error-secondary" onPress={secondary.onPress}>
            {secondary.label}
          </OutlineButton>
        ) : null}
      </View>
    </View>
  );
}

/** A non-blocking message shown above content that is still on screen. */
export function Notice({ text }: { text: string }) {
  return (
    <Text style={styles.notice} accessibilityRole="alert">
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  monthBtn: { paddingHorizontal: 12, paddingVertical: 4 },
  monthArrow: { fontFamily: fonts.semibold, fontSize: 26, color: colors.text },
  monthLabel: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text },
  field: { gap: 4 },
  fieldLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.field,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
  },
  inputError: { borderColor: colors.neg },
  fieldError: { fontFamily: fonts.regular, fontSize: 12, color: colors.neg },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primaryBtn, borderColor: colors.primaryBtn },
  chipText: { fontFamily: fonts.medium, fontSize: 13, color: colors.text },
  chipTextOn: { fontFamily: fonts.semibold },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radii.field,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
  },
  cardTitle: { fontFamily: fonts.semibold, fontSize: 17, color: colors.text },
  cardBody: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, lineHeight: 20 },
  notice: { fontFamily: fonts.medium, fontSize: 13, color: colors.neg, paddingVertical: 6 },
});
