import { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TourStepId } from "../../lib/tour/shared";
import { reducedMotion } from "../../test/native-hosts";
import { byTestId, flat, hosts, render } from "../../test/render";
import { CARRY, ENTER_BACK, ENTER_NEXT, FEED_LAND, RISE, feed, slot } from "./guide-keyframes";
import { OnboardingView } from "./onboarding-view";
import { GuideScene } from "./scenes";
import { TourCard } from "./tour-card";

vi.mock("react-native", async () => ({
  ...(await import("../../test/native-hosts")).reactNativeMock(),
  BackHandler: { addEventListener: () => ({ remove: () => {} }) },
  AccessibilityInfo: { announceForAccessibility: () => {} },
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return { useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]) };
});
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

afterEach(() => {
  reducedMotion.value = false;
});

const animated = (r: ReturnType<typeof render>) => hosts(r, "Animated.View").map((v) => flat(v.props.style)).filter((s) => s.animationName);

/** The cascade parts of the current card (web `.enter`), in order: scene, name, body, (media), actions. */
const enters = (r: ReturnType<typeof render>) =>
  animated(r).filter((s) => [RISE, ENTER_NEXT, ENTER_BACK].includes(s.animationName as typeof RISE) && ["640ms", "560ms"].includes(s.animationDuration as string));

describe("the card's entrance (guide.module.css .stage/.enter/.word)", () => {
  const ids: TourStepId[] = ["crystal", "welcome", "currency"];
  const view = () => render(<OnboardingView stepIds={ids} totalVisible={9} defaultCurrency="USD" currencies={["USD"]} onSubmit={async () => null} />);

  it("rises in on the first card, each part 80ms after the last from 60ms", () => {
    const parts = enters(view());
    expect(parts.every((s) => s.animationName === RISE && s.animationDuration === "640ms" && s.animationFillMode === "backwards")).toBe(true);
    expect(parts.map((s) => s.animationDelay)).toEqual(["60ms", "140ms", "300ms", "460ms"]); // i = 0, 1, 3, 5
  });

  it("enters from the right going on and from the left going back, 70ms apart", () => {
    const r = view();
    act(() => byTestId(r, "tour-primary").props.onPress());
    let parts = enters(r);
    expect(parts.every((s) => s.animationName === ENTER_NEXT && s.animationDuration === "560ms")).toBe(true);
    expect(parts.map((s) => s.animationDelay)).toEqual(["0ms", "70ms", "210ms", "350ms"]);
    act(() => byTestId(r, "tour-back").props.onPress());
    parts = enters(r);
    expect(parts.every((s) => s.animationName === ENTER_BACK)).toBe(true);
  });

  it("keeps each heading word's keyframes one constant, so a re-render never replays the heading", () => {
    const words = (r: ReturnType<typeof render>) =>
      animated(r).filter((s) => JSON.stringify(s.animationName).includes("translateY\":13")).map((s) => s.animationName);
    const a = words(render(<TourCard heading="One two" body="b" scene={null} dotCount={1} dotIndex={0} />));
    const b = words(render(<TourCard heading="One two" body="b" scene={null} dotCount={1} dotIndex={0} />));
    expect(a[0]).toBe(b[0]); // the same object, not an equal copy
  });

  it("raises the heading word by word, 45ms apart after 180ms, and pops the current cell in three steps", () => {
    const r = render(<TourCard heading="Know what's left." body="b" scene={null} dotCount={3} dotIndex={1} />);
    const words = animated(r).filter((s) => s.animationDuration === "560ms" && JSON.stringify(s.animationName).includes("translateY\":13"));
    expect(words.map((s) => s.animationDelay)).toEqual(["180ms", "225ms", "270ms"]);
    const pop = animated(r).find((s) => s.animationDuration === "300ms")!;
    expect(pop).toMatchObject({ animationDelay: "120ms", animationTimingFunction: { steps: 3, modifier: "jump-end" } });
  });

  it("rests, fully shown, with Reduce Motion on", () => {
    reducedMotion.value = true;
    expect(animated(view())).toEqual([]);
  });
});

describe("the scenes act out their features", () => {
  const all: TourStepId[] = ["crystal", "welcome", "auto-capture", "currency", "bank", "auto-sort", "money-left", "plan", "done"];

  it.each(all)("%s shows its finished state, still, with Reduce Motion on", (id) => {
    reducedMotion.value = true;
    expect(animated(render(<GuideScene id={id} currency="USD" />))).toEqual([]);
  });

  it("Crystal drops in, squashes on landing, then says hi", () => {
    const r = render(<GuideScene id="crystal" currency="USD" />);
    expect(flat(byTestId(r, "crystal-drop").props.style)).toMatchObject({ animationDuration: "1150ms", animationDelay: "150ms" });
    const bubble = animated(r).find((s) => s.animationDuration === "330ms")!;
    expect(bubble).toMatchObject({ animationDelay: "1000ms", transformOrigin: "0% 100%" });
  });

  it("purchases land at 4%, 18% and 32% of a 6.4s loop", () => {
    const rows = animated(render(<GuideScene id="auto-capture" currency="USD" />)).filter((s) => s.animationDuration === "6400ms");
    expect(rows.map((s) => s.animationName)).toEqual(FEED_LAND.map(feed));
    expect(rows.every((s) => s.animationIterationCount === "infinite")).toBe(true);
  });

  it("the lock carries the link across in 7 steps, resting mid-link", () => {
    const lock = flat(byTestId(render(<GuideScene id="bank" currency="USD" />), "bank-lock").props.style);
    expect(lock).toMatchObject({ animationName: CARRY, animationDuration: "2800ms", animationDelay: "600ms", animationTimingFunction: { steps: 7, modifier: "jump-end" } });
    reducedMotion.value = true;
    expect(flat(byTestId(render(<GuideScene id="bank" currency="USD" />), "bank-lock").props.style).transform).toEqual([{ translateX: 36 }]);
  });

  it("the done card lights each tab for its own quarter of the loop, in order", () => {
    // at each quarter's start, exactly tab k is lit
    for (let k = 0; k < 4; k++) {
      const lit = [0, 1, 2, 3].filter((j) => {
        const frames = slot(j);
        const at = Object.keys(frames)
          .map((key) => [parseFloat(key), frames[key]!.opacity] as const)
          .filter(([p]) => p <= k * 25)
          .sort((a, b) => b[0] - a[0])[0]!;
        return at[1] === 1;
      });
      expect(lit).toEqual([k]);
    }
  });
});
