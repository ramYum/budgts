import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const router = { refresh }; // stable, like the real app router
vi.mock("next/navigation", () => ({ useRouter: () => router }));

type Handler = (payload: { commit_timestamp: string }) => void;
const handlers: Handler[] = [];
const removeChannel = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: (_type: string, _filter: unknown, cb: Handler) => {
        handlers.push(cb);
        return channel;
      },
      subscribe: () => channel,
    };
    return { channel: () => channel, removeChannel };
  },
}));

import { RealtimeRefreshListener } from "./realtime-refresh-listener";

const RENDERED = Date.parse("2026-09-25T12:00:00.000Z");
/** A row event committed `ms` after (or before, if negative) the render. */
const at = (ms: number) => ({ commit_timestamp: new Date(RENDERED + ms).toISOString() });

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("RealtimeRefreshListener", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockClear();
    handlers.length = 0;
    setHidden(false);
  });
  afterEach(() => vi.useRealTimers());

  it("coalesces a burst of row events into one trailing refresh", () => {
    render(<RealtimeRefreshListener tables={["transactions", "budgets"]} renderedAt={RENDERED} />);
    expect(handlers).toHaveLength(2);
    act(() => {
      for (let i = 0; i < 200; i++) handlers[i % 2]!(at(10 + i));
    });
    expect(refresh).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1499));
    expect(refresh).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores changes the rendered page already includes (committed before it rendered)", () => {
    render(<RealtimeRefreshListener tables={["transactions"]} renderedAt={RENDERED} />);
    act(() => handlers[0]!(at(-50)));
    act(() => void vi.advanceTimersByTime(5000));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not double-refresh after the user's own edit: the action's re-render supersedes the queued event", () => {
    // The row event from the user's own save can arrive before the server
    // action's response. That response re-renders the page (a newer
    // renderedAt), which already contains the change.
    const { rerender } = render(<RealtimeRefreshListener tables={["transactions"]} renderedAt={RENDERED} />);
    act(() => handlers[0]!(at(100)));
    rerender(<RealtimeRefreshListener tables={["transactions"]} renderedAt={RENDERED + 400} />);
    act(() => void vi.advanceTimersByTime(5000));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("still refreshes for a change that landed after the latest render (background bank sync)", () => {
    const { rerender } = render(<RealtimeRefreshListener tables={["transactions"]} renderedAt={RENDERED} />);
    act(() => handlers[0]!(at(100)));
    rerender(<RealtimeRefreshListener tables={["transactions"]} renderedAt={RENDERED + 50} />);
    act(() => void vi.advanceTimersByTime(1500));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps one subscription across re-renders", () => {
    const { rerender } = render(<RealtimeRefreshListener tables={["transactions"]} renderedAt={RENDERED} />);
    rerender(<RealtimeRefreshListener tables={["transactions"]} renderedAt={RENDERED + 1000} />);
    expect(handlers).toHaveLength(1);
    expect(removeChannel).not.toHaveBeenCalled();
  });

  it("defers the refresh while the tab is hidden and runs it once when visible", () => {
    render(<RealtimeRefreshListener tables={["transactions"]} renderedAt={RENDERED} />);
    setHidden(true);
    act(() => handlers[0]!(at(10)));
    act(() => void vi.advanceTimersByTime(10_000));
    expect(refresh).not.toHaveBeenCalled();

    act(() => setHidden(false));
    act(() => void vi.advanceTimersByTime(1500));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending refresh and unsubscribes on unmount", () => {
    const { unmount } = render(<RealtimeRefreshListener tables={["transactions"]} renderedAt={RENDERED} />);
    act(() => handlers[0]!(at(10)));
    unmount();
    act(() => void vi.advanceTimersByTime(5000));
    expect(refresh).not.toHaveBeenCalled();
    expect(removeChannel).toHaveBeenCalled();
  });
});
