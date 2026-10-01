import { act } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import { byTestId, flat, hosts, render, textContent } from "../../test/render";
import { announcements, reducedMotion } from "../../test/native-hosts";
import { cubicBezier, facingAt, hopArc, hopProgress, hopWing, peckOffset, placeAt, walkMoving } from "./motion";
import { crystalCheers, crystalLines } from "../../lib/brand/shared";
import { formatSavingsRate } from "../../lib/shared";
import { CrystalPerch } from "./crystal-perch";
import { BUBBLE_MAX, BUBBLE_TEXT_MAX, SpeechBubble, bubbleText, tagWidth } from "./speech-bubble";



afterEach(() => {
  reducedMotion.launch = null;
  reducedMotion.value = false;
  announcements.length = 0;
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
    expect(announcements).toEqual(["32% saved!"]);
    act(() => byTestId(r, "crystal").props.onPress());
    expect(textContent(bubble(r, "crystal-say-tap"))).toBe("Chirp chirp!");
    expect(r.root.findAll((n) => n.props.testID === "crystal-say-hello")).toHaveLength(0);
  });

  it("says the month's mood: regrouping when more went out, getting started with no income", () => {
    expect(textContent(bubble(perch(-0.1), "crystal-say-note"))).toBe("Spent >\nearned");
    expect(textContent(bubble(perch(null), "crystal-say-note"))).toBe("No income\nyet"); // 113px of line in 112 of room: two lines, as the web's bubble
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

  it("follows the app's one motion source: Remove animations turned on after launch stills her too", async () => {
    reducedMotion.launch = false; // Reanimated's reading from when the app started: motion on
    const r = perch(0.32);
    const hello = () => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "crystal-say-hello");
    expect(hello()).toHaveLength(1);
    await act(async () => {
      reducedMotion.value = true; // the device's animations are switched off
    });
    expect(hello()).toHaveLength(0);
    expect(flat(bubble(r, "crystal-say-note").props.style).animationName).toBeUndefined();
    expect(textContent(bubble(r, "crystal-say-note"))).toBe("32% saved!");
  });
});

describe("her bubble's line breaks (the web's text-balance, the same on both platforms)", () => {
  it("keeps a line that fits whole, and breaks a longer one at its most even space", () => {
    expect(bubbleText("Hi, Alex!")).toBe("Hi, Alex!");
    expect(bubbleText("Chirp chirp!")).toBe("Chirp chirp!");
    expect(bubbleText("Future you says thanks!")).toBe("Future you\nsays thanks!");
    expect(bubbleText("Tomorrow's a fresh start")).toBe("Tomorrow's a\nfresh start");
    // too long for two lines: three, as even as they go
    expect(bubbleText("Keep that streak going!")).toBe("Keep that\nstreak\ngoing!");
    expect(bubbleText("Every dollar has a job!")).toBe("Every dollar\nhas a job!");
  });

  it("every line she can say fits her bubble, in at most three lines", () => {
    const all = new Set<string>();
    for (const rate of [0.45, -0.2, null]) {
      for (const l of crystalLines("Alexandra", rate, formatSavingsRate).lines) all.add(l);
      for (const l of crystalCheers(rate)) all.add(l);
    }
    all.add("Hi, Alex!");
    all.add("Hi there!");
    for (const line of all) {
      const parts = bubbleText(line).split("\n");
      expect(parts.length, line).toBeLessThanOrEqual(3);
      for (const p of parts) expect(tagWidth(p), `${line}: ${p}`).toBeLessThanOrEqual(BUBBLE_TEXT_MAX);
    }
  });
});

describe("her bubble's width (re-review: a wrapped bubble draws the web's full 136px)", () => {
  const badge = (text: string) => {
    const r = render(<SpeechBubble testID="say" text={text} side="right" atMs={0} forMs={1000} still />);
    return flat(byTestId(r, "say-badge").props.style);
  };

  it("a line that wraps fills the bubble's 136px, as the web's box sized to the unwrapped line does", () => {
    expect(badge("No income yet").width).toBe(BUBBLE_MAX);
    expect(badge("Keep that streak going!").width).toBe(BUBBLE_MAX);
  });

  it("a line that fits shrink-wraps to its own width", () => {
    expect(badge("Hi, Alex!").width).toBeUndefined();
  });
});
