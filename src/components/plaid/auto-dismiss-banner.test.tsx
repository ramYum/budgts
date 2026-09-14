import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoDismissBanner } from "./auto-dismiss-banner";

describe("AutoDismissBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows every message immediately", () => {
    render(<AutoDismissBanner messages={["First message", "Second message"]} />);
    expect(screen.getByText("First message")).toBeInTheDocument();
    expect(screen.getByText("Second message")).toBeInTheDocument();
  });

  it("hides itself after 5 seconds", () => {
    render(<AutoDismissBanner messages={["Goes away"]} />);
    expect(screen.getByText("Goes away")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText("Goes away")).not.toBeInTheDocument();
  });

  it("is still visible just before the 5-second mark", () => {
    render(<AutoDismissBanner messages={["Still here"]} />);

    act(() => {
      vi.advanceTimersByTime(4999);
    });

    expect(screen.getByText("Still here")).toBeInTheDocument();
  });

  it("renders nothing when there are no messages", () => {
    const { container } = render(<AutoDismissBanner messages={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
