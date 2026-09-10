import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NeedsCategory, type NeedsCategoryItem } from "./needs-category";

const categorizeBankTransaction = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("@/server/plaid/actions", () => ({
  categorizeBankTransaction: (...args: unknown[]) => categorizeBankTransaction(...args),
}));

const categories = [
  { id: "11111111-1111-1111-1111-111111111111", name: "Groceries", kind: "expense" as const },
  { id: "22222222-2222-2222-2222-222222222222", name: "Salary", kind: "income" as const },
];

function item(over: Partial<NeedsCategoryItem> = {}): NeedsCategoryItem {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    description: "SQ *BLUE BOTTLE",
    merchant_name: "Blue Bottle Coffee",
    amount: 650,
    direction: "debit",
    occurred_at: "2026-09-07T12:00:00.000Z",
    account_name: "Checking",
    ...over,
  };
}

afterEach(() => vi.clearAllMocks());

describe("NeedsCategory", () => {
  it("renders nothing when there is nothing to categorise", () => {
    const { container } = render(
      <NeedsCategory items={[]} categories={categories} currency="USD" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("categorises a row and removes it from the list", async () => {
    categorizeBankTransaction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<NeedsCategory items={[item()]} categories={categories} currency="USD" />);

    expect(screen.getByText("Blue Bottle Coffee")).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Category for Blue Bottle Coffee/ }),
      "11111111-1111-1111-1111-111111111111",
    );

    expect(categorizeBankTransaction).toHaveBeenCalledTimes(1);
    const fd = categorizeBankTransaction.mock.calls[0][1] as FormData;
    expect(fd.get("transactionId")).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(fd.get("categoryId")).toBe("11111111-1111-1111-1111-111111111111");

    // optimistically gone
    expect(screen.queryByText("Blue Bottle Coffee")).not.toBeInTheDocument();
  });

  it("restores the row and shows the error when the action fails", async () => {
    categorizeBankTransaction.mockResolvedValue({ error: "Could not save the category. Try again." });
    const user = userEvent.setup();

    render(<NeedsCategory items={[item()]} categories={categories} currency="USD" />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Category for Blue Bottle Coffee/ }),
      "11111111-1111-1111-1111-111111111111",
    );

    expect(await screen.findByText("Could not save the category. Try again.")).toBeInTheDocument();
    expect(screen.getByText("Blue Bottle Coffee")).toBeInTheDocument();
  });
});
