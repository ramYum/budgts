import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RollingAmount } from "./rolling-amount";

const reels = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(".roll-col")];

describe("RollingAmount", () => {
  it("gives screen readers the plain formatted amount", () => {
    render(<RollingAmount value={123456} currency="USD" />);
    expect(screen.getByText("$1,234.56")).toHaveClass("sr-only");
  });

  it("draws one aria-hidden reel per digit, each resting on its final digit", () => {
    const { container } = render(<RollingAmount value={123456} currency="USD" />);
    const cols = reels(container);
    expect(cols.map((c) => c.style.getPropertyValue("--v"))).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(cols.every((c) => c.closest("[aria-hidden]"))).toBe(true);
    // ones and cents spin a lap; the higher places roll straight to their digit
    expect(cols.map((c) => c.style.getPropertyValue("--lap"))).toEqual(["0", "0", "0", "1", "1", "1"]);
  });

  it("keeps each reel mounted when the value changes, so it rolls instead of re-entering", () => {
    const { container, rerender } = render(<RollingAmount value={123456} currency="USD" />);
    const before = reels(container);
    rerender(<RollingAmount value={123999} currency="USD" />);
    const after = reels(container);
    expect(after).toHaveLength(before.length);
    after.forEach((col, i) => expect(col).toBe(before[i]));
    expect(after.map((c) => c.style.getPropertyValue("--v"))).toEqual(["1", "2", "3", "9", "9", "9"]);
    expect(screen.getByText("$1,239.99")).toBeInTheDocument();
  });

  it("keeps a negative figure's sign as plain text beside the reels", () => {
    const { container } = render(<RollingAmount value={-55000} currency="USD" />);
    expect(screen.getByText("-$550.00")).toBeInTheDocument();
    expect(reels(container)).toHaveLength(5);
  });
});
