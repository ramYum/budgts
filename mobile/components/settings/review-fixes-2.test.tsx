import { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announcements } from "../../test/native-hosts";
import { byTestId, flat, render } from "../../test/render";
import type { DeleteOutcome } from "../../lib/account/delete-account";
import type { DeleteScreen } from "../../lib/account/delete-screen";

const h = vi.hoisted(() => ({ fetches: [] as string[], focus: null as null | (() => void), hubDown: false }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    // runs on mount as the real one does (a focused screen), and keeps the callback so a test can refocus
    useFocusEffect: (cb: () => void) => {
      h.focus = cb;
      useEffect(() => cb(), [cb]);
    },
  };
});
vi.mock("../../lib/auth/auth-context", () => ({ useAuth: () => ({ session: { access_token: "t", user: { id: "u" } } }) }));
vi.mock("../../lib/auth/api", () => ({
  NotAuthenticatedError: class extends Error {},
  authFetch: async (path: string, _s: unknown, init?: RequestInit) => {
    h.fetches.push(`${init?.method ?? "GET"} ${path}`);
    if (path === "/api/mobile/hub" && h.hubDown) throw new TypeError("Network request failed");
    if (path === "/api/mobile/hub") return new Response(JSON.stringify({ goals: 1, accounts: 1, banks: 0, categories: 3, budgets: 0 }), { status: 200 });
    if (path === "/api/mobile/settings/categories") return new Response(JSON.stringify({ version: 1, month: "2026-09", categories: [] }), { status: 200 });
    return new Response(JSON.stringify({ id: "new", name: "Pets" }), { status: 201 });
  },
}));

const RN = await import("react-native");
const { useHub } = await import("../../lib/status/use-hub");
const { useCategoriesScreen } = await import("../../lib/categories/use-category-settings");
const { CopyButton } = await import("./copy-button");
const { DeleteAccountFlow } = await import("./delete-account-flow");
const { HelpView } = await import("./help-view");

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
const count = (entry: string) => h.fetches.filter((p) => p === entry).length;

beforeEach(() => {
  h.fetches = [];
  announcements.length = 0;
});
afterEach(() => {
  (RN.Platform as { OS: string }).OS = "android";
});

