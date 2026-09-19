// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TourStep } from "./tour-step";

// The Skip/Finish buttons submit the real `completeTour` server action, which
// pulls in Supabase + next/navigation — stub it, this is a component test.
vi.mock("@/server/tour", () => ({ completeTour: vi.fn() }));

describe("TourStep", () => {
  it("leads with the question, then the agreed answer, then the demo", () => {
    render(
      <TourStep topicId="money-left" firstRun={false}>
        <p>demo-slot</p>
      </TourStep>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "What is Money Left?" })).toBeInTheDocument();
    expect(screen.getByText(/It doesn.t measure a savings-account balance/)).toBeInTheDocument();
    expect(screen.getByText("demo-slot")).toBeInTheDocument();
    expect(screen.getByText(/Step 2 of 6/)).toBeInTheDocument();
  });

  it("first step: no Back, Next goes to the second topic", () => {
    render(<TourStep topicId="organize" firstRun={false}>{null}</TourStep>);

    expect(screen.queryByRole("link", { name: "Back" })).toBeNull();
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute("href", "/tour/money-left");
  });

  it("middle step: Back and Next point at the neighbours", () => {
    render(<TourStep topicId="categorization" firstRun={false}>{null}</TourStep>);

    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/tour/money-left");
    expect(screen.getByRole("link", { name: /Next/ })).toHaveAttribute("href", "/tour/disconnect");
  });

  it("lets the reader jump to any single explanation from the step list", () => {
    render(<TourStep topicId="disconnect" firstRun={false}>{null}</TourStep>);

    const nav = screen.getByRole("navigation", { name: "Walkthrough steps" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(6);
    expect(links[4]).toHaveAttribute("href", "/tour/excluded-account");
    expect(within(nav).getByRole("link", { name: /Step 4/ })).toHaveAttribute("aria-current", "step");
  });

  it("revisit from Help: Close returns to Help, and the last step ends with Done → Help", () => {
    render(<TourStep topicId="connect-bank" firstRun={false}>{null}</TourStep>);

    expect(screen.getByRole("link", { name: "Close" })).toHaveAttribute("href", "/help");
    expect(screen.queryByRole("link", { name: /Next/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", "/help");
  });

  it("first run: Skip and Finish are buttons that complete the tour (not links away)", () => {
    render(<TourStep topicId="connect-bank" firstRun>{null}</TourStep>);

    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Finish/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Close" })).toBeNull();
  });
});
