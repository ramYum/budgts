import { useRef, type ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import Animated from "react-native-reanimated";
import { useReducedMotion } from "../motion/reduced-motion";
import { useRouter } from "expo-router";
import { BlurTargetView, BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLOR, MOTION } from "../../lib/brand/shared";
import { EASE_OUT, PAGE_ENTER } from "../../lib/motion/css";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { useAuth } from "../../lib/auth/auth-context";
import { pullWithBankRefresh } from "../../lib/plaid/bank-refresh";
import { NEEDS_CATEGORY_LINK } from "../../lib/status/status-api";
import { useStatus } from "../../lib/status/status-context";
import { OnBackdrop } from "../brand/on-backdrop";
import { StaleNotice, type StaleNoticeProps } from "../feedback/refresh-notice";
import { ScrollWatchProvider, useScrollWatchSource } from "../motion/scroll-context";
import { AppHeader, HEADER_HEIGHT } from "./app-header";
import { contentBottomPad } from "./bottom-tabs";
import { StatusBanners } from "./status-banners";

/**
 * The web header's `backdrop-blur-xl` (24px): expo-blur's strongest Android radius (intensity 100 ÷ the default
 * reduction 4 = 25) on Android 12+, the system material on iOS; over it the header's own tint (the sky's top band at 90%).
 */
export const HEADER_BLUR = { intensity: 100, blurMethod: "dimezisBlurViewSdk31Plus" } as const;

/**
 * One signed-in screen, the web dashboard layout: the sticky header (lockup and bell, the sky's top band at 90% over
 * a backdrop blur of what scrolls under it), then the column: content
 * then the status banners 12px down, then the page, inset 24px with 8px on
 * top, rising in on arrival (`page-enter`), ending where the web's column
 * does above the tab bar. Blocks inside can wait below the fold (<Reveal>).
 * Pull to refresh is the native addition that doesn't change the look. A
 * pull re-reads the screen (`onRefresh`) and, alongside, asks the server for
 * a bank refresh (`pullWithBankRefresh`): the only trigger for Plaid's billed
 * Transactions Refresh, throttled on the server to once a day per bank.
 * The screen paints no canvas of its own: the page scrolls over the tab
 * shell's sunset backdrop (components/shell/backdrop.tsx), and what sits
 * straight on it takes the backdrop's muted colour (OnBackdrop).
 *
 * A screen that loads through `useResource` passes its `notice` (the pull
 * contract: a reload that failed kept the figures on screen) with `onRetry`
 * and its `name`: the shell draws the stale-data notice in this one place, at
 * the top of the page under the banners (`<name>-refresh-notice`), so no
 * screen can show stale figures as current (guarded by
 * test/refresh-notice-guard.test.ts).
 */
export function Screen({
  children,
  refreshing = false,
  onRefresh,
  testID = "screen-root",
  ...stale
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  testID?: string;
} & StaleNoticeProps) {
  const router = useRouter();
  const status = useStatus();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { watch, scrollRef, onScrollY, onViewportHeight } = useScrollWatchSource();
  const headerBottom = insets.top + HEADER_HEIGHT;
  const enterTiming = useMotionTiming(0);
  // Android blurs a marked view (BlurTargetView) behind the header; iOS blurs whatever is behind it.
  const blurTarget = useRef<View>(null);

  return (
    <View style={{ flex: 1 }}>
      {/* The header first, so a screen reader meets it before the page (as on the web); zIndex keeps it drawn over the content. */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 1 }}>
        <BlurView
          blurTarget={blurTarget}
          {...HEADER_BLUR}
          tint="light"
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <AppHeader
          needsCategoryCount={status?.needsCategoryCount ?? null}
          onHome={() => router.navigate("/")}
          onBell={() => router.navigate(NEEDS_CATEGORY_LINK)}
        />
      </View>
      <BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        testID={testID}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: contentBottomPad(insets.bottom) }}
        scrollIndicatorInsets={{ top: HEADER_HEIGHT }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={32}
        onScroll={(e) => onScrollY(e.nativeEvent.contentOffset.y)}
        onLayout={(e) => onViewportHeight(e.nativeEvent.layout.height)}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => pullWithBankRefresh(session, onRefresh)}
              progressViewOffset={headerBottom}
              tintColor={COLOR.signal}
              colors={[COLOR.signal]}
            />
          ) : undefined
        }
      >
        {/* The header clearance sits inside the view blocks measure against, so a measured y is the scroll content's y,
            the same space as the viewport's offset and height (<Reveal>'s fold, Show more, Crystal's on-screen check). */}
        <View ref={watch.contentRef} collapsable={false} style={{ paddingTop: headerBottom }}>
          <OnBackdrop.Provider value>
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
              <StaleNotice {...stale} />
              {children}
            </Animated.View>
          </ScrollWatchProvider>
          </OnBackdrop.Provider>
        </View>
      </ScrollView>
      </BlurTargetView>
    </View>
  );
}

