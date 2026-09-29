import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import { frameCallbacks, tickFrames } from "../../test/native-hosts";
import { stepAt, useSteppedClock, type SteppedTimeline } from "./stepped";

describe("stepAt: sprite timing", () => {
  const timeline = { stepMs: 80, intro: 3, loop: 4 };

  it("holds each step for its whole duration, then jumps", () => {
    expect(stepAt(0, timeline)).toBe(0);
    expect(stepAt(79.9, timeline)).toBe(0);
    expect(stepAt(80, timeline)).toBe(1);
  });

  it("plays the intro once, then repeats the loop after it", () => {
    const steps = Array.from({ length: 12 }, (_, i) => stepAt(i * 80 + 1, timeline));
    expect(steps).toEqual([0, 1, 2, 3, 4, 5, 6, 3, 4, 5, 6, 3]);
  });

  it("holds the last step of an intro with a one-step loop (an entrance that stays)", () => {
    expect(stepAt(10_000, { stepMs: 20, intro: 5, loop: 1 })).toBe(5);
  });

  it("never runs backwards before the clock starts", () => {
    expect(stepAt(-50, timeline)).toBe(0);
  });
});

describe("useSteppedClock", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let seen: { value: number } | undefined;
  function Clock({ timeline, running = true }: { timeline: SteppedTimeline; running?: boolean }) {
    seen = useSteppedClock(timeline, running);
    return null;
  }
  const mount = (el: React.ReactElement) => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(el);
    });
    return r;
  };
  afterEach(() => {
    frameCallbacks.length = 0;
  });

  it("counts from its own start, whatever the display's clock reads", () => {
    mount(createElement(Clock, { timeline: { stepMs: 100, intro: 0, loop: 10 } }));
    act(() => {
      tickFrames(5000);
      tickFrames(5350);
    });
    expect(seen!.value).toBe(3);
  });

  it("keeps one frame callback across re-renders, so nothing rewinds it", () => {
    const timeline = { stepMs: 100, intro: 0, loop: 10 };
    const r = mount(createElement(Clock, { timeline }));
    act(() => {
      tickFrames(0);
      tickFrames(450);
    });
    act(() => r.update(createElement(Clock, { timeline: { ...timeline } })));
    act(() => tickFrames(650));
    expect(seen!.value).toBe(6);
    expect(frameCallbacks[0]!.seen.size).toBe(1);
  });

  it("starts over when the timeline changes after mount", () => {
    const r = mount(createElement(Clock, { timeline: { stepMs: 100, intro: 0, loop: 10 } }));
    act(() => {
      tickFrames(0);
      tickFrames(450);
    });
    act(() => r.update(createElement(Clock, { timeline: { stepMs: 50, intro: 0, loop: 10 } })));
    expect(seen!.value).toBe(0);
    act(() => {
      tickFrames(1000);
      tickFrames(1120);
    });
    expect(seen!.value).toBe(2);
  });

  it("stops a one-shot's frame callback once it has played, holding its last step", () => {
    mount(createElement(Clock, { timeline: { stepMs: 20, intro: 5, loop: 1 } }));
    expect(frameCallbacks[0]!.active).toBe(true);
    act(() => {
      tickFrames(0);
      tickFrames(500);
    });
    expect(seen!.value).toBe(5);
    expect(frameCallbacks[0]!.active).toBe(false);
  });

  it("holds step 0 and runs nothing while off", () => {
    mount(createElement(Clock, { timeline: { stepMs: 20, intro: 0, loop: 4 }, running: false }));
    expect(frameCallbacks[0]!.active).toBe(false);
    expect(seen!.value).toBe(0);
  });
});
