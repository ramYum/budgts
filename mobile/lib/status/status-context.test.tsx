import { act } from "react-test-renderer";
import { AppState } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../test/render";

const calls = vi.hoisted(() => ({ n: 0 }));
vi.mock("../auth/auth-context", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("../auth/api", () => ({ authFetch: async () => null }));
vi.mock("../api/load", () => ({
  loadResource: async () => {
    calls.n += 1;
    return { status: "ready", data: { needsCategoryCount: calls.n, review: { advisory: null, excluded: null }, deletionInProgress: false } };
  },
}));

const { StatusProvider, useStatus } = await import("./status-context");

describe("StatusProvider", () => {
  it("reloads the header status when the app comes back to the foreground (an event, not a timer)", async () => {
    let listener: ((s: string) => void) | null = null;
    const spy = vi.spyOn(AppState, "addEventListener").mockImplementation(((_: string, l: (s: string) => void) => {
      listener = l;
      return { remove: () => {} };
    }) as never);
    let seen: number | null = null;
    function Probe() {
      seen = useStatus()?.needsCategoryCount ?? null;
      return null;
    }
    await act(async () => {
      render(
        <StatusProvider>
          <Probe />
        </StatusProvider>,
      );
    });
    expect(seen).toBe(1);
    await act(async () => listener!("background"));
    expect(calls.n).toBe(1); // leaving never loads
    await act(async () => listener!("active"));
    expect(seen).toBe(2);
    await act(async () => listener!("active"));
    expect(calls.n).toBe(2); // already active: no second load
    spy.mockRestore();
  });
});
