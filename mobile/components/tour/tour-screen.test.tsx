import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TourStepId } from "../../lib/tour/shared";
import { byTestId, render } from "../../test/render";
import TourScreen from "../../app/(app)/tour";

/**
 * The tour screen's exits (app/(app)/tour.tsx) with the router, the profile and the cards mocked: how the guide leaves
 * depends on whether it was already seen when it opened (a replay sits over the tabs; the first run replaced Get Started).
 */

const h = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), dismissTo: vi.fn(), back: vi.fn(), canGoBack: () => true },
  seen: false,
  rerender: new Set<() => void>(),
  stepIds: ["money-left", "done"] as TourStepId[],
}));

vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { useRouter: () => h.router, useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]) };
});
vi.mock("react-native", async () => ({
  ...(await import("../../test/native-hosts")).reactNativeMock(),
  BackHandler: { addEventListener: () => ({ remove: () => {} }) },
}));
vi.mock("@react-native-community/netinfo", () => ({ default: { addEventListener: () => () => {} } }));
vi.mock("../loading-screen", () => ({ useLoadingScreen: () => {} }));
vi.mock("../banks/connect-bank", () => ({ ConnectBank: () => null }));
// the network layer (and the Supabase client under it) never loads: the cards come from the mocked useResource
vi.mock("../../lib/auth/api", () => ({ authFetch: async () => new Response("{}"), NotAuthenticatedError: class extends Error {} }));
vi.mock("../../lib/auth/auth-context", () => ({ useAuth: () => ({ session: null, signOut: async () => {} }) }));
vi.mock("../../lib/api/use-resource", () => ({
  useResource: () => ({
    state: { status: "ready", data: { stepIds: h.stepIds, offset: 0, totalVisible: h.stepIds.length, currency: "USD", accounts: [], seen: h.seen } },
    reload: async () => {},
  }),
}));
vi.mock("../../lib/profile/profile-context", async () => {
  const { useEffect, useReducer } = await import("react");
  return {
    useProfile: () => {
      const [, force] = useReducer((n: number) => n + 1, 0);
      useEffect(() => {
        h.rerender.add(force);
        return () => void h.rerender.delete(force);
      }, []);
      return {
        state: { status: "ready", profile: { tourSeen: h.seen } },
        justOnboarded: false,
        // the server stamps the guide seen, and the profile follows
        completeTour: async () => {
          h.seen = true;
          for (const f of h.rerender) f();
          return { status: "done" };
        },
      };
    },
  };
});

beforeEach(() => {
  for (const fn of [h.router.push, h.router.replace, h.router.dismissTo]) fn.mockClear();
});

const open = (seen: boolean) => {
  h.seen = seen;
  return render(<TourScreen />);
};
const press = async (r: ReturnType<typeof render>, id: string) => act(async () => byTestId(r, id).props.onPress());

describe("the tour screen's exits", () => {
  it("first run: Skip replaces the guide with Home", async () => {
    const r = open(false);
    await press(r, "tour-skip");
    expect(h.router.replace).toHaveBeenCalledWith("/");
    expect(h.router.dismissTo).not.toHaveBeenCalled();
  });

  it("first run: the last card replaces the guide with Home; How it works opens above the guide", async () => {
    const r = open(false);
    await press(r, "tour-primary");
    await press(r, "tour-how-it-works");
    expect(h.router.push).toHaveBeenCalledWith("/guide/how-it-works");
    await press(r, "tour-primary");
    expect(h.router.replace).toHaveBeenCalledWith("/");
  });

  it("replay: Skip goes back into the tabs, never a second set", async () => {
    const r = open(true);
    await press(r, "tour-skip");
    expect(h.router.dismissTo).toHaveBeenCalledWith("/");
    expect(h.router.replace).not.toHaveBeenCalled();
  });

  it("replay: the last card goes back into the tabs, and How it works opens Help's page there", async () => {
    const r = open(true);
    await press(r, "tour-primary");
    await press(r, "tour-how-it-works");
    expect(h.router.dismissTo).toHaveBeenCalledWith("/help/how-it-works");
    await press(r, "tour-primary");
    expect(h.router.dismissTo).toHaveBeenLastCalledWith("/");
    expect(h.router.push).not.toHaveBeenCalled();
    expect(h.router.replace).not.toHaveBeenCalled();
  });
});
