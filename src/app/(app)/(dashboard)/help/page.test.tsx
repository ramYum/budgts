import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HelpPage from "./page";
import { TOUR_TOPICS } from "@/lib/tour/topics";

describe("HelpPage", () => {
  it("links to the How Budgts Works guide", () => {
    render(<HelpPage />);
    expect(screen.getByRole("link", { name: /^How Budgts Works/ })).toHaveAttribute(
      "href",
      "/help/how-it-works",
    );
  });

  it("still links to the guided tour", () => {
    render(<HelpPage />);
    expect(screen.getByRole("link", { name: "Replay the tour →" })).toHaveAttribute("href", "/tour");
  });

  it("still shows the existing FAQ content", () => {
    render(<HelpPage />);
    expect(screen.getByText("How does categorization work?")).toBeInTheDocument();
    expect(screen.getByText("What is Money Left?")).toBeInTheDocument();
  });

  it("renders every walkthrough question with its answer, from the shared topic list", () => {
    render(<HelpPage />);
    for (const t of TOUR_TOPICS) {
      expect(screen.getByText(t.question)).toBeInTheDocument();
      expect(screen.getByText(t.answer)).toBeInTheDocument();
    }
  });

  it("links each answer to its own walkthrough step", () => {
    render(<HelpPage />);
    const link = screen.getByRole("link", {
      name: "See it in the walkthrough: What happens if I disconnect a bank?",
    });
    expect(link).toHaveAttribute("href", "/tour/disconnect");
  });
});
