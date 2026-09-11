import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CountUp } from "./count-up";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CountUp", () => {
  it("renders the final value immediately under reduced motion", () => {
    render(<CountUp value={123400} currency="USD" />);
    expect(screen.getByText("$1,234.00")).toBeInTheDocument();
  });

  it("animates from 0 up to the value on a controlled clock when motion is not reduced", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    let pending: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      pending = cb;
      return 1;
    });

    render(<CountUp value={100000} currency="USD" />);
    expect(screen.getByText("$0.00")).toBeInTheDocument();

    now = 1000; // halfway through the 2000ms animation
    act(() => pending?.(now));
    const midway = Number(screen.getByText(/^\$[\d,]+\.\d\d$/).textContent!.replace(/[$,]/g, ""));
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(1000);

    now = 2000; // exactly at the animation's duration
    act(() => pending?.(now));
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
  });
});
