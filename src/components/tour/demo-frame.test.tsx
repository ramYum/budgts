// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DemoFrame } from "./demo-frame";

describe("DemoFrame", () => {
  it("renders real children inside an inert region, so nothing in it can be activated", () => {
    const onClick = vi.fn();
    render(
      <DemoFrame label="Example state">
        <button onClick={onClick}>Disconnect</button>
      </DemoFrame>,
    );

    const button = screen.getByText("Disconnect");
    expect(button.closest("[inert]")).not.toBeNull();
  });

  it("labels the content as example data and explains it is not the user's", () => {
    render(
      <DemoFrame label="Example state">
        <p>child</p>
      </DemoFrame>,
    );

    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(screen.getByText(/Example state/)).toBeInTheDocument();
    expect(screen.getByText(/isn.t from your accounts/i)).toBeInTheDocument();
  });

  it("exposes the highlight key so the stylesheet can ring the matching real element", () => {
    const { container } = render(
      <DemoFrame label="x" highlight="disconnect">
        <p>child</p>
      </DemoFrame>,
    );

    expect(container.querySelector(".tour-demo")?.getAttribute("data-tour-highlight")).toBe("disconnect");
  });

  it("only crops (and fades) when asked to", () => {
    const { container, rerender } = render(
      <DemoFrame label="x">
        <p>child</p>
      </DemoFrame>,
    );
    expect(container.querySelector(".tour-demo-fade")).toBeNull();

    rerender(
      <DemoFrame label="x" clip>
        <p>child</p>
      </DemoFrame>,
    );
    expect(container.querySelector(".tour-demo-fade")).not.toBeNull();
  });
});
