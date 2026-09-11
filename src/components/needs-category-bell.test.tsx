import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NeedsCategoryBell } from "./needs-category-bell";

describe("NeedsCategoryBell", () => {
  it("links to the needs-category workflow in both states", () => {
    const { rerender } = render(<NeedsCategoryBell count={0} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/transactions#needs-category");

    rerender(<NeedsCategoryBell count={3} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/transactions#needs-category");
  });

  it("shows no count and a neutral label when nothing needs a category", () => {
    render(<NeedsCategoryBell count={0} />);

    expect(screen.getByRole("link", { name: "Categories up to date" })).toBeInTheDocument();
    expect(screen.queryByTestId("needs-category-count")).not.toBeInTheDocument();
  });

  it("shows the count and a pluralised label when transactions need a category", () => {
    render(<NeedsCategoryBell count={5} />);

    expect(
      screen.getByRole("link", { name: "5 transactions need a category" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("needs-category-count")).toHaveTextContent("5");
  });

  it("uses the singular label for exactly one", () => {
    render(<NeedsCategoryBell count={1} />);

    expect(
      screen.getByRole("link", { name: "1 transaction needs a category" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("needs-category-count")).toHaveTextContent("1");
  });

  it("caps the visible badge at 9+ but keeps the real number in the label", () => {
    render(<NeedsCategoryBell count={12} />);

    expect(screen.getByTestId("needs-category-count")).toHaveTextContent("9+");
    expect(
      screen.getByRole("link", { name: "12 transactions need a category" }),
    ).toBeInTheDocument();
  });
});
