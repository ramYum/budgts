import { cleanup, render, screen } from "@testing-library/react";
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
/** This deployment sells subscriptions (src/lib/billing/config.ts billingLive): production store events, verifiable. */
function billingOn() {
  vi.stubEnv("BILLING_ENVIRONMENT", "production");
  vi.stubEnv("REVENUECAT_WEBHOOK_SIGNING_SECRET", "test-secret");
  vi.stubEnv("REVENUECAT_SECRET_API_KEY", "test-key");
}
function billingOff() {
  vi.stubEnv("BILLING_ENVIRONMENT", "");
  vi.stubEnv("REVENUECAT_WEBHOOK_SIGNING_SECRET", "");
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
  it.each(PAGES.flatMap(([path, Page]) => [[path, "off", Page] as const, [path, "on", Page] as const]))(
    "/%s (billing %s) renders every owner fact it uses, and no placeholder, em-dash or Apple sign-in",
    (_path, billing, Page) => {
      switchOn();
      if (billing === "on") billingOn();
      else billingOff();
      const { container } = render(Page());
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/\[|\]|owner to confirm|TBD|TODO|lorem/i);
      expect(text).not.toContain("—");
      expect(text).not.toMatch(/undefined|null|NaN/);
      // Sign in with Apple isn't built yet (Phase 2)
      expect(text).not.toMatch(/Google or Apple|Apple sign-in|sign in with Apple/i);
      // no purge job exists yet: never promise one outright
      expect(text).not.toMatch(/then delete them\.|deleted too\./);
    },
  );

  it("while billing is off, no page describes paid plans or store cancellation", () => {
    switchOn();
    billingOff();
    for (const [, Page] of PAGES) {
      const { container, unmount } = render(Page());
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/\$9\.99|\$69|free trial|App Store|Google Play|RevenueCat|Manage in/);
      unmount();
    }
    render(TermsPage());
    expect(screen.getByText("Budgts is free today. Before any paid plan starts, we'll update these terms.")).toBeInTheDocument();
    expect(screen.getByText("Free today")).toBeInTheDocument();
  });

  it("privacy names the publisher, the contact, the processors and the retention period", () => {
    switchOn();
    render(PrivacyPage());
    expect(screen.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeInTheDocument();
    expect(screen.getByText("Effective October 1, 2026")).toBeInTheDocument();
    expect(screen.getByText(/published by Example Labs LLC, 1 Main Street/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "help@example.com" })[0]).toHaveAttribute("href", "mailto:help@example.com");
    for (const processor of ["Supabase", "Vercel", "Plaid", "Google"]) {
      expect(screen.getByText(processor)).toBeInTheDocument();
    }
    expect(screen.queryByText("RevenueCat")).not.toBeInTheDocument();
    expect(screen.getByText(/for 7 years after deletion/)).toHaveTextContent(/in line with our retention schedule/);
    expect(screen.getByRole("link", { name: "account deletion page" })).toHaveAttribute("href", "/account-deletion");
  });

  it("privacy names the billing processors once billing is live", () => {
    switchOn();
    billingOn();
    render(PrivacyPage());
    for (const processor of ["Apple", "RevenueCat"]) expect(screen.getByText(processor)).toBeInTheDocument();
  });

  it("terms state the approved plan once billing is live: $9.99 a month, $69 a year, a 7-day trial, sold only in the apps", () => {
    switchOn();
    billingOn();
    render(TermsPage());
    // the key fact agrees with the body's 24-hour rule
    expect(screen.getByText("You start it yourself. Cancel at least 24 hours before it ends and you pay nothing.")).toBeInTheDocument();
    expect(screen.getByText(/cancel at least 24 hours before the trial or the current period ends/)).toBeInTheDocument();
    expect(screen.queryByText(/free today/i)).not.toBeInTheDocument();
    expect(screen.getByText(/\$9\.99 a month or \$69 a year/)).toBeInTheDocument();
    expect(screen.getByText(/The 7-day free trial starts only when you choose to start it/)).toBeInTheDocument();
    expect(screen.getByText(/budgts\.com has no checkout/)).toBeInTheDocument();
    expect(screen.getByText(/governed by the laws of the State of Delaware, United States/)).toBeInTheDocument();
  });

  it("support gives one way to reach a person, and the stores' own subscription pages once billing is live", () => {
    switchOn();
    billingOn();
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
    expect(screen.getByText(/billing records of those payments/)).toHaveTextContent(/in line with our retention schedule/);
    expect(screen.queryByText(/does not automatically cancel/)).not.toBeInTheDocument();
    cleanup();
    billingOn();
    render(AccountDeletionPage());
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
