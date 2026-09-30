import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { byTestId, render, textContent, texts } from "../../test/render";
import type { DeleteOutcome } from "../../lib/account/delete-account";
import type { DeleteScreen } from "../../lib/account/delete-screen";
import { AccountDeletedView } from "./account-deleted-view";
import { DeleteAccountFlow, type DeleteFlowActions } from "./delete-account-flow";

const screen: DeleteScreen = {
  email: "sam@example.com",
  recent: true,
  google: false,
  inProgress: false,
  supportEmail: null,
  billing: false,
  keepsRecords: false,
};

function actions(over: Partial<DeleteFlowActions> = {}): DeleteFlowActions {
  return {
    deleteAccount: vi.fn(async (): Promise<DeleteOutcome> => ({ status: "deleted", storeSubscriptionMayBeActive: false, manageSubscriptionUrl: null })),
    onDeleted: vi.fn(),
    sendReauthLink: vi.fn(async () => ({ sent: true as const })),
    reauthWithGoogle: vi.fn(async () => null),
    onKeep: vi.fn(),
    onConnectedBanks: vi.fn(),
    onSignInAgain: vi.fn(),
    openUrl: vi.fn(),
    deletionPageUrl: null,
    ...over,
  };
}

const has = (r: ReturnType<typeof render>, id: string) => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === id).length > 0;
const stage = (r: ReturnType<typeof render>) => textContent(byTestId(r, "delete-stage"));
const press = async (r: ReturnType<typeof render>, id: string) => {
  await act(async () => {
    byTestId(r, id).props.onPress();
  });
};
const type = (r: ReturnType<typeof render>, text: string) => act(() => byTestId(r, "delete-confirm-word").props.onChangeText(text));

