import { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../../test/render";

type Listener = (event: string, session: { user: { id: string } } | null) => void;
const h = vi.hoisted(() => ({ listener: null as Listener | null, signOut: vi.fn(async (_opts?: unknown) => ({ error: null })) }));

vi.mock("../../lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "alice" } } } }),
      onAuthStateChange: (fn: Listener) => {
        h.listener = fn;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: h.signOut,
    },
  },
}));

const { AuthProvider, useAuth } = await import("../../lib/auth/auth-context");
const { expectReauthAs, resetReauthGuard, takeSignInProblem } = await import("../../lib/auth/reauth-guard");

let seen: string | null | undefined;
function Probe() {
  seen = useAuth().session?.user.id ?? null;
  return null;
}

async function mount() {
  const r = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await act(async () => {});
  return r;
}

const fire = (event: string, id: string | null) => act(() => h.listener!(event, id ? { user: { id } } : null));

beforeEach(() => {
  resetReauthGuard();
  h.signOut.mockClear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("AuthProvider and a re-sign-in", () => {
  it("a re-sign-in as the same account goes through", async () => {
    await mount();
    expect(seen).toBe("alice");
    expectReauthAs("alice");
    fire("SIGNED_IN", "alice");
    expect(seen).toBe("alice");
    await act(async () => {
      vi.runAllTimers();
    });
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it("a re-sign-in as another account is never shown: this phone signs out, locally, and sign-in gets the reason", async () => {
    await mount();
    expectReauthAs("alice");
    fire("SIGNED_IN", "bob");
    expect(seen).toBe("alice"); // bob's session never reaches a screen
    await act(async () => {
      vi.runAllTimers();
    });
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" });
    fire("SIGNED_OUT", null);
    expect(seen).toBeNull();
    expect(takeSignInProblem()).toBe("other_account");
  });

  it("an ordinary sign-in (no re-sign-in under way) is untouched", async () => {
    await mount();
    fire("SIGNED_OUT", null);
    fire("SIGNED_IN", "bob");
    expect(seen).toBe("bob");
    await act(async () => {
      vi.runAllTimers();
    });
    expect(h.signOut).not.toHaveBeenCalled();
  });
});
