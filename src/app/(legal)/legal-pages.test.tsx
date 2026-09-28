import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FULL_LEGAL_ENV } from "@/test-utils/legal-env";

const NOT_FOUND = new Error("NEXT_NOT_FOUND");
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));

import PrivacyPage from "./privacy/page";
import TermsPage from "./terms/page";
import SupportPage from "./support/page";
import AccountDeletionPage from "./account-deletion/page";
import LegalLayout from "./layout";
import AuthLayout from "../(auth)/layout";

const PAGES = [
  ["privacy", PrivacyPage],
  ["terms", TermsPage],
  ["support", SupportPage],
  ["account-deletion", AccountDeletionPage],
] as const;

function switchOn() {
  for (const [name, value] of Object.entries(FULL_LEGAL_ENV)) vi.stubEnv(name, value);
}
function switchOff() {
  for (const name of Object.keys(FULL_LEGAL_ENV)) vi.stubEnv(name, "");
}

afterEach(() => vi.unstubAllEnvs());

describe("legal pages: switched off (any owner fact missing)", () => {
  it.each(PAGES)("/%s is a 404, never a page with a gap in it", (_path, Page) => {
    switchOff();
    expect(() => Page()).toThrow(NOT_FOUND);
  });

  it.each(Object.keys(FULL_LEGAL_ENV))("stays a 404 while only %s is missing", (name) => {
    switchOn();
    vi.stubEnv(name, "");
    for (const [, Page] of PAGES) expect(() => Page()).toThrow(NOT_FOUND);
  });

  it("the frame has no footer, and sign-in shows no legal links", () => {
    switchOff();
    render(<LegalLayout>content</LegalLayout>);
    expect(screen.queryByRole("navigation", { name: "Legal" })).not.toBeInTheDocument();
    render(<AuthLayout params={Promise.resolve({})}>form</AuthLayout>);
    expect(screen.queryByRole("link", { name: "Privacy policy" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Terms" })).not.toBeInTheDocument();
  });
});

describe("legal pages: switched on", () => {
  it.each(PAGES)("/%s renders every owner fact it uses, and no placeholder or em-dash", (_path, Page) => {
    switchOn();
    const { container } = render(Page());
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\[|\]|owner to confirm|TBD|TODO|lorem/i);
    expect(text).not.toContain("—");
    expect(text).not.toMatch(/undefined|null|NaN/);
  });

  it("privacy names the publisher, the contact, the processors and the retention period", () => {
    switchOn();
    render(PrivacyPage());
    expect(screen.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeInTheDocument();
    expect(screen.getByText("Effective October 1, 2026")).toBeInTheDocument();
    expect(screen.getByText(/published by Example Labs LLC, 1 Main Street/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "help@example.com" })[0]).toHaveAttribute("href", "mailto:help@example.com");
    for (const processor of ["Supabase", "Vercel", "Plaid", "Apple and Google", "RevenueCat"]) {
      expect(screen.getByText(processor)).toBeInTheDocument();
    }
    expect(screen.getByText(/for 7 years after deletion/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "account deletion page" })).toHaveAttribute("href", "/account-deletion");
  });

  it("terms state the approved plan: $9.99 a month, $69 a year, a 7-day trial, sold only in the apps", () => {
    switchOn();
    render(TermsPage());
    expect(screen.getByText(/\$9\.99 a month or \$69 a year/)).toBeInTheDocument();
    expect(screen.getByText(/The 7-day free trial starts only when you choose to start it/)).toBeInTheDocument();
    expect(screen.getByText(/budgts\.com has no checkout/)).toBeInTheDocument();
    expect(screen.getByText(/governed by the laws of the State of Delaware, United States/)).toBeInTheDocument();
  });

  it("support gives one way to reach a person and the stores' own subscription pages", () => {
    switchOn();
    render(SupportPage());
    expect(screen.getByRole("link", { name: /Email support/ })).toHaveAttribute("href", "mailto:help@example.com");
    expect(screen.getByRole("link", { name: /Manage in the App Store/ })).toHaveAttribute(
      "href",
      "https://apps.apple.com/account/subscriptions",
    );
    expect(screen.getByRole("link", { name: /Manage in Google Play/ }).getAttribute("href")).toMatch(/^https:\/\/play\.google\.com\//);
  });

  it("account deletion says how, what goes, what stays, and starts at the signed-in screen", () => {
    switchOn();
    render(AccountDeletionPage());
    expect(screen.getByRole("link", { name: /Delete my account/ })).toHaveAttribute("href", "/settings/delete-account");
    expect(screen.getByText(/Open Settings, then Delete account/)).toBeInTheDocument();
    expect(screen.getByText("What's deleted")).toBeInTheDocument();
    expect(screen.getByText(/billing records of those payments/)).toHaveTextContent("7 years");
    expect(screen.getByText(/does not automatically cancel/)).toBeInTheDocument();
  });

  it("the frame's footer names the publisher and links all four pages", () => {
    switchOn();
    render(<LegalLayout>content</LegalLayout>);
    expect(screen.getByText(/© 2026 Example Labs LLC/)).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Legal" });
    for (const [name, href] of [
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Support", "/support"],
      ["Delete your account", "/account-deletion"],
    ]) {
      expect(nav.querySelector(`a[href="${href}"]`)).toHaveTextContent(name);
    }
  });

  it("sign-in links the Terms and Privacy policy", () => {
    switchOn();
    render(<AuthLayout params={Promise.resolve({})}>form</AuthLayout>);
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy");
  });
});
