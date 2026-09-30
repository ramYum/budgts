import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { byTestId, hosts, render, textContent, texts } from "../../test/render";
import { legalLinks } from "../../lib/legal";
import { AboutView, DETAILS } from "./about-view";
import { FAQ, HelpView } from "./help-view";
import { HowItWorksView, STEPS } from "./how-it-works-view";

const has = (r: ReturnType<typeof render>, id: string) => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === id).length > 0;

describe("Help (web /help)", () => {
  it("links How Budgts works and the welcome guide", () => {
    const go = vi.fn();
    const r = render(<HelpView onBack={() => {}} go={go} />);
    byTestId(r, "help-how-it-works").props.onPress();
    byTestId(r, "help-replay-guide").props.onPress();
    expect(go.mock.calls.map((c) => c[0])).toEqual(["/help/how-it-works", "/tour"]);
    expect(texts(r)).toEqual(expect.arrayContaining(["How Budgts works", "Replay the welcome guide", "Common questions"]));
  });

  it("asks the web's five questions, the first open, each toggling on its own", () => {
    const r = render(<HelpView onBack={() => {}} go={() => {}} />);
    expect(FAQ).toHaveLength(5);
    for (const f of FAQ) expect(texts(r)).toContain(f.q);
    expect(has(r, "help-faq-0-answer")).toBe(true);
    expect(has(r, "help-faq-1-answer")).toBe(false);
    expect(byTestId(r, "help-faq-0").props.accessibilityState).toEqual({ expanded: true });

    act(() => byTestId(r, "help-faq-2").props.onPress());
    expect(textContent(byTestId(r, "help-faq-2-answer"))).toBe(FAQ[2]!.a);
    expect(has(r, "help-faq-0-answer")).toBe(true);

    act(() => byTestId(r, "help-faq-0").props.onPress());
    expect(has(r, "help-faq-0-answer")).toBe(false);
    expect(byTestId(r, "help-faq-0").props.accessibilityState).toEqual({ expanded: false });
  });
});

describe("How Budgts works (web /help/how-it-works)", () => {
  it("numbers the web's seven steps and offers the welcome guide", () => {
    const onGuide = vi.fn();
    const r = render(<HowItWorksView onBack={() => {}} onGuide={onGuide} />);
    const steps = r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "how-it-works-step");
    expect(steps).toHaveLength(7);
    expect(steps.map((s) => texts(s)[0])).toEqual(["01", "02", "03", "04", "05", "06", "07"]);
    expect(STEPS.map((s) => s.heading)).toEqual([
      "Connect your accounts",
      "Transactions arrive automatically",
      "Budgts sorts them for you",
      "You review the exceptions",
      "Set your budgets",
      "See your Money Left",
      "Track your progress",
    ]);
    expect(steps[0]!.props.accessibilityLabel).toMatch(/^Step 1\. Connect your accounts\./);
    expect(textContent(byTestId(r, "how-it-works-lead"))).toContain("Budgts keeps track.");
    byTestId(r, "how-it-works-open-guide").props.onPress();
    expect(onGuide).toHaveBeenCalled();
  });

  it("draws the thread between steps, never after the last", () => {
    const r = render(<HowItWorksView onBack={() => {}} onGuide={() => {}} />);
    const threads = hosts(r, "View").filter((v) => {
      const s = v.props.style as { position?: string; width?: number } | undefined;
      return s?.position === "absolute" && s.width === 1;
    });
    expect(threads).toHaveLength(6);
  });
});

describe("About (web /about)", () => {
  it("shows the web's facts", () => {
    const r = render(<AboutView onBack={() => {}} legal={[]} onOpen={() => {}} />);
    for (const [label, value] of DETAILS) {
      expect(texts(r)).toContain(label);
      expect(texts(r)).toContain(value);
    }
    expect(textContent(byTestId(r, "about-lead"))).toContain("brighter way to budget.");
  });

  it("lists no legal rows until the pages are live", () => {
    const r = render(<AboutView onBack={() => {}} legal={legalLinks("https://budgts.com", false)} onOpen={() => {}} />);
    expect(texts(r)).not.toContain("Legal");
  });

  it("opens each live legal page on budgts.com", () => {
    const onOpen = vi.fn();
    const r = render(<AboutView onBack={() => {}} legal={legalLinks("https://budgts.com", true)} onOpen={onOpen} />);
    expect(texts(r)).toContain("Legal");
    for (const id of ["hub-privacy", "hub-terms", "hub-support"]) byTestId(r, id).props.onPress();
    expect(onOpen.mock.calls.map((c) => c[0])).toEqual([
      "https://budgts.com/privacy",
      "https://budgts.com/terms",
      "https://budgts.com/support",
    ]);
    expect(byTestId(r, "hub-privacy").props.accessibilityLabel).toBe("Privacy policy");
  });
});
