import { act } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import { ROBIN_ART } from "../../lib/brand/shared";
import { reducedMotion } from "../../test/native-hosts";
import { byTestId, flat, hosts, render } from "../../test/render";
import { BrandStage, TICKER_LINES } from "./brand-stage";
import { Robin, eyeCentre } from "./robin";
import {
  ROBIN_BEAK,
  ROBIN_BEAK_OPEN,
  ROBIN_BLINK,
  ROBIN_CHIRP,
  ROBIN_FLICKER,
  ROBIN_HOP,
  STAGE_TURN,
  STAGE_WANDER,
  WM_IN,
  WM_WAVE,
} from "./robin-keyframes";

afterEach(() => {
  reducedMotion.value = false;
});

const moves = (r: ReturnType<typeof render>) => hosts(r, "Animated.View").map((v) => flat(v.props.style)).filter((s) => s.animationName);
const named = (r: ReturnType<typeof render>, kf: unknown) => moves(r).filter((s) => s.animationName === kf);

describe("Crystal is alive (globals.css robin-*)", () => {
  it("blinks once then twice every 4.8s, around her eye's own centre", () => {
    const [blink] = named(render(<Robin mood="happy" size={44} />), ROBIN_BLINK);
    expect(blink).toMatchObject({ animationDuration: "4800ms", animationTimingFunction: "linear", animationIterationCount: "infinite" });
    const c = eyeCentre("happy", 2);
    expect(blink!.transformOrigin).toBe(`${c.x}px ${c.y}px`);
    // the blink is a scaleY squeeze at 32%, 85.5% and 91.5%
    expect(Object.entries(ROBIN_BLINK).filter(([, v]) => JSON.stringify(v).includes("0.1")).map(([k]) => k)).toEqual(["32%", "85.5%", "91.5%"]);
  });

  it("chirps every 4s in the chirping moods: the beak opens twice while her marks sound, each value held", () => {
    const r = render(<Robin mood="normal" />);
    for (const kf of [ROBIN_BEAK, ROBIN_BEAK_OPEN, ROBIN_CHIRP]) {
      const [m] = named(r, kf);
      expect(m).toMatchObject({ animationDuration: "4000ms", animationTimingFunction: { steps: 1, modifier: "jump-end" } });
    }
    // the open beak only shows mid-chirp
    expect(named(r, ROBIN_BEAK_OPEN)[0]!.opacity).toBe(0);
    expect(named(render(<Robin mood="happy" chirpMs={6000} />), ROBIN_CHIRP)[0]!.animationDuration).toBe("6000ms");
  });

  it("flickers the curious '?' and sleepy 'z' instead, and a sleepy robin doesn't blink", () => {
    expect(named(render(<Robin mood="curious" />), ROBIN_FLICKER)).toHaveLength(1);
    expect(named(render(<Robin mood="curious" />), ROBIN_CHIRP)).toHaveLength(0);
    const sleepy = render(<Robin mood="sleepy" />);
    expect(named(sleepy, ROBIN_BLINK)).toHaveLength(0);
    expect(named(sleepy, ROBIN_FLICKER)).toHaveLength(1);
  });

  it("draws the same art moving as at rest, layer by layer in the web's paint order", () => {
    const fills = (r: ReturnType<typeof render>) => hosts(r, "Path").map((p) => p.props.fill);
    const moving = render(<Robin mood="happy" />);
    reducedMotion.value = true;
    const still = render(<Robin mood="happy" />);
    // moving adds only the open beak (hidden until a chirp)
    const openBeak = ROBIN_ART.happy.beakOpen.length ? new Set(ROBIN_ART.happy.beakOpen.map((r) => r.fill)).size : 0;
    expect(fills(moving).length).toBe(fills(still).length + openBeak);
    expect(moves(still)).toEqual([]);
  });

  it("stays still with animated={false} or a still beak frame", () => {
    expect(moves(render(<Robin animated={false} />))).toEqual([]);
    expect(named(render(<Robin beakOpen />), ROBIN_CHIRP)).toHaveLength(0);
  });

  it("hops 4px on a tap, in four steps, each tap again", () => {
    const r = render(<Robin hopOnTap />);
    expect(named(r, ROBIN_HOP)).toHaveLength(0);
    act(() => byTestId(r, "robin-hop").props.onPress());
    expect(named(r, ROBIN_HOP)[0]).toMatchObject({ animationDuration: "360ms", animationTimingFunction: { steps: 4, modifier: "jump-end" } });
  });

  it("plays a caller's moves on her layers (Crystal on Home's arrival flap and tap chirp)", () => {
    const flap = { kf: { from: { opacity: 1 }, to: { opacity: 0 } }, ms: 640, delay: 200 };
    const chirpBack = { kf: { from: { opacity: 0 }, to: { opacity: 1 } }, ms: 600 };
    const r = render(<Robin mood="happy" choreography={{ wingUp: [flap], beak: chirpBack, beakOpen: chirpBack, wingStyle: { opacity: 0.5 } }} />);
    expect(named(r, flap.kf)[0]).toMatchObject({ animationDuration: "640ms", animationDelay: "200ms", opacity: 0, animationFillMode: "backwards" });
    expect(named(r, chirpBack.kf)).toHaveLength(2); // on the shut beak (inside its loop) and on an open beak
    expect(hosts(r, "Animated.View").some((v) => flat(v.props.style).opacity === 0.5)).toBe(true);
    reducedMotion.value = true;
    expect(moves(render(<Robin mood="happy" choreography={{ wingUp: [flap] }} />))).toEqual([]);
  });
});

