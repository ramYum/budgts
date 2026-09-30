import { describe, expect, it, vi } from "vitest";
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

describe("lane requests, batch 2", () => {
  it("Checkbox is Chrome's 16px box: grey edge unchecked, the tone's fill and a white tick checked", async () => {
    const { Checkbox, CHECKBOX_EDGE, CHECKBOX_TONE } = await import("./checkbox");
    const flip = vi.fn();
    const off = render(<Checkbox checked={false} onChange={flip} accessibilityLabel="Transfer" />);
    const box = (r: ReturnType<typeof render>) => r.root.findAll((n) => (n.type as unknown) === "View")[0]!.props.style;
    expect(box(off)).toMatchObject({ width: 16, height: 16, borderRadius: 2, borderWidth: 1, borderColor: CHECKBOX_EDGE });
    off.root.findAll((n) => (n.type as unknown) === "Pressable")[0]!.props.onPress();
    expect(flip).toHaveBeenCalledWith(true);
    const on = render(<Checkbox checked tone="accent" onChange={() => {}} accessibilityLabel="Remove history" />);
    expect(box(on)).toMatchObject({ backgroundColor: CHECKBOX_TONE.accent, borderWidth: 0 });
  });

  it("Field takes a node label and a rows count (the web's textarea)", async () => {
    const { Field, fieldHeight } = await import("../brand/controls");
    const { Text } = await import("../brand/text");
    const r = render(<Field label={<Text variant="formLabel">Type DELETE</Text>} accessibilityLabel="Type DELETE to confirm" rows={2} />);
    const input = r.root.findAll((n) => (n.type as unknown) === "TextInput")[0]!;
    expect(input.props).toMatchObject({ accessibilityLabel: "Type DELETE to confirm", multiline: true, numberOfLines: 2 });
    expect(fieldHeight(2)).toBe(68);
  });

  it("Select can hide its label and disable an option; HubRow can leave the app", async () => {
    const { Select } = await import("./select");
    const r = render(<Select hideLabel testID="map" label="Account" value={null} onChange={() => {}} options={[{ value: "x", label: "An existing account", disabled: true }]} />);
    expect(r.root.findAll((n) => (n.type as unknown) === "Text").some((t) => t.props.children === "Account")).toBe(false);
    const { HubRow } = await import("./hub-list");
    const open = vi.fn();
    const row = render(<HubRow label="Privacy policy" icon="document" onPress={open} testID="hub-privacy" />);
    row.root.findAll((n) => n.props.testID === "hub-privacy" && typeof n.type === "string")[0]!.props.onPress();
    expect(open).toHaveBeenCalled();
  });
});

describe("Select plaidHint (web Needs a category)", () => {
  it("a short guess sits inside the field, a long one on its own line", async () => {
    const { Select } = await import("./select");
    const { texts } = await import("../../test/render");
    const opts = [{ value: "a", label: "Groceries" }];
    expect(texts(render(<Select hideLabel label="Category for Acme" value={null} options={opts} onChange={() => {}} plaidHint="Other" />))).toContain("Plaid: Other");
    const long = texts(render(<Select hideLabel label="Category for Acme" value={null} options={opts} onChange={() => {}} plaidHint="Food and drink" />));
    expect(long).toContain("Plaid suggests: Food and drink");
    expect(long).not.toContain("Plaid: Food and drink");
  });
});
