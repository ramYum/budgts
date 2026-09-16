import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TourWizardContent } from "./tour-wizard-content";
import type { TourStepId } from "@/lib/tour/steps";
import type { TourState } from "@/server/tour";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

// The "bank" card renders <ConnectBank>, which pulls in the real server
// action module through <AccountMapping> — mock it the same way
// account-mapping.test.tsx does, so this stays a component test, not an
// integration test against Supabase.
vi.mock("@/server/plaid/actions", () => ({
  mapAccounts: vi.fn(),
}));

const NO_BANK_STEPS: TourStepId[] = ["auto-sort", "money-left", "done"];

function renderWizard(
  stepIds: TourStepId[],
  action: (prev: TourState, formData: FormData) => Promise<TourState> = vi.fn().mockResolvedValue({}),
) {
  return render(
    <TourWizardContent stepIds={stepIds} offset={0} totalVisible={stepIds.length} accounts={[]} action={action} />,
  );
}

describe("TourWizardContent", () => {
  it("shows the first step's heading and dots for every visible step", () => {
    renderWizard(NO_BANK_STEPS);
    expect(screen.getByRole("heading", { name: "Sorted for you" })).toBeInTheDocument();
    expect(document.querySelectorAll('[role="presentation"] > span')).toHaveLength(3);
  });

  it("Next moves forward through the cards", async () => {
    const user = userEvent.setup();
    renderWizard(NO_BANK_STEPS);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Know what's left" })).toBeInTheDocument();

    await user.click(screen.getByText("‹ Back"));
    expect(screen.getByRole("heading", { name: "Sorted for you" })).toBeInTheDocument();
  });

  it("the right arrow key advances and the left arrow key goes back", async () => {
    const user = userEvent.setup();
    renderWizard(NO_BANK_STEPS);

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("heading", { name: "Know what's left" })).toBeInTheDocument();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("heading", { name: "Sorted for you" })).toBeInTheDocument();
  });

  it("Skip submits the completion action from a non-final step", async () => {
    const action = vi.fn().mockResolvedValue({});
    const user = userEvent.setup();
    renderWizard(NO_BANK_STEPS, action);

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(action).toHaveBeenCalled();
  });

  it("the final step's primary button submits the same completion action", async () => {
    const action = vi.fn().mockResolvedValue({});
    const user = userEvent.setup();
    renderWizard(NO_BANK_STEPS, action);

    await user.click(screen.getByRole("button", { name: "Next" })); // -> money-left
    await user.click(screen.getByRole("button", { name: "Next" })); // -> done
    expect(screen.getByRole("heading", { name: "You're all set" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "See my finances" }));
    expect(action).toHaveBeenCalled();
  });

  it("the final step links to the How Budgts Works guide", async () => {
    const user = userEvent.setup();
    renderWizard(NO_BANK_STEPS);

    await user.click(screen.getByRole("button", { name: "Next" })); // -> money-left
    await user.click(screen.getByRole("button", { name: "Next" })); // -> done
    expect(screen.getByRole("link", { name: "How Budgts Works" })).toHaveAttribute(
      "href",
      "/help/how-it-works",
    );
  });

  it("shows an error returned by the completion action", async () => {
    const action = vi.fn().mockResolvedValue({ error: "Something went wrong. Try again." });
    const user = userEvent.setup();
    renderWizard(NO_BANK_STEPS, action);

    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
  });

  it("does not reshuffle the visible steps when stepIds changes after mount", () => {
    const { rerender } = renderWizard(NO_BANK_STEPS);
    expect(screen.getByRole("heading", { name: "Sorted for you" })).toBeInTheDocument();

    rerender(
      <TourWizardContent
        stepIds={["money-left", "done"]}
        offset={0}
        totalVisible={2}
        accounts={[]}
        action={vi.fn().mockResolvedValue({})}
      />,
    );
    // Still showing the original first step, not "Know what's left".
    expect(screen.getByRole("heading", { name: "Sorted for you" })).toBeInTheDocument();
  });

  it("renders the purchase-icon row on the pitch card and Connect Bank on the bank card", async () => {
    const user = userEvent.setup();
    renderWizard(["auto-capture", "bank", "done"]);
    expect(screen.getByText("Phone tap")).toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
    expect(screen.getByText("Online order")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Connect your bank to turn it on" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect a bank" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /I'll add things by hand/ })).toBeInTheDocument();
  });
});
