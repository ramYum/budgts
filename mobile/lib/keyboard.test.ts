import { describe, expect, it } from "vitest";
import { scrollTargetAboveKeyboard } from "./keyboard";

describe("scrollTargetAboveKeyboard", () => {
  it("scrolls the send button up above the keyboard, with a margin", () => {
    // the form ends 609pt into the content; 273pt of the scroll view shows above the keyboard
    expect(scrollTargetAboveKeyboard(609, 273)).toBe(352);
  });

  it("needs no scroll when the form already clears the keyboard", () => {
    expect(scrollTargetAboveKeyboard(200, 273)).toBeLessThanOrEqual(0);
  });
});