describe("1: the FAQ rows are the web's 56pt, with a 44pt+ target", () => {
  it("outer 12 + inner 4 around a 24px line, and a hitSlop that reaches the row's edges", () => {
    const r = render(<HelpView onBack={() => {}} go={() => {}} />);
    const button = byTestId(r, "help-faq-1");
    const s = flat(button.props.style);
    const outer = flat(byTestId(r, "help-faq-1-row").props.style);
    expect(s.minHeight).toBeUndefined();
    expect(s.paddingVertical).toBe(4);
    expect(outer.paddingVertical).toBe(12);
    expect(2 * (outer.paddingVertical as number) + 2 * (s.paddingVertical as number) + 24).toBe(56);
    const slop = button.props.hitSlop as { top: number; bottom: number };
    expect(slop).toEqual({ top: 12, bottom: 12 });
    expect(2 * (s.paddingVertical as number) + 24 + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
  });

  it("the answer keeps the web's pt-2 pb-1", () => {
    const r = render(<HelpView onBack={() => {}} go={() => {}} />);
    expect(flat(byTestId(r, "help-faq-0-answer").props.style)).toMatchObject({ paddingTop: 8, paddingBottom: 4 });
  });
});

const screen: DeleteScreen = { email: "s@x.co", recent: true, google: false, inProgress: false, supportEmail: null, billing: false, keepsRecords: false };
const flow = (onStage?: () => void) => (
  <DeleteAccountFlow
    screen={screen}
    step="intro"
    actions={{
      deleteAccount: async (): Promise<DeleteOutcome> => ({ status: "failed" }),
      onDeleted: () => {},
      sendReauthLink: async () => ({ sent: true }),
      reauthWithGoogle: async () => null,
      onKeep: () => {},
      onConnectedBanks: () => {},
      onSignInAgain: () => {},
      openUrl: () => {},
      deletionPageUrl: null,
      onStage,
    }}
  />
);

describe("2: one announcement mechanism per platform", () => {
  it("Android: the live regions speak; nothing is announced on top", async () => {
    const r = render(flow());
    await act(async () => byTestId(r, "delete-continue").props.onPress());
    expect(announcements).toEqual([]);
    expect(byTestId(r, "delete-stage").props.accessibilityLiveRegion).toBe("polite");

    const c = render(<CopyButton value="a" label="Copy" copy={async () => {}} />);
    await act(async () => byTestId(c, "copy-button").props.onPress());
    expect(announcements).toEqual([]);
    expect(c.root.findAll((n) => typeof n.type === "string" && n.props.accessibilityLiveRegion === "polite")).toHaveLength(1);
  });

  it("iOS (VoiceOver ignores live regions): announced once each", async () => {
    (RN.Platform as { OS: string }).OS = "ios";
    const r = render(flow());
    expect(announcements).toEqual([]);
    await act(async () => byTestId(r, "delete-continue").props.onPress());
    expect(announcements).toEqual(["Last step"]);

    const c = render(<CopyButton value="a" label="Copy" copy={async () => {}} />);
    await act(async () => byTestId(c, "copy-button").props.onPress());
    expect(announcements).toEqual(["Last step", "Copied"]);
  });
});

describe("3: a category write reads the list once, without the pull spinner", () => {
  it("one GET per write, refreshing stays off", async () => {
    let api!: ReturnType<typeof useCategoriesScreen>;
    function Probe() {
      api = useCategoriesScreen();
      return null;
    }
    render(<Probe />);
    await settle();
    const before = count("GET /api/mobile/settings/categories");
    const spinner: boolean[] = [];
    await act(async () => {
      const p = api.writes.create({ name: "Pets", kind: "expense", color: "#8b5cf6" }, "11111111-1111-4111-8111-111111111111");
      spinner.push(api.refreshing);
      await p;
    });
    await settle();
    spinner.push(api.refreshing);
    expect(count("POST /api/mobile/categories")).toBe(1);
    expect(count("GET /api/mobile/settings/categories") - before).toBe(1);
    expect(spinner).toEqual([false, false]);
  });
});

describe("4: the deletion flow tells the screen when its stage changes", () => {
  it("so a stale link error clears (not on the first render)", async () => {
    const onStage = vi.fn();
    const r = render(flow(onStage));
    expect(onStage).not.toHaveBeenCalled();
    await act(async () => byTestId(r, "delete-continue").props.onPress());
    expect(onStage).toHaveBeenCalledTimes(1);
  });
});

describe("5: the hub counts are fresh on every visit", () => {
  it("a refocus reloads once; the first mount loads once", async () => {
    function Hub() {
      useHub();
      return null;
    }
    render(<Hub />);
    await settle();
    expect(count("GET /api/mobile/hub")).toBe(1);
    act(() => h.focus!());
    await settle();
    expect(count("GET /api/mobile/hub")).toBe(2);
  });

  it("a revisit read that fails keeps the counts and hands on the notice (the hubs' <Screen notice>)", async () => {
    let hub: ReturnType<typeof useHub> | null = null;
    function Hub() {
      hub = useHub();
      return null;
    }
    render(<Hub />);
    await settle();
    expect(hub!.notice).toBeNull();
    h.hubDown = true;
    act(() => h.focus!());
    await settle();
    h.hubDown = false;
    expect(hub!.hub?.categories).toBe(3);
    expect(hub!.notice).toBe("Couldn't reach Budgts. Check your connection and try again.");
    await act(async () => hub!.refresh());
    expect(hub!.notice).toBeNull();
  });
});

describe("4: a mailto that can't open says where to write", () => {
  it("names the address", async () => {
    const { mailAppFailed } = await import("../../lib/open-in-browser");
    expect(mailAppFailed("support@budgts.com")).toBe("Couldn't open your email app. Write to support@budgts.com.");
  });
});
