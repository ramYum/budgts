import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { Button, TextButton } from "./controls";
import { PixelFrame } from "./pixel-frame";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const flat = (style: unknown): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : ((style as Record<string, unknown>) ?? {});

/**
 * Regression (Android emulator, 2026-09-29): a press style whose `transform`
 * turned `undefined` on release reached React Native's style processor as
 * `null` ("Cannot read property 'forEach' of null") and crashed the sign-in
 * screen. The resting transform is an empty list, never undefined.
 */
describe("press transforms are always a list", () => {
  it("a button at rest", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<Button onPress={() => {}}>Send</Button>);
    });
    expect(flat(r.root.findByType(PixelFrame).props.style).transform).toEqual([]);
  });

  it("a text button at rest and pressed", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<TextButton onPress={() => {}}>Use a different email</TextButton>);
    });
    const styleFn = r.root.find((n) => typeof n.props.style === "function").props.style as (s: { pressed: boolean }) => Record<string, unknown>;
    expect(styleFn({ pressed: false }).transform).toEqual([]);
    expect(styleFn({ pressed: true }).transform).toEqual([{ scale: 0.98 }]);
  });
});
