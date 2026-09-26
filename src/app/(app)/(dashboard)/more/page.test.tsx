import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MorePage from "./page";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  getSessionUser: async () => ({ id: "user-1", email: "alex@example.com" }),
  createClient: async () => ({}),
}));
vi.mock("@/lib/hub-counts", () => ({
  hubCounts: async () => ({ goals: 2, accounts: 4, banks: 1, categories: 8, budgets: 4 }),
  plural: (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`,
}));

describe("MorePage", () => {
  it("has a Play welcome guide button that replays the guide", async () => {
    render(await MorePage());
    expect(screen.getByRole("link", { name: /^Play welcome guide/ })).toHaveAttribute("href", "/tour");
  });

  it("still links to the rest of the app", async () => {
    render(await MorePage());
    for (const [name, href] of [
      [/^Savings goals/, "/goals"],
      [/^Accounts/, "/accounts"],
      [/^Insights/, "/insights"],
      [/^Connected banks/, "/connected-banks"],
      [/^Settings/, "/settings"],
      [/^Help/, "/help"],
      [/^About Budgts/, "/about"],
    ] as const) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("says what's behind each row", async () => {
    render(await MorePage());
    expect(screen.getByRole("link", { name: /^Savings goals/ })).toHaveTextContent("2 goals");
    expect(screen.getByRole("link", { name: /^Connected banks/ })).toHaveTextContent("1 bank");
  });
});
