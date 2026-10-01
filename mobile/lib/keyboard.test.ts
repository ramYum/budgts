import { describe, expect, it } from "vitest";
import { revealScrollTarget, scrollTargetAboveKeyboard } from "./keyboard";

describe("scrollTargetAboveKeyboard", () => {
  it("scrolls the send button up above the keyboard, with a margin", () => {
    // the form ends 609pt into the content; 273pt of the scroll view shows above the keyboard
    expect(scrollTargetAboveKeyboard(609, 273)).toBe(352);
  });

  it("needs no scroll when the form already clears the keyboard", () => {
    expect(scrollTargetAboveKeyboard(200, 273)).toBeLessThanOrEqual(0);
  });
});

describe("revealScrollTarget", () => {
  it("scrolls only when the field's bottom (plus the margin) is below what shows, never back from where the user is", () => {
    expect(revealScrollTarget(1544, 1200, 600)).toBeNull(); // visible at 1200-1800
    expect(revealScrollTarget(1790, 1200, 600)).toBe(1790 + 16 - 600); // within the margin of the bottom
    expect(revealScrollTarget(609, 0, 273)).toBe(352); // the keyboard case, from the top
    expect(revealScrollTarget(200, 0, 273)).toBeNull();
  });
});
