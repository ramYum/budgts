import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { byTestId, render, textContent } from "../../test/render";
import { HomeAddSheets } from "./add-sheets";

vi.mock("@react-native-community/datetimepicker", () => ({ default: () => null, DateTimePickerAndroid: { open: () => {} } }));
vi.mock("../../lib/auth/auth-context", () => ({ useAuth: () => ({ session: { access_token: "t" } }) }));
const asked = vi.hoisted(() => [] as string[]);
vi.mock("../../lib/auth/api", () => ({
  NotAuthenticatedError: class extends Error {},
  authFetch: async (path: string) => {
    asked.push(path);
    const body = path.startsWith("/api/mobile/accounts")
      ? { version: 1, accounts: [{ id: "a1", name: "Everyday checking", type: "checking", source: "manual", archived: false, selectable: true }], accountTypes: ["checking"] }
      : {
          version: 1,
          categories: [
            { id: "c-food", name: "Groceries", kind: "expense", color: "#000" },
            { id: "c-pay", name: "Salary", kind: "income", color: "#000" },
          ],
        };
    return new Response(JSON.stringify(body), { status: 200 });
  },
}));

async function open(sheet: "income" | "add") {
  const onClose = vi.fn();
  let r!: ReturnType<typeof render>;
  await act(async () => {
    r = render(<HomeAddSheets sheet={sheet} defaultDate="2026-09-19" onClose={onClose} />);
  });
  await act(async () => {});
  return { r, onClose };
}

describe("Home's add sheets (review 🔴1: they opened a deleted route)", () => {
  it("the plus by Came in and the set-up step open Add income, money in fixed, dated the user's today", async () => {
    const { r } = await open("income");
    expect(textContent(byTestId(r, "sheet-title"))).toBe("Add income");
    expect(byTestId(r, "txn-form-date").props.accessibilityLabel).toBe("Date, 09/19/2026");
    expect(asked).toEqual(expect.arrayContaining(["/api/mobile/accounts", "/api/mobile/categories"]));
  });

  it("'Add one by hand' opens Add transaction", async () => {
    const { r } = await open("add");
    expect(textContent(byTestId(r, "sheet-title"))).toBe("Add transaction");
  });
});
