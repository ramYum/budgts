import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OnboardingWizardContent } from "./onboarding-wizard-content";
import type { TourStepId } from "@/lib/tour/steps";
import type { OnboardingState } from "@/server/onboarding";

const STEPS: TourStepId[] = ["crystal", "welcome", "auto-capture", "currency"];

function renderWizard(
  action: (prev: OnboardingState, formData: FormData) => Promise<OnboardingState> = vi
    .fn()
    .mockResolvedValue({}),
) {
  return render(
    <OnboardingWizardContent stepIds={STEPS} totalVisible={9} defaultCurrency="USD" action={action} />,
  );
}

describe("OnboardingWizardContent", () => {
  it("opens with Crystal introducing herself, then walks through what Budgts does", async () => {
    const user = userEvent.setup();
    renderWizard();
    expect(screen.getByRole("heading", { name: "Hi, I'm Crystal." })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nice to meet you" }));
    expect(screen.getByRole("heading", { name: "Budgeting that does itself." })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show me how" }));
    expect(screen.getByRole("heading", { name: "Every purchase, tracked." })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Budgeting that does itself." })).toBeInTheDocument();
  });

  it("reports progress across the whole guide, not just this half", async () => {
    const user = userEvent.setup();
    renderWizard();
    const progress = screen.getByRole("progressbar", { name: "Welcome guide progress" });
    expect(progress).toHaveAttribute("aria-valuenow", "1");
    expect(progress).toHaveAttribute("aria-valuemax", "9");

    await user.click(screen.getByRole("button", { name: "Nice to meet you" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  });

  it("Skip on an early step jumps straight to the required currency step", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByRole("heading", { name: "Pick your currency." })).toBeInTheDocument();
    // The required last step has no Skip of its own.
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
  });

  it("previews amounts in the currency being chosen", async () => {
    const user = userEvent.setup();
    renderWizard();

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("$2,480.00")).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox"), "EUR");
    expect(screen.getByText("€2,480.00")).toBeInTheDocument();
  });

  it("submits the currency form via the injected action", async () => {
    const action = vi.fn().mockResolvedValue({});
    const user = userEvent.setup();
    renderWizard(action);

    await user.click(screen.getByRole("button", { name: "Skip" }));
    await user.selectOptions(screen.getByRole("combobox"), "EUR");
    await user.click(screen.getByRole("button", { name: "Start budgeting" }));

    expect(action).toHaveBeenCalled();
    const submittedFormData = action.mock.calls[0][1] as FormData;
    expect(submittedFormData.get("currency")).toBe("EUR");
  });

  it("shows an error returned by the action without losing the form", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Please choose a currency." });
    const user = userEvent.setup();
    renderWizard(action);

    await user.click(screen.getByRole("button", { name: "Skip" }));
    await user.click(screen.getByRole("button", { name: "Start budgeting" }));

    expect(await screen.findByText("Please choose a currency.")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
