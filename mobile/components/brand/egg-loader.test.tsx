import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import { EGG_FRAMES, EGG_GROUND, EGG_GROUND_PALETTE, EGG_LOOP, EGG_STEP_MS, ROLE } from "../../lib/brand/shared";
import { pathPoints } from "../../lib/brand/snap";
import { frameCallbacks, RATIO, reducedMotion, tickFrames } from "../../test/native-hosts";
import { EGG_SCALE, EggLoader } from "./egg-loader";

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
const translateX = (n: ReactTestInstance) =>
  ((flat(n.props.style).transform as { translateX: number }[] | undefined) ?? [{ translateX: 0 }])[0]!.translateX;
const onDeviceGrid = (v: number) => Math.abs(v * RATIO - Math.round(v * RATIO)) < 1e-9;
const REST = EGG_FRAMES[0]!;
const pitchPx = (EGG_GROUND.cell + EGG_GROUND.gap) * EGG_SCALE;
/** the one frame showing, and where */
function shown(r: ReactTestRenderer) {
  const f = EGG_FRAMES.filter((fr) => flat(byId(r, `egg-frame-${fr.angle}`).props.style).opacity === 1);
  expect(f).toHaveLength(1);
  return { frame: EGG_FRAMES.indexOf(f[0]!), x: translateX(byId(r, `egg-frame-${f[0]!.angle}`)) };
}

afterEach(() => {
  reducedMotion.value = false;
  frameCallbacks.length = 0;
});

describe("<EggLoader>", () => {
  it("is one busy progress indicator to a screen reader, with no text on screen", () => {
    const r = render(<EggLoader label="Signing you in" />);
    const root = r.root.findAll((n) => n.props.accessibilityRole === "progressbar" && typeof n.type === "string");
    expect(root).toHaveLength(1);
    expect(root[0]!.props).toMatchObject({ accessible: true, accessibilityLabel: "Signing you in", accessibilityState: { busy: true } });
    expect(byId(r, "egg-stage").props).toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" });
    expect(r.root.findAll((n) => (n.type as unknown) === "Text")).toHaveLength(0);
    expect(flat(root[0]!.props.style).backgroundColor).toBe(ROLE.bg);
  });

  it("opens on the splash's egg: the standing frame, centred, at 6px a cell", () => {
    const r = render(<EggLoader />);
    expect(EGG_SCALE).toBe(6);
    expect(flat(byId(r, "egg-stage").props.style)).toMatchObject({ width: REST.w * 6, height: REST.h * 6 });
    const s = shown(r);
    expect(s.frame).toBe(0);
    expect(s.x).toBeCloseTo(0);
  });

  it("stands every frame on the row of cells", () => {
    const r = render(<EggLoader />);
    for (const f of EGG_FRAMES) {
      const style = flat(byId(r, `egg-frame-${f.angle}`).props.style);
      expect((style.top as number) + f.h * EGG_SCALE, `${f.angle}°`).toBe(REST.h * EGG_SCALE);
    }
    expect(flat(byId(r, "egg-ground").props.style)).toMatchObject({
      top: (REST.h + EGG_GROUND.drop) * EGG_SCALE,
      left: EGG_GROUND.left * EGG_SCALE,
      width: EGG_GROUND.width * EGG_SCALE,
    });
  });

  it("draws every cell edge on a whole device pixel", () => {
    const r = render(<EggLoader />);
    for (const p of r.root.findAll((n) => (n.type as unknown) === "Path"))
      for (const shape of pathPoints(p.props.d as string)) for (const [x, y] of shape) expect(onDeviceGrid(x) && onDeviceGrid(y)).toBe(true);
  });

  it("marks nothing under the standing egg: the trail only follows a roll", () => {
    const r = render(<EggLoader />);
    expect(flat(byId(r, "egg-ground-recent").props.style)).toMatchObject({ opacity: 0, backgroundColor: EGG_GROUND_PALETTE.recent });
    expect(flat(byId(r, "egg-ground-older").props.style)).toMatchObject({ opacity: 0, backgroundColor: EGG_GROUND_PALETTE.older });
  });

  it("rolls on the frame clock, step by step, the cells it left fading behind it", () => {
    const r = render(<EggLoader />);
    expect(translateX(byId(r, "egg-ground-cover"))).toBeCloseTo(0); // the cells are still to arrive
    const i = 5;
    act(() => {
      tickFrames(1000);
      tickFrames(1000 + i * EGG_STEP_MS + 1);
    });
    act(() => r.update(<EggLoader label="Still loading" />)); // (the stand-in styles are read on render)
    const s = shown(r);
    expect(s.frame).toBe(EGG_LOOP[i]!.frame);
    expect(s.x).toBeCloseTo(EGG_LOOP[i]!.x * EGG_SCALE, 0);
    const recent = byId(r, "egg-ground-recent");
    expect(flat(recent.props.style).opacity).toBe(1);
    expect(translateX(recent)).toBeCloseTo(EGG_LOOP[i]!.trail[0]! * pitchPx, 0);
    expect(translateX(byId(r, "egg-ground-cover"))).toBeGreaterThanOrEqual(EGG_GROUND.width * EGG_SCALE - 1); // the row has arrived
  });

  it("stops the one-shot cell sweep once it has played, and every clock when it goes", () => {
    const r = render(<EggLoader />);
    expect(frameCallbacks).toHaveLength(2);
    expect(frameCallbacks.every((c) => c.active)).toBe(true);
    act(() => {
      tickFrames(0);
      tickFrames(1000);
    });
    expect(frameCallbacks.filter((c) => c.active)).toHaveLength(1); // the roll keeps going
    act(() => r.unmount());
    expect(frameCallbacks.every((c) => !c.active)).toBe(true);
  });

  it("under Reduce Motion: the standing egg on a full, still row; no clock runs", () => {
    reducedMotion.value = true;
    const r = render(<EggLoader />);
    expect(translateX(byId(r, "egg-ground-cover"))).toBeGreaterThanOrEqual(EGG_GROUND.width * EGG_SCALE - 1);
    expect(frameCallbacks.every((c) => !c.active)).toBe(true);
    expect(shown(r).frame).toBe(0);
    expect(flat(byId(r, "egg-ground-recent").props.style).opacity).toBe(0);
  });
});
