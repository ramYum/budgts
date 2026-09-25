import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

type Handler = () => void;
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

import { RealtimeRefresh } from "./realtime-refresh";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("RealtimeRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockClear();
    handlers.length = 0;
    setHidden(false);
  });
  afterEach(() => vi.useRealTimers());

  it("coalesces a burst of row events into one trailing refresh", () => {
    render(<RealtimeRefresh tables={["transactions", "budgets"]} />);
    expect(handlers).toHaveLength(2);
    act(() => {
      for (let i = 0; i < 200; i++) handlers[i % 2]!();
    });
    expect(refresh).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1499));
    expect(refresh).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("defers the refresh while the tab is hidden and runs it once when visible", () => {
    render(<RealtimeRefresh tables={["transactions"]} />);
    setHidden(true);
    act(() => handlers[0]!());
    act(() => void vi.advanceTimersByTime(10_000));
    expect(refresh).not.toHaveBeenCalled();

    act(() => setHidden(false));
    act(() => void vi.advanceTimersByTime(1500));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending refresh and unsubscribes on unmount", () => {
    const { unmount } = render(<RealtimeRefresh tables={["transactions"]} />);
    act(() => handlers[0]!());
    unmount();
    act(() => void vi.advanceTimersByTime(5000));
    expect(refresh).not.toHaveBeenCalled();
    expect(removeChannel).toHaveBeenCalled();
  });
});
