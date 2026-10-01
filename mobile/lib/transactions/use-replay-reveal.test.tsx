import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { render } from "../../test/render";
import type { MobileTransaction, TransactionsPage } from "./transactions-api";
import type { LedgerState } from "./use-ledger";
import { useReplayReveal } from "./use-replay-reveal";

const t = (id: string) => ({ id }) as MobileTransaction;
const ready = (ids: string[], cursor: string | null = null): LedgerState => ({
  status: "ready",
  page: { month: "2026-09", items: ids.map(t), nextCursor: cursor } as TransactionsPage,
  cursor,
  restError: null,
});

function harness(first: LedgerState) {
  const onOpen = vi.fn();
  const onAnotherMonth = vi.fn();
  let api!: ReturnType<typeof useReplayReveal>;
  function Probe({ ledger, notice }: { ledger: LedgerState; notice: string | null }) {
    api = useReplayReveal({ ledger, notice, onOpen, onAnotherMonth });
    return null;
  }
  const r = render(<Probe ledger={first} notice={null} />);
  const show = (ledger: LedgerState, notice: string | null = null) => act(() => r.update(<Probe ledger={ledger} notice={notice} />));
  return { onOpen, onAnotherMonth, start: (id: string) => act(() => api.start(id)), cancel: () => act(() => api.cancel()), show };
}

describe("useReplayReveal (a create the server answered replayed: true)", () => {
  it("opens the kept row once the refreshed month has it", () => {
    const h = harness(ready(["a"]));
    h.start("kept");
    expect(h.onOpen).not.toHaveBeenCalled(); // the month on screen predates the save
    h.show(ready(["kept", "a"]));
    expect(h.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "kept" }));
    h.show(ready(["kept", "a", "b"]));
    expect(h.onOpen).toHaveBeenCalledTimes(1);
  });

  it("a kept row in another month is said, not dropped", () => {
    const h = harness(ready(["a"]));
    h.start("kept");
    h.show(ready(["a"]));
    expect(h.onOpen).not.toHaveBeenCalled();
    expect(h.onAnotherMonth).toHaveBeenCalledTimes(1);
  });

  it("a refresh that fails still says it was already saved (the saved notice), and never opens the row later", () => {
    const h = harness(ready(["a"]));
    h.start("kept");
    h.show(ready(["a"], "c1"), "Couldn't reach Budgts.");
    // the fact isn't dropped: Activity's saved notice says it at once
    expect(h.onAnotherMonth).toHaveBeenCalledTimes(1);
    h.show(ready(["kept", "a"]));
    expect(h.onOpen).not.toHaveBeenCalled();
    expect(h.onAnotherMonth).toHaveBeenCalledTimes(1);
  });

  it("another sheet opening cancels it", () => {
    const h = harness(ready(["a"]));
    h.start("kept");
    h.cancel();
    h.show(ready(["kept", "a"]));
    expect(h.onOpen).not.toHaveBeenCalled();
  });

  it("a notice already on screen when it starts does not cancel it", () => {
    const h = harness(ready(["a"]));
    h.show(ready(["a"]), "Couldn't reach Budgts.");
    h.start("kept");
    h.show(ready(["kept", "a"]), null);
    expect(h.onOpen).toHaveBeenCalledTimes(1);
  });
});
