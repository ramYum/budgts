import { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { byTestId, render, textContent } from "../../test/render";
import { invalidate } from "../../lib/api/invalidate";
import { HomeAddSheets } from "./add-sheets";

vi.mock("@react-native-community/datetimepicker", () => ({ default: () => null, DateTimePickerAndroid: { open: () => {} } }));
vi.mock("../../lib/auth/auth-context", () => ({ useAuth: () => ({ session: { access_token: "t" } }) }));
const asked = vi.hoisted(() => [] as string[]);
const down = vi.hoisted(() => ({ accounts: false }));
vi.mock("../../lib/auth/api", () => ({
  NotAuthenticatedError: class extends Error {},
  authFetch: async (path: string) => {
    asked.push(path);
    if (down.accounts && path.startsWith("/api/mobile/accounts")) throw new TypeError("Network request failed");
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

const mounted: ReturnType<typeof render>[] = [];
afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
});

async function open(sheet: "income" | "add") {
  const onClose = vi.fn();
  let r!: ReturnType<typeof render>;
  await act(async () => {
    r = render(<HomeAddSheets sheet={sheet} defaultDate="2026-09-19" onClose={onClose} />);
  });
  mounted.push(r);
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

  it("re-reads its accounts and categories in place when they change elsewhere (tabs stay mounted)", async () => {
    const { r } = await open("add");
    const count = (p: string) => asked.filter((a) => a === p).length;
    const cats = count("/api/mobile/categories");
    const accts = count("/api/mobile/accounts");
    await act(async () => invalidate("transactions"));
    await act(async () => invalidate("accounts"));
    await act(async () => {});
    expect(count("/api/mobile/categories")).toBe(cats + 1);
    expect(count("/api/mobile/accounts")).toBe(accts + 1);
    expect(r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "txn-form-loading")).toHaveLength(0);
    expect(byTestId(r, "txn-form")).toBeTruthy();
  });

  it("says when a re-read failed and kept the older accounts, and Retry re-reads them in place", async () => {
    const { r } = await open("add");
    down.accounts = true;
    await act(async () => invalidate("accounts"));
    await act(async () => {});
    down.accounts = false;
    expect(textContent(byTestId(r, "txn-form-notice"))).toContain("These accounts and categories may be out of date. Couldn't reach Budgts.");
    expect(byTestId(r, "txn-form")).toBeTruthy();
    await act(async () => byTestId(r, "txn-form-notice").findAll((n) => typeof n.type === "string" && n.props.accessibilityLabel === "Retry")[0]!.props.onPress());
    await act(async () => {});
    expect(r.root.findAll((n) => typeof n.type === "string" && n.props.testID === "txn-form-notice")).toHaveLength(0);
    expect(byTestId(r, "txn-form")).toBeTruthy();
  });
});
