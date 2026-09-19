import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { colors } from "./theme";

// mobile/ is its own npm root, so the web stylesheet is only present in a full
// checkout (not inside an EAS build sandbox) — skip rather than fail there.
const cssPath = resolve(__dirname, "../../src/app/globals.css");
const suite = existsSync(cssPath) ? describe : describe.skip;

function token(css: string, name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (!m) throw new Error(`--${name} not found in globals.css`);
  return m[1].toLowerCase();
}

suite("theme colors stay in sync with the web design tokens", () => {
  const css = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";

  it.each([
    ["bg", "cream"],
    ["surface", "surface-raw"],
    ["text", "ink"],
    ["muted", "muted"],
    ["border", "border"],
    ["accent", "coral"],
    ["primaryBtn", "sun"],
    ["neg", "coral-strong"],
    ["pos", "sage-strong"],
  ] as const)("colors.%s matches --%s", (key, cssName) => {
    expect(colors[key]).toBe(token(css, cssName));
  });

  it("the primary button label is ink, not white (contrast on sun)", () => {
    expect(colors.onPrimaryBtn).toBe(token(css, "ink"));
  });
});
