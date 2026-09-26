import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Reveal } from "./reveal";

let intersect: ((entries: { isIntersecting: boolean }[]) => void) | null = null;
const disconnect = vi.fn();

function motionOn() {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) => ({ matches: false, media: query }) as MediaQueryList,
  );
}

function placeAt(top: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top } as DOMRect);
}

beforeEach(() => {
  intersect = null;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = cb;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const block = () => screen.getByText("Spending by month").parentElement!;

describe("Reveal", () => {
  it("just shows its block when motion is reduced", () => {
    render(
      <Reveal i={3}>
        <p>Spending by month</p>
      </Reveal>,
    );
    expect(block()).toHaveClass("reveal");
    expect(block()).not.toHaveAttribute("data-reveal");
    expect(block().style.getPropertyValue("--i")).toBe("3");
  });

  it("leaves a block that is already on screen to the page's own cascade", () => {
    motionOn();
    placeAt(200);
    render(
      <Reveal i={1}>
        <p>Spending by month</p>
      </Reveal>,
    );
    expect(block()).not.toHaveAttribute("data-reveal");
    expect(intersect).toBeNull();
  });

  it("holds a below-the-fold block until it scrolls into view, then plays it once", () => {
    motionOn();
    placeAt(window.innerHeight + 400);
    render(
      <Reveal i={9}>
        <p>Spending by month</p>
      </Reveal>,
    );
    expect(block()).toHaveAttribute("data-reveal", "armed");

    act(() => intersect?.([{ isIntersecting: false }]));
    expect(block()).toHaveAttribute("data-reveal", "armed");

    act(() => intersect?.([{ isIntersecting: true }]));
    expect(block()).toHaveAttribute("data-reveal", "shown");
    expect(disconnect).toHaveBeenCalled();
  });
});
