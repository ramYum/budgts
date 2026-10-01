import { act } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import { reducedMotion } from "../../test/native-hosts";
import { render, textContent } from "../../test/render";
import { useReducedMotion } from "./reduced-motion";

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
