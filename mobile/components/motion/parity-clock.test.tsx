import { describe, expect, it } from "vitest";
import { byTestId, flat, render } from "../../test/render";
import { ParityClockProvider, parseClockParam } from "../../lib/motion/parity-clock";
import { Reveal } from "./reveal";

describe("the dev-only parity clock", () => {
  it("parses ?clock=<ms> and nothing else", () => {
    expect([parseClockParam("1200"), parseClockParam(["40"]), parseClockParam("-1"), parseClockParam("1e3"), parseClockParam(undefined)]).toEqual([
      1200,
      40,
      null,
      null,
      null,
    ]);
  });

  it("pauses every entrance at the frozen instant (a negative delay seeks into it)", () => {
    const r = render(
      <ParityClockProvider frozenAtMs={500}>
        <Reveal i={2} testID="rv">
          <></>
        </Reveal>
      </ParityClockProvider>,
    );
    expect(flat(byTestId(r, "rv").props.style)).toMatchObject({ animationDelay: `${2 * 70 + 40 - 500}ms`, animationPlayState: "paused" });
  });

  it("is inert in a release build", () => {
    const g = globalThis as { __DEV__?: boolean };
    g.__DEV__ = false;
    try {
      const r = render(
        <ParityClockProvider frozenAtMs={500}>
          <Reveal i={0} testID="rv">
            <></>
          </Reveal>
        </ParityClockProvider>,
      );
      expect(flat(byTestId(r, "rv").props.style)).toMatchObject({ animationDelay: "40ms", animationPlayState: "running" });
    } finally {
      g.__DEV__ = true;
    }
  });
});
