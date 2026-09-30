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
  function Probe({ k, v }: { k: string; v?: number }) {
    const { state } = useResource(k, fetcher, { version: v });
    seen.push(state);
    return null;
  }
  return { seen, pending, Probe };
}

describe("useResource", () => {
  it("refreshes the same resource in place: a version bump never flashes the loading state", async () => {
    const h = harness();
    const r = render(<h.Probe k="budgets:2026-09" v={1} />);
    expect(h.seen.at(-1)).toEqual({ status: "loading" });
    await act(async () => h.pending.shift()!({ status: "ready", data: "one" }));
    act(() => r.update(<h.Probe k="budgets:2026-09" v={2} />));
    expect(h.seen.at(-1)).toEqual({ status: "ready", data: "one" });
    await act(async () => h.pending.shift()!({ status: "ready", data: "two" }));
    expect(h.seen.at(-1)).toEqual({ status: "ready", data: "two" });
  });

  it("a new resource (another month) shows the loading state, as the web's navigation shows its loading page", async () => {
    const h = harness();
    const r = render(<h.Probe k="budgets:2026-09" />);
    await act(async () => h.pending.shift()!({ status: "ready", data: "september" }));
    act(() => r.update(<h.Probe k="budgets:2026-10" />));
    expect(h.seen.at(-1)).toEqual({ status: "loading" });
    await act(async () => h.pending.shift()!({ status: "ready", data: "october" }));
    expect(h.seen.at(-1)).toEqual({ status: "ready", data: "october" });
  });

  it("a failed in-place refresh replaces the old data, and a stale answer never overwrites a newer one", async () => {
    const h = harness();
    const r = render(<h.Probe k="x" v={1} />);
    await act(async () => h.pending.shift()!({ status: "ready", data: "a" }));
    act(() => r.update(<h.Probe k="x" v={2} />));
    act(() => r.update(<h.Probe k="x" v={3} />));
    const [older, newer] = [h.pending.shift()!, h.pending.shift()!];
    await act(async () => newer({ status: "error", kind: "unavailable", message: "no" }));
    await act(async () => older({ status: "ready", data: "stale" }));
    expect(h.seen.at(-1)).toMatchObject({ status: "error" });
  });
});
