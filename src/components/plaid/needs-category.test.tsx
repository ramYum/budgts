import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NeedsCategory, type NeedsCategoryItem } from "./needs-category";

const categorizeBankTransaction = vi.fn();
const rescanUncategorized = vi.fn();
const createCategory = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock("@/server/plaid/actions", () => ({
  categorizeBankTransaction: (...args: unknown[]) => categorizeBankTransaction(...args),
  rescanUncategorized: (...args: unknown[]) => rescanUncategorized(...args),
}));

vi.mock("@/server/categories", () => ({
  createCategory: (...args: unknown[]) => createCategory(...args),
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
    merchant_entity_id: "ent-blue-bottle",
    amount: 650,
    direction: "debit",
    occurred_at: "2026-09-07T12:00:00.000Z",
    account_name: "Checking",
    pending: false,
    plaid_category_primary: null,
    suggested_category_id: null,
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

  it("groups transactions from the same merchant into one card", () => {
    render(
      <NeedsCategory
        items={[
          item({ id: "a" }),
          item({ id: "b" }),
          item({ id: "c", merchant_entity_id: "ent-other", merchant_name: "Other Shop" }),
        ]}
        categories={categories}
        missingStandard={[]}
        currency="USD"
      />,
    );

    expect(screen.getByText("Blue Bottle Coffee")).toBeInTheDocument();
    expect(screen.getByText(/^2 purchases · latest/)).toBeInTheDocument();
    expect(screen.getByText("Other Shop")).toBeInTheDocument();
    // a lone purchase shows its date, not a count of one
    expect(screen.queryByText(/1 purchase/)).not.toBeInTheDocument();
  });

  it("categorizes a merchant group using its most recent transaction as the anchor, and removes the card", async () => {
    categorizeBankTransaction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(
      <NeedsCategory
        items={[
          item({ id: "old", occurred_at: "2026-09-01T00:00:00.000Z" }),
          item({ id: "new", occurred_at: "2026-09-07T00:00:00.000Z" }),
        ]}
        categories={categories}
        missingStandard={[]}
        currency="USD"
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Category for Blue Bottle Coffee/ }),
      "11111111-1111-1111-1111-111111111111",
    );

    expect(categorizeBankTransaction).toHaveBeenCalledTimes(1);
    const fd = categorizeBankTransaction.mock.calls[0][1] as FormData;
    expect(fd.get("transactionId")).toBe("new");
    expect(fd.get("categoryId")).toBe("11111111-1111-1111-1111-111111111111");
    expect(fd.get("standardCategoryName")).toBeNull();

    expect(screen.queryByText("Blue Bottle Coffee")).not.toBeInTheDocument();
  });

  it("offers a one-tap suggested chip and applies it on click", async () => {
    categorizeBankTransaction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(
      <NeedsCategory
        items={[item({ suggested_category_id: "11111111-1111-1111-1111-111111111111" })]}
        categories={categories}
        missingStandard={[]}
        currency="USD"
      />,
    );

    const chip = screen.getByRole("button", { name: "Groceries" });
    await user.click(chip);

    expect(categorizeBankTransaction).toHaveBeenCalledTimes(1);
    const fd = categorizeBankTransaction.mock.calls[0][1] as FormData;
    expect(fd.get("categoryId")).toBe("11111111-1111-1111-1111-111111111111");
    expect(screen.queryByText("Blue Bottle Coffee")).not.toBeInTheDocument();
  });

  it("does not show a suggested chip when there is no confident suggestion", () => {
    render(
      <NeedsCategory
        items={[item({ suggested_category_id: null, plaid_category_primary: "FOOD_AND_DRINK" })]}
        categories={categories}
        missingStandard={[]}
        currency="USD"
      />,
    );

    expect(screen.queryByRole("button", { name: "Groceries" })).not.toBeInTheDocument();
    expect(screen.getByText("Plaid suggests: Food and drink")).toBeInTheDocument();
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

  it("restores the card and shows the error when the action fails", async () => {
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

  it("expands to show every transaction in a multi-transaction group, in full", async () => {
    const user = userEvent.setup();
    render(
      <NeedsCategory
        items={[
          item({ id: "a", description: "A long uncut merchant description that used to get truncated" }),
          item({ id: "b", description: "Second visit" }),
        ]}
        categories={categories}
        missingStandard={[]}
        currency="USD"
      />,
    );

    await user.click(screen.getByText("Show 2 transactions"));
    expect(
      screen.getByText("A long uncut merchant description that used to get truncated"),
    ).toBeInTheDocument();
    expect(screen.getByText("Second visit")).toBeInTheDocument();
  });

  it("shows the pending state for a single-transaction group", () => {
    render(
      <NeedsCategory
        items={[item({ occurred_at: "2026-09-07T12:00:00.000Z", pending: true })]}
        categories={categories}
        missingStandard={[]}
        currency="USD"
      />,
    );

    expect(screen.getByText(/Sep 7/)).toBeInTheDocument();
    expect(screen.getByText(/Pending/)).toBeInTheDocument();
  });

  it("always hints that a new category can be created", () => {
    render(<NeedsCategory items={[item()]} categories={categories} missingStandard={[]} currency="USD" />);

    expect(screen.getAllByText(/New category…/).length).toBeGreaterThan(0);
  });

  it("offers to restore a missing default category alongside the new-category option", () => {
    render(
      <NeedsCategory
        items={[item()]}
        categories={categories}
        missingStandard={["Transportation"]}
        currency="USD"
      />,
    );

    const combobox = screen.getByRole("combobox", { name: /Category for Blue Bottle Coffee/ });
    expect(within(combobox).getByText("Transportation")).toBeInTheDocument();
    expect(within(combobox).getByText("+ New category…")).toBeInTheDocument();
  });

  it("creates a new category inline and uses it to categorize the merchant group", async () => {
    createCategory.mockResolvedValue({ ok: true, id: "new-cat-id", name: "Pets" });
    categorizeBankTransaction.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<NeedsCategory items={[item()]} categories={categories} missingStandard={[]} currency="USD" />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Category for Blue Bottle Coffee/ }),
      "__new__",
    );

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Pets");
    await user.click(within(dialog).getByRole("button", { name: "Add & use" }));

    expect(createCategory).toHaveBeenCalledTimes(1);
    expect(categorizeBankTransaction).toHaveBeenCalledTimes(1);
    const fd = categorizeBankTransaction.mock.calls[0][1] as FormData;
    expect(fd.get("categoryId")).toBe("new-cat-id");
    expect(fd.get("standardCategoryName")).toBeNull();
  });

  it("resets the picker without categorizing when the new-category dialog is cancelled", async () => {
    const user = userEvent.setup();

    render(<NeedsCategory items={[item()]} categories={categories} missingStandard={[]} currency="USD" />);

    await user.selectOptions(
      screen.getByRole("combobox", { name: /Category for Blue Bottle Coffee/ }),
      "__new__",
    );
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(categorizeBankTransaction).not.toHaveBeenCalled();
    expect(screen.getByText("Blue Bottle Coffee")).toBeInTheDocument();
  });

  it("Re-scan calls the rescan action", async () => {
    rescanUncategorized.mockResolvedValue({ ok: true });
    const user = userEvent.setup();

    render(<NeedsCategory items={[item()]} categories={categories} missingStandard={[]} currency="USD" />);
    await user.click(screen.getByRole("button", { name: "Re-scan" }));

    expect(rescanUncategorized).toHaveBeenCalledTimes(1);
  });
});
