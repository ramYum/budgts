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

const NO_BANK_STEPS: TourStepId[] = ["auto-sort", "money-left", "plan", "done"];

function renderWizard(
  stepIds: TourStepId[],
  action: (prev: TourState, formData: FormData) => Promise<TourState> = vi.fn().mockResolvedValue({}),
) {
  return render(
    <TourWizardContent
      stepIds={stepIds}
      offset={0}
      totalVisible={stepIds.length}
      currency="USD"
      accounts={[]}
      action={action}
    />,
  );
}

async function walkToDone(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Next" })); // -> money-left
  await user.click(screen.getByRole("button", { name: "Next" })); // -> plan
  await user.click(screen.getByRole("button", { name: "Next" })); // -> done
}

describe("TourWizardContent", () => {
  it("shows the first step's heading and progress over every visible step", () => {
    renderWizard(NO_BANK_STEPS);
    expect(screen.getByRole("heading", { name: "Sorted for you." })).toBeInTheDocument();
    const progress = screen.getByRole("progressbar", { name: "Welcome guide progress" });
    expect(progress).toHaveAttribute("aria-valuenow", "1");
    expect(progress).toHaveAttribute("aria-valuemax", "4");
  });

  it("continues the progress count from onboarding", () => {
    render(
      <TourWizardContent
        stepIds={NO_BANK_STEPS}
        offset={4}
        totalVisible={8}
        currency="USD"
        accounts={[]}
        action={vi.fn().mockResolvedValue({})}
      />,
    );
    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-valuenow", "5");
    expect(progress).toHaveAttribute("aria-valuemax", "8");
  });

  it("Next moves forward through the cards and Back returns", async () => {
    const user = userEvent.setup();
    renderWizard(NO_BANK_STEPS);

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Know what's left." })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Plan it. Then grow it." })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Know what's left." })).toBeInTheDocument();
  });

  it("the right arrow key advances and the left arrow key goes back", async () => {
    const user = userEvent.setup();
    renderWizard(NO_BANK_STEPS);

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("heading", { name: "Know what's left." })).toBeInTheDocument();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("heading", { name: "Sorted for you." })).toBeInTheDocument();
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

    await walkToDone(user);
    expect(screen.getByRole("heading", { name: "You're all set." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "See my finances" }));
    expect(action).toHaveBeenCalled();
  });

  it("the final step links to the How Budgts Works guide", async () => {
    const user = userEvent.setup();
    renderWizard(NO_BANK_STEPS);

    await walkToDone(user);
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
    expect(screen.getByRole("heading", { name: "Sorted for you." })).toBeInTheDocument();

    rerender(
      <TourWizardContent
        stepIds={["money-left", "done"]}
        offset={0}
        totalVisible={2}
        currency="USD"
        accounts={[]}
        action={vi.fn().mockResolvedValue({})}
      />,
    );
    // Still showing the original first step, not "Know what's left."
    expect(screen.getByRole("heading", { name: "Sorted for you." })).toBeInTheDocument();
  });

  it("a replay opens with Crystal", () => {
    renderWizard(["crystal", "welcome", "money-left", "plan", "done"]);
    expect(screen.getByRole("heading", { name: "Hi, I'm Crystal." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nice to meet you" })).toBeInTheDocument();
  });

  it("shows how purchases arrive, then offers Connect Bank or adding by hand", async () => {
    const user = userEvent.setup();
    renderWizard(["auto-capture", "bank", "done"]);
    expect(screen.getByText("Phone tap")).toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Connect your bank." })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect a bank" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /I'll add things by hand/ }));
    expect(screen.getByRole("heading", { name: "You're all set." })).toBeInTheDocument();
  });

  it("previews Money Left with the real rule: came in minus went out", async () => {
    const user = userEvent.setup();
    renderWizard(NO_BANK_STEPS);
    await user.click(screen.getByRole("button", { name: "Next" })); // -> money-left
    expect(screen.getByText("+$3,028.21")).toBeInTheDocument();
    expect(screen.getByText("−$1,357.48")).toBeInTheDocument();
  });
});
