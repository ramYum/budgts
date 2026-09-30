import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { useStatus } from "../../lib/status/status-context";
import { contentBottomPad } from "./bottom-tabs";
import { StatusBanners } from "./status-banners";

/**
 * One signed-in screen's body, the web dashboard layout's column: the status
 * banners (12px under the header), then the page, inset 24px from the phone's
 * edges with 8px on top, ending where the web's does above the tab bar. Pull
 * to refresh is the native addition that doesn't change the look.
 */
export function Screen({
  children,
  refreshing = false,
  onRefresh,
  testID = "screen-root",
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  testID?: string;
}) {
  const router = useRouter();
  const status = useStatus();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      testID={testID}
      style={{ flex: 1, backgroundColor: ROLE.bg }}
      contentContainerStyle={{ paddingBottom: contentBottomPad(insets.bottom) }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLOR.signal} colors={[COLOR.signal]} /> : undefined
      }
    >
      <View style={{ paddingHorizontal: 24 }}>
        <StatusBanners
          status={status}
          onFinishDeleting={() => router.push("/delete-account")}
          onReview={() => router.push("/settings")}
        />
      </View>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>{children}</View>
    </ScrollView>
  );
}
