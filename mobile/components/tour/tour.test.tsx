import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLOR, ROLE } from "../../lib/brand/shared";
import { formatMoney } from "../../lib/home/format";
import { GUIDE_COPY, type TourStepId } from "../../lib/tour/shared";
import { byTestId, flat, hosts, render, textContent, texts } from "../../test/render";
import { Text } from "../brand/text";
import { OnboardingView } from "./onboarding-view";
import { GuideScene } from "./scenes";
import { HEADING_SPACE, Progress, TourCard } from "./tour-card";
import { TourView } from "./tour-view";

const native = vi.hoisted(() => ({
  back: [] as (() => boolean)[],
  announced: [] as string[],
}));

vi.mock("react-native", async () => ({
  ...(await import("../../test/native-hosts")).reactNativeMock(),
  BackHandler: {
    addEventListener: (_e: string, fn: () => boolean) => {
      native.back.push(fn);
      return { remove: () => native.back.splice(native.back.indexOf(fn), 1) };
    },
  },
  AccessibilityInfo: { announceForAccessibility: (s: string) => native.announced.push(s) },
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }) }));

beforeEach(() => {
  native.back.length = 0;
  native.announced.length = 0;
});

const press = (r: ReturnType<typeof render>, id: string) => act(() => byTestId(r, id).props.onPress());
const step = (r: ReturnType<typeof render>) =>
  r.root.findAll((n) => typeof n.type === "string" && typeof n.props.testID === "string" && n.props.testID.startsWith("tour-step-"))[0]!.props.testID;

describe("TourCard (web tour-card.tsx)", () => {
  const card = (over: Partial<Parameters<typeof TourCard>[0]> = {}) => (
    <TourCard heading="Hi, I'm Crystal." body="Words." scene={null} dotCount={9} dotIndex={2} {...over} />
  );

  it("shows the whole guide as square cells: done in ink, now in red, the rest on the track", () => {
    const r = render(<Progress count={9} index={2} />);
    const cells = r.root.findAll((n) => n.props.testID === "tour-progress-cell" && typeof n.type === "string");
    expect(cells.map((c) => flat(c.props.style).backgroundColor)).toEqual([ROLE.ink, ROLE.ink, COLOR.signal, ...Array(6).fill(ROLE.track)]);
    expect(flat(cells[0]!.props.style)).toMatchObject({ width: 8, height: 8 });
    expect(flat(byTestId(r, "tour-progress").props.style).gap).toBe(3);
    expect(byTestId(r, "tour-progress").props.accessibilityValue).toEqual({ min: 1, max: 9, now: 3, text: "Step 3 of 9" });
  });

  it("sets the heading at the web's 26px / 1.15 and hides the scene from screen readers", () => {
    const r = render(card());
    const words = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "tour-heading-word");
    expect(words.map((w) => textContent(w))).toEqual(["Hi,", "I'm", "Crystal."]);
    expect(flat(words[0]!.props.style)).toMatchObject({ fontSize: 26, lineHeight: 29.9, letterSpacing: -0.65 });
    // one view per word, wrapped and centred like the web's inline-block words, a space apart
    expect(flat(byTestId(r, "tour-heading").props.style)).toMatchObject({ flexWrap: "wrap", justifyContent: "center", columnGap: HEADING_SPACE });
    // read as one header, not word by word
    expect(byTestId(r, "tour-heading").props).toMatchObject({ accessible: true, accessibilityRole: "header", accessibilityLabel: "Hi, I'm Crystal." });
    expect(byTestId(r, "tour-scene").props.importantForAccessibility).toBe("no-hide-descendants");
    expect(texts(r)).toContain("CRYSTAL");
  });

  it("offers Back and Skip only where the step has them", () => {
    expect(() => byTestId(render(card()), "tour-back")).toThrow();
    const onBack = vi.fn();
    const onSkip = vi.fn();
    const r = render(card({ onBack, onSkip }));
    byTestId(r, "tour-back").props.onPress();
    byTestId(r, "tour-skip").props.onPress();
    expect(onBack).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
  });
});

