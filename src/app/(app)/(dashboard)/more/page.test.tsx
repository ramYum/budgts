import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MorePage from "./page";

describe("MorePage", () => {
  it("has a Play welcome guide button that replays the guide", () => {
    render(<MorePage />);
    expect(screen.getByRole("link", { name: /^Play welcome guide/ })).toHaveAttribute("href", "/tour");
  });

  it("still links to the rest of the app", () => {
    render(<MorePage />);
    for (const [name, href] of [
      ["Savings Goals", "/goals"],
      ["Accounts", "/accounts"],
      ["Insights", "/insights"],
      ["Connected Banks", "/connected-banks"],
      ["Settings", "/settings"],
      ["Help", "/help"],
      ["About Budgts", "/about"],
    ]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });
});
