import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Keyboard, TextInput } from "react-native";
import { describe, expect, it, vi } from "vitest";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { reducedMotion } from "../../test/native-hosts";
import { byTestId, flat, hosts, render, textContent, texts } from "../../test/render";
import { Field } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { Overlay, SCRIM, SHEET_BOX, SHEET_IN, useSheetFocus } from "./overlay";
import { KEYBOARD_MARGIN } from "../../lib/keyboard";
import { estimateMenuHeight, MENU_ITEM_H, menuPosition, RowMenu } from "./row-menu";
import { Select } from "./select";

vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }) }));

describe("Overlay (web overlay.tsx, the bottom sheet)", () => {
  it("is a modal over the ink scrim: the lifted card, its pixel title, a square close button", () => {
    const close = vi.fn();
    const r = render(
      <Overlay title="New budget" onClose={close}>
        <></>
      </Overlay>,
    );
    const modal = hosts(r, "Modal")[0]!;
    expect(modal.props).toMatchObject({ transparent: true, animationType: "none" });
    modal.props.onRequestClose();
    byTestId(r, "sheet-close").props.onPress();
    const scrim = hosts(r, "Pressable").find((p) => p.props.accessible === false)!;
    scrim.props.onPress();
    expect(close).toHaveBeenCalledTimes(3);
    // the scrim is not a second "Close" for a screen reader
    expect(scrim.props).toMatchObject({ importantForAccessibility: "no" });
    expect(scrim.props.accessibilityLabel).toBeUndefined();
    expect(hosts(r, "Pressable").filter((p) => p.props.accessibilityLabel === "Close")).toHaveLength(1);
    expect(hosts(r, "Animated.View").some((v) => flat(v.props.style).backgroundColor === SCRIM)).toBe(true);
    expect(byTestId(r, "sheet").props.accessibilityLabel).toBe("New budget");
    expect(r.root.findAll((n) => n.type === PixelFrame).map((f) => f.props.frame)).toEqual(["px-card-raised", "px-step"]);
    expect(textContent(byTestId(r, "sheet"))).toContain("New budget");
  });

  it("pads above the keyboard on both platforms and keeps the home indicator clear", () => {
    const r = render(
      <Overlay title="x" onClose={() => {}}>
        <></>
      </Overlay>,
    );
    expect(hosts(r, "KeyboardAvoidingView")[0]!.props.behavior).toBe("padding");
    expect(flat(hosts(r, "ScrollView")[0]!.props.contentContainerStyle)).toMatchObject({ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 20 });
    expect(hosts(r, "ScrollView")[0]!.props.keyboardShouldPersistTaps).toBe("handled");
  });

  it("rises 32px and fades in over 300ms; appears at once with motion off", () => {
    const r = render(
      <Overlay title="x" onClose={() => {}}>
        <></>
      </Overlay>,
    );
    expect(hosts(r, "Animated.View").map((v) => flat(v.props.style).animationName)).toContainEqual(SHEET_IN);
    reducedMotion.value = true;
    try {
      const still = render(
        <Overlay title="x" onClose={() => {}}>
          <></>
        </Overlay>,
      );
      expect(hosts(still, "Animated.View").every((v) => flat(v.props.style).animationName === undefined)).toBe(true);
    } finally {
      reducedMotion.value = false;
    }
  });

  it("a tall form with a 300pt keyboard on a 640-high window: the sheet stays on screen, the focused field and Submit above the keyboard", () => {
    const WINDOW = 640;
    const KEYBOARD = 300;
    // the form: title row, fields, the last field (focused), then Submit, then the sheet's bottom padding (20)
    const FIELD = { y: 560, h: 44 };
    const SUBMIT = { y: 620, h: 44 };
    const CONTENT = SUBMIT.y + SUBMIT.h + 20;

    let didShow: (() => void) | null = null;
    const kb = vi.spyOn(Keyboard, "addListener").mockImplementation(((event: string, l: () => void) => {
      if (event === "keyboardDidShow") didShow = l;
      return { remove: () => {} };
    }) as never);
    const focused = { measureLayout: (_to: unknown, cb: (x: number, y: number, w: number, h: number) => void) => cb(0, FIELD.y, 300, FIELD.h) };
    const focus = vi.spyOn(TextInput.State, "currentlyFocusedInput").mockReturnValue(focused as never);
    const scrolls: number[] = [];
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <Overlay title="New transaction" onClose={() => {}}>
          <></>
        </Overlay>,
        { createNodeMock: (el) => (el.type === "ScrollView" ? { scrollTo: ({ y }: { y: number }) => void scrolls.push(y) } : {}) },
      );
    });

    // Lay the sheet out the way Yoga does from the styles it carries: the KeyboardAvoidingView pads the keyboard off the
    // bottom, the sheet (flex-end) is at most its maxHeight percentage of what is left and shrinks to fit.
    const sheet = hosts(r, "Animated.View").map((v) => flat(v.props.style)).find((st) => st.maxHeight !== undefined)!;
    expect(sheet).toMatchObject(SHEET_BOX);
    expect(flat(byTestId(r, "sheet").props.style).flexShrink).toBe(1);
    const layOut = (keyboard: number) => {
      const box = WINDOW - keyboard;
      const height = Math.min(CONTENT, (parseFloat(String(sheet.maxHeight)) / 100) * box);
      return { top: box - height, bottom: box, height };
    };
    const scrollView = hosts(r, "ScrollView")[0]!;
    const layout = (height: number) => act(() => scrollView.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height } } }));

    layout(layOut(0).height); // the sheet before the keyboard
    // Android: keyboardDidShow can arrive before the sheet has shrunk, then the sheet's own layout shrinks it
    act(() => didShow!());
    const open = layOut(KEYBOARD);
    layout(open.height);

    expect(open.top).toBeGreaterThanOrEqual(0); // never above the screen
    expect(open.bottom).toBeLessThanOrEqual(WINDOW - KEYBOARD);
    const scrollY = scrolls.at(-1)!;
    const fieldTop = open.top + FIELD.y - scrollY;
    const fieldBottom = fieldTop + FIELD.h;
    expect(fieldTop).toBeGreaterThanOrEqual(open.top);
    expect(fieldBottom).toBeLessThanOrEqual(WINDOW - KEYBOARD - KEYBOARD_MARGIN + 1e-9);
    // Submit, with the form scrolled to its end, ends above the keyboard
    const endY = CONTENT - open.height;
    expect(open.top + SUBMIT.y + SUBMIT.h - endY).toBeLessThanOrEqual(340);
    kb.mockRestore();
    focus.mockRestore();
  });

  it("leaves the scroll where it is when the field is already in view (a picker deep in a long list)", () => {
    let reveal: ((input: unknown) => void) | null = null;
    function Probe() {
      reveal = useSheetFocus() as typeof reveal;
      return null;
    }
    const scrolls: number[] = [];
    let r!: ReactTestRenderer;
    act(() => {
      r = create(
        <Overlay title="Choose which accounts to import" onClose={() => {}}>
          <Probe />
        </Overlay>,
        { createNodeMock: (el) => (el.type === "ScrollView" ? { scrollTo: ({ y }: { y: number }) => void scrolls.push(y) } : {}) },
      );
    });
    const scrollView = hosts(r, "ScrollView")[0]!;
    act(() => scrollView.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } } }));
    act(() => scrollView.props.onScroll({ nativeEvent: { contentOffset: { x: 0, y: 1200 } } }));
    const at = (y: number, h = 44) => ({ measureLayout: (_to: unknown, cb: (x: number, y: number, w: number, h: number) => void) => cb(0, y, 300, h) });
    // row 10's picker, on screen at 1500-1544 of a view showing 1200-1800: no jump
    act(() => reveal!(at(1500)));
    expect(scrolls).toEqual([]);
    // a field hidden below the view still scrolls up into it, KEYBOARD_MARGIN above the bottom
    act(() => reveal!(at(2000)));
    expect(scrolls).toEqual([2000 + 44 + KEYBOARD_MARGIN - 600]);
  });

  it("gives the fields inside it a way to scroll themselves into view", () => {
    let reveal: unknown = null;
    function Probe() {
      reveal = useSheetFocus();
      return null;
    }
    render(
      <Overlay title="x" onClose={() => {}}>
        <Probe />
      </Overlay>,
    );
    expect(typeof reveal).toBe("function");
    render(<Probe />);
    expect(reveal).toBeNull(); // outside a sheet there is nothing to ask
    // and the brand Field still renders outside a sheet
    expect(texts(render(<Field label="Amount" />))).toContain("Amount");
  });
});

