import { Pressable, View } from "react-native";
import Animated, { steps } from "react-native-reanimated";
import { useReducedMotion } from "../motion/reduced-motion";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLOR, ROLE, tabTestId, type IconName } from "../../lib/brand/shared";
import { PIP_IN, PIP_MS } from "../../lib/motion/css";
import { useMotionTiming } from "../../lib/motion/parity-clock";
import { Icon } from "../brand/icon";
import { Text } from "../brand/text";
import { pressStyle } from "../kit/press";

/** The four tabs, in the web's order (src/components/bottom-nav.tsx `NAV`); `route` is the tab's route group. */
export const TABS = [
  { route: "(home)", label: "Home", icon: "home" },
  { route: "(budgets)", label: "Budgets", icon: "budgets" },
  { route: "(activity)", label: "Activity", icon: "activity" },
  { route: "(more)", label: "More", icon: "more" },
] as const satisfies readonly { route: string; label: string; icon: IconName }[];

export type TabRoute = (typeof TABS)[number]["route"];

/** The bar's own height above the bottom inset: a 2px hairline, 12px, the 24px icon, 4px, a 16px label, 8px. */
export const TAB_BAR_HEIGHT = 2 + 12 + 24 + 4 + 16 + 8;

/** The web's `pb-[max(0.25rem,env(safe-area-inset-bottom))]`. */
export const tabBarBottomPad = (insetBottom: number) => Math.max(4, insetBottom);

/**
 * The web's content column ends 112px (`pb-28`) above the screen's bottom edge,
 * under a fixed bar; natively the bar takes its own space, so a screen pads
 * only what is left of those 112px.
 */
export const contentBottomPad = (insetBottom: number) => Math.max(0, 112 - TAB_BAR_HEIGHT - tabBarBottomPad(insetBottom));

/** The active tab's marker (`.pip`): a 16×4 red bar on the top edge that snaps in, `pip-in 220ms steps(3, end)`. */
function Pip() {
  const reduced = useReducedMotion();
  const timing = useMotionTiming(0);
  return (
    <Animated.View
      testID="tab-pip"
      pointerEvents="none"
      style={[
        { position: "absolute", top: -2, width: 16, height: 4, backgroundColor: COLOR.signal },
        reduced
          ? null
          : {
              animationName: PIP_IN,
              animationDuration: `${PIP_MS}ms`,
              animationTimingFunction: steps(3, "jump-end"),
              animationFillMode: "backwards",
              ...timing,
            },
      ]}
    />
  );
}

/**
 * The fixed bottom tab bar (web `BottomNav`): white, a 2px hairline on top,
 * four equal columns. The current tab is the one red element: a red icon, an
 * ink semibold label, and the pip on the bar's top edge.
 */
export function BottomTabs({ active, onSelect }: { active: TabRoute; onSelect: (route: TabRoute) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="bottom-nav"
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: ROLE.surface,
        borderTopWidth: 2,
        borderTopColor: ROLE.hairline,
        paddingBottom: tabBarBottomPad(insets.bottom),
      }}
    >
      {TABS.map((tab) => {
        const on = tab.route === active;
        return (
          <Pressable
            key={tab.route}
            testID={tabTestId(tab.label)}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(tab.route)}
            style={({ pressed }) => [
              { flex: 1, alignItems: "center", gap: 4, paddingTop: 12, paddingBottom: 8 },
              pressStyle(pressed),
            ]}
          >
            {on ? <Pip /> : null}
            <Icon name={tab.icon} color={on ? COLOR.signal : ROLE.muted} />
            <Text
              variant={on ? "bodyStrong" : "body"}
              color={on ? ROLE.text : ROLE.muted}
              style={{ fontSize: 13, lineHeight: 16 }}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
