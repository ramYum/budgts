import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HelpPage from "./page";

describe("HelpPage", () => {
  it("shows the static FAQ", () => {
    render(<HelpPage />);
    expect(screen.getByText("How does Budgts organize my money?")).toBeInTheDocument();
    expect(screen.getByText("What is Money Left?")).toBeInTheDocument();
    expect(screen.getByText("How does categorization work?")).toBeInTheDocument();
    expect(screen.getByText("What happens if I disconnect a bank?")).toBeInTheDocument();
    expect(screen.getByText("Why is an account excluded from my totals?")).toBeInTheDocument();
  });

  // Budgts currently ships with NO app tour (the replacement is being built
  // separately). Help must not link into one, or a user lands on a 404.
  it("does not link to any tour or walkthrough", () => {
    render(<HelpPage />);
    for (const a of screen.queryAllByRole("link")) {
      expect(a.getAttribute("href")).not.toMatch(/tour|how-it-works/);
    }
    expect(screen.queryByText(/tour|walkthrough|how budgts works/i)).not.toBeInTheDocument();
  });
});