describe("Delete account (web delete-account-flow.tsx)", () => {
  it("explains what's deleted and kept first, with a way to keep the account", async () => {
    const a = actions();
    const r = render(<DeleteAccountFlow screen={screen} step="intro" actions={a} />);
    expect(stage(r)).toBe("Before you go");
    expect(texts(r)).toEqual(expect.arrayContaining(["What's deleted", "What's kept", "Every connected bank, disconnected at Plaid."]));
    expect(textContent(byTestId(r, "delete-kept"))).toBe("Nothing. Your data is deleted right away.");
    expect(has(r, "delete-store-notice")).toBe(false);
    await press(r, "delete-keep");
    expect(a.onKeep).toHaveBeenCalled();
  });

  it("says what's kept, the store notice and a started deletion when they apply", () => {
    const r = render(<DeleteAccountFlow screen={{ ...screen, keepsRecords: true, billing: true, inProgress: true }} step="intro" actions={actions()} />);
    expect(textContent(byTestId(r, "delete-kept"))).toMatch(/^Only if you ever paid/);
    expect(textContent(byTestId(r, "delete-store-notice"))).toContain("does not automatically cancel");
    expect(textContent(byTestId(r, "delete-in-progress"))).toContain("Deletion already started.");
  });

  it("asks for DELETE, then deletes and hands over the store answer", async () => {
    const a = actions({
      deleteAccount: vi.fn(async (): Promise<DeleteOutcome> => ({ status: "deleted", storeSubscriptionMayBeActive: true, manageSubscriptionUrl: null })),
    });
    const r = render(<DeleteAccountFlow screen={screen} step="intro" actions={a} />);
    await press(r, "delete-continue");
    expect(stage(r)).toBe("Last step");
    expect(textContent(byTestId(r, "delete-account-view"))).toContain("the Budgts account for sam@example.com");
    expect(byTestId(r, "delete-submit").props.disabled).toBe(true);
    type(r, " delete ");
    expect(byTestId(r, "delete-submit").props.disabled).toBe(false);
    await press(r, "delete-submit");
    expect(a.deleteAccount).toHaveBeenCalledTimes(1);
    expect(a.onDeleted).toHaveBeenCalledWith(true);
  });

  it("shows the progress with no way back while the server works", async () => {
    let finish!: (o: DeleteOutcome) => void;
    const onBusy = vi.fn();
    const a = actions({ deleteAccount: () => new Promise<DeleteOutcome>((res) => (finish = res)), onBusy });
    const r = render(<DeleteAccountFlow screen={screen} step="confirm" actions={a} />);
    type(r, "DELETE");
    await press(r, "delete-submit");
    expect(stage(r)).toBe("Deleting your account");
    expect(has(r, "delete-deleting")).toBe(true);
    expect(has(r, "page-back")).toBe(false);
    expect(onBusy).toHaveBeenLastCalledWith(true);
    await act(async () => finish({ status: "failed" }));
    expect(onBusy).toHaveBeenLastCalledWith(false);
  });

  it("gives every failure its own words and way out", async () => {
    const run = async (status: Exclude<DeleteOutcome["status"], "deleted" | "reauth_required" | "auth">, over: Partial<DeleteScreen> = {}) => {
      const a = actions({ deleteAccount: vi.fn(async () => ({ status }) as DeleteOutcome) });
      const r = render(<DeleteAccountFlow screen={{ ...screen, ...over }} step="confirm" actions={a} />);
      type(r, "DELETE");
      await press(r, "delete-submit");
      return { r, a };
    };

    const plaid = await run("plaid");
    expect(stage(plaid.r)).toBe("A bank wouldn't disconnect");
    await press(plaid.r, "delete-connected-banks");
    expect(plaid.a.onConnectedBanks).toHaveBeenCalled();
    expect(has(plaid.r, "delete-back-to-settings")).toBe(false);

    const incomplete = await run("incomplete");
    expect(stage(incomplete.r)).toBe("Deletion didn't finish");
    expect(has(incomplete.r, "delete-back-to-settings")).toBe(false);
    await press(incomplete.r, "delete-retry");
    expect(incomplete.a.deleteAccount).toHaveBeenCalledTimes(2);

    const network = await run("network", { supportEmail: "help@budgts.com" });
    expect(stage(network.r)).toBe("Couldn't reach Budgts");
    expect(has(network.r, "delete-back-to-settings")).toBe(true);
    expect(texts(network.r)).toContain("help@budgts.com");

    for (const [status, title] of [
      ["unavailable", "Deletion is unavailable"],
      ["uncertain", "We couldn't confirm it"],
      ["failed", "Something went wrong"],
    ] as const) {
      expect(stage((await run(status)).r)).toBe(title);
    }
  });

  it("asks for a fresh sign-in when the server says the last one is too old, and moves on once it's fresh", async () => {
    const a = actions({ deleteAccount: vi.fn(async (): Promise<DeleteOutcome> => ({ status: "reauth_required" })) });
    const r = render(<DeleteAccountFlow screen={screen} step="confirm" actions={a} />);
    type(r, "DELETE");
    await press(r, "delete-submit");
    expect(stage(r)).toBe("Confirm it's you");
    expect(textContent(byTestId(r, "delete-stale"))).toBe("It's been more than 10 minutes since you signed in. Nothing was deleted.");

    // the state is read again after the fresh sign-in
    act(() => r.update(<DeleteAccountFlow screen={{ ...screen }} step="confirm" actions={a} />));
    expect(stage(r)).toBe("Last step");
  });

  it("offers the email link, and Google when it's linked", async () => {
    const a = actions({ sendReauthLink: vi.fn(async () => ({ sent: false as const, error: "A link was sent a moment ago. Wait a minute, then try again." })) });
    const stale = { ...screen, recent: false };
    const r = render(<DeleteAccountFlow screen={stale} step="intro" actions={a} />);
    await press(r, "delete-continue");
    expect(stage(r)).toBe("Confirm it's you");
    expect(has(r, "delete-google")).toBe(false);
    await press(r, "delete-send-link");
    expect(textContent(byTestId(r, "delete-reauth-error"))).toMatch(/^A link was sent/);

    const ok = actions();
    const sent = render(<DeleteAccountFlow screen={stale} step="confirm" actions={ok} />);
    await press(sent, "delete-send-link");
    expect(textContent(byTestId(sent, "delete-link-sent"))).toContain("We sent a sign-in link to sam@example.com.");

    const g = actions({ reauthWithGoogle: vi.fn(async () => "Google sign-in didn't finish. Please try again.") });
    const withGoogle = render(<DeleteAccountFlow screen={{ ...stale, google: true }} step="confirm" actions={g} />);
    await press(withGoogle, "delete-google");
    expect(g.reauthWithGoogle).toHaveBeenCalled();
    expect(textContent(byTestId(withGoogle, "delete-reauth-error"))).toMatch(/^Google sign-in didn't finish/);
  });

  it("says a lost session deleted nothing, and signs in again", async () => {
    const a = actions({ deleteAccount: vi.fn(async (): Promise<DeleteOutcome> => ({ status: "auth" })), deletionPageUrl: "https://budgts.com/account-deletion" });
    const r = render(<DeleteAccountFlow screen={screen} step="confirm" actions={a} />);
    type(r, "DELETE");
    await press(r, "delete-submit");
    expect(stage(r)).toBe("You've been signed out");
    await press(r, "delete-sign-in-again");
    expect(a.onSignInAgain).toHaveBeenCalled();
    expect(texts(r)).toContain("how deletion works");
  });
});

describe("Account deleted (web /account-deleted)", () => {
  it("confirms, and says nothing more when there's nothing to say", () => {
    const onDone = vi.fn();
    const r = render(<AccountDeletedView store={false} keeps={false} privacyUrl={null} openUrl={() => {}} onDone={onDone} />);
    expect(textContent(byTestId(r, "page-title"))).toContain("Your account is deleted");
    expect(has(r, "account-deleted-store")).toBe(false);
    expect(has(r, "account-deleted-kept")).toBe(false);
    byTestId(r, "account-deleted-done").props.onPress();
    expect(onDone).toHaveBeenCalled();
  });

  it("warns that a store subscription wasn't cancelled, with the stores' pages, and says what's kept", () => {
    const openUrl = vi.fn();
    const r = render(<AccountDeletedView store keeps privacyUrl="https://budgts.com/privacy#deleting-your-data" openUrl={openUrl} onDone={() => {}} />);
    expect(textContent(byTestId(r, "account-deleted-store"))).toContain("To stop being charged, cancel it in the App Store or Google Play.");
    expect(textContent(byTestId(r, "account-deleted-kept"))).toContain("What we keep and why");
    for (const link of r.root.findAll((n) => typeof n.type === "string" && n.props.accessibilityRole === "link")) link.props.onPress();
    expect(openUrl.mock.calls.map((c) => c[0])).toEqual([
      "https://apps.apple.com/account/subscriptions",
      "https://play.google.com/store/account/subscriptions?package=com.budgts.app",
      "https://budgts.com/privacy#deleting-your-data",
    ]);
  });
});
