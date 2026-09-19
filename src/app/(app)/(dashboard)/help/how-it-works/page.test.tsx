import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HowItWorksPage from "./page";
import { TOUR_TOPICS } from "@/lib/tour/topics";

describe("HowItWorksPage", () => {
  it("leads with the core message and says the demos never touch real accounts", () => {
    render(<HowItWorksPage />);
    expect(screen.getByRole("heading", { name: "You spend. Budgts keeps track." })).toBeInTheDocument();
    expect(screen.getByText(/nothing here touches your accounts/)).toBeInTheDocument();
  });

  it("starts the sequential walkthrough at the first step", () => {
    render(<HowItWorksPage />);
    expect(screen.getByRole("link", { name: /Start the walkthrough/ })).toHaveAttribute(
      "href",
      "/tour/organize",
    );
  });

  it("lets the reader open any single explanation, in walkthrough order", () => {
    render(<HowItWorksPage />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(TOUR_TOPICS.length);
    TOUR_TOPICS.forEach((t, i) => {
      expect(items[i]).toHaveTextContent(t.question);
      expect(items[i].querySelector("a")).toHaveAttribute("href", `/tour/${t.id}`);
    });
  });

  it("links back to Help", () => {
    render(<HowItWorksPage />);
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/help");
  });
});
