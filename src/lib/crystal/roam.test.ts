import { describe, expect, it } from "vitest";
import { bubbleSide, hopLength, nextOuting } from "./roam";

describe("nextOuting", () => {
  it("hops the way she's heading, a step at a time", () => {
    expect(nextOuting(1, -1, 0.1, 3)).toEqual({ dir: -1, stops: [0.9, 0.8, 0.7] });
    expect(nextOuting(0.2, 1, 0.1, 2)).toEqual({ dir: 1, stops: [0.3, 0.4] });
  });

  it("stops at an end rather than running past it", () => {
    expect(nextOuting(0.15, -1, 0.1, 4)).toEqual({ dir: -1, stops: [0.05, 0] });
    expect(nextOuting(0.95, 1, 0.1, 4)).toEqual({ dir: 1, stops: [1] });
  });

  it("turns back at an end before hopping", () => {
    expect(nextOuting(0, -1, 0.25, 2)).toEqual({ dir: 1, stops: [0.25, 0.5] });
    expect(nextOuting(1, 1, 0.25, 2)).toEqual({ dir: -1, stops: [0.75, 0.5] });
  });

  it("crosses in one hop when the edge is shorter than a hop", () => {
    expect(nextOuting(1, -1, 1.4, 3)).toEqual({ dir: -1, stops: [0] });
  });

  it("never lands on a fraction's rounding noise", () => {
    const { stops } = nextOuting(1, -1, 0.1, 10);
    expect(stops.at(-1)).toBe(0);
    for (const s of stops) expect(Number.isFinite(s) && s >= 0 && s <= 1).toBe(true);
    expect(stops).toEqual([0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0]);
  });
});

describe("hopLength", () => {
  it("takes small hops on a phone's short edge and longer ones on a wide card", () => {
    expect(hopLength(274)).toBe(36);
    expect(hopLength(479)).toBe(36);
    expect(hopLength(480)).toBe(48);
    expect(hopLength(908)).toBe(48);
  });
});

describe("bubbleSide", () => {
  it("opens toward the middle of the card, so it never runs off an end", () => {
    expect(bubbleSide(1)).toBe("left");
    expect(bubbleSide(0.6)).toBe("left");
    expect(bubbleSide(0.5)).toBe("right");
    expect(bubbleSide(0)).toBe("right");
  });
});
