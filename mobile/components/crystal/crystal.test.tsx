import { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byTestId, flat, hosts, render, textContent } from "../../test/render";
import { reducedMotion } from "../../test/native-hosts";
import { cubicBezier, facingAt, hopArc, hopProgress, hopWing, peckOffset, placeAt, walkMoving } from "./motion";
import { CrystalPerch } from "./crystal-perch";

import { announce } from "./test-mocks";

vi.mock("react-native-reanimated", async () => (await import("./test-mocks")).reanimated());
vi.mock("react-native", async () => (await import("./test-mocks")).reactNative());

afterEach(() => {
  reducedMotion.value = false;
  announce.mockReset();
});

describe("the walk's poses (web HOP_ARC, HOP_FLAP, PECK, the mover's slide)", () => {
  it("eases like CSS cubic-bezier", () => {
    expect(cubicBezier(0.45, 0, 0.55, 1, 0)).toBe(0);
    expect(cubicBezier(0.45, 0, 0.55, 1, 1)).toBe(1);
    expect(cubicBezier(0.45, 0, 0.55, 1, 0.5)).toBeCloseTo(0.5, 4);
    expect(cubicBezier(0, 0.55, 0.45, 1, 0.25)).toBeGreaterThan(0.25); // ease out runs ahead
    expect(cubicBezier(0.55, 0, 1, 0.45, 0.25)).toBeLessThan(0.25); // ease in lags
  });

  it("hops 9px high with a crouch and a squash, from her feet", () => {
    expect(hopArc(0)).toEqual({ y: 0, sx: 1, sy: 1 });
    expect(hopArc(0.14)).toMatchObject({ y: 0, sx: 1.08, sy: 0.9 });
    expect(hopArc(0.5).y).toBeCloseTo(-9);
    expect(hopArc(0.92).sx).toBeCloseTo(1.06);
    expect(hopArc(-1)).toEqual({ y: 0, sx: 1, sy: 1 });
  });

  it("beats her wing twice per hop and pecks twice per peck, in held steps", () => {
    expect([0.1, 0.2, 0.4, 0.6, 0.8].map(hopWing)).toEqual([0, 1, 0, 1, 0]);
    // 700ms: down at 20–40% and 60–80%
    expect([0.1, 0.3, 0.5, 0.7, 0.9].map((q) => peckOffset([100], 100 + q * 700))).toEqual([0, 3, 0, 3, 0]);
    expect(peckOffset([0], 700 * 0.3)).toBe(3);
    expect(peckOffset([0], 700 * 0.5)).toBe(0);
    expect(peckOffset([0], 800)).toBe(0);
  });

  it("slides between stops over 360ms and faces the way she turned", () => {
    const hops = [{ at: 1000, from: 0.5, to: 0.6 }];
    expect(placeAt(hops, 999)).toBe(0.5);
    expect(placeAt(hops, 1180)).toBeCloseTo(0.55, 3);
    expect(placeAt(hops, 1400)).toBe(0.6);
    expect(hopProgress(hops, 1180)).toBeCloseTo(0.5);
    expect(hopProgress(hops, 1400)).toBe(-1);
    expect(facingAt([{ at: 500, facing: -1 }], 400)).toBe(1);
    expect(facingAt([{ at: 500, facing: -1 }], 500)).toBe(-1);
  });

  it("asks for frames only while something moves", () => {
    const hops = [{ at: 1000, from: 0.5, to: 0.6 }];
    expect(walkMoving(hops, [], [], 1200)).toBe(true);
    expect(walkMoving(hops, [], [], 2000)).toBe(false);
    expect(walkMoving([], [], [3000], 3500)).toBe(true);
  });
});

const perch = (rate: number | null, name = "Alex") => render(<CrystalPerch name={name} savingsRate={rate} />);
const bubble = (r: ReturnType<typeof render>, id: string) => byTestId(r, id);

describe("Crystal on Home", () => {
  it("arrives saying hi, then her note on the month, toward the middle of the card", () => {
    const r = perch(0.32);
    const hello = bubble(r, "crystal-say-hello");
    const note = bubble(r, "crystal-say-note");
    expect(textContent(hello)).toBe("Hi, Alex!");
    expect(textContent(note)).toBe("32% saved!");
    expect(flat(hello.props.style)).toMatchObject({ animationDelay: "700ms", animationDuration: "2600ms", left: 60, opacity: 0 });
    expect(flat(note.props.style)).toMatchObject({ animationDelay: "3300ms", animationDuration: "4400ms" });
  });

  it("perches on the card's top edge, inset 16px, standing 2px into it", () => {
    const r = perch(0.32);
    expect(flat(byTestId(r, "crystal-perch").props.style)).toMatchObject({ position: "absolute", left: 16, right: 16, top: -42, height: 44 });
    expect(byTestId(r, "crystal").props.accessibilityLabel).toBe("Say hi to Crystal");
  });

  it("a tap: she jumps, and after landing says the next line, announced to a screen reader", () => {
    const r = perch(0.32);
    act(() => byTestId(r, "crystal").props.onPress());
    const said = bubble(r, "crystal-say-tap");
    expect(textContent(said)).toBe("32% saved!");
    expect(flat(said.props.style)).toMatchObject({ animationDelay: "850ms", animationDuration: "3000ms" });
    expect(announce).toHaveBeenCalledWith("32% saved!");
    act(() => byTestId(r, "crystal").props.onPress());
    expect(textContent(bubble(r, "crystal-say-tap"))).toBe("Chirp chirp!");
    expect(r.root.findAll((n) => n.props.testID === "crystal-say-hello")).toHaveLength(0);
  });

  it("says the month's mood: regrouping when more went out, getting started with no income", () => {
    expect(textContent(bubble(perch(-0.1), "crystal-say-note"))).toBe("Spent > earned");
    expect(textContent(bubble(perch(null), "crystal-say-note"))).toBe("No income yet");
    expect(textContent(bubble(perch(0.3, "Christopher"), "crystal-say-hello"))).toBe("Hi there!");
  });

  it("a '+$' rises from her beak only while the month is saving", () => {
    const tokens = (rate: number | null) => hosts(perch(rate), "Text").filter((t) => textContent(t) === "+$").length;
    expect(tokens(0.3)).toBe(2);
    expect(tokens(0)).toBe(0);
    expect(tokens(-0.2)).toBe(0);
  });

  it("with motion off she sits in the middle with her note, no hello, and a tap swaps in its line", () => {
    reducedMotion.value = true;
    const r = perch(0.32);
    expect(r.root.findAll((n) => n.props.testID === "crystal-say-hello")).toHaveLength(0);
    const note = bubble(r, "crystal-say-note");
    expect(flat(note.props.style).animationName).toBeUndefined();
    act(() => byTestId(r, "crystal").props.onPress());
    expect(textContent(bubble(r, "crystal-say-tap"))).toBe("32% saved!");
    expect(flat(bubble(r, "crystal-say-tap").props.style).opacity).toBeUndefined();
  });
});
