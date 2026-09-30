import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import { EGG_FRAMES, EGG_GROUND_PALETTE, EGG_MARGIN, EGG_PATHS, EGG_STEP_MS, MOTION, ROLE, eggPathFor } from "../../lib/brand/shared";
import { pathPoints } from "../../lib/brand/snap";
import { RATIO, reducedMotion, windowSize } from "../../test/native-hosts";
import { EGG_SCALE, EggLoader, lapKeyframes, type LapKeyframe } from "./egg-loader";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(node: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(node);
  });
  return r;
}
const byId = (r: ReactTestRenderer, id: string) => r.root.find((n) => n.props.testID === id && typeof n.type === "string");
const flat = (style: unknown): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : ((style as Record<string, unknown>) ?? {});
const translateX = (s: Record<string, unknown>) => ((s.transform as { translateX: number }[] | undefined) ?? [{ translateX: 0 }])[0]!.translateX;
const styleOf = (n: ReactTestInstance) => flat(n.props.style);
const onDeviceGrid = (v: number) => Math.abs(v * RATIO - Math.round(v * RATIO)) < 1e-9;
const REST = EGG_FRAMES[0]!;
// the stand-in window is a 412dp phone: the half-turn lap
const { loop: LOOP, ground: GROUND } = eggPathFor(412, 6);
const pitchPx = (GROUND.cell + GROUND.gap) * EGG_SCALE;
/** A layer's keyframe for step k (the animation's k-th keyframe, in order). */
const keyframeAt = (n: ReactTestInstance, k: number) => Object.values(styleOf(n).animationName as Record<string, LapKeyframe>)[k]!;

afterEach(() => {
  reducedMotion.value = false;
  windowSize.width = 412;
});

describe("lapKeyframes", () => {
  it("puts one keyframe at the start of every step, and closes on step 0 where the lap wraps", () => {
    const frames = lapKeyframes(4, (k) => ({ opacity: k, transform: [{ translateX: k * 10 }] }));
    expect(Object.keys(frames)).toEqual(["0.0000%", "25.0000%", "50.0000%", "75.0000%", "100.0000%"]);
    expect(Object.values(frames).map((f) => f.opacity)).toEqual([0, 1, 2, 3, 0]);
  });
});

