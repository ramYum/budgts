import { useRef, type ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { BlurTargetView, BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLOR, MOTION, ROLE } from "../../lib/brand/shared";
import { EASE_OUT, PAGE_ENTER } from "../../lib/motion/css";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { useStatus } from "../../lib/status/status-context";
import { ScrollWatchProvider, useScrollWatchSource } from "../motion/scroll-context";
import { AppHeader, HEADER_HEIGHT } from "./app-header";
import { contentBottomPad } from "./bottom-tabs";
import { StatusBanners } from "./status-banners";

/**
 * The web header's `backdrop-blur-xl` (24px): expo-blur's strongest Android radius (intensity 100 ÷ the default
 * reduction 4 = 25) on Android 12+, the system material on iOS; under it the header's own `bg/90`.
 */
export const HEADER_BLUR = { intensity: 100, blurMethod: "dimezisBlurViewSdk31Plus" } as const;

/**
 * One signed-in screen, the web dashboard layout: the sticky header (lockup and bell, `bg-bg/90` over a
 * backdrop blur of what scrolls under it), then the column: content
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
  const { watch, scrollRef, onScrollY, onViewportHeight } = useScrollWatchSource();
  const headerBottom = insets.top + HEADER_HEIGHT;
  const enterTiming = useMotionTiming(0);
  // Android blurs a marked view (BlurTargetView) behind the header; iOS blurs whatever is behind it.
  const blurTarget = useRef<View>(null);

  return (
    <View style={{ flex: 1, backgroundColor: ROLE.bg }}>
      <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
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
                onFinishDeleting={() => router.push("/settings/delete-account")}
                onReview={() => router.push("/settings")}
              />
            </View>
            <Animated.View
              testID="screen-content"
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
      </BlurTargetView>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
        <BlurView
          blurTarget={blurTarget}
          {...HEADER_BLUR}
          tint="light"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <AppHeader
          needsCategoryCount={status?.needsCategoryCount ?? null}
          onHome={() => router.navigate("/")}
          onBell={() => router.navigate("/activity")}
        />
      </View>
    </View>
  );
}
