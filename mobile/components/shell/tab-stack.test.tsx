import { createElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { byTestId, flat, hosts, render } from "../../test/render";

/**
 * The tab shell over the sunset backdrop (option B): one backdrop behind all four tabs, every navigator inside them
 * transparent, the meadow on the bar's measured height; and, where a pushed screen slides over the one below (iOS),
 * an opaque copy of the scene under it.
 */

const platform = vi.hoisted(() => ({ OS: "ios" }));
vi.mock("react-native", async () => {
  const rn = (await import("../../test/native-hosts")).reactNativeMock();
  return { ...rn, Platform: { ...rn.Platform, get OS() { return platform.OS; } } };
});

type StackProps = { screenOptions: Record<string, unknown>; screenLayout: (a: unknown) => ReactElement };
const captured = vi.hoisted(() => ({ stack: null as unknown, tabs: null as unknown, theme: null as unknown }));
vi.mock("expo-router", async () => {
  const { createElement: h } = await import("react");
  return {
    Stack: (props: unknown) => {
      captured.stack = props;
      return null;
    },
    Tabs: Object.assign(
      (props: { tabBar: (p: unknown) => ReactElement }) => {
        captured.tabs = props;
        const routes = [{ name: "(home)", key: "h" }];
        return props.tabBar({ state: { routes, index: 0 }, navigation: { emit: () => ({}), navigate: () => {} } });
      },
      { Screen: () => null },
    ),
    ThemeProvider: ({ value, children }: { value: unknown; children: unknown }) => {
      captured.theme = value;
      return h("ThemeProvider", null, children as never);
    },
    DefaultTheme: { dark: false, colors: { background: "rgb(242, 242, 242)", card: "white" }, fonts: {} },
  };
});
vi.mock("expo-haptics", () => ({ selectionAsync: async () => {} }));
vi.mock("../../lib/realtime/use-realtime-refresh", () => ({ useRealtimeRefresh: () => {} }));

const nav = (keys: string[]) => ({ getState: () => ({ routes: keys.map((key) => ({ key })) }) });
const page = createElement("View", { testID: "page" });

describe("TabStack over the backdrop", () => {
  async function stack(os: "ios" | "android") {
    platform.OS = os;
    vi.resetModules();
    const { TabStack } = await import("./tab-stack");
    render(<TabStack />);
    return captured.stack as StackProps;
  }

  it("paints no screen background, so the shell's one backdrop shows through", async () => {
    const s = await stack("android");
    expect(s.screenOptions).toMatchObject({ headerShown: false, contentStyle: { backgroundColor: "transparent" }, animation: "none" });
    // Android doesn't slide a screen over another: no copy of the scene anywhere
    expect(s.screenLayout({ route: { key: "b" }, navigation: nav(["a", "b"]), children: page })).toBe(page);
  });

  it("on iOS (the slide), gives a pushed screen its own copy of the scene; the tab's first screen sits on the shell's", async () => {
    const s = await stack("ios");
    const { BackdropProvider } = await import("./backdrop");
    expect(s.screenOptions.animation).toBe("default");
    expect(s.screenLayout({ route: { key: "a" }, navigation: nav(["a", "b"]), children: page })).toBe(page);
    const pushed = render(<BackdropProvider barHeight={70}>{s.screenLayout({ route: { key: "b" }, navigation: nav(["a", "b"]), children: page })}</BackdropProvider>);
    const wrapper = hosts(pushed, "View")[0]!;
    expect(flat(wrapper.props.style)).toMatchObject({ flex: 1 });
    // the scene first, under the page
    expect(wrapper.findAll((n) => typeof n.type === "string" && ["backdrop", "page"].includes(n.props.testID)).map((n) => n.props.testID)).toEqual(["backdrop", "page"]);
  });
});

describe("the tab shell (app/(app)/(tabs)/_layout.tsx)", () => {
  it("draws one backdrop behind the tabs, makes their navigators transparent, and seats the meadow on the bar's laid-out height", async () => {
    platform.OS = "android";
    vi.resetModules();
    const { default: TabsLayout } = await import("../../app/(app)/(tabs)/_layout");
    const { backdropSize } = await import("../../lib/brand/backdrop");
    const { TAB_BAR_HEIGHT } = await import("./bottom-tabs");
    const { windowSize } = await import("../../test/native-hosts");
    const { act } = await import("react-test-renderer");
    const r = render(<TabsLayout />);
    expect(r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "backdrop")).toHaveLength(1);
    expect((captured.theme as { colors: { background: string } }).colors.background).toBe("transparent");
    expect((captured.tabs as { screenOptions: { sceneStyle: unknown } }).screenOptions.sceneStyle).toEqual({ backgroundColor: "transparent" });
    const scene = () => byTestId(r, "backdrop");
    // before the bar lays out: its height at the default text size (no bottom inset here: 4px below)
    let size = backdropSize(windowSize.width, windowSize.height, TAB_BAR_HEIGHT + 4);
    expect(hosts(scene(), "Path").length).toBeGreaterThan(0);
    expect(hosts(scene(), "Svg")[0]!.props.height).toBe(size.rows * 2);
    const first = hosts(scene(), "Path").map((p) => p.props.d).join("");
    // a larger text size: the bar lays out taller and the meadow rises with it
    act(() => byTestId(r, "bottom-nav").props.onLayout({ nativeEvent: { layout: { width: 412, height: 96 } } }));
    size = backdropSize(windowSize.width, windowSize.height, 96);
    const { backdropPaths } = await import("../../lib/brand/backdrop");
    const { RATIO } = await import("../../test/native-hosts");
    const after = hosts(scene(), "Path").map((p) => p.props.d).join("");
    expect(after).not.toBe(first);
    expect(after).toBe(backdropPaths(size, RATIO).map(([, d]) => d).join(""));
  });
});
