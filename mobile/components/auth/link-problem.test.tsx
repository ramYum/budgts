import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { byTestId, render, textContent } from "../../test/render";
import { LinkProblem } from "./link-problem";

describe("LinkProblem (a signed-in sign-in link that failed)", () => {
  it("says nothing changed, and has one way back", () => {
    const onBack = vi.fn();
    const r = render(<LinkProblem problem="expired" onBack={onBack} />);
    expect(textContent(byTestId(r, "link-problem-message"))).toContain("Nothing changed, and you're still signed in.");
    byTestId(r, "link-problem-back").props.onPress();
    expect(onBack).toHaveBeenCalled();
  });
});

/**
 * The root stack's guards (app/_layout.tsx), read from the source: the test hosts can't mount Expo Router's
 * navigator. Sign-in stays signed-out only; the callback is reachable either way; the app stays signed-in only.
 */
describe("root routing", () => {
  const src = readFileSync(join(__dirname, "..", "..", "app", "_layout.tsx"), "utf8");
  const guarded = (guard: string) => {
    const m = new RegExp(`<Stack\\.Protected guard=\\{${guard.replace(/[!]/g, "\\!")}\\}>([\\s\\S]*?)</Stack\\.Protected>`).exec(src);
    return m ? m[1]! : "";
  };

  it("keeps sign-in signed-out only and the app signed-in only, as before", () => {
    expect(guarded("!session")).toContain('<Stack.Screen name="sign-in" />');
    expect(guarded("!!session")).toContain('<Stack.Screen name="(app)" />');
  });

  it("lets the callback open signed in or out, outside every guard", () => {
    const outside = src.replace(/<Stack\.Protected[\s\S]*?<\/Stack\.Protected>/g, "");
    expect(outside).toContain('<Stack.Screen name="auth/callback" />');
    expect(src.match(/name="auth\/callback"/g)).toHaveLength(1);
  });
});
