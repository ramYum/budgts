import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OnboardingForm } from "./onboarding-form";
import type { OnboardingState } from "@/server/onboarding";

function renderForm(
  action: (prev: OnboardingState, formData: FormData) => Promise<OnboardingState> = vi
    .fn()
    .mockResolvedValue({}),
) {
  return render(<OnboardingForm defaultCurrency="USD" action={action} />);
}

describe("OnboardingForm", () => {
  it("is just the required currency step - no tour, no pitch cards, nothing to skip", () => {
    renderForm();
    expect(screen.getByRole("heading", { name: "Pick your currency" })).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("USD");
    expect(screen.queryByRole("button", { name: /skip|next|back|get started/i })).not.toBeInTheDocument();
  });

  it("submits the chosen currency via the injected action", async () => {
    const action = vi.fn().mockResolvedValue({});
    const user = userEvent.setup();
    renderForm(action);

    await user.selectOptions(screen.getByRole("combobox"), "EUR");
    await user.click(screen.getByRole("button", { name: "Start budgeting" }));

    expect(action).toHaveBeenCalled();
    const submittedFormData = action.mock.calls[0][1] as FormData;
    expect(submittedFormData.get("currency")).toBe("EUR");
  });

  it("shows an error returned by the action without losing the form", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Please choose a currency." });
    const user = userEvent.setup();
    renderForm(action);

    await user.click(screen.getByRole("button", { name: "Start budgeting" }));

    expect(await screen.findByText("Please choose a currency.")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
