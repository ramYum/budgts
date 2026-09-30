import { describe, expect, it } from "vitest";
import { render } from "../../test/render";
import { Button, TextButton } from "../brand/controls";
import { figureVariant } from "./figure";
import { LOCKED_MESSAGE, mutate } from "../../lib/api/load";

describe("trailing icons (web iconAfter)", () => {
  it("Button and TextButton draw the icon after the label", () => {
    for (const node of [
      <Button key="b" variant="secondary" iconAfter="chevron-down" onPress={() => {}}>Show 12 more</Button>,
      <TextButton key="t" iconAfter="sync" onPress={() => {}}>Re-scan</TextButton>,
    ]) {
      const r = render(node);
      const kids = r.root.findAll((n) => (n.type as unknown) === "Svg" || (n.type as unknown) === "Text").map((n) => n.type as unknown);
      expect(kids[kids.length - 1]).toBe("Svg");
    }
  });
});

describe("one figure-size rule (src/lib/brand/figure-size.ts)", () => {
  it("the hero size up to 13 characters, one step down past them", () => {
    expect(figureVariant("$1,234,567.89")).toBe("tNumXl");
    expect(figureVariant("$12,345,678.90")).toBe("tNumLg");
  });
});

describe("account_locked", () => {
  it("a write refused by the deletion lock says the web's words", async () => {
    const res = new Response(JSON.stringify({ error: "account_locked" }), { status: 423, headers: { "Content-Type": "application/json" } });
    expect(await mutate(async () => res)).toEqual({ status: "error", kind: "locked", message: LOCKED_MESSAGE });
    expect(LOCKED_MESSAGE).toBe("Your account is being deleted, so changes are paused.");
  });
});