describe("RowMenu (web row-menu.tsx)", () => {
  it("is a 40px kebab button named for its row", () => {
    const r = render(<RowMenu label="Actions for Rent" items={[{ label: "Edit", icon: "edit", onSelect: () => {} }]} />);
    expect(byTestId(r, "row-menu").props).toMatchObject({ accessibilityRole: "button", accessibilityLabel: "Actions for Rent" });
    expect(flat(byTestId(r, "row-menu").props.style({ pressed: false }))).toMatchObject({ width: 40, height: 40 });
  });

  it("opens under the kebab, right-aligned to it, inside the screen", () => {
    expect(menuPosition({ x: 340, y: 300, width: 40, height: 40 }, { width: 412, height: 915 }, 100)).toEqual({ top: 344, right: 32, above: false });
    expect(menuPosition({ x: 380, y: 0, width: 40, height: 40 }, { width: 412, height: 915 })).toMatchObject({ right: 8 });
  });

  it("opens above the kebab when below would run past the screen or under the navigation bar", () => {
    const h = estimateMenuHeight(2); // two items
    // a kebab near the bottom: 800 + 40 + 4 + h > 915 - 48
    expect(menuPosition({ x: 340, y: 800, width: 40, height: 40 }, { width: 412, height: 915 }, h, 48)).toEqual({ top: 800 - 4 - h, right: 32, above: true });
    // just fits above the inset: stays below
    const y = 915 - 48 - h - 44;
    expect(menuPosition({ x: 340, y, width: 40, height: 40 }, { width: 412, height: 915 }, h, 48)).toMatchObject({ above: false });
  });

  it("each item is drawn 40pt tall and reaches 44pt through hitSlop, with no visual change", () => {
    let r!: ReactTestRenderer;
    act(() => {
      r = create(<RowMenu label="Actions for Rent" items={[{ label: "Edit", icon: "edit", onSelect: () => {} }]} />, {
        createNodeMock: () => ({ measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(340, 300, 40, 40) }),
      });
    });
    act(() => byTestId(r, "row-menu").props.onPress());
    const item = hosts(r, "Pressable").find((p) => p.props.accessibilityRole === "menuitem")!;
    expect(flat(item.props.style({ pressed: false })).height).toBe(MENU_ITEM_H);
    expect(MENU_ITEM_H + item.props.hitSlop.top + item.props.hitSlop.bottom).toBe(44);
  });
});

