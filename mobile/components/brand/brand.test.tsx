import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLOR, ICONS, RAISE, ROLE } from "../../lib/brand/shared";
import { pathPoints } from "../../lib/brand/snap";
import { RATIO, reducedMotion } from "../../test/native-hosts";
import { BrandStage } from "./brand-stage";
import { Button, Field, IconTile, TextButton } from "./controls";
import { Icon } from "./icon";
import { PixelFrame } from "./pixel-frame";
import { Robin } from "./robin";
import { Text } from "./text";

// React 19's act() environment flag for a non-DOM renderer
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(node: React.ReactElement): ReactTestRenderer {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(node);
  });
  return r;
}

const is = (n: ReactTestInstance, type: string) => (n.type as unknown) === type;
const all = (r: ReactTestRenderer, type: string) => r.root.findAll((n) => is(n, type));
const flat = (style: unknown): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : ((style as Record<string, unknown>) ?? {});

/** Every corner of every path lands on a whole device pixel. */
function onDeviceGrid(paths: ReactTestInstance[]) {
  for (const p of paths) {
    for (const shape of pathPoints(p.props.d as string)) {
      for (const [x, y] of shape) {
        expect(Math.abs(x * RATIO - Math.round(x * RATIO))).toBeLessThan(1e-9);
        expect(Math.abs(y * RATIO - Math.round(y * RATIO))).toBeLessThan(1e-9);
      }
    }
  }
}

function layout(r: ReactTestRenderer, width: number, height: number) {
  const view = r.root.find((n) => is(n, "View") && typeof n.props.onLayout === "function");
  act(() => view.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } }));
}

describe("<PixelFrame>", () => {
  it("is a transparent border of the frame's cells, with the web's shadow, and draws once measured", () => {
    const r = render(<PixelFrame frame="px-card-raised" testID="card" />);
    const view = all(r, "View")[0]!;
    expect(flat(view.props.style)).toMatchObject({ borderWidth: 8, borderColor: "transparent" });
    expect(flat(view.props.style).boxShadow).toEqual([
      { offsetX: 0, offsetY: 2, blurRadius: 6, spreadDistance: -4, color: "rgba(17, 17, 17, 0.08)" },
      { offsetX: 0, offsetY: 22, blurRadius: 40, spreadDistance: -26, color: "rgba(17, 17, 17, 0.22)" },
    ]);
    expect(all(r, "Svg")).toHaveLength(0);

    layout(r, 172, 80);
    const svg = all(r, "Svg")[0]!;
    expect(svg.props).toMatchObject({ width: "100%", height: "100%" });
    const layer = all(r, "View").find((v) => v.props.pointerEvents === "none")!;
    expect(layer.props).toMatchObject({ importantForAccessibility: "no-hide-descendants" });
    expect(flat(layer.props.style)).toMatchObject({ position: "absolute", left: -8, top: -8, right: -8, bottom: -8 });
    const paths = all(r, "Path");
    expect(paths.map((p) => p.props.fill)).toEqual([COLOR.white]); // a solid white sheet
    onDeviceGrid(paths);
  });

  it("draws a state's line over its fill, in token colours", () => {
    const r = render(<PixelFrame frame="px-field" state=":focus-within" />);
    layout(r, 172, 44);
    expect(all(r, "Path").map((p) => p.props.fill)).toEqual([COLOR.white, COLOR.charcoal]);
  });

  it("gives the primary button its raised edge: its own shape, 2px lower, beneath it", () => {
    const r = render(<PixelFrame frame="px-btn-primary" raise />);
    layout(r, 172, 44);
    expect(flat(all(r, "View").find((v) => v.props.pointerEvents === "none")!.props.style).bottom).toBe(-6 - RAISE.y);
    const [edge, face] = all(r, "Path");
    expect(edge!.props).toMatchObject({ fill: COLOR.signalEdge, transform: `translate(0 ${RAISE.y})` });
    expect(face!.props.fill).toBe(COLOR.signalStrong);
  });
});

describe("<Robin> at rest (motion off: robin-motion.test.tsx has her moving)", () => {
  beforeEach(() => void (reducedMotion.value = true));
  afterEach(() => void (reducedMotion.value = false));

  it("draws Crystal at whole px per cell, decorative by default", () => {
    const r = render(<Robin mood="happy" scale={4} />);
    const svg = all(r, "Svg")[0]!;
    expect(svg.props).toMatchObject({ width: 104, height: 88, importantForAccessibility: "no-hide-descendants", accessible: false });
    expect(all(r, "G")).toHaveLength(4); // body, beak, eye, marks
    onDeviceGrid(all(r, "Path"));
  });

  it("names her when she carries meaning", () => {
    const svg = all(render(<Robin mood="curious" title="Crystal looks puzzled" />), "Svg")[0]!;
    expect(svg.props).toMatchObject({ accessible: true, accessibilityRole: "image", accessibilityLabel: "Crystal looks puzzled" });
  });

  it("swaps the beak mid-chirp and adds the raised wing mid-flap", () => {
    const fills = (el: React.ReactElement) => all(render(el), "Path").map((p) => p.props.fill);
    expect(fills(<Robin beakOpen wingUp />).length).toBeGreaterThan(fills(<Robin />).length);
  });
});

