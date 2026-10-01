import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../test/render";
import type { LoadState } from "./load";
import { useResource } from "./use-resource";

vi.mock("../auth/auth-context", () => ({ useAuth: () => ({ session: null }) }));

type Settled = Exclude<LoadState<string>, { status: "loading" }>;

function harness() {
  const seen: LoadState<string>[] = [];
  const flags: boolean[] = [];
  const pending: ((s: Settled) => void)[] = [];
  const fetcher = () => new Promise<Settled>((resolve) => pending.push(resolve));
  let latest!: ReturnType<typeof useResource<string>>;
  function Probe({ k, v }: { k: string; v?: number }) {
    latest = useResource(k, fetcher, { version: v });
    seen.push(latest.state);
    flags.push(latest.refreshing);
    return null;
  }
  return { seen, flags, pending, Probe, last: () => latest };
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

  it("a failed version reload keeps the figures and reports a notice; a stale answer never overwrites a newer one", async () => {
    const h = harness();
    const r = render(<h.Probe k="x" v={1} />);
    await act(async () => h.pending.shift()!({ status: "ready", data: "a" }));
    act(() => r.update(<h.Probe k="x" v={2} />));
    act(() => r.update(<h.Probe k="x" v={3} />));
    const [older, newer] = [h.pending.shift()!, h.pending.shift()!];
    await act(async () => newer({ status: "error", kind: "unavailable", message: "no" }));
    await act(async () => older({ status: "ready", data: "stale" }));
    expect(h.seen.at(-1)).toEqual({ status: "ready", data: "a" });
    expect(h.last().notice).toBe("no");
    expect(h.flags).not.toContain(true); // a version reload never shows the pull indicator
    act(() => r.update(<h.Probe k="x" v={4} />));
    await act(async () => h.pending.shift()!({ status: "ready", data: "b" }));
    expect(h.seen.at(-1)).toEqual({ status: "ready", data: "b" });
    expect(h.last().notice).toBeNull();
  });

  it("a failed first load or new key is the failure state (never another key's numbers)", async () => {
    const h = harness();
    const r = render(<h.Probe k="m:09" />);
    await act(async () => h.pending.shift()!({ status: "ready", data: "september" }));
    act(() => r.update(<h.Probe k="m:10" />));
    await act(async () => h.pending.shift()!({ status: "error", kind: "unavailable", message: "no" }));
    expect(h.seen.at(-1)).toMatchObject({ status: "error" });
  });

  it("one warning for one failure: a read already showing its failure gets no notice when a silent reload or pull fails too", async () => {
    const h = harness();
    const r = render(<h.Probe k="activity" v={1} />);
    const fail: Settled = { status: "error", kind: "network", message: "Couldn't reach Budgts." };
    await act(async () => h.pending.shift()!(fail));
    expect(h.last().state).toEqual(fail);
    act(() => r.update(<h.Probe k="activity" v={2} />)); // a save or a sync while the failure is on screen
    await act(async () => h.pending.shift()!(fail));
    expect(h.last().state).toEqual(fail);
    expect(h.last().notice).toBeNull(); // the failure state already says it
    await act(async () => void h.last().refresh());
    await act(async () => h.pending.shift()!(fail));
    expect(h.last().notice).toBeNull();
    await act(async () => void h.last().refresh()); // and once it recovers, all clear
    await act(async () => h.pending.shift()!({ status: "ready", data: "back" }));
    expect(h.last().state).toEqual({ status: "ready", data: "back" });
    expect(h.last().notice).toBeNull();
  });

  it("refreshing is only the user's pull, and it ends even when a newer request wins", async () => {
    const h = harness();
    const r = render(<h.Probe k="x" v={1} />);
    await act(async () => h.pending.shift()!({ status: "ready", data: "a" }));
    act(() => void h.last().refresh());
    expect(h.last().refreshing).toBe(true);
    act(() => r.update(<h.Probe k="x" v={2} />)); // a realtime bump lands mid-pull
    const [pull, bump] = [h.pending.shift()!, h.pending.shift()!];
    await act(async () => bump({ status: "ready", data: "b" }));
    await act(async () => pull({ status: "ready", data: "old" }));
    expect(h.last().refreshing).toBe(false);
    expect(h.seen.at(-1)).toEqual({ status: "ready", data: "b" });
  });

  it("the same interleaving settling the other way round: the pull answers first, then the version reload", async () => {
    const h = harness();
    const r = render(<h.Probe k="x" v={1} />);
    await act(async () => h.pending.shift()!({ status: "ready", data: "a" }));
    act(() => void h.last().refresh());
    act(() => r.update(<h.Probe k="x" v={2} />));
    const [pull, bump] = [h.pending.shift()!, h.pending.shift()!];
    await act(async () => pull({ status: "ready", data: "old" }));
    expect(h.last().refreshing).toBe(false); // the pull is over even though its answer lost
    await act(async () => bump({ status: "ready", data: "b" }));
    expect(h.last().refreshing).toBe(false);
    expect(h.seen.at(-1)).toEqual({ status: "ready", data: "b" });
  });

  it("a failed pull keeps the figures and reports a notice", async () => {
    const h = harness();
    render(<h.Probe k="x" />);
    await act(async () => h.pending.shift()!({ status: "ready", data: "a" }));
    act(() => void h.last().refresh());
    await act(async () => h.pending.shift()!({ status: "error", kind: "network", message: "offline" }));
    expect(h.seen.at(-1)).toEqual({ status: "ready", data: "a" });
    expect(h.last()).toMatchObject({ refreshing: false, notice: "offline" });
  });
});
