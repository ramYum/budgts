/**
 * POST /api/plaid/exchange — web cookie and native Bearer callers share this one handler (getRequestContext). The
 * Item and its accounts are two writes: if the accounts write fails, the half-created connection must not survive
 * (an Item with no accounts can never be mapped or synced), so the Item row is deleted and the Item removed at Plaid.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const itemPublicTokenExchange = vi.fn();
const accountsGet = vi.fn();
const itemRemove = vi.fn();
let ctx: { user: { id: string }; supabase: unknown } | null;

vi.mock("@/lib/plaid/client", () => ({ plaidClient: () => ({ itemPublicTokenExchange, accountsGet, itemRemove }) }));
vi.mock("@/lib/plaid/config", () => ({ loadPlaidConfig: () => ({ tokenEncKey: Buffer.alloc(32) }) }));
vi.mock("@/lib/plaid/crypto", () => ({ encryptToken: () => "enc" }));
vi.mock("@/lib/auth/request-context", () => ({ getRequestContext: async () => ctx }));
vi.mock("@/lib/account/deletion-store", () => ({ isAccountDeleting: async () => false }));
const gate = vi.hoisted(() => ({ denied: null as Response | null, calls: [] as string[] }));
vi.mock("@/lib/billing/gate", () => ({
  requireBankSyncAccess: async (userId: string) => (gate.calls.push(userId), gate.denied),
}));

import { POST } from "./route";

type Op = { table: string; op: string; args: unknown[][] };

/** A PostgREST-shaped fake: `answer` decides each chain's result; every chain is recorded. */
function fakeSupabase(answer: (op: Op) => { data?: unknown; error?: unknown }) {
  const ops: Op[] = [];
  return {
    ops,
    client: {
      from: (table: string) => {
        const op: Op = { table, op: "select", args: [] };
        ops.push(op);
        const q: unknown = new Proxy(
          {},
          {
            get: (_t, prop) => {
              if (prop === "then") {
                const r = answer(op);
                return (resolve: (v: unknown) => unknown) => Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(resolve);
              }
              return (...args: unknown[]) => {
                if (prop === "insert" || prop === "delete" || prop === "update") op.op = String(prop);
                op.args.push([String(prop), ...args]);
                return q;
              };
            },
          },
        );
        return q;
      },
    },
  };
}

const request = () =>
  new Request("http://x/api/plaid/exchange", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ public_token: "public-sandbox-1", institution: { institution_id: "ins_1", name: "Bank" } }),
  });

beforeEach(() => {
  itemPublicTokenExchange.mockReset().mockResolvedValue({ data: { access_token: "access-1", item_id: "item-1" } });
  accountsGet.mockReset().mockResolvedValue({ data: { accounts: [{ account_id: "a1", name: "Checking", balances: {} }] } });
  itemRemove.mockReset().mockResolvedValue({ data: {} });
  gate.denied = null;
  gate.calls.length = 0;
});

describe("POST /api/plaid/exchange: the bank-sync gate", () => {
  it("without a subscription answers the gate's 402 BEFORE the exchange: no Item is created at Plaid or locally", async () => {
    const sb = fakeSupabase(() => ({}));
    ctx = { user: { id: "u1" }, supabase: sb.client };
    gate.denied = Response.json({ error: "premium_required", entitlement: { hasPremium: false } }, { status: 402 });
    const res = await POST(request());
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: "premium_required" });
    expect(gate.calls).toEqual(["u1"]);
    expect(itemPublicTokenExchange).not.toHaveBeenCalled();
    expect(sb.ops).toEqual([]);
  });

  it("asks the gate for the verified caller and proceeds when it allows", async () => {
    const sb = fakeSupabase((op) => (op.table === "plaid_items" && op.op === "insert" ? { data: { id: "row-1" } } : {}));
    ctx = { user: { id: "u1" }, supabase: sb.client };
    expect((await POST(request())).status).toBe(200);
    expect(gate.calls).toEqual(["u1"]);
  });
});

describe("POST /api/plaid/exchange", () => {
  it("records the Item and its accounts (unmapped) and returns them for mapping", async () => {
    const sb = fakeSupabase((op) => (op.table === "plaid_items" && op.op === "insert" ? { data: { id: "row-1" } } : {}));
    ctx = { user: { id: "u1" }, supabase: sb.client };
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ plaidItemId: "row-1", accounts: [{ plaidAccountId: "a1" }] });
    expect(itemRemove).not.toHaveBeenCalled();
  });

  it("when the accounts write fails, deletes the just-created Item and removes it at Plaid: no half-created connection", async () => {
    const sb = fakeSupabase((op) => {
      if (op.table === "plaid_items" && op.op === "insert") return { data: { id: "row-1" } };
      if (op.table === "plaid_accounts" && op.op === "insert") return { error: { code: "XX000", message: "boom" } };
      return {};
    });
    ctx = { user: { id: "u1" }, supabase: sb.client };
    const res = await POST(request());
    expect(res.status).toBe(500);
    const del = sb.ops.find((o) => o.table === "plaid_items" && o.op === "delete");
    expect(del?.args).toContainEqual(["eq", "id", "row-1"]);
    expect(itemRemove).toHaveBeenCalledWith({ access_token: "access-1" });
  });

  it("still removes the Item at Plaid when deleting the row fails, and still answers 500", async () => {
    const sb = fakeSupabase((op) => {
      if (op.table === "plaid_items" && op.op === "insert") return { data: { id: "row-1" } };
      if (op.table === "plaid_accounts" && op.op === "insert") return { error: { code: "XX000", message: "boom" } };
      if (op.table === "plaid_items" && op.op === "delete") return { error: { code: "XX000", message: "nope" } };
      return {};
    });
    ctx = { user: { id: "u1" }, supabase: sb.client };
    itemRemove.mockRejectedValue(new Error("plaid down"));
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(itemRemove).toHaveBeenCalledWith({ access_token: "access-1" });
  });
});
