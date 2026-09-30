import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { byTestId, flat, render, textContent, texts } from "../../test/render";
import { AppearanceView } from "./appearance-view";
import { CopyButton } from "./copy-button";
import { ProfileView, avatarLetter, signsInWith, type ProfileDetails } from "./profile-view";
import { SECURITY_FACTS, SecurityView } from "./security-view";

const copied = (r: ReturnType<typeof render>) => r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "copy-button-copied");

const details: ProfileDetails = {
  email: "alex.lee@example.com",
  displayName: "Alex",
  signInMethods: ["Email link", "Google"],
  currency: "USD",
  currencyName: "US Dollar",
  timeZoneLabel: "New York · Eastern Daylight Time",
};

const profile = (over: Partial<Parameters<typeof ProfileView>[0]> = {}) => (
  <ProfileView profile={details} onBack={() => {}} copy={async () => {}} {...over} />
);

describe("Profile (web /settings/profile)", () => {
  it("shows the web's card, details and notes, in its order", () => {
    const r = render(profile());
    const words = texts(r);
    expect(words).toContain("Profile");
    expect(textContent(byTestId(r, "profile-name"))).toBe("Alex");
    expect(textContent(byTestId(r, "profile-card"))).toContain("Signs in with an email link or Google");
    expect(words.filter((w) => ["Email", "Currency", "Time zone", "Sign-in methods"].includes(w))).toEqual([
      "Email",
      "Currency",
      "Time zone",
      "Sign-in methods",
    ]);
    expect(textContent(byTestId(r, "profile-email"))).toBe("alex.lee@example.com");
    expect(textContent(byTestId(r, "profile-currency"))).toBe("USD · US Dollar");
    expect(textContent(byTestId(r, "profile-time-zone"))).toBe("New York · Eastern Daylight Time");
    expect(textContent(byTestId(r, "profile-methods"))).toBe("Email link · Google");
    expect(texts(byTestId(r, "profile-methods-count"))).toEqual(["2 active"]);
    expect(words.join(" ")).toContain("It's set once, when you start");
    expect(words.join(" ")).toContain("each month starts at your own midnight");
  });

  it("falls back to You and the email's letter when there's no name", () => {
    const r = render(profile({ profile: { ...details, displayName: "", email: "9x@example.com" } }));
    expect(textContent(byTestId(r, "profile-name"))).toBe("You");
    expect(texts(r)).toContain("9");
  });

  it("says how the user signs in, and picks the avatar letter, as the web does", () => {
    expect(signsInWith(["Email link"])).toBe("an email link");
    expect(signsInWith(["Email link", "Google"])).toBe("an email link or Google");
    expect(signsInWith(["Apple"])).toBe("Apple");
    expect(avatarLetter({ displayName: "Alex", email: "alex@x.com" })).toBe("A");
    expect(avatarLetter({ displayName: "", email: null })).toBe("?");
  });

  it("goes back", () => {
    const onBack = vi.fn();
    byTestId(render(profile({ onBack })), "page-back").props.onPress();
    expect(onBack).toHaveBeenCalled();
  });
});

describe("CopyButton (web copy-button.tsx)", () => {
  it("copies the value, then says Copied", async () => {
    const copy = vi.fn(async () => {});
    const r = render(<CopyButton value="a@b.co" label="Copy email" copy={copy} />);
    expect(byTestId(r, "copy-button").props.accessibilityLabel).toBe("Copy email");
    expect(copied(r)).toHaveLength(0);
    await act(async () => {
      byTestId(r, "copy-button").props.onPress();
    });
    expect(copy).toHaveBeenCalledWith("a@b.co");
    expect(texts(byTestId(r, "copy-button-copied"))).toEqual(["Copied"]);
    expect(flat(byTestId(r, "copy-button-copied").props.style).animationDuration).toBe("300ms");
  });

  it("confirms nothing when the clipboard refuses", async () => {
    const r = render(<CopyButton value="a@b.co" label="Copy email" copy={async () => Promise.reject(new Error("no"))} />);
    await act(async () => {
      byTestId(r, "copy-button").props.onPress();
    });
    expect(copied(r)).toHaveLength(0);
  });

  it("lets the chip go after two seconds", async () => {
    vi.useFakeTimers();
    try {
      const r = render(<CopyButton value="x" label="Copy" copy={async () => {}} />);
      await act(async () => {
        byTestId(r, "copy-button").props.onPress();
      });
      expect(copied(r)).toHaveLength(1);
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(copied(r)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Security (web /settings/security)", () => {
  it("states the web's three facts, each ticked, and links How Budgts works", () => {
    const onHowItWorks = vi.fn();
    const r = render(<SecurityView onBack={() => {}} onHowItWorks={onHowItWorks} />);
    const words = texts(r);
    expect(textContent(byTestId(r, "security-lead"))).toContain("Your connections are protected.");
    for (const f of SECURITY_FACTS) {
      expect(words).toContain(f.title);
      expect(words).toContain(f.body);
    }
    expect(SECURITY_FACTS.map((f) => f.title)).toEqual([
      "Your bank login never reaches Budgts",
      "Only you can see your data",
      "Read-only access",
    ]);
    byTestId(r, "security-how-it-works").props.onPress();
    expect(onHowItWorks).toHaveBeenCalled();
  });
});

describe("Appearance (web /settings/appearance)", () => {
  it("reports Light as the one active state, with no toggle", () => {
    const r = render(<AppearanceView onBack={() => {}} />);
    expect(texts(r)).toEqual(["Appearance", "Light", "Dark mode isn't available yet.", "Active"]);
  });
});
