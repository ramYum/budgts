import { act } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import { reducedMotion } from "../../test/native-hosts";
import { render, textContent } from "../../test/render";
import { reducedMotionStore, useReducedMotion } from "./reduced-motion";

function Probe() {
  return <>{useReducedMotion() ? "still" : "moving"}</>;
}

afterEach(() => {
  reducedMotion.launch = null;
  act(() => {
    reducedMotion.value = false;
  });
});

// The store is the app's one, shared across this file: the first test sees it before the OS has ever answered.
describe("the app's reduced-motion source", () => {
  it("starts from the launch reading, then takes the OS's answer (a setting changed after launch)", async () => {
    reducedMotion.launch = false; // Reanimated read "motion on" when the bundle loaded
    reducedMotion.value = true; // the OS now says Remove animations is on
    const r = render(<Probe />);
    expect(textContent(r.root)).toBe("moving");
    await act(async () => {});
    expect(textContent(r.root)).toBe("still");
  });

  it("follows the setting while the app runs, both ways, without a relaunch", () => {
    const r = render(<Probe />);
    expect(textContent(r.root)).toBe("moving");
    act(() => {
      reducedMotion.value = true;
    });
    expect(textContent(r.root)).toBe("still");
    act(() => {
      reducedMotion.value = false;
    });
    expect(textContent(r.root)).toBe("moving");
  });
});

/** An OS whose first answer the test releases by hand, and whose change events it fires. */
function fakeOs() {
  let answer!: (on: boolean) => void;
  let event!: (on: boolean) => void;
  return {
    os: {
      isReduceMotionEnabled: () => new Promise<boolean>((resolve) => (answer = resolve)),
      addEventListener: (_e: "reduceMotionChanged", listener: (on: boolean) => void) => {
        event = listener;
        return { remove: () => {} };
      },
    },
    answer: (on: boolean) => answer(on),
    event: (on: boolean) => event(on),
  };
}

describe("the OS's first answer and its change events, in either order", () => {
  it("the answer, then an event: the event wins", async () => {
    const o = fakeOs();
    const store = reducedMotionStore(o.os);
    store.subscribe(() => {});
    expect(store.snapshot()).toBeNull();
    o.answer(false);
    await Promise.resolve();
    expect(store.snapshot()).toBe(false);
    o.event(true);
    expect(store.snapshot()).toBe(true);
  });

  it("an event, then the older answer: the answer is ignored", async () => {
    const o = fakeOs();
    const store = reducedMotionStore(o.os);
    const heard: number[] = [];
    store.subscribe(() => heard.push(1));
    o.event(true); // Remove animations switched on while the first question was in flight
    expect(store.snapshot()).toBe(true);
    o.answer(false); // the answer to the question asked before the switch
    await Promise.resolve();
    await Promise.resolve();
    expect(store.snapshot()).toBe(true);
    expect(heard).toHaveLength(1);
  });
});
