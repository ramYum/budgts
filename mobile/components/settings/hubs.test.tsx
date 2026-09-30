import { describe, expect, it, vi } from "vitest";
import { byTestId, hosts, render, texts } from "../../test/render";
import { MoreView } from "./more-view";
import { SettingsView } from "./settings-view";

const hub = { goals: 1, accounts: 3, banks: 2, categories: 12, budgets: 6 };

describe("More (web /more)", () => {
  it("lists the web's rows in the web's groups, with the hub counts", () => {
    const r = render(<MoreView hub={hub} go={() => {}} />);
    expect(texts(r).filter((t) => ["Your money", "Banks & settings", "Help"].includes(t)).slice(0, 3)).toEqual(["Your money", "Banks & settings", "Help"]);
    expect(byTestId(r, "hub-goals").props.accessibilityLabel).toBe("Savings goals, 1 goal");
    expect(byTestId(r, "hub-accounts").props.accessibilityLabel).toBe("Accounts, 3");
    expect(byTestId(r, "hub-connected-banks").props.accessibilityLabel).toBe("Connected banks, 2 banks");
    expect(byTestId(r, "hub-about").props.accessibilityLabel).toBe("About Budgts, V1");
  });

  it("goes where the web's links go", () => {
    const go = vi.fn();
    const r = render(<MoreView hub={null} go={go} />);
    hosts(r, "Pressable").find((p) => String(p.props.accessibilityLabel).startsWith("Play welcome guide"))!.props.onPress();
    for (const id of ["hub-goals", "hub-accounts", "hub-insights", "hub-connected-banks", "hub-settings", "hub-help", "hub-about"])
      byTestId(r, id).props.onPress();
    expect(go.mock.calls.map((c) => c[0])).toEqual(["/tour", "/goals", "/accounts", "/insights", "/connected-banks", "/settings", "/help", "/about"]);
  });

  it("shows rows without values while the counts load, and none for banks when bank connections are off", () => {
    expect(byTestId(render(<MoreView hub={null} go={() => {}} />), "hub-goals").props.accessibilityLabel).toBe("Savings goals");
    expect(byTestId(render(<MoreView hub={{ ...hub, banks: null }} go={() => {}} />), "hub-connected-banks").props.accessibilityLabel).toBe("Connected banks");
  });
});

describe("Settings (web /settings)", () => {
  const view = (over: Partial<Parameters<typeof SettingsView>[0]> = {}) => (
    <SettingsView
      email="sam@example.com"
      hub={hub}
      go={() => {}}
      onBack={() => {}}
      onExport={() => {}}
      exporting={false}
      exportError={null}
      onSignOut={() => {}}
      {...over}
    />
  );

  it("reads in the web's phone order and has no plan status", () => {
    const words = texts(render(view()));
    const heads = ["Your account", "Your money", "Connected banks", "App", "Data"];
    expect(words.filter((t) => heads.includes(t)).filter((t, i, a) => a.indexOf(t) === i)).toEqual(heads);
    expect(words.join(" ")).not.toMatch(/subscription|plan|trial|diagnostic/i);
    expect(words).toContain("Sign out");
  });

  it("shows the counts the web shows", () => {
    const r = render(view());
    expect(byTestId(r, "hub-settings-profile").props.accessibilityLabel).toBe("Profile, sam@example.com");
    expect(byTestId(r, "hub-budgets").props.accessibilityLabel).toBe("Budgets, 6 set");
    expect(byTestId(r, "hub-settings-appearance").props.accessibilityLabel).toBe("Appearance, Light");
  });

  it("exports, and says so plainly when it can't", () => {
    const onExport = vi.fn();
    const r = render(view({ onExport, exportError: "Couldn't export your transactions. Check your connection and try again." }));
    hosts(r, "Pressable").find((p) => p.props.accessibilityLabel === "Export")!.props.onPress();
    expect(onExport).toHaveBeenCalled();
    expect(texts(r).some((t) => t.startsWith("Couldn't export"))).toBe(true);
  });
});
