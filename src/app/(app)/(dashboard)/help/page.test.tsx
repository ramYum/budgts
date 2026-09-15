import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HelpPage from "./page";

describe("HelpPage", () => {
  it("links to the How Budgts Works guide", () => {
    render(<HelpPage />);
    expect(screen.getByRole("link", { name: /How Budgts Works/ })).toHaveAttribute(
      "href",
      "/help/how-it-works",
    );
  });

  it("still shows the existing FAQ content", () => {
    render(<HelpPage />);
    expect(screen.getByText("How does categorization work?")).toBeInTheDocument();
    expect(screen.getByText("What is Money Left?")).toBeInTheDocument();
  });
});
