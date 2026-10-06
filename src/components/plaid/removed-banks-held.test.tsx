import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemovedBanksHeld } from "./removed-banks-held";

const answerDetachedHeldAction = vi.fn();
const changeDetachedHeldAnswerAction = vi.fn();

vi.mock("@/server/plaid/actions", () => ({
  answerDetachedHeldAction: (...args: unknown[]) => answerDetachedHeldAction(...args),
  changeDetachedHeldAnswerAction: (...args: unknown[]) => changeDetachedHeldAnswerAction(...args),
  answerSignCheckAction: vi.fn(),
  changeSignAnswerAction: vi.fn(),
  clearAccountReview: vi.fn(),
  disconnectBank: vi.fn(),
  mapAccounts: vi.fn(),
  setAccountCalculationExclusionAction: vi.fn(),
  setAccountImportingAction: vi.fn(),
  syncConnection: vi.fn(),
}));

afterEach(() => vi.clearAllMocks());

const sample = { transactionId: "11111111-1111-1111-1111-111111111111", description: "Anthropic", occurredAt: "2026-09-15T00:00:00Z", amount: 2120, currency: "USD" };
const group = { accountId: "acct-1", accountName: "SoFi Checking ••5805", originRef: "feed-old", count: 3, sample };
const wholeText = (text: string) => (_: string, el: Element | null) =>
  !!el && el.textContent === text && Array.from(el.children).every((c) => c.textContent !== text);

describe("RemovedBanksHeld", () => {
  it("renders nothing when no removed bank left anything to check", () => {
    const { container } = render(<RemovedBanksHeld data={{ groups: [], answered: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says how many transactions wait, under the account they live in, and sends the answer with the transaction only", async () => {
    answerDetachedHeldAction.mockResolvedValue({ ok: true });
    render(<RemovedBanksHeld data={{ groups: [group], answered: [] }} />);
    expect(screen.getByTestId("removed-banks-held")).toHaveAttribute("id", "from-removed-banks");
    expect(screen.getByText("SoFi Checking ••5805")).toBeInTheDocument();
    expect(
      screen.getByText(
        wholeText("A bank you disconnected left 3 transactions here before Budgts could check its transaction format. They count once you answer."),
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Going out" }));
    await waitFor(() => expect(answerDetachedHeldAction).toHaveBeenCalled());
    const fd = answerDetachedHeldAction.mock.calls[0]![1] as FormData;
    expect(fd.get("transactionId")).toBe(sample.transactionId);
    expect(fd.get("answer")).toBe("out");
    expect(fd.get("plaidAccountRowId")).toBeNull();
  });

  it("keys each group by account and feed, so two feeds into one account stay distinct", () => {
    render(<RemovedBanksHeld data={{ groups: [group, { ...group, originRef: "feed-2", sample: { ...sample, transactionId: "33333333-3333-3333-3333-333333333333" } }], answered: [] }} />);
    expect(screen.getByTestId("removed-held-acct-1|feed-old")).toBeInTheDocument();
    expect(screen.getByTestId("removed-held-acct-1|feed-2")).toBeInTheDocument();
  });

  it("says it couldn't load, in the card's place, when the read failed", () => {
    render(<RemovedBanksHeld data={null} />);
    expect(screen.getByTestId("removed-banks-held-error")).toHaveTextContent("Couldn't load transactions from removed banks. Try again later.");
  });

  it("offers Change answer for an answered group", async () => {
    changeDetachedHeldAnswerAction.mockResolvedValue({ ok: true });
    render(<RemovedBanksHeld data={{ groups: [], answered: [{ accountId: "acct-1", accountName: "SoFi Checking ••5805", originRef: "feed-old", answeredAt: "2026-10-05T00:00:00Z", sample }] }} />);
    await userEvent.click(screen.getByRole("button", { name: "Change answer" }));
    await userEvent.click(screen.getByRole("button", { name: "Coming in" }));
    await waitFor(() => expect(changeDetachedHeldAnswerAction).toHaveBeenCalled());
    expect((changeDetachedHeldAnswerAction.mock.calls[0]![1] as FormData).get("answer")).toBe("in");
  });
});
