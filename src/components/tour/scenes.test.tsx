import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TourStepId } from "@/lib/tour/steps";
import { GuideScene } from "./scenes";

afterEach(cleanup);

const ALL: TourStepId[] = ["crystal", "welcome", "auto-capture", "currency", "bank", "auto-sort", "money-left", "plan", "done"];

// The scenes run in the welcome guide and on the public homepage: sample merchants are made up (owner, 2026-09-29).
const REAL_BRANDS = /Blue Bottle|Shell|Netflix|Whole Foods|Uber/;

describe("the guide scenes' sample merchants", () => {
  it("are made-up names, never the old real brands", () => {
    for (const id of ALL) {
      const { container, unmount } = render(<GuideScene id={id} currency="USD" />);
      expect(container.textContent).not.toMatch(REAL_BRANDS);
      unmount();
    }
  });

  it("show the purchase feed and the sorting example with the made-up names", () => {
    const capture = render(<GuideScene id="auto-capture" currency="USD" />);
    for (const name of ["Corner Coffee", "Northside Fuel", "Stream+"]) expect(capture.getByText(name)).toBeInTheDocument();
    capture.unmount();
    const sort = render(<GuideScene id="auto-sort" currency="USD" />);
    for (const name of ["Green Grocer", "City Rides"]) expect(sort.getByText(name)).toBeInTheDocument();
  });
});
