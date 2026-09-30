import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoalescer, REFRESH_DEBOUNCE_MS } from "./coalescer";

describe("createCoalescer (web realtime-refresh-listener.tsx rules)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("turns a burst of row events into one trailing refresh after the quiet period", () => {
    const flush = vi.fn();
    const c = createCoalescer(flush);
    for (let i = 0; i < 300; i++) {
      c.change();
      vi.advanceTimersByTime(10);
    }
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("waits while the app is in the background, then refreshes once it is back", () => {
    const flush = vi.fn();
    const c = createCoalescer(flush);
    c.setActive(false);
    c.change();
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS * 3);
    expect(flush).not.toHaveBeenCalled();
    c.setActive(true);
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a change, and nothing after dispose", () => {
    const flush = vi.fn();
    const c = createCoalescer(flush);
    c.setActive(false);
    c.setActive(true);
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS * 2);
    c.change();
    c.dispose();
    vi.advanceTimersByTime(REFRESH_DEBOUNCE_MS * 2);
    expect(flush).not.toHaveBeenCalled();
  });
});