describe("<EggLoader>", () => {
  it("is one busy progress indicator to a screen reader, with no text on screen", () => {
    const r = render(<EggLoader label="Signing you in" />);
    const root = r.root.findAll((n) => n.props.accessibilityRole === "progressbar" && typeof n.type === "string");
    expect(root).toHaveLength(1);
    expect(root[0]!.props).toMatchObject({ accessible: true, accessibilityLabel: "Signing you in", accessibilityState: { busy: true } });
    expect(byId(r, "egg-stage").props).toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" });
    expect(r.root.findAll((n) => (n.type as unknown) === "Text")).toHaveLength(0);
    expect(styleOf(root[0]!).backgroundColor).toBe(ROLE.bg);
  });

  it("rests on the splash's egg: the standing frame alone, centred, at 6px a cell", () => {
    const r = render(<EggLoader />);
    expect(EGG_SCALE).toBe(6);
    expect(styleOf(byId(r, "egg-stage"))).toMatchObject({ width: REST.w * 6, height: REST.h * 6 });
    const resting = EGG_FRAMES.filter((f) => styleOf(byId(r, `egg-frame-${f.angle}`)).opacity === 1);
    expect(resting).toEqual([REST]);
    expect(translateX(styleOf(byId(r, `egg-frame-${REST.angle}`)))).toBe(0);
  });

  it("stands every frame on the row of cells", () => {
    const r = render(<EggLoader />);
    for (const f of EGG_FRAMES) {
      const style = styleOf(byId(r, `egg-frame-${f.angle}`));
      expect((style.top as number) + f.h * EGG_SCALE, `${f.angle}°`).toBe(REST.h * EGG_SCALE);
    }
    expect(styleOf(byId(r, "egg-ground"))).toMatchObject({
      top: (REST.h + GROUND.drop) * EGG_SCALE,
      left: GROUND.left * EGG_SCALE,
      width: GROUND.width * EGG_SCALE,
    });
  });

  it("draws every cell edge on a whole device pixel", () => {
    const r = render(<EggLoader />);
    for (const p of r.root.findAll((n) => (n.type as unknown) === "Path"))
      for (const shape of pathPoints(p.props.d as string)) for (const [x, y] of shape) expect(onDeviceGrid(x) && onDeviceGrid(y)).toBe(true);
  });

  it("rolls from mount as one stepped CSS animation per frame layer: each shows on its own steps, at their place", () => {
    const r = render(<EggLoader />);
    for (const [i, f] of EGG_FRAMES.entries()) {
      const layer = byId(r, `egg-frame-${f.angle}`);
      expect(styleOf(layer)).toMatchObject({
        animationDuration: `${LOOP.length * EGG_STEP_MS}ms`,
        animationIterationCount: "infinite",
        animationTimingFunction: { steps: 1, modifier: "jump-end" },
        animationDelay: "0ms",
        animationPlayState: "running",
      });
      for (let k = 0; k <= LOOP.length; k++) {
        const step = LOOP[k % LOOP.length]!;
        const kf = keyframeAt(layer, k);
        expect(kf.opacity, `${f.angle}° step ${k}`).toBe(step.frame === i ? 1 : 0);
        expect(translateX(kf)).toBeCloseTo(step.x * EGG_SCALE, 0);
        expect(onDeviceGrid(translateX(kf))).toBe(true);
      }
    }
    // step 1 is already a roll: no standing start
    expect(LOOP[1]!.frame).not.toBe(0);
  });

  it("marks nothing at rest; the trail keyframes follow the cells the egg just left", () => {
    const r = render(<EggLoader />);
    const recent = byId(r, "egg-ground-recent");
    const older = byId(r, "egg-ground-older");
    expect(styleOf(recent)).toMatchObject({ opacity: 0, backgroundColor: EGG_GROUND_PALETTE.recent });
    expect(styleOf(older)).toMatchObject({ opacity: 0, backgroundColor: EGG_GROUND_PALETTE.older });
    LOOP.forEach((step, k) => {
      const kf = keyframeAt(recent, k);
      expect(kf.opacity).toBe(step.trail[0] === undefined ? 0 : 1);
      if (step.trail[0] !== undefined) expect(translateX(kf)).toBeCloseTo(step.trail[0] * pitchPx, 0);
    });
  });

  it("sweeps the row in once, one cell at a time, and rests with every cell shown", () => {
    const r = render(<EggLoader />);
    const cover = styleOf(byId(r, "egg-ground-cover"));
    expect(translateX(cover)).toBeGreaterThanOrEqual(GROUND.width * EGG_SCALE - 1); // the resting style: swept
    expect(cover).toMatchObject({
      animationDuration: `${MOTION.cellsSweepMs}ms`,
      animationTimingFunction: { steps: GROUND.count, modifier: "jump-end" },
      animationFillMode: "backwards",
    });
    expect(cover.animationIterationCount).toBeUndefined();
    expect(translateX((cover.animationName as { from: Record<string, unknown> }).from)).toBe(0);
  });

  it("keeps its animations across re-renders (a new label never restarts the lap)", () => {
    const r = render(<EggLoader label="Loading" />);
    const before = styleOf(byId(r, `egg-frame-${REST.angle}`)).animationName;
    act(() => r.update(<EggLoader label="Loading your account" />));
    expect(styleOf(byId(r, `egg-frame-${REST.angle}`)).animationName).toBe(before);
  });

  it("under Reduce Motion: the standing egg on a full, still row; nothing animates", () => {
    reducedMotion.value = true;
    const r = render(<EggLoader />);
    for (const n of r.root.findAll((x) => typeof x.type === "string" && x.props.style !== undefined))
      expect(styleOf(n).animationName, n.props.testID).toBeUndefined();
    expect(translateX(styleOf(byId(r, "egg-ground-cover")))).toBeGreaterThanOrEqual(GROUND.width * EGG_SCALE - 1);
    expect(styleOf(byId(r, `egg-frame-${REST.angle}`)).opacity).toBe(1);
    expect(styleOf(byId(r, "egg-ground-recent")).opacity).toBe(0);
  });

  it("fits its lap to the window: the quarter turn and its own row at 320dp, the egg kept off the edges", () => {
    windowSize.width = 320;
    const quarter = EGG_PATHS.find((p) => p.id === "quarter")!;
    const r = render(<EggLoader />);
    expect(styleOf(byId(r, "egg-ground"))).toMatchObject({ width: quarter.ground.width * EGG_SCALE, left: quarter.ground.left * EGG_SCALE });
    expect(styleOf(byId(r, `egg-frame-${REST.angle}`)).animationDuration).toBe(`${quarter.loop.length * EGG_STEP_MS}ms`);
    const stageLeft = (320 - REST.w * EGG_SCALE) / 2;
    for (const s of quarter.loop) {
      const f = EGG_FRAMES[s.frame]!;
      expect(stageLeft + s.x * EGG_SCALE).toBeGreaterThanOrEqual(EGG_MARGIN);
      expect(stageLeft + (s.x + f.w) * EGG_SCALE).toBeLessThanOrEqual(320 - EGG_MARGIN);
    }
  });

  it("rolls the half turn on 360dp phones and wider, within the margin", () => {
    for (const w of [360, 412]) {
      windowSize.width = w;
      const r = render(<EggLoader />);
      const half = EGG_PATHS.find((p) => p.id === "half")!;
      expect(styleOf(byId(r, "egg-ground")).width).toBe(half.ground.width * EGG_SCALE);
      expect(half.reach * EGG_SCALE + EGG_MARGIN).toBeLessThanOrEqual(w / 2);
      act(() => r.unmount());
    }
  });
});
