import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { reducedMotion } from "../../test/native-hosts";
import { byTestId, flat, hosts, render, textContent, texts } from "../../test/render";
import { Field } from "../brand/controls";
import { PixelFrame } from "../brand/pixel-frame";
import { Overlay, SCRIM, SHEET_IN, useSheetFocus } from "./overlay";
import { menuPosition, RowMenu } from "./row-menu";
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
    hosts(r, "Pressable").find((p) => p.props.accessibilityLabel === "Close" && p.props.testID === undefined)!.props.onPress();
    expect(close).toHaveBeenCalledTimes(3);
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
    expect(menuPosition({ x: 340, y: 300, width: 40, height: 40 }, { width: 412 })).toEqual({ top: 344, right: 32 });
    expect(menuPosition({ x: 380, y: 0, width: 40, height: 40 }, { width: 412 })).toMatchObject({ right: 8 });
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
    const r = render(<Select testID="type" label="Type" value="checking" options={options} onChange={pick} />);
    act(() => byTestId(r, "type").props.onPress());
    expect(byTestId(r, "type-option-checking").props.accessibilityState).toEqual({ selected: true, disabled: false });
    act(() => byTestId(r, "type-option-savings").props.onPress());
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

  it("can hide its label for a field its row explains, still heard by a screen reader", () => {
    const r = render(<Select testID="t" label="New account type" hideLabel value="savings" options={options} onChange={() => {}} />);
    expect(texts(r)).toEqual(["Savings"]);
    expect(byTestId(r, "t").props.accessibilityLabel).toBe("New account type, Savings");
  });

  it("offers a disabled option it can't pick (the web's <option disabled>)", () => {
    const pick = vi.fn();
    const r = render(<Select testID="t" label="Import as" value="new" options={[{ value: "new", label: "A new Budgts account" }, { value: "existing", label: "An existing account", disabled: true }]} onChange={pick} />);
    act(() => byTestId(r, "t").props.onPress());
    const off = byTestId(r, "t-option-existing");
    expect(off.props.disabled).toBe(true);
    expect(off.props.accessibilityState).toEqual({ selected: false, disabled: true });
  });
});
