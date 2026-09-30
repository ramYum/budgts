import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../test/render";
import type { LoadState } from "./load";
import { useResource } from "./use-resource";

vi.mock("../auth/auth-context", () => ({ useAuth: () => ({ session: null }) }));

type Settled = Exclude<LoadState<string>, { status: "loading" }>;

function harness() {
  const seen: LoadState<string>[] = [];
  const pending: ((s: Settled) => void)[] = [];
  const fetcher = () => new Promise<Settled>((resolve) => pending.push(resolve));
  function Probe({ k }: { k: string }) {
    const { state } = useResource(k, fetcher);
    seen.push(state);
    return null;
  }
  return { seen, pending, Probe };
}

describe("useResource", () => {
  it("shows loading only on the first load, then reloads a new key in place", async () => {
    const h = harness();
    const r = render(<h.Probe k="v1" />);
    expect(h.seen.at(-1)).toEqual({ status: "loading" });
    await act(async () => h.pending.shift()!({ status: "ready", data: "one" }));
    expect(h.seen.at(-1)).toEqual({ status: "ready", data: "one" });
    act(() => r.update(<h.Probe k="v2" />));
    expect(h.seen.at(-1)).toEqual({ status: "ready", data: "one" }); // no skeleton flash on a version bump
    await act(async () => h.pending.shift()!({ status: "ready", data: "two" }));
    expect(h.seen.at(-1)).toEqual({ status: "ready", data: "two" });
  });

  it("a failed reload replaces the old data, never showing another key's numbers", async () => {
    const h = harness();
    const r = render(<h.Probe k="2026-09" />);
    await act(async () => h.pending.shift()!({ status: "ready", data: "september" }));
    act(() => r.update(<h.Probe k="2026-10" />));
    await act(async () => h.pending.shift()!({ status: "error", kind: "network", message: "offline" }));
    expect(h.seen.at(-1)).toMatchObject({ status: "error", kind: "network" });
  });
});