describe("OnboardingView (web onboarding-wizard-content.tsx)", () => {
  const ids: TourStepId[] = ["crystal", "welcome", "auto-capture", "currency"];
  const view = (onSubmit = vi.fn(async () => null as string | null)) =>
    render(<OnboardingView stepIds={ids} totalVisible={9} defaultCurrency="USD" currencies={["USD", "EUR", "GBP"]} onSubmit={onSubmit} />);

  it("walks Crystal's cards in the server's order with the guide's own words, counting the whole guide", () => {
    const r = view();
    expect(step(r)).toBe("tour-step-crystal");
    expect(byTestId(r, "tour-heading").props.accessibilityLabel).toBe(GUIDE_COPY.crystal.heading);
    expect(native.announced).toEqual(["Step 1 of 9: Meet Crystal"]);
    press(r, "tour-primary");
    expect(step(r)).toBe("tour-step-welcome");
    expect(byTestId(r, "tour-progress").props.accessibilityValue.now).toBe(2);
    expect(native.announced.at(-1)).toBe("Step 2 of 9: What Budgts does");
  });

  it("Skip jumps to the required currency card instead of leaving; Back and Android back step back", () => {
    const r = view();
    press(r, "tour-skip");
    expect(step(r)).toBe("tour-step-currency");
    expect(() => byTestId(r, "tour-skip")).toThrow(); // the last card has no Skip
    press(r, "tour-back");
    expect(step(r)).toBe("tour-step-auto-capture");
    let handled = false;
    act(() => void (handled = native.back.at(-1)!()));
    expect(handled).toBe(true);
    expect(step(r)).toBe("tour-step-welcome");
    act(() => void native.back.at(-1)!());
    // on the first card, back does what it does anywhere else
    expect(native.back.at(-1)!()).toBe(false);
  });

  it("previews and submits the chosen currency, pending until the shell moves on", async () => {
    let resolve!: (v: string | null) => void;
    const onSubmit = vi.fn(() => new Promise<string | null>((res) => (resolve = res)));
    const r = view(onSubmit);
    press(r, "tour-skip");
    expect(texts(byTestId(r, "scene-currency-amount"))).toEqual([formatMoney(248000, "USD")]);
    press(r, "onboarding-currency");
    press(r, "onboarding-currency-option-EUR");
    expect(texts(byTestId(r, "scene-currency-amount"))).toEqual([formatMoney(248000, "EUR")]);
    press(r, "tour-primary");
    expect(onSubmit).toHaveBeenCalledWith("EUR");
    expect(byTestId(r, "tour-primary").props.accessibilityLabel).toBe("Saving…");
    expect(byTestId(r, "tour-primary").props.disabled).toBe(true);
    await act(async () => resolve(null));
    expect(byTestId(r, "tour-primary").props.accessibilityLabel).toBe("Saving…");
  });

  it("shows a failed save and lets the user try again", async () => {
    const r = view(vi.fn(async () => "Couldn't reach Budgts. Check your connection and try again."));
    press(r, "tour-skip");
    await act(async () => byTestId(r, "tour-primary").props.onPress());
    expect(textContent(byTestId(r, "onboarding-error"))).toBe("Couldn't reach Budgts. Check your connection and try again.");
    expect(byTestId(r, "onboarding-error").props.accessibilityRole).toBe("alert");
    expect(byTestId(r, "tour-primary").props.accessibilityLabel).toBe(GUIDE_COPY.currency.cta);
    expect(byTestId(r, "tour-primary").props.disabled).toBeFalsy();
  });
});

