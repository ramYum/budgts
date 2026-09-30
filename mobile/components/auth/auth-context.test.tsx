import { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../../test/render";

type Listener = (event: string, session: { user: { id: string } } | null) => void;
const h = vi.hoisted(() => ({
  listener: null as Listener | null,
  stored: "alice" as string | null,
  signOut: vi.fn(async (_opts?: unknown): Promise<{ error: unknown }> => ({ error: null })),
  disk: new Map<string, string>(),
}));

vi.mock("../../lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: h.stored ? { user: { id: h.stored } } : null } }),
      onAuthStateChange: (fn: Listener) => {
        h.listener = fn;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: h.signOut,
    },
  },
}));
vi.mock("../../lib/auth/secure-kv", () => ({
  secureKv: {
    getItem: async (k: string) => h.disk.get(k) ?? null,
    setItem: async (k: string, v: string) => void h.disk.set(k, v),
    removeItem: async (k: string) => void h.disk.delete(k),
  },
}));

const { AuthProvider, useAuth } = await import("../../lib/auth/auth-context");
const { expectReauthAs, resetReauthGuard, takeSignInProblem, refusalOf } = await import("../../lib/auth/reauth-guard");
const { resetReturnIntent, returnAfterSignIn, takeReturnAfterSignIn } = await import("../../lib/auth/return-intent");

let seen: string | null | undefined;
let loading: boolean | undefined;
function Probe() {
  const auth = useAuth();
  seen = auth.session?.user.id ?? null;
  loading = auth.loading;
  return null;
}

async function mount() {
  const r = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  return r;
}

const fire = (event: string, id: string | null) => act(() => h.listener!(event, id ? { user: { id } } : null));
const flush = () =>
  act(async () => {
    await vi.runAllTimersAsync();
  });

beforeEach(() => {
  resetReauthGuard();
  resetReturnIntent();
  h.disk.clear();
  h.stored = "alice";
  h.signOut.mockReset();
  h.signOut.mockImplementation(async () => ({ error: null }));
  seen = undefined;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("AuthProvider and a re-sign-in", () => {
  it("a re-sign-in as the same account goes through", async () => {
    await mount();
    expect(seen).toBe("alice");
    await expectReauthAs("alice");
    fire("SIGNED_IN", "alice");
    expect(seen).toBe("alice");
    await flush();
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it("a re-sign-in as another account is never shown: this phone signs out, locally, and sign-in gets the reason", async () => {
    await mount();
    await expectReauthAs("alice");
    fire("SIGNED_IN", "bob");
    expect(seen).toBe("alice"); // bob's session never reaches a screen
    await flush();
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
    fire("SIGNED_OUT", null);
    expect(seen).toBeNull();
    expect(takeSignInProblem()).toBe("other_account");
  });

  it("G2: a failed sign-out of the refused session shows nobody and says so", async () => {
    h.signOut.mockImplementation(async () => ({ error: new Error("storage") }));
    await mount();
    await expectReauthAs("alice");
    fire("SIGNED_IN", "bob");
    await flush();
    expect(seen).toBeNull();
    expect(refusalOf("bob")).toBe("sign_out_failed");
    expect(takeSignInProblem()).toBe("sign_out_failed");
  });

  it("an ordinary sign-in (no re-sign-in under way) is untouched", async () => {
    await mount();
    fire("SIGNED_OUT", null);
    fire("SIGNED_IN", "bob");
    expect(seen).toBe("bob");
    await flush();
    expect(h.signOut).not.toHaveBeenCalled();
  });
});

describe("Y1: the launch after a process killed mid re-sign-in", () => {
  it("never shows a stored session for another account: signs out locally before the first screen, with the reason", async () => {
    await expectReauthAs("alice"); // then the process died with bob's session already saved
    resetReauthGuard();
    h.stored = "bob";
    await mount();
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(seen).toBeNull();
    expect(loading).toBe(false);
    expect(takeSignInProblem()).toBe("other_account");
  });

  it("shows the same account, and brings back the return intent the email link needs", async () => {
    await expectReauthAs("alice");
    await returnAfterSignIn("/settings/delete-account?step=confirm", "alice");
    resetReauthGuard();
    resetReturnIntent();
    await mount();
    expect(seen).toBe("alice");
    expect(h.signOut).not.toHaveBeenCalled();
    expect(takeReturnAfterSignIn("alice")).toBe("/settings/delete-account?step=confirm");
  });

  it("an ordinary launch (nothing stored) is untouched", async () => {
    h.stored = "bob";
    await mount();
    expect(seen).toBe("bob");
    expect(h.signOut).not.toHaveBeenCalled();
  });
});