describe("<Icon>", () => {
  it("draws the web's glyph at its size in the given colour, hidden from screen readers", () => {
    const r = render(<Icon name="mail" size={36} color={COLOR.signal} />);
    const svg = all(r, "Svg")[0]!;
    expect(svg.props).toMatchObject({ width: 36, height: 36, accessibilityElementsHidden: true });
    const paths = all(r, "Path");
    expect(paths).toHaveLength(ICONS.mail.d.length);
    for (const p of paths) expect(p.props.fill).toBe(COLOR.signal);
    onDeviceGrid(paths);
  });
});

describe("<Text>", () => {
  it("sets a role's font file, size, line and tracking", () => {
    const t = all(render(<Text variant="tNumXl">$1,204.50</Text>), "Text")[0]!;
    expect(flat(t.props.style)).toMatchObject({ fontFamily: "Geist-SemiBold", fontSize: 32, lineHeight: 40, letterSpacing: -0.96, color: ROLE.text });
  });

  it("narrows Dogica's spaces as the web's word-spacing does", () => {
    const r = render(<Text variant="pxTitle">Savings goals</Text>);
    const spans = all(r, "Text");
    expect(spans).toHaveLength(2);
    expect(flat(spans[1]!.props.style).letterSpacing).toBe(-4);
    expect(spans[1]!.props.children).toBe(" ");
  });
});

describe("controls", () => {
  it("a primary button: the red frame on its edge, white label, a button to assistive tech", () => {
    const onPress = vi.fn();
    const r = render(
      <Button size="lg" arrow onPress={onPress}>
        Email me a sign-in link
      </Button>,
    );
    const press = all(r, "Pressable")[0]!;
    expect(press.props).toMatchObject({ accessibilityRole: "button", accessibilityLabel: "Email me a sign-in link", disabled: false });
    expect(r.root.findAll((n) => is(n, "Text") && n.props.children === "Email me a sign-in link")[0]!.props.style).toBeDefined();
    const frame = r.root.findByType(PixelFrame);
    expect(frame.props).toMatchObject({ frame: "px-btn-primary", raise: true, state: "" });
    expect(flat(frame.props.style)).toMatchObject({ height: 44 });
  });

  it("a disabled button goes silver and says so", () => {
    const r = render(
      <Button disabled onPress={() => {}}>
        Sending…
      </Button>,
    );
    expect(all(r, "Pressable")[0]!.props.accessibilityState).toEqual({ disabled: true, busy: false });
    expect(r.root.findByType(PixelFrame).props).toMatchObject({ state: ":disabled", raise: false });
  });

  it("a small button still reaches a 44px touch target", () => {
    const r = render(<Button onPress={() => {}}>Save</Button>);
    expect(all(r, "Pressable")[0]!.props.hitSlop).toBe(4);
  });

  it("a field: a labelled input in the stone frame, ink when focused, red when invalid", () => {
    const r = render(<Field label="Email" testID="email" />);
    const input = all(r, "TextInput")[0]!;
    expect(input.props).toMatchObject({ accessibilityLabel: "Email", placeholderTextColor: "#767676" });
    expect(flat(input.props.style)).toMatchObject({ fontFamily: "Geist-Regular", fontSize: 16 });
    expect(r.root.findByType(PixelFrame).props.state).toBe("");
    act(() => input.props.onFocus({}));
    expect(r.root.findByType(PixelFrame).props.state).toBe(":focus-within");
    const bad = render(<Field label="Email" invalid />);
    expect(bad.root.findByType(PixelFrame).props.state).toBe("[data-invalid='true']");
  });

  it("a text action and an icon tile", () => {
    const tb = render(<TextButton onPress={() => {}}>Use a different email</TextButton>);
    expect(all(tb, "Pressable")[0]!.props).toMatchObject({ accessibilityRole: "button", accessibilityLabel: "Use a different email" });
    const tile = render(<IconTile name="mail" />);
    expect(tile.root.findByType(PixelFrame).props.frame).toBe("px-tile");
    expect(all(tile, "Svg")[0]!.props.width).toBe(24);
  });
});

describe("<BrandStage>", () => {
  it("is the web's sign-in stage at rest: Crystal, her shadow, the wordmark, the tag, the rule and a savings line", () => {
    reducedMotion.value = true;
    const r = render(<BrandStage />);
    reducedMotion.value = false;
    const texts = all(r, "Text").map((t) => t.props.children).flat();
    expect(texts.join("")).toContain("Budgts"); // one letter per view, for the ripple
    expect(texts).toEqual(expect.arrayContaining(["Every dollar has a job."]));
    expect(texts).not.toContain("Small savings add up."); // at rest only the first line
    expect(r.root.findByType(Robin).props).toMatchObject({ mood: "happy", scale: 4 });
  });
});
