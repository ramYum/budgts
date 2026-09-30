import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { announcements } from "../../test/native-hosts";
import { byTestId, flat, render, textContent } from "../../test/render";
import type { DeleteOutcome } from "../../lib/account/delete-account";
import type { DeleteScreen } from "../../lib/account/delete-screen";

const h = vi.hoisted(() => ({ fetches: [] as string[] }));
vi.mock("../../lib/auth/auth-context", () => ({ useAuth: () => ({ session: { access_token: "t", user: { id: "u" } } }) }));
vi.mock("../../lib/auth/api", () => ({
  authFetch: async (path: string) => {
    h.fetches.push(path);
    const body =
      path === "/api/mobile/hub"
        ? { goals: 1, accounts: 1, banks: 0, categories: 3, budgets: 0 }
        : { version: 1, month: "2026-09", categories: [] };
    return new Response(JSON.stringify(body), { status: 200 });
  },
}));

const { invalidate } = await import("../../lib/api/invalidate");
const { useHub } = await import("../../lib/status/use-hub");
const { useCategorySettings } = await import("../../lib/categories/use-category-settings");
const { CopyButton } = await import("./copy-button");
const { DeleteAccountFlow } = await import("./delete-account-flow");
const { HelpView } = await import("./help-view");
const { SettingsView } = await import("./settings-view");
const { AboutView } = await import("./about-view");
const { AccountDeletedView } = await import("./account-deleted-view");
const { openInBrowser, LINK_FAILED } = await import("../../lib/open-in-browser");

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
const count = (path: string) => h.fetches.filter((p) => p === path).length;

beforeEach(() => {
  h.fetches = [];
  announcements.length = 0;
});

describe("Y1: the hub counts follow every topic they count", () => {
  function Hub() {
    useHub();
    return null;
  }
  it("reloads after a goal, budget, account or category (transactions) change", async () => {
    render(<Hub />);
    await settle();
    const before = count("/api/mobile/hub");
    for (const topic of ["goals", "budgets", "accounts", "transactions"] as const) {
      act(() => invalidate(topic));
      await settle();
    }
    expect(count("/api/mobile/hub") - before).toBe(4);
  });
});

describe("Y2: Categories' counts follow transactions", () => {
  function Cats() {
    useCategorySettings();
    return null;
  }
  it("re-reads when transactions change", async () => {
    render(<Cats />);
    await settle();
    const before = count("/api/mobile/settings/categories");
    act(() => invalidate("transactions"));
    await settle();
    expect(count("/api/mobile/settings/categories") - before).toBe(1);
  });
});

const screen: DeleteScreen = { email: "s@x.co", recent: true, google: false, inProgress: false, supportEmail: null, billing: false, keepsRecords: false };

describe("Y3: VoiceOver hears where the flow went, and a copy", () => {
  it("announces each deletion stage change, not the first render", async () => {
    const r = render(
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
        }}
      />,
    );
    expect(announcements).toEqual([]);
    await act(async () => byTestId(r, "delete-continue").props.onPress());
    expect(announcements).toEqual(["Last step"]);
  });

  it("announces Copied after a copy", async () => {
    const r = render(<CopyButton value="a" label="Copy email" copy={async () => {}} />);
    await act(async () => byTestId(r, "copy-button").props.onPress());
    expect(announcements).toEqual(["Copied"]);
    expect(textContent(byTestId(r, "copy-button-copied"))).toBe("Copied"); // G5: the id is on the Badge
  });
});

describe("Y4: each FAQ toggle is a 44pt target", () => {
  it("the pressable row itself is at least 44 tall", () => {
    const r = render(<HelpView onBack={() => {}} go={() => {}} />);
    const s = flat(byTestId(r, "help-faq-1").props.style);
    expect((s.minHeight as number) ?? 0).toBeGreaterThanOrEqual(44);
  });
});

describe("G2, G4: form messages and the DELETE label", () => {
  it("the export error reads as the other form errors (small, negative)", () => {
    const r = render(
      <SettingsView email="e" hub={null} go={() => {}} onBack={() => {}} onExport={() => {}} exporting={false} exportError="Couldn't export." onSignOut={() => {}} />,
    );
    const err = byTestId(r, "settings-export-error");
    expect(err.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ fontSize: 14, lineHeight: 20 })]));
  });

  it("bolds DELETE in the label and keeps a plain spoken label", async () => {
    const r = render(
      <DeleteAccountFlow
        screen={screen}
        step="confirm"
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
        }}
      />,
    );
    const input = byTestId(r, "delete-confirm-word");
    expect(input.props.accessibilityLabel).toBe("Type DELETE to confirm");
    const bold = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "delete-confirm-word-strong");
    expect(bold).toHaveLength(1);
    expect(textContent(bold[0]!)).toBe("DELETE");
  });
});

describe("G8: a page that won't open says so", () => {
  it("openInBrowser reports a failure in words, never throws", async () => {
    expect(await openInBrowser("https://budgts.com/privacy", async () => ({}))).toBeNull();
    expect(await openInBrowser("https://budgts.com/privacy", async () => Promise.reject(new Error("no browser")))).toBe(LINK_FAILED);
  });

  it("About and Account deleted show the message", () => {
    const about = render(<AboutView onBack={() => {}} legal={[]} onOpen={() => {}} linkError={LINK_FAILED} />);
    expect(textContent(byTestId(about, "link-error"))).toBe(LINK_FAILED);
    const deleted = render(<AccountDeletedView store={false} keeps={false} privacyUrl={null} openUrl={() => {}} onDone={() => {}} linkError={LINK_FAILED} />);
    expect(textContent(byTestId(deleted, "link-error"))).toBe(LINK_FAILED);
  });
});
