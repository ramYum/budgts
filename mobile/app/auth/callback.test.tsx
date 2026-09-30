import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { byTestId, render } from "../../test/render";

type Outcome = { ok: true; userId?: string } | { ok: false; problem: string };
const h = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  finish: null as ((o: Outcome) => void) | null,
  replace: vi.fn(),
  redirects: [] as unknown[],
}));

vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: unknown }) => {
    h.redirects.push(href);
    return null;
  },
  useGlobalSearchParams: () => ({}),
  useRouter: () => ({ replace: h.replace }),
}));
vi.mock("expo-linking", () => ({ getLinkingURL: () => "budgts://auth/callback?code=c1" }));
vi.mock("../../components/loading-screen", () => ({ useLoadingScreen: () => {} }));
vi.mock("../../lib/auth/auth-context", () => ({ useAuth: () => ({ session: h.session }) }));
vi.mock("../../lib/auth/complete-session-from-url", () => ({
  completeSessionFromUrl: () => new Promise<Outcome>((resolve) => (h.finish = resolve)),
}));

const { default: AuthCallbackScreen } = await import("./callback");
const guard = await import("../../lib/auth/reauth-guard");
const intent = await import("../../lib/auth/return-intent");

const CONFIRM = "/settings/delete-account?step=confirm";
const answer = (o: Outcome) =>
  act(async () => {
    h.finish!(o);
  });
const lastRedirect = () => h.redirects[h.redirects.length - 1];

beforeEach(() => {
  guard.resetReauthGuard();
  intent.resetReturnIntent();
  h.session = { user: { id: "alice" } };
  h.replace.mockReset();
  h.redirects = [];
});

describe("app/auth/callback.tsx", () => {
  it("decides once: the re-sign-in returns to confirm, and a later render never takes the intent again", async () => {
    await intent.returnAfterSignIn(CONFIRM, "alice");
    const take = vi.spyOn(intent, "takeReturnAfterSignIn");
    const r = render(<AuthCallbackScreen />);
    expect(h.redirects).toEqual([]); // waiting for the answer
    await answer({ ok: true, userId: "alice" });
    expect(lastRedirect()).toBe(CONFIRM);
    h.session = { user: { id: "alice" } }; // a token refresh swaps the session object
    act(() => r.update(<AuthCallbackScreen />));
    expect(lastRedirect()).toBe(CONFIRM);
    expect(take).toHaveBeenCalledTimes(1);
    take.mockRestore();
  });

  it("a refused account: waits for the sign-out, then hands sign-in the reason (and spends the guard's copy)", async () => {
    await guard.expectReauthAs("alice");
    guard.reauthVerdict("SIGNED_IN", "bob");
    const r = render(<AuthCallbackScreen />);
    await answer({ ok: true, userId: "bob" });
    expect(h.redirects).toEqual([]); // alice's session is still on screen while the phone signs out
    h.session = null;
    act(() => r.update(<AuthCallbackScreen />));
    expect(lastRedirect()).toEqual({ pathname: "/sign-in", params: { problem: "other_account" } });
    expect(guard.takeSignInProblem()).toBeNull();
  });

  it("a signed-in failure changes nothing and offers the way back", async () => {
    await intent.returnAfterSignIn(CONFIRM, "alice");
    const r = render(<AuthCallbackScreen />);
    await answer({ ok: false, problem: "expired" });
    expect(h.redirects).toEqual([]);
    byTestId(r, "link-problem-back").props.onPress();
    expect(h.replace).toHaveBeenCalledWith(CONFIRM);
  });

  it("signed out, a failure goes to sign-in with its problem, as before", async () => {
    h.session = null;
    render(<AuthCallbackScreen />);
    await answer({ ok: false, problem: "expired" });
    expect(lastRedirect()).toEqual({ pathname: "/sign-in", params: { problem: "expired" } });
  });
});
