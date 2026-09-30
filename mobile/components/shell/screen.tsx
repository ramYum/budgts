import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { Stack, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLOR, MOTION, ROLE } from "../../lib/brand/shared";
import { EASE_OUT, PAGE_ENTER } from "../../lib/motion/css";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { useStatus } from "../../lib/status/status-context";
import { ScrollWatchProvider, useScrollWatchSource } from "../motion/scroll-context";
import { HEADER_HEIGHT } from "./app-header";
import { contentBottomPad } from "./bottom-tabs";
import { StatusBanners } from "./status-banners";

/**
 * One signed-in screen's body, the web dashboard layout's column: content
 * scrolls under the translucent header (the web's sticky `bg-bg/90` header),
 * then the status banners 12px down, then the page, inset 24px with 8px on
 * top, rising in on arrival (`page-enter`), ending where the web's column
 * does above the tab bar. Blocks inside can wait below the fold (<Reveal>).
 * Pull to refresh is the native addition that doesn't change the look.
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
  const reduced = useReducedMotion();
  const { watch, onScrollY, onViewportHeight } = useScrollWatchSource();
  const headerBottom = insets.top + HEADER_HEIGHT;
  const enterTiming = useMotionTiming(0);

  return (
    <>
      <Stack.Screen options={{ headerTransparent: true }} />
      <ScrollView
        testID={testID}
        style={{ flex: 1, backgroundColor: ROLE.bg }}
        contentContainerStyle={{ paddingTop: headerBottom, paddingBottom: contentBottomPad(insets.bottom) }}
        scrollIndicatorInsets={{ top: HEADER_HEIGHT }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={(e) => onScrollY(e.nativeEvent.contentOffset.y)}
        onLayout={(e) => onViewportHeight(e.nativeEvent.layout.height)}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              progressViewOffset={headerBottom}
              tintColor={COLOR.signal}
              colors={[COLOR.signal]}
            />
          ) : undefined
        }
      >
        <View ref={watch.contentRef} collapsable={false}>
          <ScrollWatchProvider watch={watch}>
            <View style={{ paddingHorizontal: 24 }}>
              <StatusBanners
                status={status}
                onFinishDeleting={() => router.push("/delete-account")}
                onReview={() => router.push("/settings")}
              />
            </View>
            <Animated.View
              style={[
                { paddingHorizontal: 24, paddingTop: 8 },
                reduced
                  ? null
                  : {
                      animationName: PAGE_ENTER,
                      animationDuration: `${MOTION.pageEnterMs}ms`,
                      animationTimingFunction: EASE_OUT,
                      animationFillMode: "backwards",
                      ...enterTiming,
                    },
              ]}
            >
              {children}
            </Animated.View>
          </ScrollWatchProvider>
        </View>
      </ScrollView>
    </>
  );
}
