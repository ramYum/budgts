import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NeedsCategory, type NeedsCategoryItem } from "./needs-category";

const categorizeBankTransaction = vi.fn();
const rescanUncategorized = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("@/server/plaid/actions", () => ({
  categorizeBankTransaction: (...args: unknown[]) => categorizeBankTransaction(...args),
  rescanUncategorized: (...args: unknown[]) => rescanUncategorized(...args),
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
    pending: false,
    plaid_category_primary: null,
    ...over,
  };
}

afterEach(() => vi.clearAllMocks());

describe("NeedsCategory", () => {
  it("renders nothing when there is nothing to categorise", () => {
    const { container } = render(
      <NeedsCategory items={[]} categories={categories} missingStandard={[]} currency="USD" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("categorises a row with an existing category and removes it from the list", async () => {
    categorizeBankTransaction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<NeedsCategory items={[item()]} categories={categories} missingStandard={[]} currency="USD" />);

    expect(screen.getByText("Blue Bottle Coffee")).toBeInTheDocument();

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Category for Blue Bottle Coffee/ }),
      "11111111-1111-1111-1111-111111111111",
    );

    expect(categorizeBankTransaction).toHaveBeenCalledTimes(1);
    const fd = categorizeBankTransaction.mock.calls[0][1] as FormData;
    expect(fd.get("transactionId")).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(fd.get("categoryId")).toBe("11111111-1111-1111-1111-111111111111");
    expect(fd.get("standardCategoryName")).toBeNull();

    expect(screen.queryByText("Blue Bottle Coffee")).not.toBeInTheDocument();
  });

  it("adds a standard category (sends standardCategoryName, not categoryId)", async () => {
    categorizeBankTransaction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(
      <NeedsCategory
        items={[item()]}
        categories={categories}
        missingStandard={["Transportation", "Personal Care"]}
        currency="USD"
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Category for Blue Bottle Coffee/ }),
      "std:Transportation",
    );

    const fd = categorizeBankTransaction.mock.calls[0][1] as FormData;
    expect(fd.get("standardCategoryName")).toBe("Transportation");
    expect(fd.get("categoryId")).toBeNull();
  });

  it("restores the row and shows the error when the action fails", async () => {
    categorizeBankTransaction.mockResolvedValue({ error: "Could not save the category. Try again." });
    const user = userEvent.setup();

    render(<NeedsCategory items={[item()]} categories={categories} missingStandard={[]} currency="USD" />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Category for Blue Bottle Coffee/ }),
      "11111111-1111-1111-1111-111111111111",
    );

    expect(await screen.findByText("Could not save the category. Try again.")).toBeInTheDocument();
    expect(screen.getByText("Blue Bottle Coffee")).toBeInTheDocument();
  });

  it("shows the transaction date, pending state, and Plaid's suggested category", () => {
    render(
      <NeedsCategory
        items={[item({ occurred_at: "2026-09-07T12:00:00.000Z", pending: true, plaid_category_primary: "FOOD_AND_DRINK" })]}
        categories={categories}
        missingStandard={[]}
        currency="USD"
      />,
    );

    expect(screen.getByText(/Sep 7/)).toBeInTheDocument();
    expect(screen.getByText(/Pending/)).toBeInTheDocument();
    expect(screen.getByText("Plaid suggests: Food and drink")).toBeInTheDocument();
  });

  it("hints that a standard category can be added when one is missing", () => {
    render(
      <NeedsCategory
        items={[item()]}
        categories={categories}
        missingStandard={["Transportation"]}
        currency="USD"
      />,
    );

    expect(screen.getByText(/Add a category/)).toBeInTheDocument();
  });

  it("Re-scan calls the rescan action", async () => {
    rescanUncategorized.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<NeedsCategory items={[item()]} categories={categories} missingStandard={[]} currency="USD" />);
    await user.click(screen.getByRole("button", { name: "Re-scan" }));

    expect(rescanUncategorized).toHaveBeenCalledTimes(1);
  });
});
