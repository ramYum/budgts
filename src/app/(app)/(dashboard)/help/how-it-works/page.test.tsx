import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HowItWorksPage from "./page";

describe("HowItWorksPage", () => {
  it("leads with the core convenience message", () => {
    render(<HowItWorksPage />);
    expect(screen.getByRole("heading", { name: "You spend. Budgts keeps track." })).toBeInTheDocument();
    expect(
      screen.getByText(/Connect your accounts, spend normally, and Budgts organizes everything/),
    ).toBeInTheDocument();
  });

  it("walks the full workflow in order: connect, arrive, sort, review, budget, Money Left, track", () => {
    render(<HowItWorksPage />);
    const headings = [
      "Connect your accounts",
      "Transactions arrive automatically",
      "Budgts sorts them for you",
      "You review the exceptions",
      "Set your budgets",
      "See your Money Left",
      "Track your progress",
    ];
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(headings.length);
    headings.forEach((heading, i) => {
      expect(items[i]).toHaveTextContent(heading);
      expect(items[i]).toHaveTextContent(`Step ${i + 1}`);
    });
  });

  it("never describes Money Left as a savings balance", () => {
    render(<HowItWorksPage />);
    expect(screen.getByText(/not your savings balance/)).toBeInTheDocument();
  });

  it("links to the welcome guide as a hands-on follow-up, not a gate", () => {
    render(<HowItWorksPage />);
    expect(screen.getByRole("link", { name: "Open the welcome guide" })).toHaveAttribute("href", "/tour");
  });

  it("links back to Help", () => {
    render(<HowItWorksPage />);
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/help");
  });
});