describe("the sign-in stage's 8s beat (globals.css stage-*, saving, wm-*, ticker-*)", () => {
  it("wanders ±8px in 4px sprite steps, turning on her feet", () => {
    const r = render(<BrandStage />);
    expect(flat(byTestId(r, "stage-wander").props.style)).toMatchObject({ animationName: STAGE_WANDER, animationDuration: "8000ms", animationTimingFunction: { steps: 2, modifier: "jump-end" } });
    const turn = flat(byTestId(r, "stage-turn").props.style);
    expect(turn).toMatchObject({ animationName: STAGE_TURN, animationTimingFunction: { steps: 1, modifier: "jump-end" } });
    expect(String(turn.transformOrigin)).toMatch(/px 50%$/);
  });

  it("raises a '+$' from each chirp, at 1.6s and 5.6s of every beat, four over two beats", () => {
    const savings = moves(render(<BrandStage />)).filter((s) => s.animationDuration === "16000ms");
    expect(savings.map((s) => s.animationDelay)).toEqual(["1600ms", "5600ms", "9600ms", "13600ms"]);
    expect(savings.every((s) => s.opacity === 0)).toBe(true);
  });

  it("steps the wordmark in letter by letter, then ripples it each beat", () => {
    const r = render(<BrandStage />);
    expect(named(r, WM_IN).map((s) => s.animationDelay)).toEqual(["200ms", "270ms", "340ms", "410ms", "480ms", "550ms"]);
    expect(named(r, WM_WAVE).map((s) => s.animationDelay)).toEqual(["0ms", "60ms", "120ms", "180ms", "240ms", "300ms"]);
  });

  it("types each savings line in its own 4s slot, one Geist Mono character a step", () => {
    const lines = moves(render(<BrandStage />)).filter((s) => s.animationDuration === "20000ms");
    expect(lines.map((s) => s.animationDelay)).toEqual(["800ms", "4800ms", "8800ms", "12800ms", "16800ms"]);
    expect(lines.map((s) => (s.animationTimingFunction as { steps: number }).steps)).toEqual(TICKER_LINES.map((l) => l.length));
  });

  it("holds still under Reduce Motion, the web's motion-off frame", () => {
    reducedMotion.value = true;
    expect(moves(render(<BrandStage />))).toEqual([]);
  });
});