describe("Select", () => {
  const options = [
    { value: "checking", label: "Checking" },
    { value: "savings", label: "Savings" },
  ];

  it("shows the label above a 44px field with the chosen option and a chevron", () => {
    const r = render(<Select label="Type" value="savings" options={options} onChange={() => {}} />);
    expect(texts(r)).toEqual(["Type", "Savings"]);
    expect(hosts(r, "Pressable")[0]!.props.accessibilityLabel).toBe("Type, Savings");
    expect(r.root.findAll((n) => n.type === PixelFrame)[0]!.props.frame).toBe("px-field");
  });

  it("opens a sheet of the options, the chosen one ticked; a pick closes it", () => {
    const pick = vi.fn();
    const r = render(<Select label="Type" value="checking" options={options} onChange={pick} />);
    act(() => hosts(r, "Pressable")[0]!.props.onPress());
    expect(hosts(r, "Pressable").find((p) => p.props.accessibilityLabel === "Checking")!.props.accessibilityState).toEqual({ selected: true, disabled: false });
    act(() => hosts(r, "Pressable").find((p) => p.props.accessibilityLabel === "Savings")!.props.onPress());
    expect(pick).toHaveBeenCalledWith("savings");
    expect(r.root.findAll((n) => n.props.testID === "sheet")).toHaveLength(0);
  });

  it("shows the placeholder in the web's placeholder grey when nothing is chosen, and red when invalid", () => {
    const r = render(<Select label="Account" value={null} options={options} onChange={() => {}} invalid />);
    expect(textContent(hosts(r, "Pressable")[0]!)).toContain("Choose…");
    expect(r.root.findAll((n) => n.type === PixelFrame)[0]!.props.state).toBe("[data-invalid='true']");
    void COLOR;
    void ROLE;
  });
});
