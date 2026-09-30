import { describe, expect, it } from "vitest";
import { boxesFromHierarchy, parseBounds, parseDensity } from "../../../tools/parity/capture-native-lib";

const tree = {
  attributes: { "resource-id": "", bounds: "[0,0][1080,2400]" },
  children: [
    {
      attributes: { "resource-id": "screen-root", bounds: "[0,63][1080,2337]" },
      children: [
        { attributes: { "resource-id": "progress-bar", bounds: "[63,420][1017,441]" } },
        { attributes: { "resource-id": "com.budgts.app:id/progress-bar", bounds: "[63,500][1017,521]" } },
        { attributes: { "resource-id": "hidden", bounds: "[0,0][0,0]" } },
      ],
    },
  ],
};

describe("native hierarchy", () => {
  it("reads Android bounds", () => {
    expect(parseBounds("[63,420][1017,441]")).toEqual({ x: 63, y: 420, w: 954, h: 21 });
    expect(parseBounds("nope")).toBeNull();
  });

  it("keys test ids in tree order, in dp, skipping zero-size views, past Maestro's log lines", () => {
    const boxes = boxesFromHierarchy(`Running on emulator-5554\n${JSON.stringify(tree)}`, 2.625);
    expect(boxes.map((b) => b.key)).toEqual(["screen-root", "progress-bar", "progress-bar#2"]);
    expect(boxes[0]).toMatchObject({ x: 0, y: 24, w: 1080 / 2.625, h: 2274 / 2.625 });
  });

  it("reads the density, preferring an override", () => {
    expect(parseDensity("Physical density: 420\n")).toBe(2.625);
    expect(parseDensity("Physical density: 420\nOverride density: 480\n")).toBe(3);
    expect(() => parseDensity("error")).toThrow();
  });
});

describe("the compared screen area", () => {
  it("runs from the status bar's bottom to the gesture bar's top", async () => {
    const { screenArea } = await import("../../../tools/parity/capture-native-lib");
    const b = (id: string, y: number, h: number) => ({ id, key: id, x: 0, y, w: 411.43, h });
    expect(screenArea([b("statusBarBackground", 0, 24), b("navigationBarBackground", 896, 18.29)], 411.43, 914.29)).toEqual({
      x: 0,
      y: 24,
      w: 411.43,
      h: 872,
    });
    expect(screenArea([], 411.43, 914.29)).toEqual({ x: 0, y: 0, w: 411.43, h: 914.29 });
  });
});
