import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OWNER_LEGAL_ENV } from "@/test-utils/legal-env";
import AuthLayout from "../../(auth)/layout";
import HomePage, { metadata } from "./page";

function legalOn() {
  for (const [name, value] of Object.entries(OWNER_LEGAL_ENV)) vi.stubEnv(name, value);
}
function legalOff() {
  for (const name of Object.keys(OWNER_LEGAL_ENV)) vi.stubEnv(name, "");
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("the company homepage", () => {
  it("says what Budgts is, that the apps are coming, and lets an existing user sign in", () => {
    legalOn();
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1, name: "Budgeting that does itself." })).toBeInTheDocument();
    expect(screen.getByText("Coming soon to iPhone and Android")).toBeInTheDocument();
    for (const name of ["Every purchase, tracked.", "Sorted for you.", "Know what's left.", "Plan it. Then grow it."]) {
      expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    }
    expect(screen.getByText(/through Plaid, read-only/)).toBeInTheDocument();
    // sorts "your purchases", not "every purchase": some arrive as Needs a category
    expect(screen.getByText(/Budgts sorts your purchases/)).toBeInTheDocument();
    expect(screen.queryByText(/every purchase,? shows/)).not.toBeInTheDocument();
    // what Google sign-in data is for (Google's brand verification)
    expect(screen.getByText("Google shares your name and email address. Budgts uses them only for your account.")).toBeInTheDocument();
    const signIns = screen.getAllByRole("link", { name: /^Sign in/ });
    expect(signIns.length).toBeGreaterThan(0);
    for (const link of signIns) expect(link).toHaveAttribute("href", "/sign-in");
    expect(screen.getByRole("link", { name: "Budgts home" })).toHaveAttribute("href", "/");
  });

  it("shows no prices and no store badges while billing is off and the apps aren't out", () => {
    legalOn();
    const { container } = render(<HomePage />);
    // the scenes' sample figures are decorative (aria-hidden); nothing a reader is told costs money
    const shown = container.cloneNode(true) as HTMLElement;
    shown.querySelectorAll("[aria-hidden='true']").forEach((el) => el.remove());
    const read = shown.textContent ?? "";
    expect(read).not.toMatch(/\$|per month|\/month|a year|free trial|subscribe|pricing/i);
    expect(screen.queryByRole("link", { name: /app store|google play/i })).not.toBeInTheDocument();
    expect(container.querySelectorAll("img, script, iframe")).toHaveLength(0);
  });

  it("ends with the publisher and the four legal pages once they are live", () => {
    legalOn();
    render(<HomePage />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("© 2026 Budgts, LLC")).toBeInTheDocument();
    const legal = within(footer).getByRole("navigation", { name: "Legal" });
    const links = within(legal).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Support", "/support"],
      ["Delete your account", "/account-deletion"],
    ]);
  });

  it("links to no legal page while those pages are switched off (they would 404)", () => {
    legalOff();
    render(<HomePage />);
    expect(screen.queryByRole("navigation", { name: "Legal" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("is titled and described for search and sharing, with / as its one address", () => {
    expect(metadata.title).toEqual({ absolute: "Budgts: budgeting that does itself" });
    expect(metadata.description).toMatch(/^Connect your bank and Budgts sorts your purchases, .*Coming soon to iPhone and Android\.$/);
    expect(metadata.alternates?.canonical).toBe("/");
    expect(metadata.openGraph).toMatchObject({ type: "website", url: "/", siteName: "Budgts" });
    for (const text of [String(metadata.description), JSON.stringify(metadata.openGraph)]) expect(text).not.toMatch(/—/);
  });
});

describe("the sign-in page", () => {
  it("has a quiet way back to the homepage", () => {
    render(<AuthLayout params={Promise.resolve({})}>form</AuthLayout>);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
  });
});
