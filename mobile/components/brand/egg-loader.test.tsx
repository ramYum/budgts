import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import { EGG_FRAMES, EGG_GROUND, EGG_GROUND_PALETTE, EGG_LOOP, ROLE } from "../../lib/brand/shared";
import { pathPoints } from "../../lib/brand/snap";
import { frameCallbacks, RATIO, reducedMotion } from "../../test/native-hosts";
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

  it("opens on the splash's egg: the resting frame, centred, at Crystal's sign-in grain", () => {
    const r = render(<EggLoader />);
    expect(EGG_SCALE).toBe(4);
    const stage = byId(r, "egg-stage");
    expect(flat(stage.props.style)).toMatchObject({ width: EGG_FRAMES[0]!.w * 4, height: EGG_FRAMES[0]!.h * 4 });
    const shown = EGG_FRAMES.filter((f) => flat(byId(r, `egg-frame-${f.angle}`).props.style).opacity === 1);
    expect(shown).toEqual([EGG_FRAMES[0]]);
    expect(translateX(byId(r, `egg-frame-${EGG_FRAMES[0]!.angle}`))).toBeCloseTo(0);
  });

  it("stands every frame on the same ground line, a cell above the row of cells", () => {
    const r = render(<EggLoader />);
    for (const f of EGG_FRAMES) {
      const style = flat(byId(r, `egg-frame-${f.angle}`).props.style);
      expect((style.top as number) + f.h * 4, `${f.angle}°`).toBe(EGG_FRAMES[0]!.h * 4);
    }
    expect(flat(byId(r, "egg-ground").props.style)).toMatchObject({
      top: (EGG_FRAMES[0]!.h + EGG_GROUND.drop) * 4,
      left: EGG_GROUND.left * 4,
      width: EGG_GROUND.width * 4,
    });
  });

  it("draws every cell edge on a whole device pixel", () => {
    const r = render(<EggLoader />);
    for (const p of r.root.findAll((n) => (n.type as unknown) === "Path"))
      for (const shape of pathPoints(p.props.d as string)) for (const [x, y] of shape) expect(onDeviceGrid(x) && onDeviceGrid(y)).toBe(true);
    expect(onDeviceGrid(translateX(byId(r, "egg-ground-lit")))).toBe(true);
  });

  it("lights the ground cell under the resting egg, in ink; nothing trails yet", () => {
    const r = render(<EggLoader />);
    const lit = byId(r, "egg-ground-lit");
    expect(flat(lit.props.style).backgroundColor).toBe(EGG_GROUND_PALETTE.lit);
    expect(translateX(lit)).toBeCloseTo(EGG_LOOP[0]!.lit * 3 * 4, 0);
    expect(flat(byId(r, "egg-ground-trail").props.style).opacity).toBe(0);
  });

  it("with motion on: the cells are still to arrive and the clocks run", () => {
    const r = render(<EggLoader />);
    expect(translateX(byId(r, "egg-ground-cover"))).toBeCloseTo(0);
    expect(frameCallbacks.length).toBeGreaterThan(0);
    expect(frameCallbacks.every((c) => c.active)).toBe(true);
    act(() => r.unmount());
    expect(frameCallbacks.every((c) => !c.active)).toBe(true);
  });

  it("under Reduce Motion: a still egg on a full, still row; no clock runs", () => {
    reducedMotion.value = true;
    const r = render(<EggLoader />);
    expect(translateX(byId(r, "egg-ground-cover"))).toBeGreaterThanOrEqual(EGG_GROUND.width * 4 - 1);
    expect(frameCallbacks.every((c) => !c.active)).toBe(true);
    expect(flat(byId(r, `egg-frame-${EGG_FRAMES[0]!.angle}`).props.style).opacity).toBe(1);
  });
});