describe("TourView (web tour-wizard-content.tsx)", () => {
  const view = (over: Partial<Parameters<typeof TourView>[0]> = {}) =>
    render(
      <TourView
        stepIds={["bank", "auto-sort", "money-left", "plan", "done"]}
        offset={4}
        totalVisible={9}
        currency="USD"
        bank={(label) => <Text variant="body">{label}</Text>}
        onFinish={vi.fn(async () => null)}
        {...over}
      />,
    );

  it("continues the progress from the onboarding cards", () => {
    const r = view();
    expect(byTestId(r, "tour-progress").props.accessibilityValue).toMatchObject({ now: 5, max: 9 });
    expect(native.announced).toEqual(["Step 5 of 9: Connect your bank"]);
  });

  it("puts the connect action on the bank card, with a way on by hand", () => {
    const r = view();
    expect(texts(byTestId(r, "tour-media"))).toContain("Connect a bank");
    press(r, "tour-by-hand");
    expect(step(r)).toBe("tour-step-auto-sort");
  });

  it("Skip marks the guide seen from any card, and a failure is shown with the guide still open", async () => {
    const onFinish = vi.fn(async () => "Something went wrong. Please try again.");
    const r = view({ onFinish });
    await act(async () => byTestId(r, "tour-skip").props.onPress());
    expect(onFinish).toHaveBeenCalledOnce();
    expect(textContent(byTestId(r, "tour-error"))).toBe("Something went wrong. Please try again.");
    expect(step(r)).toBe("tour-step-bank");
  });

  it("ends on the web's last card: See my finances, and How Budgts Works as a link only once Help is open", async () => {
    const onFinish = vi.fn(async () => null);
    const r = view({ stepIds: ["money-left", "plan", "done"], offset: 6, onFinish });
    press(r, "tour-skip"); // not a jump here: Skip finishes
    expect(onFinish).toHaveBeenCalledOnce();
    press(r, "tour-primary");
    press(r, "tour-primary");
    expect(step(r)).toBe("tour-step-done");
    expect(() => byTestId(r, "tour-skip")).toThrow();
    expect(textContent(byTestId(r, "tour-footnote"))).toBe("Replay this guide, or read How Budgts Works, anytime from Help.");
    expect(byTestId(r, "tour-how-it-works").props.accessibilityRole).toBeUndefined();
    const open = vi.fn();
    const replay = view({ stepIds: ["done"], offset: 0, totalVisible: 1, onHowItWorks: open });
    expect(byTestId(replay, "tour-how-it-works").props.accessibilityRole).toBe("link");
    byTestId(replay, "tour-how-it-works").props.onPress();
    expect(open).toHaveBeenCalledOnce();
  });
});

describe("GuideScene rest frames (web scenes.tsx, motion off)", () => {
  const all: TourStepId[] = ["crystal", "welcome", "auto-capture", "currency", "bank", "auto-sort", "money-left", "plan", "done"];

  it.each(all)("%s draws its finished state", (id) => {
    const r = render(<GuideScene id={id} currency="USD" />);
    expect(byTestId(r, `scene-${id}`)).toBeTruthy();
  });

  it("uses the web's sample words and figures in the user's currency", () => {
    expect(texts(render(<GuideScene id="crystal" currency="USD" />))).toEqual(expect.arrayContaining(["Hi!", "CRYSTAL", "Your budget buddy"]));
    expect(texts(render(<GuideScene id="welcome" currency="USD" />))).toEqual(["Track", "Plan", "Grow"]);
    const capture = texts(render(<GuideScene id="auto-capture" currency="EUR" />));
    expect(capture).toEqual(expect.arrayContaining(["Blue Bottle Coffee", "Shell", "Netflix", `−${formatMoney(540, "EUR")}`]));
    const plan = texts(render(<GuideScene id="plan" currency="USD" />));
    expect(plan).toEqual(expect.arrayContaining([`${formatMoney(21150, "USD")} / ${formatMoney(40000, "USD")}`, `+${formatMoney(5000, "USD")}`]));
    expect(texts(render(<GuideScene id="done" currency="USD" />))).toEqual(expect.arrayContaining(["Home", " · What's left this month"]));
  });

  it("sizes Crystal as the web does: 104px tall on her introduction", () => {
    const svg = hosts(render(<GuideScene id="crystal" currency="USD" />), "Svg").find((s) => s.props.height === 104)!;
    expect(svg.props.width).toBe(123);
  });
});
