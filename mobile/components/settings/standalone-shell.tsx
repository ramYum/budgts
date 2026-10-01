import type { ReactNode } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ROLE } from "../../lib/brand/shared";
import { Logo } from "../brand/logo";
import { StaleNotice, type StaleNoticeProps } from "../feedback/refresh-notice";
import { pressStyle } from "../kit/press";

/**
 * A screen that stands outside the signed-in app (web StandaloneShell): the
 * brand top-left, then one column, centred, or pinned under the brand
 * (`align="top"`) for a multi-step flow whose title must not jump from step
 * to step. No header bar, no tabs. Pads above the keyboard on both platforms.
 * A screen that loads through `useResource` passes its `notice`, `onRetry` and
 * `name`, drawn first in the column as `<Screen>` draws it.
 */
export function StandaloneShell({
  children,
  align = "center",
  onHome,
  ...stale
}: {
  children: ReactNode;
  align?: "center" | "top";
  /** the brand is a way home, when there is one */
  onHome?: () => void;
} & StaleNoticeProps) {
  const insets = useSafeAreaInsets();
  const logo = <Logo size={22} testID="app-logo" />;
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: ROLE.bg }}>
      <ScrollView
        testID="screen-root"
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top, paddingBottom: insets.bottom + 48 }}
      >
        <View style={{ paddingHorizontal: 24, paddingVertical: 16, flexDirection: "row" }}>
          {onHome ? (
            <Pressable accessibilityRole="link" accessibilityLabel="Budgts home" onPress={onHome} style={({ pressed }) => pressStyle(pressed)}>
              {logo}
            </Pressable>
          ) : (
            logo
          )}
        </View>
        <View
          testID="screen-content"
          style={{ flexGrow: 1, paddingHorizontal: 24, justifyContent: align === "top" ? "flex-start" : "center", paddingTop: align === "top" ? 16 : 24 }}
        >
          <StaleNotice {...stale} />
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
