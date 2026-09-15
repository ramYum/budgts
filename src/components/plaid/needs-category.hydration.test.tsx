import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrate } from "@/test-utils/hydration";
import { NeedsCategory, type NeedsCategoryItem } from "./needs-category";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/server/plaid/actions", () => ({
  categorizeBankTransaction: vi.fn(),
  rescanUncategorized: vi.fn(),
}));

vi.mock("@/server/categories", () => ({
  createCategory: vi.fn(),
}));

// 02:00 UTC on Sep 10 is still Sep 9 in New York — a date a UTC server and an EDT browser disagree on.
const OCCURRED_AT = "2026-09-10T02:00:00.000Z";

const originalTz = process.env.TZ;
const setTz = (tz: string) => {
  process.env.TZ = tz;
};

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const categories = [{ id: "11111111-1111-1111-1111-111111111111", name: "Groceries", kind: "expense" as const }];

function item(over: Partial<NeedsCategoryItem> = {}): NeedsCategoryItem {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    description: "SQ *BLUE BOTTLE",
    merchant_name: "Blue Bottle Coffee",
    merchant_entity_id: "ent-blue-bottle",
    amount: 650,
    direction: "debit",
    occurred_at: OCCURRED_AT,
    account_name: "Checking",
    pending: false,
    plaid_category_primary: null,
    suggested_category_id: null,
    ...over,
  };
}

describe("NeedsCategory hydration across time zones", () => {
  it("uses a fixture whose calendar date really differs between UTC and New York", () => {
    const day = () => new Date(OCCURRED_AT).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    setTz("UTC");
    const utc = day();
    setTz("America/New_York");
    expect(day()).not.toBe(utc);
  });

  it("hydrates a UTC server render in a New York browser without a text mismatch", async () => {
    const { errors, text } = await hydrate(
      <NeedsCategory items={[item()]} categories={categories} missingStandard={[]} currency="USD" />,
      { serverEnv: () => setTz("UTC"), clientEnv: () => setTz("America/New_York") },
    );

    expect(errors).toEqual([]);
    // Same calendar date the Activity list shows for this row (stored UTC day).
    expect(text).toContain("Sep 10");
  });
});
