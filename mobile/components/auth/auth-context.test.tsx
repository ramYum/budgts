import { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../../test/render";

type Listener = (event: string, session: { user: { id: string } } | null) => void;
const h = vi.hoisted(() => ({
  listener: null as Listener | null,
  stored: "alice" as string | null,
  signOut: vi.fn(async (_opts?: unknown): Promise<{ error: unknown }> => ({ error: null })),
  disk: new Map<string, string>(),
  gate: null as Promise<void> | null,
  history: [] as (string | null)[],
}));

vi.mock("../../lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => {
        if (h.gate) await h.gate;
        return { data: { session: h.stored ? { user: { id: h.stored } } : null } };
      },
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
  h.history.push(seen);
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
  h.gate = null;
  h.history = [];
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

  it("Y-a: offline, the sign-out still removes the session locally: that's a sign-out, not a failure", async () => {
    await mount();
    await expectReauthAs("alice");
    // auth-js removes the stored session and emits SIGNED_OUT, then reports /logout's network error
    h.signOut.mockImplementation(async () => {
      h.stored = null;
      h.listener!("SIGNED_OUT", null);
      return { error: new Error("network") };
    });
    fire("SIGNED_IN", "bob");
    await flush();
    expect(seen).toBeNull();
    expect(refusalOf("bob")).toBe("other_account");
    expect(takeSignInProblem()).toBe("other_account");
  });

  it("G2: a sign-out that leaves the session on the phone shows nobody and says so", async () => {
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

  it("Y-b: a launch refusal's completed sign-out ends the re-sign-in on disk too, so B signing in on purpose stays", async () => {
    await expectReauthAs("alice");
    resetReauthGuard();
    h.stored = "bob";
    // as auth-js does: the stored session goes and SIGNED_OUT is emitted inside signOut
    h.signOut.mockImplementation(async () => {
      h.stored = null;
      h.listener!("SIGNED_OUT", null);
      return { error: null };
    });
    const first = await mount();
    expect(seen).toBeNull();
    expect(h.disk.has("budgts.reauth-expected")).toBe(false);
    act(() => first.unmount());

    // bob signs in on purpose, then the app is relaunched within the hour
    resetReauthGuard();
    h.stored = "bob";
    h.signOut.mockClear();
    await mount();
    expect(seen).toBe("bob");
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it("G-a: no auth event reaches the screen before the launch check has run", async () => {
    await expectReauthAs("alice");
    resetReauthGuard();
    h.stored = "bob";
    let open!: () => void;
    h.gate = new Promise<void>((r) => (open = r));
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    fire("TOKEN_REFRESHED", "bob"); // a startup refresh of the stored session, before the launch check
    fire("SIGNED_IN", "bob");
    open();
    await flush();
    expect(h.history).not.toContain("bob");
    expect(seen).toBeNull();
    expect(takeSignInProblem()).toBe("other_account");
  });

  it("an ordinary launch (nothing stored) is untouched", async () => {
    h.stored = "bob";
    await mount();
    expect(seen).toBe("bob");
    expect(h.signOut).not.toHaveBeenCalled();
  });
});
